import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { JOBS_DIR } from './config.js';
import { readJson, writeJson } from './util.js';

export const STAGES = [
  { key: 'audio', label: 'Get audio' },
  { key: 'transcribe', label: 'Transcribe' },
  { key: 'curate', label: 'Pick best parts' },
  { key: 'parts', label: 'Fetch parts' },
  { key: 'style', label: 'Frames & style' },
  { key: 'score', label: 'Score' },
  { key: 'render', label: 'Render' },
];

const live = new Map();
export const bus = new EventEmitter();
bus.setMaxListeners(200);

export const jobDir = (id) => path.join(JOBS_DIR, id);
const validId = (id) => /^[\w-]{6,40}$/.test(id);

export async function createJob(input) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const id = `${stamp}-${crypto.randomBytes(3).toString('hex')}`;
  await fs.mkdir(jobDir(id), { recursive: true });
  const job = {
    id,
    createdAt: new Date().toISOString(),
    status: 'queued',
    input,
    stages: Object.fromEntries(STAGES.map((s) => [s.key, { status: 'pending', progress: 0 }])),
    log: [],
    source: null,
    summary: null,
    clips: [],
    rejected: [],
    cost: null,
    error: null,
  };
  live.set(id, job);
  await saveJob(job);
  return job;
}

export async function saveJob(job) {
  job.updatedAt = new Date().toISOString();
  await writeJson(path.join(jobDir(job.id), 'job.json'), job);
}

export async function getJob(id, { raw = false } = {}) {
  if (!validId(id)) return null;
  if (live.has(id)) return live.get(id);
  const job = await readJson(path.join(jobDir(id), 'job.json'));
  if (!job) return null;
  settleClips(job);
  if (raw) {
    live.set(id, job);
    return job;
  }
  if (job.status === 'queued' || job.status === 'running') {
    job.status = 'error';
    job.error = 'The server restarted while this job was running. Start it again.';
  }
  return job;
}

const posterOf = (j) => {
  const c = j.clips.find((x) => x.poster);
  return c ? `/media/${j.id}/${c.poster}` : null;
};
const progressOf = (j) => STAGES.reduce((a, s) => {
  const st = j.stages?.[s.key];
  return a + (st?.status === 'done' ? 1 : st?.progress || 0);
}, 0) / STAGES.length;

export async function listJobs() {
  const names = await fs.readdir(JOBS_DIR).catch(() => []);
  const jobs = (await Promise.all(names.map((n) => getJob(n)))).filter(Boolean);
  return jobs
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((j) => ({
      id: j.id,
      createdAt: j.createdAt,
      status: j.status,
      title: j.source?.title || j.input?.url || j.input?.fileName || 'Untitled',
      platform: j.source?.platform || null,
      duration: j.source?.duration || null,
      clipCount: j.clips.length,
      topScore: j.clips.reduce((m, c) => Math.max(m, c.score || 0), 0) || null,
      costUsd: j.cost?.usd ?? null,
      thumbnail: j.source?.thumbnail || null,
      poster: posterOf(j),
      progress: Math.round(progressOf(j) * 1000) / 1000,
      stage: STAGES.find((s) => j.stages?.[s.key]?.status === 'running')?.label || null,
    }));
}

/** A trim or export that was running when the server stopped did not finish: show the clip as it was. */
function settleClips(job) {
  for (const c of job.clips || []) {
    if (c.status !== 'trimming' && c.status !== 'rendering' && c.status !== 'queued') continue;
    c.status = c.file ? 'done' : 'error';
    if (!c.file) c.error ||= 'The server restarted before this clip finished rendering.';
    if (c.trim) c.trim = { ...c.trim, stage: null, progress: 0 };
  }
}

export const emit = (job) => bus.emit(job.id, job);

export function logLine(job, msg) {
  job.log.push({ at: new Date().toISOString(), msg });
  if (job.log.length > 300) job.log.splice(0, job.log.length - 300);
  emit(job);
}

/** Jobs saved by an older build carry an older stage list; align them to the current one. */
export function normalizeStages(job) {
  job.stages = Object.fromEntries(STAGES.map((s) => [s.key, job.stages?.[s.key] || { status: 'pending', progress: 0 }]));
}

export function setStage(job, key, patch) {
  const s = (job.stages[key] ||= { status: 'pending', progress: 0 });
  if (patch.status === 'running' && !s.startedAt) s.startedAt = Date.now();
  if (patch.status === 'done' || patch.status === 'error') s.endedAt = Date.now();
  Object.assign(s, patch);
  emit(job);
}
