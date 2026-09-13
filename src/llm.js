import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

let client;
const anthropic = () => (client ||= new Anthropic({ apiKey: config.anthropicKey, maxRetries: 2, timeout: 15 * 60 * 1000 }));

const supportsServerFallback = (model) => /^claude-(opus-5|fable-5)/.test(model);

async function streamOnce(model, { system, content, schema, effort, maxTokens }, onProgress) {
  const params = {
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content }],
  };
  if (supportsServerFallback(model)) Object.assign(params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  const stream = anthropic().beta.messages.stream(params);
  let chars = 0;
  stream.on('streamEvent', (event) => {
    if (event.type === 'content_block_start') {
      const t = event.content_block.type;
      onProgress?.({ phase: t === 'thinking' ? 'thinking' : t === 'text' ? 'writing' : 'reading', chars });
    } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      chars += event.delta.text.length;
      onProgress?.({ phase: 'writing', chars });
    }
  });
  return stream.finalMessage();
}

/**
 * One structured-output Claude call with adaptive thinking. Ladders from the requested model to the
 * fallback model on overload/outage (same key). Resolves {data, msg, model, ms}.
 */
export async function callStructured({ system, content, schema, model, effort = config.curatorEffort, maxTokens = 32000, onProgress }) {
  if (!config.anthropicKey) throw new Error('ANTHROPIC_API_KEY is missing from .env');
  const ladder = [...new Set([model || config.curatorModel, config.curatorFallbackModel].filter(Boolean))];
  let lastErr;
  for (const m of ladder) {
    const started = Date.now();
    let msg;
    try {
      msg = await streamOnce(m, { system, content, schema, effort, maxTokens }, onProgress);
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof Anthropic.APIConnectionError
        || (err instanceof Anthropic.APIError && (err.status === 429 || err.status >= 500));
      if (retryable) continue;
      break;
    }
    if (msg.stop_reason === 'refusal') {
      throw new Error(`The model declined this request${msg.stop_details?.explanation ? `: ${msg.stop_details.explanation}` : '.'}`);
    }
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    try {
      return { data: JSON.parse(text), msg, model: msg.model || m, ms: Date.now() - started };
    } catch {
      throw new Error(msg.stop_reason === 'max_tokens'
        ? 'The model ran out of output tokens before finishing. Try again or lower CURATOR_EFFORT.'
        : 'The model returned malformed JSON.');
    }
  }
  if (lastErr instanceof Anthropic.APIError) throw new Error(`Claude request failed (HTTP ${lastErr.status}): ${lastErr.message}`);
  throw lastErr;
}
