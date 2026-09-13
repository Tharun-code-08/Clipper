import path from 'node:path';
import { config, DATA_DIR, LLM_PRICING, STT_PRICING, STT_MIN_BILLED_SEC, CACHE_READ_MULT, CACHE_WRITE_MULT, MAX_CLIPS } from './config.js';
import { readJson, writeJson } from './util.js';

const CALIBRATION_FILE = path.join(DATA_DIR, 'calibration.json');
const round6 = (n) => Math.round(n * 1e6) / 1e6;

/** Input-token overhead that does not grow with video length: role + rubric + exemplars (~4k) and ~48 frames (~5k). */
const HEURISTIC = {
  fixedInputTokens: 9000,
  inputTokensPerMinute: 300, // ~150 spoken words/min in English plus timestamps and loudness marks
  outputTokens: 14000, // adaptive thinking + up to 10 packaged clips
  analyzeMsPerSourceMinute: 1500, // audio extract + loudness + scene/frame scan on a desktop CPU
  renderMsPerClipSecond: 450,
  avgClipSeconds: 40,
};

export function llmLineItem(model, usage = {}) {
  const p = LLM_PRICING[model] ?? LLM_PRICING['claude-opus-5'];
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const usd = (input * p.input + output * p.output + cacheRead * p.input * CACHE_READ_MULT + cacheWrite * p.input * CACHE_WRITE_MULT) / 1e6;
  return {
    stage: 'Curation',
    provider: 'Anthropic',
    model,
    detail: `${input.toLocaleString('en-US')} input · ${output.toLocaleString('en-US')} output tokens (incl. thinking)`,
    units: { input, output, cacheRead, cacheWrite },
    usd: round6(usd),
  };
}

export function sttLineItem(model, billedSec) {
  const rate = STT_PRICING[model] ?? 0;
  return {
    stage: 'Transcription',
    provider: 'Groq',
    model,
    detail: `${(billedSec / 60).toFixed(1)} min of audio @ $${rate}/hr`,
    units: { billedSec },
    usd: round6((billedSec / 3600) * rate),
  };
}

export function computeLineItem(stage, ms) {
  return {
    stage,
    provider: 'Local ffmpeg',
    model: '',
    detail: `${(ms / 1000).toFixed(1)} s of CPU work — free on this machine`,
    units: { ms },
    usd: 0,
    hostedUsd: round6((ms / 3_600_000) * config.hostedCpuUsdPerHour),
  };
}

/** Totals for a finished job's receipt. */
export function summarize(items, { sourceMinutes, clipCount }) {
  const usd = items.reduce((a, i) => a + i.usd, 0);
  const hostedUsd = usd + items.reduce((a, i) => a + (i.hostedUsd || 0), 0);
  const perMin = sourceMinutes > 0 ? usd / sourceMinutes : 0;
  return {
    items,
    usd: round6(usd),
    inr: Math.round(usd * config.usdInr * 100) / 100,
    hostedUsd: round6(hostedUsd),
    hostedInr: Math.round(hostedUsd * config.usdInr * 100) / 100,
    perClipUsd: clipCount ? round6(usd / clipCount) : null,
    perSourceMinuteUsd: round6(perMin),
    per20MinUsd: round6(perMin * 20),
    usdInr: config.usdInr,
    hostedCpuUsdPerHour: config.hostedCpuUsdPerHour,
  };
}

export const loadCalibration = async () => (await readJson(CALIBRATION_FILE)) || { runs: [] };

/** Remember what a real run consumed so estimates converge on measured numbers. */
export async function recordCalibration(run) {
  const cal = await loadCalibration();
  cal.runs = [...cal.runs, { at: new Date().toISOString(), ...run }].slice(-20);
  await writeJson(CALIBRATION_FILE, cal);
  return cal;
}

function calibrated(cal) {
  const runs = (cal?.runs || []).filter((r) => r.sourceMinutes > 1 && r.inputTokens > 0);
  if (!runs.length) return { ...HEURISTIC, basis: 'heuristic', runs: 0 };
  const avg = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  const renderRuns = runs.filter((r) => r.renderedClipSeconds > 0);
  return {
    fixedInputTokens: HEURISTIC.fixedInputTokens,
    inputTokensPerMinute: Math.max(50, avg((r) => (r.inputTokens - HEURISTIC.fixedInputTokens) / r.sourceMinutes)),
    outputTokens: avg((r) => r.outputTokens),
    analyzeMsPerSourceMinute: avg((r) => r.analyzeMs / r.sourceMinutes),
    renderMsPerClipSecond: renderRuns.length ? renderRuns.reduce((a, r) => a + r.renderMs / r.renderedClipSeconds, 0) / renderRuns.length : HEURISTIC.renderMsPerClipSecond,
    avgClipSeconds: renderRuns.length ? renderRuns.reduce((a, r) => a + r.renderedClipSeconds / Math.max(1, r.clips), 0) / renderRuns.length : HEURISTIC.avgClipSeconds,
    basis: 'measured',
    runs: runs.length,
  };
}

/** Projected cost to clip one video of `minutes` length. */
export function estimate({ minutes = 20, model = config.curatorModel, sttModel = config.sttModel, clips = MAX_CLIPS, calibration } = {}) {
  const k = calibrated(calibration);
  const sec = minutes * 60;
  const chunks = Math.max(1, Math.ceil(sec / 600));
  const billedSec = Math.max(sec + (chunks - 1) * 4, chunks * STT_MIN_BILLED_SEC);
  const inputTokens = Math.round(k.fixedInputTokens + k.inputTokensPerMinute * minutes);
  const outputTokens = Math.round(k.outputTokens);
  const clipCount = Math.min(MAX_CLIPS, Math.max(1, clips));
  const analyzeMs = k.analyzeMsPerSourceMinute * minutes;
  const renderMs = k.renderMsPerClipSecond * k.avgClipSeconds * clipCount;

  const items = [
    sttLineItem(sttModel, billedSec),
    llmLineItem(model, { input_tokens: inputTokens, output_tokens: outputTokens }),
    computeLineItem('Analysis', analyzeMs),
    computeLineItem('Rendering', renderMs),
  ];
  const summary = summarize(items, { sourceMinutes: minutes, clipCount });
  const compare = Object.keys(LLM_PRICING).map((m) => ({
    model: m,
    usd: round6(items[0].usd + llmLineItem(m, { input_tokens: inputTokens, output_tokens: outputTokens }).usd),
  }));
  return { minutes, model, sttModel, clips: clipCount, basis: k.basis, calibrationRuns: k.runs, ...summary, compare };
}
