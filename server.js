import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { config, ROOT, DATA_DIR, JOBS_DIR, MAX_CLIPS, LLM_PRICING, STT_PRICING, CAPTIK_FONTS } from './src/config.js';
import { createJob, getJob, listJobs, saveJob, jobDir, bus, STAGES, logLine } from './src/jobs.js';
import { enqueue, resumeQueued, queueRerender, startTrim, trimSource } from './src/pipeline.js';
import { sanitizeEdit } from './src/captikRender.js';
import { romanizeClips, needsRoman } from './src/romanize.js';
import { llmLineItem, summarize } from './src/cost.js';
import { loadTemplateCatalog } from './src/director.js';
import { classifySource, SUPPORTED_PLATFORMS, ytdlpCommand } from './src/ingest.js';
import { estimate, loadCalibration } from './src/cost.js';
import { addFeedback, loadFeedback } from './src/feedback.js';
import { loadModel, saveModel, trainWeights, FEATURES, DEFAULT_WEIGHTS } from './src/virality.js';
import { clamp, run } from './src/util.js';

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
await fs.mkdir(JOBS_DIR, { recursive: true });
await fs.mkdir(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '1mb' }));
// The clipper home (/) and the clip studio (/editor/), built by Vite from web/ (npm run build).
app.use(express.static(path.join(ROOT, 'dist')));
// Captik's fonts first (the editor + templates reference /fonts/*), then the clipper's own.
app.use('/fonts', express.static(CAPTIK_FONTS));
app.use('/fonts', express.static(path.join(ROOT, 'assets', 'fonts')));
app.use('/media', express.static(JOBS_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 8 * 1024 ** 3 },
  fileFilter: (_req, file, cb) => cb(null, /^video\//.test(file.mimetype) || /\.(mp4|mov|m4v|mkv|webm|avi)$/i.test(file.originalname)),
});

function jobOptions(body = {}, fallback = {}) {
  const pick = (v, table, d) => (table[v] ? v : d);
  const captions = body.captions ?? fallback.captions ?? true;
  return {
    maxClips: clamp(parseInt(body.maxClips ?? fallback.maxClips, 10) || MAX_CLIPS, 1, MAX_CLIPS),
    model: pick(body.model, LLM_PRICING, fallback.model || config.curatorModel),
    sttModel: pick(body.sttModel, STT_PRICING, fallback.sttModel || config.sttModel),
    captions: captions !== false && captions !== 'false',
  };
}

app.post('/api/jobs', upload.single('file'), async (req, res, next) => {
  try {
    const opts = jobOptions(req.body);
    let job;
    if (req.file) {
      job = await createJob({ kind: 'upload', fileName: req.file.originalname, ...opts });
      const stored = `upload${path.extname(req.file.originalname).toLowerCase() || '.mp4'}`;
      await fs.rename(req.file.path, path.join(jobDir(job.id), stored));
      job.input.storedName = stored;
      await saveJob(job);
    } else {
      const src = classifySource(req.body?.url);
      if (!src) return res.status(400).json({ error: 'Paste a full https:// link, or upload a video file.' });
      job = await createJob({ kind: 'url', url: src.url, platform: src.platform, ...opts });
    }
    enqueue(job);
    res.status(201).json({ id: job.id });
  } catch (err) {
    next(err);
  }
});

app.post('/api/jobs/:id/recurate', async (req, res, next) => {
  try {
    const prev = await getJob(req.params.id);
    if (!prev?.source) return res.status(404).json({ error: 'That job has nothing to re-curate yet.' });
    const fromJobId = prev.input.kind === 'recurate' ? prev.input.fromJobId : prev.id;
    const job = await createJob({ kind: 'recurate', fromJobId, ...jobOptions(req.body, prev.input) });
    enqueue(job);
    res.status(201).json({ id: job.id });
  } catch (err) {
    next(err);
  }
});

app.get('/api/jobs', async (_req, res) => res.json(await listJobs()));

app.get('/api/templates', async (_req, res, next) => {
  try { res.json(await loadTemplateCatalog()); } catch (err) { next(err); }
});

// The editor sends the trim revision it loaded; an edit made before a trim must not overwrite the re-timed captions.
const staleTrim = (clip, body) => body?.trimRev !== undefined && (body.trimRev ?? null) !== (clip.trim?.trimmedAt ?? null);
const TRIMMED = { error: 'This clip was trimmed after the editor loaded it. Reload to keep editing.', code: 'trimmed' };

// The editor saves a clip's Captik state (words, lines, template, colours, position) here.
app.put('/api/jobs/:id/clips/:clipId/edit', async (req, res, next) => {
  try {
    const job = await getJob(req.params.id, { raw: true });
    const clip = job?.clips.find((c) => c.id === req.params.clipId);
    if (!clip?.edit) return res.status(404).json({ error: 'Clip not found or not styled yet' });
    if (clip.status === 'trimming') return res.status(409).json({ error: 'This clip is being trimmed; the editor reloads it when the trim is done.' });
    if (staleTrim(clip, req.body)) return res.status(409).json(TRIMMED);
    clip.edit = sanitizeEdit(req.body?.edit, clip.edit);
    clip.dirty = true;
    await saveJob(job);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Convert an existing job's Devanagari captions to romanized Hinglish, keep every word's timing and style,
// add the cost to the job's receipt, and re-render the changed clips.
app.post('/api/jobs/:id/romanize', async (req, res, next) => {
  try {
    const job = await getJob(req.params.id, { raw: true });
    if (!job?.clips?.length) return res.status(404).json({ error: 'Job not found or has no clips' });
    if (job.status === 'running' || job.status === 'queued') return res.status(409).json({ error: 'Wait for the job to finish first' });
    const clips = job.clips.filter((c) => c.edit?.words && needsRoman(c.edit.words));
    if (!clips.length) return res.json({ ok: true, romanized: 0, failed: [] });
    const r = await romanizeClips(clips.map((c) => ({ id: c.id, words: c.edit.words })), { model: job.input.model });
    for (const c of clips) {
      const words = r.words.get(c.id);
      if (words) c.edit = { ...c.edit, words };
    }
    if (job.cost?.items) {
      job.cost = summarize([...job.cost.items, { ...llmLineItem(r.model, r.usage), stage: 'Romanize' }], {
        sourceMinutes: (job.source?.duration || 60) / 60,
        clipCount: job.clips.filter((c) => c.status === 'done').length,
      });
    }
    logLine(job, `Romanized captions for ${r.words.size} clips${r.failed.length ? `; kept Devanagari for ${r.failed.join(', ')}` : ''}`);
    const rerender = req.body?.render !== false ? clips.filter((c) => r.words.has(c.id) && c.base) : [];
    for (const c of rerender) Object.assign(c, { status: 'queued', progress: 0 });
    await saveJob(job);
    for (const c of rerender) queueRerender(job, c.id).catch(() => {});
    res.json({ ok: true, romanized: r.words.size, failed: r.failed, rerendering: rerender.map((c) => c.id), usage: r.usage });
  } catch (err) {
    next(err);
  }
});

// The trim track: source words, loudness and downloaded video around a clip (?context= seconds each side).
app.get('/api/jobs/:id/clips/:clipId/source', async (req, res, next) => {
  try {
    const job = await getJob(req.params.id, { raw: true });
    const clip = job?.clips.find((c) => c.id === req.params.clipId);
    if (!clip?.edit || !job.source) return res.status(404).json({ error: 'Clip not found or not ready' });
    res.json(await trimSource(job, clip, { contextSec: req.query.context }));
  } catch (err) {
    next(err);
  }
});

// Trim a clip to new in/out points (source seconds). Re-cuts the 9:16 base — downloading more video when the
// range reaches past the part — re-times the captions keeping every edit, and re-scores. Progress arrives over SSE.
app.post('/api/jobs/:id/clips/:clipId/trim', async (req, res, next) => {
  try {
    const job = await getJob(req.params.id, { raw: true });
    const clip = job?.clips.find((c) => c.id === req.params.clipId);
    if (!clip?.edit || !clip.base || !job.source) return res.status(404).json({ error: 'Clip not found or not ready to trim' });
    if (job.status === 'running' || job.status === 'queued') return res.status(409).json({ error: 'Wait for the job to finish first' });
    if (staleTrim(clip, req.body)) return res.status(409).json(TRIMMED);
    if (req.body?.edit && clip.status !== 'trimming') clip.edit = sanitizeEdit(req.body.edit, clip.edit);
    const range = await startTrim(job, clip, { start: req.body?.start, end: req.body?.end });
    res.status(202).json({ ok: true, ...range });
  } catch (err) {
    next(err);
  }
});

// Export from the editor: save the state (if sent) and re-render through Captik's composition.
app.post('/api/jobs/:id/clips/:clipId/render', async (req, res, next) => {
  try {
    const job = await getJob(req.params.id, { raw: true });
    const clip = job?.clips.find((c) => c.id === req.params.clipId);
    if (!clip?.base || !clip.edit) return res.status(404).json({ error: 'Clip not found or not ready to render' });
    if (clip.status === 'trimming') return res.status(409).json({ error: 'Wait for the trim to finish before exporting.' });
    if (staleTrim(clip, req.body)) return res.status(409).json(TRIMMED);
    if (req.body?.edit) clip.edit = sanitizeEdit(req.body.edit, clip.edit);
    Object.assign(clip, { status: 'queued', progress: 0 });
    await saveJob(job);
    queueRerender(job, clip.id).catch(() => {});
    res.status(202).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  const job = await getJob(req.params.id);
  return job ? res.json(job) : res.status(404).json({ error: 'Job not found' });
});

app.get('/api/jobs/:id/events', async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).end();
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  let last = 0;
  let pending = null;
  // Jobs mutate in place, so a trailing write always serialises the newest state.
  const send = (j) => {
    const write = () => { last = Date.now(); pending = null; res.write(`data: ${JSON.stringify(j)}\n\n`); };
    if (Date.now() - last >= 250) write();
    else pending ||= setTimeout(write, 250 - (Date.now() - last));
  };
  send(job);
  bus.on(job.id, send);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    bus.off(job.id, send);
    clearInterval(ping);
    clearTimeout(pending);
  });
});

app.post('/api/jobs/:id/clips/:clipId/feedback', async (req, res, next) => {
  try {
    const job = await getJob(req.params.id);
    const clip = job?.clips.find((c) => c.id === req.params.clipId);
    if (!clip) return res.status(404).json({ error: 'Clip not found' });
    const label = req.body?.label === 1 || req.body?.label === 0 ? req.body.label : null;
    const note = String(req.body?.note || '').slice(0, 300);
    clip.feedback = label;
    clip.feedbackNote = note;
    await saveJob(job);
    await addFeedback({
      jobId: job.id,
      clipId: clip.id,
      label,
      note,
      title: clip.title,
      format: clip.format,
      duration: clip.duration,
      transcript: clip.transcript.slice(0, 800),
      features: clip.features,
      score: clip.score,
    });
    const all = await loadFeedback();
    res.json({ ok: true, ratings: all.length });
  } catch (err) {
    next(err);
  }
});

async function modelStatus() {
  const [model, feedback] = await Promise.all([loadModel(), loadFeedback()]);
  const liked = feedback.filter((f) => f.label === 1).length;
  return { ...model, features: FEATURES, defaults: DEFAULT_WEIGHTS, ratings: { total: feedback.length, liked, disliked: feedback.length - liked } };
}

app.get('/api/model', async (_req, res) => res.json(await modelStatus()));

app.post('/api/train', async (req, res, next) => {
  try {
    const samples = (await loadFeedback()).filter((f) => f.features);
    const liked = samples.filter((s) => s.label === 1).length;
    if (samples.length < 6 || liked < 2 || samples.length - liked < 2) {
      return res.status(400).json({ error: `Rate at least 6 clips, with 2+ thumbs up and 2+ thumbs down (now ${liked} up, ${samples.length - liked} down).` });
    }
    const result = trainWeights(samples, DEFAULT_WEIGHTS);
    await saveModel({ ...result, trainedAt: new Date().toISOString() });
    res.json({ ...result, status: await modelStatus() });
  } catch (err) {
    next(err);
  }
});

app.post('/api/model/reset', async (_req, res) => {
  await fs.rm(path.join(ROOT, 'training', 'weights.json'), { force: true });
  res.json(await modelStatus());
});

app.get('/api/estimate', async (req, res) => {
  const minutes = clamp(Number(req.query.minutes) || 20, 1, 600);
  const opts = jobOptions(req.query);
  res.json(estimate({ minutes, model: opts.model, sttModel: opts.sttModel, clips: opts.maxClips, calibration: await loadCalibration() }));
});

let toolCache;
app.get('/api/health', async (_req, res) => {
  toolCache ||= await Promise.all([
    run(config.ffmpeg, ['-version']).then((r) => r.stdout.split('\n')[0].split(' ')[2]).catch(() => null),
    ytdlpCommand().then((y) => y?.version || null),
  ]);
  res.json({
    ffmpeg: toolCache[0],
    ytdlp: toolCache[1],
    anthropicKey: Boolean(config.anthropicKey),
    groqKey: Boolean(config.groqKey),
    sarvamKey: Boolean(config.sarvamKey),
    wordTiming: Boolean(config.elevenlabsKey || config.supabaseServiceRoleKey),
    maxClips: MAX_CLIPS,
    defaults: { model: config.curatorModel, sttModel: config.sttModel },
    models: Object.keys(LLM_PRICING),
    sttModels: Object.keys(STT_PRICING),
    platforms: SUPPORTED_PLATFORMS,
    stages: STAGES,
    usdInr: config.usdInr,
  });
});

app.use((err, _req, res, _next) => {
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || 500;
  res.status(status).json({ error: err.message || 'Something went wrong' });
});

app.listen(config.port, '127.0.0.1', () => {
  console.log(`Captik Clipper running at http://localhost:${config.port}`);
  resumeQueued().catch((err) => console.error('resume failed', err));
});
