import fs from 'node:fs/promises';
import path from 'node:path';
import { config, MAX_CLIPS } from './config.js';
import { jobDir, getJob, saveJob, setStage, logLine, emit } from './jobs.js';
import { ingestUrl } from './ingest.js';
import { probe, extractAudio, loudnessMap, scanVideo } from './media.js';
import { transcribe } from './transcribe.js';
import { buildPhrases, formatTranscript } from './transcript.js';
import { buildPrompt, callCurator, parseCuratorMessage, finalizeClips } from './curate.js';
import { loadModel, measureContext, measureClip, llmFeatures, computeScore, tierOf } from './virality.js';
import { renderClip } from './render.js';
import { llmLineItem, sttLineItem, computeLineItem, summarize, recordCalibration } from './cost.js';
import { loadFeedback } from './feedback.js';
import { clamp, fmtTime, mapLimit, readJson, writeJson } from './util.js';

const MIN_SOURCE_SEC = 30;
const queue = [];
let active = 0;

/** Jobs run one at a time: ffmpeg already saturates the CPU. */
export function enqueue(job) {
  queue.push(job);
  logLine(job, queue.length + active > 1 ? `Queued behind ${queue.length + active - 1} job(s)` : 'Starting');
  pump();
}

function pump() {
  if (active || !queue.length) return;
  const job = queue.shift();
  active++;
  runJob(job).finally(() => { active--; pump(); });
}

const timed = async (promise) => { const t = Date.now(); const value = await promise; return [value, Date.now() - t]; };

/** ~360 loudness bars in 0..1 for the energy timeline in the UI. */
function energyBars(db, count = 360) {
  const size = Math.max(1, Math.floor(db.length / count));
  const bars = [];
  for (let i = 0; i < db.length; i += size) {
    const slice = db.slice(i, i + size);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    bars.push(Math.round(clamp((mean + 50) / 40, 0, 1) * 100) / 100);
  }
  return bars;
}

function updateCost(ctx, clipCount = 0) {
  ctx.job.cost = summarize(ctx.costItems, { sourceMinutes: (ctx.job.source?.duration || 60) / 60, clipCount });
  emit(ctx.job);
}

async function stageIngest(ctx) {
  const { job, dir } = ctx;
  setStage(job, 'ingest', { status: 'running', progress: 0 });
  let meta;
  if (job.input.kind === 'upload') {
    ctx.sourceFile = path.join(dir, job.input.storedName);
    meta = { title: job.input.fileName.replace(/\.[^.]+$/, ''), uploader: '', description: '', webpageUrl: '', thumbnail: '', viewCount: null, source: { platform: 'upload', label: 'Upload' } };
    logLine(job, `Using uploaded file ${job.input.fileName}`);
  } else {
    logLine(job, `Fetching ${job.input.url}`);
    let lastPct = -1;
    meta = await ingestUrl(job.input.url, dir, (p) => {
      const pct = Math.floor(p * 100);
      if (pct !== lastPct) { lastPct = pct; setStage(job, 'ingest', { progress: p }); }
    });
    ctx.sourceFile = meta.file;
  }
  const pr = await probe(ctx.sourceFile);
  if (!pr.hasVideo) throw new Error('This file has no video track.');
  if (!pr.hasAudio) throw new Error('This video has no audio track, and clipping needs speech.');
  if (pr.duration < MIN_SOURCE_SEC) throw new Error(`This video is only ${Math.round(pr.duration)} s long; send a long-form video.`);
  if (pr.duration > config.maxSourceMinutes * 60) {
    throw new Error(`This video is ${fmtTime(pr.duration)} long; the limit is ${config.maxSourceMinutes} minutes (MAX_SOURCE_MINUTES in .env).`);
  }
  ctx.probe = pr;
  job.source = {
    title: meta.title,
    uploader: meta.uploader,
    description: meta.description,
    url: meta.webpageUrl || job.input.url || '',
    platform: meta.source.platform,
    platformLabel: meta.source.label,
    thumbnail: meta.thumbnail,
    viewCount: meta.viewCount,
    file: path.basename(ctx.sourceFile),
    ...pr,
  };
  setStage(job, 'ingest', { status: 'done', progress: 1 });
  logLine(job, `Got "${meta.title}" — ${fmtTime(pr.duration)}, ${pr.width}x${pr.height} @ ${pr.fps} fps`);
  await saveJob(job);
}

async function stageAnalyze(ctx) {
  const { job, dir } = ctx;
  setStage(job, 'analyze', { status: 'running', progress: 0 });
  const audio = path.join(dir, 'audio.mp3');
  const [, extractMs] = await timed(extractAudio(ctx.sourceFile, audio));
  const frameEvery = Math.max(10, Math.round(ctx.probe.duration / 48));
  let sttP = 0;
  let loudDone = false;
  let scanDone = false;
  const bump = () => setStage(job, 'analyze', { progress: 0.05 + 0.6 * sttP + (loudDone ? 0.1 : 0) + (scanDone ? 0.25 : 0) });
  logLine(job, `Transcribing with ${job.input.sttModel}, measuring loudness, scanning scenes`);
  const [[stt], [loud, loudMs], [scan, scanMs]] = await Promise.all([
    timed(transcribe(audio, ctx.probe.duration, dir, { model: job.input.sttModel, onProgress: (p) => { sttP = p; bump(); } })),
    timed(loudnessMap(audio).then((r) => { loudDone = true; bump(); return r; })),
    timed(scanVideo(ctx.sourceFile, dir, { frameEvery }).then((r) => { scanDone = true; bump(); return r; })),
  ]);
  logLine(job, `Transcribed ${stt.words.length.toLocaleString('en-US')} words (${stt.language || 'language unknown'}); ${scan.scenes.length} scene cuts; ${scan.frames.length} frames`);
  if (stt.words.length < 40) throw new Error('Not enough speech was found in this video to clip.');
  await writeJson(path.join(dir, 'analysis.json'), { stt, loud, scan, frameEvery });
  Object.assign(ctx, { stt, loud, scan, frameEvery, framesDir: dir, analyzeMs: extractMs + loudMs + scanMs });
  job.source.language = stt.language;
  job.energy = energyBars(loud.db);
  job.scenes = scan.scenes;
  ctx.costItems.push(sttLineItem(stt.model, stt.billedSec));
  updateCost(ctx);
  setStage(job, 'analyze', { status: 'done', progress: 1 });
}

/** Re-curation: reuse the source, transcript, loudness and frames of an earlier job. */
async function stageReuse(ctx) {
  const { job } = ctx;
  const prev = await getJob(job.input.fromJobId);
  const prevDir = jobDir(job.input.fromJobId);
  const analysis = await readJson(path.join(prevDir, 'analysis.json'));
  if (!prev?.source || !analysis) throw new Error('The original job has no saved analysis to reuse.');
  Object.assign(ctx, {
    sourceFile: path.join(prevDir, prev.source.file),
    probe: prev.source,
    stt: analysis.stt,
    loud: analysis.loud,
    scan: analysis.scan,
    frameEvery: analysis.frameEvery,
    framesDir: prevDir,
    analyzeMs: 0,
  });
  job.source = { ...prev.source };
  job.energy = prev.energy;
  job.scenes = prev.scenes;
  setStage(job, 'ingest', { status: 'done', progress: 1, note: 'reused' });
  setStage(job, 'analyze', { status: 'done', progress: 1, note: 'reused' });
  logLine(job, `Re-curating "${prev.source.title}" with the saved transcript (no download or transcription cost)`);
}

async function stageCurate(ctx) {
  const { job, dir } = ctx;
  setStage(job, 'curate', { status: 'running', progress: 0 });
  const phrases = buildPhrases(ctx.stt.words);
  const transcriptText = formatTranscript(phrases, { loudness: ctx.loud, scenes: ctx.scan.scenes });
  const feedback = await loadFeedback();
  const maxClips = clamp(Number(job.input.maxClips) || MAX_CLIPS, 1, MAX_CLIPS);
  const prompt = await buildPrompt({
    meta: { ...job.source, language: ctx.stt.language },
    transcriptText,
    frames: ctx.scan.frames,
    frameEvery: ctx.frameEvery,
    jobDir: ctx.framesDir,
    maxClips,
    feedback,
  });
  await fs.writeFile(path.join(dir, 'prompt.txt'), prompt.debugText);
  logLine(job, `${job.input.model} is reading ${phrases.length} transcript lines and ${ctx.scan.frames.length} frames${feedback.length ? `, guided by ${feedback.length} of your ratings` : ''}`);

  const started = Date.now();
  const ticker = setInterval(() => {
    setStage(job, 'curate', { progress: Math.min(0.95, (Date.now() - started) / 180_000), elapsedMs: Date.now() - started });
  }, 1000);
  let result;
  try {
    result = await callCurator(prompt, { model: job.input.model, onProgress: (p) => { job.stages.curate.phase = p.phase; } });
  } finally {
    clearInterval(ticker);
  }
  const { msg, ms } = result;
  await writeJson(path.join(dir, 'curator_response.json'), msg);
  const served = msg.model || result.requestedModel;
  ctx.costItems.push(llmLineItem(served, msg.usage));
  updateCost(ctx);
  if (served !== job.input.model) logLine(job, `${job.input.model} was unavailable, so ${served} curated this run`);

  const raw = parseCuratorMessage(msg);
  job.summary = raw.video_summary;
  const { clips, rejected } = finalizeClips(raw.clips, { words: ctx.stt.words, duration: ctx.probe.duration, maxClips });
  job.rejected = rejected;
  logLine(job, `Curator proposed ${raw.clips.length} moments in ${Math.round(ms / 1000)} s; ${clips.length} passed validation${rejected.length ? `, ${rejected.length} rejected` : ''}`);
  if (!clips.length) throw new Error('The curator found no clip-worthy moments in this video.');
  Object.assign(ctx, { clips, usage: msg.usage, servedModel: served });
  setStage(job, 'curate', { status: 'done', progress: 1, model: served, elapsedMs: ms });
}

async function stageScore(ctx) {
  const { job } = ctx;
  setStage(job, 'score', { status: 'running', progress: 0 });
  const model = await loadModel();
  const mctx = measureContext({ words: ctx.stt.words, loudness: ctx.loud, scenes: ctx.scan.scenes });
  for (const c of ctx.clips) {
    const m = measureClip(c, mctx);
    c.features = { ...llmFeatures(c.scores), ...m.features };
    c.stats = m.stats;
    c.score = computeScore(c.features, model.weights);
    c.tier = tierOf(c.score);
  }
  ctx.clips.sort((a, b) => b.score - a.score);
  ctx.clips.forEach((c, i) => Object.assign(c, { rank: i + 1, status: 'pending', progress: 0 }));
  job.clips = ctx.clips;
  job.scoreModel = { trained: model.trained, trainedAt: model.trainedAt || null, samples: model.samples || 0 };
  setStage(job, 'score', { status: 'done', progress: 1 });
  await saveJob(job);
}

async function stageRender(ctx) {
  const { job, dir } = ctx;
  setStage(job, 'render', { status: 'running', progress: 0 });
  let renderMs = 0;
  let renderedSec = 0;
  await mapLimit(job.clips, config.renderConcurrency, async (clip) => {
    clip.status = 'rendering';
    try {
      const r = await renderClip({
        jobDir: dir,
        sourceFile: ctx.sourceFile,
        probe: ctx.probe,
        clip,
        words: ctx.stt.words,
        captions: job.input.captions !== false,
        onProgress: (p) => {
          clip.progress = p;
          setStage(job, 'render', { progress: job.clips.reduce((a, c) => a + (c.progress || 0), 0) / job.clips.length });
        },
      });
      Object.assign(clip, r, { status: 'done', progress: 1 });
      renderMs += r.renderMs;
      renderedSec += clip.duration;
      logLine(job, `Rendered #${clip.rank} "${clip.title}" (${clip.duration} s)`);
    } catch (err) {
      Object.assign(clip, { status: 'error', error: err.message });
      logLine(job, `Render failed for "${clip.title}": ${err.message}`);
    }
    await saveJob(job);
  });
  const ok = job.clips.filter((c) => c.status === 'done');
  if (!ok.length) throw new Error('Every clip failed to render.');
  setStage(job, 'render', { status: 'done', progress: 1 });
  Object.assign(ctx, { renderMs, renderedSec, rendered: ok.length });
}

async function runJob(job) {
  const ctx = { job, dir: jobDir(job.id), costItems: [] };
  const started = Date.now();
  job.status = 'running';
  emit(job);
  try {
    if (job.input.kind === 'recurate') {
      await stageReuse(ctx);
    } else {
      await stageIngest(ctx);
      await stageAnalyze(ctx);
    }
    await stageCurate(ctx);
    await stageScore(ctx);
    await stageRender(ctx);

    if (ctx.analyzeMs) ctx.costItems.push(computeLineItem('Analysis', ctx.analyzeMs));
    ctx.costItems.push(computeLineItem('Rendering', ctx.renderMs));
    updateCost(ctx, ctx.rendered);
    if (job.input.kind !== 'recurate') {
      await recordCalibration({
        jobId: job.id,
        sourceMinutes: ctx.probe.duration / 60,
        language: ctx.stt.language,
        model: ctx.servedModel,
        sttModel: ctx.stt.model,
        frames: ctx.scan.frames.length,
        inputTokens: ctx.usage.input_tokens,
        outputTokens: ctx.usage.output_tokens,
        analyzeMs: ctx.analyzeMs,
        renderMs: ctx.renderMs,
        renderedClipSeconds: ctx.renderedSec,
        clips: ctx.rendered,
      });
    }
    job.status = 'done';
    job.totalMs = Date.now() - started;
    logLine(job, `Done: ${ctx.rendered} clips in ${fmtTime(job.totalMs / 1000)} for $${job.cost.usd.toFixed(3)} (₹${job.cost.inr.toFixed(2)})`);
  } catch (err) {
    job.status = 'error';
    job.error = err.message;
    const running = Object.entries(job.stages).find(([, s]) => s.status === 'running');
    if (running) setStage(job, running[0], { status: 'error' });
    if (ctx.costItems.length) updateCost(ctx);
    logLine(job, `Failed: ${err.message}`);
  } finally {
    await saveJob(job);
    emit(job);
  }
}
