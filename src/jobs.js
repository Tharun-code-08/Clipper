import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { JOBS_DIR } from './config.js';
import { readJson, writeJson } from './util.js';

export const STAGES = [
  { key: 'ingest', label: 'Fetch video' },
  { key: 'analyze', label: 'Listen & watch' },
  { key: 'curate', label: 'Curate' },
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

export async function getJob(id) {
  if (!validId(id)) return null;
  if (live.has(id)) return live.get(id);
  const job = await readJson(path.join(jobDir(id), 'job.json'));
  if (!job) return null;
  if (job.status === 'queued' || job.status === 'running') {
    job.status = 'error';
    job.error = 'The server restarted while this job was running. Start it again.';
  }
  return job;
}

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
    }));
}

export const emit = (job) => bus.emit(job.id, job);

export function logLine(job, msg) {
  job.log.push({ at: new Date().toISOString(), msg });
  if (job.log.length > 300) job.log.splice(0, job.log.length - 300);
  emit(job);
}

export function setStage(job, key, patch) {
  const s = job.stages[key];
  if (patch.status === 'running' && !s.startedAt) s.startedAt = Date.now();
  if (patch.status === 'done' || patch.status === 'error') s.endedAt = Date.now();
  Object.assign(s, patch);
  emit(job);
}
