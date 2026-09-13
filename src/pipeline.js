import fs from 'node:fs/promises';
import path from 'node:path';
import { config, MAX_CLIPS, JOBS_DIR } from './config.js';
import { jobDir, getJob, saveJob, setStage, logLine, emit, normalizeStages } from './jobs.js';
import { classifySource } from './ingest.js';
import { fetchAudio, fetchSections } from './fetcher.js';
import { probe, extractAudio, loudnessMap, grabFrame } from './media.js';
import { transcribe } from './transcribe.js';
import { transcribeSarvam } from './sarvamStt.js';
import { buildPhrases, formatTranscript } from './transcript.js';
import { buildPrompt, callCurator, finalizeClips } from './curate.js';
import { alignSection } from './align.js';
import { renderBase } from './render.js';
import { toCaptikWords } from './segments.js';
import { romanizeClips, needsRoman } from './romanize.js';
import { directClips, editStateFor, validateStyle, loadTemplateCatalog } from './director.js';
import { renderWithCaptik, captionPropsFromEdit } from './captikRender.js';
import { loadModel, measureContext, measureClip, llmFeatures, computeScore, tierOf } from './virality.js';
import { llmLineItem, sttLineItem, alignLineItem, computeLineItem, summarize, recordCalibration } from './cost.js';
import { loadFeedback } from './feedback.js';
import { clamp, fmtTime, mapLimit, readJson, writeJson } from './util.js';

// Architecture: get the audio → transcribe → the LLM picks the best parts → download ONLY those parts
// → frames from those parts → the LLM styles captions from the frames → render with Captik's templates.
const MIN_SOURCE_SEC = 30;
const queue = [];
let active = 0;

/** Jobs run one at a time: ffmpeg and Remotion already saturate the CPU. */
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

/** On boot, start any job that was accepted but never began (e.g. the server restarted right after upload). */
export async function resumeQueued() {
  const names = await fs.readdir(JOBS_DIR).catch(() => []);
  for (const id of names.sort()) {
    const raw = await readJson(path.join(jobDir(id), 'job.json'));
    if (raw?.status === 'queued' && !raw.log?.length) {
      const job = await getJob(id, { raw: true });
      if (job) enqueue(job);
    }
  }
}

const timed = async (promise) => { const t = Date.now(); const value = await promise; return [value, Date.now() - t]; };
const rel = (dir, abs) => path.relative(dir, abs).split(path.sep).join('/');

function energyBars(db, count = 360) {
  const size = Math.max(1, Math.floor(db.length / count));
  const bars = [];
  for (let i = 0; i < db.length; i += size) {
    const slice = db.slice(i, i + size);
    bars.push(Math.round(clamp((slice.reduce((a, b) => a + b, 0) / slice.length + 50) / 40, 0, 1) * 100) / 100);
  }
  return bars;
}

function updateCost(ctx, clipCount = 0) {
  ctx.job.cost = summarize(ctx.costItems, { sourceMinutes: (ctx.duration || 60) / 60, clipCount });
  emit(ctx.job);
}

async function stageAudio(ctx) {
  const { job, dir } = ctx;
  setStage(job, 'audio', { status: 'running', progress: 0 });
  let meta;
  if (job.input.kind === 'upload') {
    ctx.fullVideo = path.join(dir, job.input.storedName);
    ctx.audioSource = ctx.fullVideo;
    meta = { title: job.input.fileName.replace(/\.[^.]+$/, ''), platform: 'upload', platformLabel: 'Upload' };
    logLine(job, `Using uploaded file ${job.input.fileName}`);
  } else {
    const src = classifySource(job.input.url);
    logLine(job, `Downloading only the audio from ${src?.label || 'the link'}`);
    const started = Date.now();
    const got = await fetchAudio(job.input.url, dir, (p) => setStage(job, 'audio', { progress: p }));
    ctx.audioSource = got.file;
    ctx.fullVideo = got.full_video ? got.file : null;
    meta = {
      title: got.meta.title,
      uploader: got.meta.uploader,
      description: got.meta.description,
      url: got.meta.webpage_url || job.input.url,
      thumbnail: got.meta.thumbnail,
      viewCount: got.meta.view_count,
      platform: src?.platform || 'web',
      platformLabel: src?.label || 'Web',
    };
    logLine(job, `Audio ready in ${Math.round((Date.now() - started) / 1000)} s${got.full_video ? ' (no separate audio on this site, so the video came down whole)' : ''}`);
  }
  const pr = await probe(ctx.audioSource);
  if (!pr.hasAudio) throw new Error('This video has no audio track, and clipping needs speech.');
  if (ctx.fullVideo && !pr.hasVideo) throw new Error('This file has no video track.');
  if (pr.duration < MIN_SOURCE_SEC) throw new Error(`This video is only ${Math.round(pr.duration)} s long; send a long-form video.`);
  if (pr.duration > config.maxSourceMinutes * 60) {
    throw new Error(`This video is ${fmtTime(pr.duration)} long; the limit is ${config.maxSourceMinutes} minutes (MAX_SOURCE_MINUTES in .env).`);
  }
  ctx.duration = pr.duration;
  job.source = {
    ...meta,
    duration: pr.duration,
    audioFile: rel(dir, ctx.audioSource),
    fullVideo: ctx.fullVideo ? rel(dir, ctx.fullVideo) : null,
    ...(ctx.fullVideo ? { width: pr.width, height: pr.height, fps: pr.fps } : {}),
  };
  setStage(job, 'audio', { status: 'done', progress: 1 });
  logLine(job, `"${meta.title}" — ${fmtTime(pr.duration)}`);
  await saveJob(job);
}

async function stageTranscribe(ctx) {
  const { job, dir } = ctx;
  setStage(job, 'transcribe', { status: 'running', progress: 0 });
  const audio = path.join(dir, 'audio.mp3');
  const [, extractMs] = await timed(extractAudio(ctx.audioSource, audio));
  let sttP = 0;
  let loudDone = false;
  const bump = () => setStage(job, 'transcribe', { progress: 0.05 + 0.85 * sttP + (loudDone ? 0.1 : 0) });
  const sarvam = String(job.input.sttModel).startsWith('sarvam:');
  logLine(job, sarvam
    ? `Transcribing ${fmtTime(ctx.duration)} with Sarvam ${config.sarvamModel} (codemix), timing every word with ElevenLabs forced alignment`
    : `Transcribing ${fmtTime(ctx.duration)} with ${job.input.sttModel}`);
  const onSttProgress = (p) => { sttP = p; bump(); };
  const [[stt], [loud, loudMs]] = await Promise.all([
    timed(sarvam
      ? transcribeSarvam(ctx.audioSource, ctx.duration, { onProgress: onSttProgress })
      : transcribe(audio, ctx.duration, dir, { model: job.input.sttModel, onProgress: onSttProgress })),
    timed(loudnessMap(audio).then((r) => { loudDone = true; bump(); return r; })),
  ]);
  if (stt.words.length < 40) throw new Error('Not enough speech was found in this video to clip.');
  const sttStats = stt.stats
    ? ` — ${stt.stats.chunks} Sarvam chunks, ${stt.stats.accepted} alignment windows accepted (mean loss ${stt.stats.meanLoss})${stt.stats.fallback ? `, ${stt.stats.fallback} fell back to even timing` : ''}`
    : '';
  logLine(job, `Transcribed ${stt.words.length.toLocaleString('en-US')} words (${stt.language || 'language unknown'})${sttStats}`);
  await writeJson(path.join(dir, 'analysis.json'), { stt, loud });
  Object.assign(ctx, { stt, loud, analyzeMs: extractMs + loudMs });
  job.source.language = stt.language;
  job.energy = energyBars(loud.db);
  job.scenes = [];
  ctx.costItems.push(sttLineItem(stt.model, stt.billedSec));
  if (stt.alignedSec) ctx.costItems.push(alignLineItem(stt.alignedSec));
  updateCost(ctx);
  setStage(job, 'transcribe', { status: 'done', progress: 1 });
}

/** Re-curation: reuse the audio + transcript of an earlier job (only the LLM calls and parts are paid again). */
async function stageReuse(ctx) {
  const { job } = ctx;
  const prev = await getJob(job.input.fromJobId);
  const prevDir = jobDir(job.input.fromJobId);
  const analysis = await readJson(path.join(prevDir, 'analysis.json'));
  if (!prev?.source?.audioFile || !analysis?.stt) throw new Error('The original job has no saved audio + transcript to reuse. Run the link again.');
  Object.assign(ctx, {
    audioSource: path.join(prevDir, prev.source.audioFile),
    fullVideo: prev.source.fullVideo ? path.join(prevDir, prev.source.fullVideo) : null,
    duration: prev.source.duration,
    stt: analysis.stt,
    loud: analysis.loud,
    analyzeMs: 0,
    url: prev.input.url,
  });
  job.source = { ...prev.source, sourceJobId: prev.id };
  job.energy = prev.energy;
  job.scenes = [];
  setStage(job, 'audio', { status: 'done', progress: 1, note: 'reused' });
  setStage(job, 'transcribe', { status: 'done', progress: 1, note: 'reused' });
  logLine(job, `Re-curating "${prev.source.title}" with the saved transcript`);
}

async function stageCurate(ctx) {
  const { job, dir } = ctx;
  setStage(job, 'curate', { status: 'running', progress: 0 });
  const phrases = buildPhrases(ctx.stt.words);
  const transcriptText = formatTranscript(phrases, { loudness: ctx.loud, scenes: [] });
  const feedback = await loadFeedback();
  const maxClips = clamp(Number(job.input.maxClips) || MAX_CLIPS, 1, MAX_CLIPS);
  const prompt = await buildPrompt({ meta: { ...job.source, language: ctx.stt.language }, transcriptText, maxClips, feedback });
  await fs.writeFile(path.join(dir, 'prompt.txt'), prompt.debugText);
  logLine(job, `${job.input.model} is reading ${phrases.length} transcript lines${feedback.length ? `, guided by ${feedback.length} of your ratings` : ''}`);

  const started = Date.now();
  const ticker = setInterval(() => setStage(job, 'curate', { progress: Math.min(0.95, (Date.now() - started) / 150_000), elapsedMs: Date.now() - started }), 1000);
  let result;
  try {
    result = await callCurator(prompt, { model: job.input.model, onProgress: (p) => { job.stages.curate.phase = p.phase; } });
  } finally {
    clearInterval(ticker);
  }
  const { data, msg, model: served, ms } = result;
  await writeJson(path.join(dir, 'curator_response.json'), msg);
  ctx.costItems.push(llmLineItem(served, msg.usage));
  updateCost(ctx);
  job.summary = data.video_summary;
  const { clips, rejected } = finalizeClips(data.clips, { words: ctx.stt.words, duration: ctx.duration, maxClips });
  job.rejected = rejected;
  logLine(job, `Picked ${clips.length} parts in ${Math.round(ms / 1000)} s${rejected.length ? ` (${rejected.length} rejected by the validator)` : ''}`);
  if (!clips.length) throw new Error('The curator found no clip-worthy moments in this video.');
  job.clips = clips.map((c, i) => ({ ...c, rank: i + 1, status: 'pending', progress: 0 }));
  Object.assign(ctx, { curateUsage: msg.usage, servedModel: served });
  setStage(job, 'curate', { status: 'done', progress: 1, model: served, elapsedMs: ms });
  await saveJob(job);
}

async function stageParts(ctx) {
  const { job, dir } = ctx;
  setStage(job, 'parts', { status: 'running', progress: 0 });
  if (ctx.fullVideo) {
    const pr = await probe(ctx.fullVideo);
    for (const c of job.clips) {
      ctx.parts.set(c.id, { file: ctx.fullVideo, offset: 0, probe: pr });
      c.part = { local: true, offset: 0, aligned: true };
    }
    setStage(job, 'parts', { status: 'done', progress: 1, note: 'local file' });
    return;
  }
  const picked = job.clips.reduce((a, c) => a + c.duration, 0);
  logLine(job, `Downloading only the ${job.clips.length} picked parts: ${fmtTime(picked)} of ${fmtTime(ctx.duration)}`);
  const started = Date.now();
  const partsDir = path.join(dir, 'parts');
  const { sections, errors } = await fetchSections(ctx.url, partsDir, job.clips.map((c) => ({ id: c.id, start: c.start, end: c.end })), {
    onProgress: (p) => setStage(job, 'parts', { progress: 0.9 * p }),
  });
  let aligned = 0;
  await mapLimit(job.clips, 3, async (c) => {
    const s = sections.get(c.id);
    if (!s) {
      Object.assign(c, { status: 'error', error: errors.get(c.id) || 'This part could not be downloaded.' });
      return;
    }
    const [pr, al] = await Promise.all([
      probe(s.file),
      alignSection({ sectionFile: s.file, sourceAudio: ctx.audioSource, expectedStart: s.start }).catch(() => ({ offset: s.start, score: 0, aligned: false })),
    ]);
    if (al.aligned) aligned++;
    ctx.parts.set(c.id, { file: s.file, offset: al.offset, probe: pr });
    c.part = { file: rel(dir, s.file), offset: Math.round(al.offset * 1000) / 1000, aligned: al.aligned, score: Math.round(al.score * 1000) / 1000 };
  });
  if (!ctx.parts.size) throw new Error('None of the picked parts could be downloaded.');
  logLine(job, `Parts ready in ${Math.round((Date.now() - started) / 1000)} s; ${aligned}/${ctx.parts.size} matched to the audio to the 10 ms`);
  setStage(job, 'parts', { status: 'done', progress: 1 });
}

async function stageStyle(ctx) {
  const { job, dir } = ctx;
  setStage(job, 'style', { status: 'running', progress: 0 });
  await fs.mkdir(path.join(dir, 'clips'), { recursive: true });
  const live = job.clips.filter((c) => ctx.parts.has(c.id));
  let done = 0;
  let cutMs = 0;
  await mapLimit(live, config.renderConcurrency, async (c) => {
    const part = ctx.parts.get(c.id);
    const base = `clips/${c.id}_base.mp4`;
    try {
      const started = Date.now();
      await renderBase({ inputFile: part.file, inStart: Math.max(0, c.start - part.offset), probe: part.probe, clip: c, outFile: path.join(dir, base) });
      cutMs += Date.now() - started;
      const frames = [];
      for (const [k, f] of [0.2, 0.5, 0.8].entries()) {
        const file = `clips/${c.id}_f${k}.jpg`;
        await grabFrame(path.join(dir, base), c.duration * f, path.join(dir, file), 360);
        frames.push({ t: Math.round(c.duration * f * 10) / 10, file });
      }
      Object.assign(c, { base, frames, poster: frames[1].file });
      ctx.captik.set(c.id, toCaptikWords(ctx.stt.words, { start: c.start, end: c.end }));
    } catch (err) {
      Object.assign(c, { status: 'error', error: err.message });
      logLine(job, `Could not cut "${c.title}": ${err.message}`);
    }
    setStage(job, 'style', { progress: 0.5 * (++done / live.length) });
  });
  const ready = live.filter((c) => c.status !== 'error');
  if (!ready.length) throw new Error('Every picked part failed to cut.');
  ctx.cutMs = cutMs;

  if (config.captionScript === 'roman') {
    const native = ready.filter((c) => needsRoman(ctx.captik.get(c.id).words));
    if (native.length) {
      logLine(job, `Romanizing Hinglish captions for ${native.length} clips`);
      try {
        const r = await romanizeClips(native.map((c) => ({ id: c.id, words: ctx.captik.get(c.id).words })), { model: job.input.model });
        for (const [id, words] of r.words) ctx.captik.set(id, { ...ctx.captik.get(id), words });
        ctx.costItems.push({ ...llmLineItem(r.model, r.usage), stage: 'Romanize' });
        updateCost(ctx);
        if (r.failed.length) logLine(job, `Kept Devanagari for ${r.failed.join(', ')}: romanization did not line up word-for-word`);
      } catch (err) {
        logLine(job, `Romanization failed, keeping Devanagari captions: ${err.message}`);
      }
    }
  }

  logLine(job, `${job.input.model} is styling captions from frames of the ${ready.length} parts`);
  const ids = (await loadTemplateCatalog()).map((t) => t.id);
  let styles = new Map();
  try {
    const r = await directClips(
      ready.map((c) => ({ id: c.id, title: c.title, format: c.format, why: c.why, duration: c.duration, words: ctx.captik.get(c.id).words, frames: c.frames })),
      { jobDir: dir, model: job.input.model, onProgress: (p) => { job.stages.style.phase = p.phase; } },
    );
    styles = r.styles;
    ctx.styleUsage = r.usage;
    ctx.costItems.push({ ...llmLineItem(r.model, r.usage), stage: 'Styling' });
    updateCost(ctx);
    logLine(job, `Styled ${styles.size} clips in ${Math.round(r.ms / 1000)} s`);
  } catch (err) {
    logLine(job, `Styling fell back to the default template: ${err.message}`);
  }
  for (const c of ready) {
    const cw = ctx.captik.get(c.id);
    c.style = styles.get(c.id) || validateStyle({}, cw, ids);
    c.edit = editStateFor(cw, c.style);
  }
  setStage(job, 'style', { status: 'done', progress: 1 });
  await saveJob(job);
}

async function stageScore(ctx) {
  const { job } = ctx;
  setStage(job, 'score', { status: 'running', progress: 0 });
  const model = await loadModel();
  const mctx = measureContext({ words: ctx.stt.words, loudness: ctx.loud, scenes: [] });
  for (const c of job.clips) {
    const m = measureClip(c, mctx);
    const cuts = c.track?.cuts ?? 0;
    m.features.visual = Math.round(clamp(cuts / (c.duration / 60) / 8, 0, 1) * 1000) / 1000;
    m.stats.sceneCuts = cuts;
    c.features = { ...llmFeatures(c.scores), ...m.features };
    c.stats = m.stats;
    c.score = computeScore(c.features, model.weights);
    c.tier = tierOf(c.score);
  }
  job.clips.sort((a, b) => (a.status === 'error') - (b.status === 'error') || b.score - a.score);
  job.clips.forEach((c, i) => { c.rank = i + 1; });
  job.scoreModel = { trained: model.trained, trainedAt: model.trainedAt || null, samples: model.samples || 0 };
  setStage(job, 'score', { status: 'done', progress: 1 });
  await saveJob(job);
}

/** Render one clip's base video + editable caption state through Captik's composition. Resolves render ms. */
export async function renderClipWithCaptik(job, clip, onProgress) {
  const dir = jobDir(job.id);
  const base = path.join(dir, clip.base);
  const pr = await probe(base);
  const fps = Math.round((pr.fps || 30) * 1000) / 1000;
  const final = path.join(dir, 'clips', `${clip.id}.mp4`);
  const tmp = path.join(dir, 'clips', `${clip.id}.rendering.mp4`);
  Object.assign(clip, { status: 'rendering', progress: 0, error: null });
  emit(job);
  const started = Date.now();
  await renderWithCaptik({
    baseVideo: base,
    outFile: tmp,
    captionProps: captionPropsFromEdit(clip.edit),
    fps,
    durationInFrames: Math.max(1, Math.floor(pr.duration * fps)),
    onProgress,
  });
  await fs.rm(final, { force: true });
  await fs.rename(tmp, final);
  const { size } = await fs.stat(final);
  Object.assign(clip, {
    file: `clips/${clip.id}.mp4`,
    sizeBytes: size,
    status: 'done',
    progress: 1,
    dirty: false,
    renderMs: Date.now() - started,
    renderedAt: new Date().toISOString(),
  });
  return clip.renderMs;
}

async function stageRender(ctx) {
  const { job } = ctx;
  setStage(job, 'render', { status: 'running', progress: 0 });
  const ready = job.clips.filter((c) => c.edit && c.status !== 'error');
  let renderMs = 0;
  let renderedSec = 0;
  logLine(job, `Rendering ${ready.length} clips with Captik's caption templates`);
  for (const c of ready) {
    try {
      renderMs += await renderClipWithCaptik(job, c, (p) => {
        c.progress = p;
        setStage(job, 'render', { progress: ready.reduce((a, x) => a + (x.progress || 0), 0) / ready.length });
      });
      renderedSec += c.duration;
      logLine(job, `Rendered #${c.rank} "${c.title}" in ${c.style.captionStyle} (${Math.round(c.renderMs / 1000)} s)`);
    } catch (err) {
      Object.assign(c, { status: 'error', error: err.message });
      logLine(job, `Render failed for "${c.title}": ${err.message}`);
    }
    await saveJob(job);
  }
  const ok = job.clips.filter((c) => c.status === 'done');
  if (!ok.length) throw new Error('Every clip failed to render.');
  setStage(job, 'render', { status: 'done', progress: 1 });
  Object.assign(ctx, { renderMs, renderedSec, rendered: ok.length });
}

async function runJob(job) {
  const ctx = { job, dir: jobDir(job.id), costItems: [], parts: new Map(), captik: new Map(), url: job.input.url };
  const started = Date.now();
  normalizeStages(job);
  job.status = 'running';
  emit(job);
  try {
    if (job.input.kind === 'recurate') {
      await stageReuse(ctx);
    } else {
      await stageAudio(ctx);
      await stageTranscribe(ctx);
    }
    await stageCurate(ctx);
    await stageParts(ctx);
    await stageStyle(ctx);
    await stageScore(ctx);
    await stageRender(ctx);

    if (ctx.analyzeMs) ctx.costItems.push(computeLineItem('Analysis', ctx.analyzeMs));
    ctx.costItems.push(computeLineItem('Cutting', ctx.cutMs || 0), computeLineItem('Rendering', ctx.renderMs));
    updateCost(ctx, ctx.rendered);
    if (job.input.kind !== 'recurate') {
      await recordCalibration({
        jobId: job.id,
        sourceMinutes: ctx.duration / 60,
        language: ctx.stt.language,
        model: ctx.servedModel,
        sttModel: ctx.stt.model,
        inputTokens: ctx.curateUsage.input_tokens,
        outputTokens: ctx.curateUsage.output_tokens,
        styleInputTokens: ctx.styleUsage?.input_tokens,
        styleOutputTokens: ctx.styleUsage?.output_tokens,
        analyzeMs: ctx.analyzeMs + (ctx.cutMs || 0),
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

// Editor re-renders: one at a time, independent of the job queue.
const rerenders = [];
let rerendering = false;

export function queueRerender(job, clipId) {
  return new Promise((resolve, reject) => {
    rerenders.push({ job, clipId, resolve, reject });
    pumpRerenders();
  });
}

async function pumpRerenders() {
  if (rerendering || !rerenders.length) return;
  rerendering = true;
  const { job, clipId, resolve, reject } = rerenders.shift();
  const clip = job.clips.find((c) => c.id === clipId);
  try {
    await renderClipWithCaptik(job, clip, (p) => { clip.progress = p; emit(job); });
    logLine(job, `Re-rendered #${clip.rank} "${clip.title}" from the editor`);
    resolve(clip);
  } catch (err) {
    Object.assign(clip, { status: 'error', error: err.message });
    reject(err);
  } finally {
    await saveJob(job);
    emit(job);
    rerendering = false;
    pumpRerenders();
  }
}
