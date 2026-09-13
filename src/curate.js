import fs from 'node:fs/promises';
import path from 'node:path';
import { TRAINING_DIR, MAX_CLIPS, CLIP_MIN_SEC, CLIP_MAX_SEC } from './config.js';
import { callStructured } from './llm.js';
import { clamp, fmtTime } from './util.js';
import { snapStart, snapEnd, textBetween, isEndBoundary } from './transcript.js';
import { FEATURES } from './virality.js';

const JUDGEMENT_KEYS = FEATURES.filter((f) => f.source === 'llm').map((f) => f.key);

// Curation only picks moments and packages them. Framing and caption styling happen later, from
// frames of the picked parts (see director.js), so the curator never needs the video itself.
export const CLIP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['video_summary', 'language', 'clips'],
  properties: {
    video_summary: { type: 'string', description: 'One or two sentences: what the long video is and who it is for.' },
    language: { type: 'string', description: 'Primary spoken language, e.g. English, Hindi, Hinglish.' },
    clips: {
      type: 'array',
      description: `Best moments ranked best-first. Never more than ${MAX_CLIPS}.`,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['start', 'end', 'title', 'hook_text', 'caption', 'hashtags', 'format', 'why', 'scores'],
        properties: {
          start: { type: 'number', description: 'Seconds. Timestamp of the hook line from the transcript.' },
          end: { type: 'number', description: 'Seconds. End of the payoff sentence.' },
          title: { type: 'string' },
          hook_text: { type: 'string' },
          caption: { type: 'string' },
          hashtags: { type: 'array', items: { type: 'string' } },
          format: { type: 'string', description: 'Which winning format from the rubric this clip is.' },
          why: { type: 'string', description: 'Why it will perform: 1-2 specific sentences.' },
          scores: {
            type: 'object',
            additionalProperties: false,
            required: JUDGEMENT_KEYS,
            properties: Object.fromEntries(JUDGEMENT_KEYS.map((k) => [k, { type: 'integer', description: '0-10' }])),
          },
        },
      },
    },
  },
};

const ROLE = `You are Captik Clipper, the curator inside a short-form video clipping engine.
You read a long-form video through its timestamped transcript, loudness marks and pauses, and you choose the
moments that will perform as vertical shorts on YouTube Shorts, Instagram Reels and TikTok.
You have the judgement of a top clipping editor: you would rather return 3 great clips than 10 average ones.
Only the parts you pick get downloaded and edited, so timestamps must come from the transcript and packaging must be ready to post.`;

async function loadTraining() {
  const rubric = await fs.readFile(path.join(TRAINING_DIR, 'rubric.md'), 'utf8');
  const ex = JSON.parse(await fs.readFile(path.join(TRAINING_DIR, 'exemplars.json'), 'utf8'));
  const examples = ex.examples
    .map((e, i) => `Example ${i + 1} — ${e.lesson}\nTranscript: ${e.transcript}\nVerdict: ${e.verdict.toUpperCase()}${e.start !== undefined ? ` (start ${e.start})` : ''}\nWhy: ${e.why}`)
    .join('\n\n');
  return { rubric, examples };
}

/** Recent thumbs-up/down from this creator, rendered as in-context preference examples. */
export function tasteBlock(feedback = []) {
  const pick = (label) => feedback.filter((f) => f.label === label).slice(-6);
  const line = (f) => `- "${f.title}" [${f.format || 'clip'}, ${Math.round(f.duration)}s] — ${f.transcript.split(/\s+/).slice(0, 40).join(' ')}…${f.note ? ` (creator note: ${f.note})` : ''}`;
  const liked = pick(1);
  const disliked = pick(0);
  if (!liked.length && !disliked.length) return '';
  return [
    'THIS CREATOR\'S TASTE — learned from their own ratings of earlier picks. Weight it heavily: find more moments like LIKED, avoid moments like DISLIKED.',
    liked.length ? `LIKED:\n${liked.map(line).join('\n')}` : '',
    disliked.length ? `DISLIKED:\n${disliked.map(line).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

export async function buildPrompt({ meta, transcriptText, maxClips, feedback }) {
  const { rubric, examples } = await loadTraining();
  const taste = tasteBlock(feedback);
  const system = [ROLE, `# TRAINING MANUAL\n${rubric}`, `# WORKED EXAMPLES\n${examples}`, taste && `# ${taste}`]
    .filter(Boolean)
    .join('\n\n');
  const header = [
    `VIDEO: "${meta.title}"${meta.uploader ? ` by ${meta.uploader}` : ''}`,
    `Source: ${meta.platform} · duration ${fmtTime(meta.duration)} (${meta.duration.toFixed(1)} s) · detected language: ${meta.language || 'unknown'}`,
    meta.description ? `Description: ${meta.description.slice(0, 600)}` : '',
  ].filter(Boolean).join('\n');
  const task = `${header}

TRANSCRIPT — format: [start_seconds eLOUDNESS] text · e1 quiet … e5 loudest quintile of this video · (pause Ns) = silence.

${transcriptText}

TASK: Pick up to ${maxClips} clips (the engine hard-caps at ${MAX_CLIPS}). Rank them best-first.
Before answering, review every pick against the hard laws in section 1 of the manual and delete any that fail — returning fewer clips is correct when the video has fewer great moments.
start/end must be transcript timestamps; clip length ${CLIP_MIN_SEC}-${CLIP_MAX_SEC} s, ideally 20-60 s.`;
  return { system, content: [{ type: 'text', text: task }], debugText: `${system}\n\n=== USER ===\n${task}` };
}

/** Resolves {data, msg, model, ms}. */
export const callCurator = (prompt, { model, onProgress } = {}) =>
  callStructured({ system: prompt.system, content: prompt.content, schema: CLIP_SCHEMA, model, onProgress });

const normTag = (t) => `#${String(t).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')}`;

/**
 * Turn raw curator picks into clips. The validator, not the prompt, owns the rules:
 * ≤ maxClips (never above MAX_CLIPS), sentence-snapped boundaries, 12-90 s, no heavy overlaps.
 */
export function finalizeClips(rawClips, { words, duration, maxClips = MAX_CLIPS }) {
  const limit = clamp(Math.floor(Number(maxClips)) || MAX_CLIPS, 1, MAX_CLIPS);
  const clips = [];
  const rejected = [];
  for (const [i, c] of (Array.isArray(rawClips) ? rawClips : []).entries()) {
    const title = String(c.title || `Clip ${i + 1}`).trim().slice(0, 90);
    if (clips.length >= limit) { rejected.push({ title, reason: `over the ${limit}-clip cap` }); continue; }
    let start = Number(c.start);
    let end = Number(c.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) { rejected.push({ title, reason: 'invalid timestamps' }); continue; }
    start = snapStart(clamp(start, 0, duration), words).t;
    end = Math.min(duration, snapEnd(clamp(end, 0, duration), words).t);

    if (end - start > CLIP_MAX_SEC) {
      const limitT = start + CLIP_MAX_SEC - 0.3;
      let j = words.findLastIndex((w) => w.e <= limitT && w.s > start);
      while (j > 0 && !isEndBoundary(words, j)) j--;
      end = j > 0 ? Math.min(words[j].e + 0.3, limitT + 0.3) : limitT;
    }
    const dur = end - start;
    if (dur < CLIP_MIN_SEC) { rejected.push({ title, reason: `too short after snapping (${dur.toFixed(1)} s)` }); continue; }

    const clash = clips.find((k) => Math.max(0, Math.min(k.end, end) - Math.max(k.start, start)) > 0.35 * Math.min(k.duration, dur));
    if (clash) { rejected.push({ title, reason: `overlaps "${clash.title}"` }); continue; }

    const scores = Object.fromEntries(JUDGEMENT_KEYS.map((k) => [k, clamp(Math.round(Number(c.scores?.[k]) || 0), 0, 10)]));
    clips.push({
      id: `c${String(clips.length + 1).padStart(2, '0')}`,
      llmRank: i + 1,
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      duration: Math.round(dur * 10) / 10,
      title,
      hookText: String(c.hook_text || '').trim().slice(0, 60),
      caption: String(c.caption || '').trim().slice(0, 220),
      hashtags: [...new Set((c.hashtags || []).map(normTag).filter((t) => t.length > 1))].slice(0, 6),
      format: String(c.format || '').trim().slice(0, 60),
      why: String(c.why || '').trim().slice(0, 400),
      layout: 'crop',
      focusX: 0.5,
      scores,
      transcript: textBetween(words, start, end),
    });
  }
  return { clips, rejected };
}
