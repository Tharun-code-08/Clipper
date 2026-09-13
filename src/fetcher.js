import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';
import { run } from './util.js';

const SCRIPT = path.join(ROOT, 'py', 'fetch.py');
const PYTHON = process.env.PYTHON || 'python';

/** Run py/fetch.py and stream its JSON-line events. Resolves with the final "done" event. */
async function runFetch(args, onEvent) {
  let done = null;
  let error = null;
  const r = await run(PYTHON, [SCRIPT, ...args], {
    onLine: (line) => {
      if (!line.startsWith('{')) return; // yt-dlp's own stderr chatter
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === 'done') done = ev;
      else if (ev.type === 'error') error = ev.message;
      onEvent?.(ev);
    },
  });
  if (error) throw new Error(error);
  if (!done) {
    const tail = (r.stderr || r.stdout).trim().split(/\r?\n/).pop();
    throw new Error(`Downloader failed (${args[0]}): ${tail || `exit ${r.code}`}`);
  }
  return done;
}

/**
 * Audio first: the smallest thing transcription needs. Resolves {file, full_video, meta}.
 * full_video = the site had no separate audio stream, so the whole video is already local.
 */
export function fetchAudio(url, outDir, onProgress) {
  return runFetch(['audio', url, outDir], (ev) => {
    if (ev.type === 'progress' && ev.pct != null) onProgress?.(ev.pct);
  });
}

/**
 * Download only the picked ranges ([{id, start, end}] in source seconds). Resolves
 * {sections: Map(id → {file, start, end}), errors: Map(id → message)}.
 */
export async function fetchSections(url, outDir, ranges, { onProgress, onSection } = {}) {
  await fs.mkdir(outDir, { recursive: true });
  const rangesFile = path.join(outDir, 'ranges.json');
  await fs.writeFile(rangesFile, JSON.stringify(ranges));
  const pct = new Map();
  const sections = new Map();
  const errors = new Map();
  const report = () => onProgress?.([...pct.values()].reduce((a, b) => a + b, 0) / Math.max(1, ranges.length));
  await runFetch(['sections', url, outDir, rangesFile], (ev) => {
    if (ev.type === 'progress' && ev.id) {
      pct.set(ev.id, ev.pct ?? pct.get(ev.id) ?? 0);
      report();
    } else if (ev.type === 'section') {
      sections.set(ev.id, { file: ev.file, start: ev.start, end: ev.end });
      pct.set(ev.id, 1);
      report();
      onSection?.(ev);
    } else if (ev.type === 'section_error') {
      errors.set(ev.id, ev.message);
    }
  });
  return { sections, errors };
}
