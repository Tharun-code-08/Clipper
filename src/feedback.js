import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const FILE = path.join(DATA_DIR, 'feedback.jsonl');

/** Append-only log; the newest entry for a clip wins and `label: null` clears a rating. */
export async function addFeedback(entry) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(FILE, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

/** Current ratings, oldest first: [{jobId, clipId, label: 1|0, title, format, duration, transcript, features, ...}]. */
export async function loadFeedback() {
  const text = await fs.readFile(FILE, 'utf8').catch(() => '');
  const latest = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      latest.set(`${e.jobId}/${e.clipId}`, e);
    } catch {
      // A torn line from a crash is skipped rather than poisoning every later rating.
    }
  }
  return [...latest.values()].filter((e) => e.label === 0 || e.label === 1).sort((a, b) => a.at.localeCompare(b.at));
}
