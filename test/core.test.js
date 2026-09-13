import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CLIPS } from '../src/config.js';
import { classifySource, driveFileId } from '../src/ingest.js';
import { planChunks } from '../src/media.js';
import { buildPhrases, snapStart, snapEnd } from '../src/transcript.js';
import { finalizeClips, tasteBlock } from '../src/curate.js';
import { computeScore, tierOf, trainWeights, DEFAULT_WEIGHTS, FEATURES, measureClip, measureContext } from '../src/virality.js';
import { estimate, llmLineItem } from '../src/cost.js';
import { buildAss, captionChunks, layoutFilter } from '../src/render.js';
import { planCrop, bestWindow, cropXExpression, detectCuts, shotModes } from '../src/focus.js';

/** 20 minutes of synthetic speech: 12-word sentences, 0.3 s per word, 0.5 s pause between sentences. */
function fakeWords(seconds = 1200) {
  const words = [];
  let t = 0.5;
  let n = 0;
  while (t < seconds - 1) {
    const last = n % 12 === 11;
    words.push({ w: `w${n}${last ? '.' : ''}`, s: +t.toFixed(2), e: +(t + 0.26).toFixed(2) });
    t += last ? 0.8 : 0.3;
    n++;
  }
  return words;
}

const rawClip = (start, end, extra = {}) => ({
  start, end, title: `clip ${start}`, hook_text: 'hook', caption: 'c', hashtags: ['tag'], format: 'hot take', why: 'y',
  first_words: '', last_words: '', layout: 'crop', focus_x: 0.5,
  scores: { hook: 7, emotion: 6, value: 6, shareability: 6, standalone: 7, trend: 5, payoff: 6 }, ...extra,
});

test('classifies every supported platform link', () => {
  const cases = {
    'https://youtu.be/abc': 'youtube',
    'https://www.youtube.com/shorts/x': 'youtube',
    'https://drive.google.com/file/d/1AbCdEfGhIjKl/view': 'gdrive',
    'https://www.instagram.com/reel/x/': 'instagram',
    'https://vm.tiktok.com/Z/': 'tiktok',
    'https://twitter.com/a/status/1': 'x',
    'https://fb.watch/x': 'facebook',
    'https://www.linkedin.com/posts/x': 'linkedin',
    'https://vimeo.com/1': 'vimeo',
    'https://example.com/talk.mp4': 'direct',
  };
  for (const [url, platform] of Object.entries(cases)) assert.equal(classifySource(url)?.platform, platform, url);
  assert.equal(classifySource('not a url'), null);
  assert.equal(classifySource('ftp://x.com/a.mp4'), null);
  assert.equal(driveFileId('https://drive.google.com/open?id=1AbCdEfGhIjKl'), '1AbCdEfGhIjKl');
});

test('STT chunks keep every second exactly once', () => {
  const chunks = planChunks(1263);
  for (let t = 0; t < 1263; t += 0.5) {
    assert.equal(chunks.filter((c) => t >= c.keepFrom && t < c.keepTo).length, 1, `t=${t}`);
  }
  assert.ok(chunks.every((c) => c.end - c.start <= 604));
});

test('never returns more than 10 clips, even when asked for more', () => {
  const words = fakeWords();
  const raw = Array.from({ length: 14 }, (_, i) => rawClip(20 + i * 80, 60 + i * 80));
  const { clips, rejected } = finalizeClips(raw, { words, duration: 1200, maxClips: 25 });
  assert.equal(clips.length, MAX_CLIPS);
  assert.equal(rejected.filter((r) => r.reason.includes('cap')).length, 4);
  const three = finalizeClips(raw, { words, duration: 1200, maxClips: 3 });
  assert.equal(three.clips.length, 3);
});

test('snaps boundaries to sentence edges, trims >90 s, drops short and overlapping picks', () => {
  const words = fakeWords();
  const s = snapStart(100, words);
  assert.ok(s.index === 0 || /\.$/.test(words[s.index - 1].w), 'start lands on a sentence start');
  const e = snapEnd(130, words);
  assert.match(words[e.index].w, /\.$/, 'end lands on a sentence end');

  const { clips, rejected } = finalizeClips([
    rawClip(100, 300), // 200 s -> trimmed to <= 90
    rawClip(110, 150), // overlaps the first
    rawClip(500, 505), // too short
  ], { words, duration: 1200 });
  assert.equal(clips.length, 1);
  assert.ok(clips[0].duration <= 90.3, `trimmed duration ${clips[0].duration}`);
  assert.equal(rejected.length, 2);
});

test('phrases break on sentence ends', () => {
  const phrases = buildPhrases(fakeWords(60));
  assert.ok(phrases.every((p) => p.i1 - p.i0 < 14));
  assert.ok(phrases.slice(0, -1).every((p) => /\.$/.test(p.text) || p.i1 - p.i0 === 13));
});

test('score is a 0-100 weighted mean with tiers', () => {
  const ones = Object.fromEntries(FEATURES.map((f) => [f.key, 1]));
  const zeros = Object.fromEntries(FEATURES.map((f) => [f.key, 0]));
  assert.equal(computeScore(ones), 100);
  assert.equal(computeScore(zeros), 0);
  assert.equal(tierOf(90), 'Viral bet');
  assert.equal(tierOf(72), 'Strong');
  assert.equal(tierOf(60), 'Solid');
  assert.equal(tierOf(20), 'Long shot');
  const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('measured features stay in range', () => {
  const words = fakeWords(300);
  const loudness = { stepSec: 0.5, db: Array.from({ length: 600 }, (_, i) => -30 + 10 * Math.sin(i / 7)) };
  const ctx = measureContext({ words, loudness, scenes: [40, 55, 70] });
  const { features } = measureClip({ start: 30, end: 75 }, ctx);
  for (const v of Object.values(features)) assert.ok(v >= 0 && v <= 1);
});

test('training learns which feature predicts thumbs-up', () => {
  const samples = [];
  for (let i = 0; i < 40; i++) {
    const liked = i % 2 === 0;
    const f = Object.fromEntries(FEATURES.map((x) => [x.key, 0.5 + 0.2 * Math.sin(i * 3.1 + x.key.length)]));
    f.payoff = liked ? 0.9 : 0.3; // the only real signal
    f.hook = 0.6 + 0.1 * Math.cos(i); // noise
    samples.push({ features: f, label: liked ? 1 : 0 });
  }
  const r = trainWeights(samples);
  assert.ok(r.aucAfter >= r.aucBefore, `auc ${r.aucBefore} -> ${r.aucAfter}`);
  assert.ok(r.weights.payoff > DEFAULT_WEIGHTS.payoff, 'payoff weight increases');
  assert.ok(Math.abs(Object.values(r.weights).reduce((a, b) => a + b, 0) - 1) < 0.01);
});

test('taste block lists liked and disliked picks', () => {
  const block = tasteBlock([
    { label: 1, title: 'Great', format: 'story', duration: 40, transcript: 'a b c' },
    { label: 0, title: 'Meh', format: 'rant', duration: 70, transcript: 'd e f' },
  ]);
  assert.match(block, /LIKED:[\s\S]*Great/);
  assert.match(block, /DISLIKED:[\s\S]*Meh/);
  assert.equal(tasteBlock([]), '');
});

test('cost estimate for a 20-minute video is itemised and model-sensitive', () => {
  const est = estimate({ minutes: 20 });
  assert.ok(est.usd > 0);
  assert.equal(est.items.length, 4);
  const opus = est.compare.find((c) => c.model === 'claude-opus-5').usd;
  const sonnet = est.compare.find((c) => c.model === 'claude-sonnet-5').usd;
  assert.ok(opus > sonnet);
  // Measured run: 21,746 in / 7,992 out on Opus 5 = $0.3086
  assert.ok(Math.abs(llmLineItem('claude-opus-5', { input_tokens: 21746, output_tokens: 7992 }).usd - 0.30853) < 1e-4);
  const calibrated = estimate({ minutes: 20, calibration: { runs: [{ sourceMinutes: 21, inputTokens: 21746, outputTokens: 7992, analyzeMs: 30000, renderMs: 60000, renderedClipSeconds: 150, clips: 2 }] } });
  assert.equal(calibrated.basis, 'measured');
});

test('ASS captions escape braces and pick an Indic font for Devanagari', () => {
  const words = [{ w: 'Hello{\\b1}', s: 0, e: 0.4 }, { w: 'world.', s: 0.5, e: 0.9 }, { w: 'again', s: 1.0, e: 1.3 }];
  const ass = buildAss({ words, hookText: 'Big {hook}', duration: 5, layout: 'crop' });
  assert.match(ass, /Style: Caption,Montserrat Black/);
  assert.ok(!ass.split('\n').filter((l) => l.startsWith('Dialogue')).some((l) => /\{\\b1\}|\{hook\}/.test(l)));
  const hindi = buildAss({ words: [{ w: 'नमस्ते', s: 0, e: 0.5 }], hookText: '', duration: 2, layout: 'fit' });
  assert.match(hindi, /Style: Caption,Nirmala UI/);
  assert.ok(captionChunks(words).every((c) => c.length <= 3));
});

test('crop plan follows the subject and jumps only on cuts', () => {
  const windowFrac = 0.316;
  const cols = (center) => Float32Array.from({ length: 192 }, (_, x) => Math.exp(-(((x / 192 - center) / 0.05) ** 2)));
  assert.ok(Math.abs(bestWindow(cols(0.2), windowFrac).center - 0.2) < 0.03);
  const obs = [];
  for (let i = 0; i < 80; i++) {
    const center = i < 40 ? 0.25 : 0.72;
    const { share } = bestWindow(cols(center), windowFrac);
    obs.push({ t: i / 8, center, share, strength: 1, cut: i === 40 });
  }
  const keys = planCrop(obs, { windowFrac, duration: 10 });
  assert.ok(Math.abs(keys[0].x - 0.25) < 0.02, `first shot x ${keys[0].x}`);
  assert.ok(Math.abs(keys[keys.length - 1].x - 0.72) < 0.02, `second shot x ${keys[keys.length - 1].x}`);
  const cut = keys.find((k) => k.cut);
  assert.ok(cut && Math.abs(cut.t - 4.94) < 0.1, 'hard jump at the cut');
  const expr = cropXExpression(keys, { width: 1920, cropW: 606 });
  assert.match(expr, /^trunc\(if\(lt\(t,/);
});

test('cuts are single-frame histogram spikes; shots without a person letterbox', () => {
  const cuts = detectCuts([0, 0.05, 0.04, 0.06, 0.9, 0.05, 0.04, 0.07, 0.3, 0.05]);
  assert.deepEqual(cuts.flatMap((c, i) => (c ? [i] : [])), [4]);
  assert.equal(detectCuts([0, 0.5, 0.55, 0.6, 0.52, 0.58, 0.5]).filter(Boolean).length, 0, 'a sustained camera move is not a cut');

  const obs = Array.from({ length: 80 }, (_, i) => ({ t: i / 8, skin: i < 40 ? 0.35 : 0, cut: i === 40 }));
  const shots = shotModes(obs, { duration: 10 });
  assert.deepEqual(shots.map((s) => s.mode), ['crop', 'fit']);
  assert.ok(Math.abs(shots[1].from - 4.938) < 0.01);

  const flicker = Array.from({ length: 80 }, (_, i) => ({ t: i / 8, skin: i >= 30 && i < 36 ? 0 : 0.3, cut: i === 30 || i === 36 }));
  assert.deepEqual(shotModes(flicker, { duration: 10 }).map((s) => s.mode), ['crop'], 'a 0.75 s no-person shot inherits crop');

  const graph = layoutFilter({ width: 1920, height: 1080 }, { layout: 'crop', focusX: 0.5 }, { keys: [{ t: 0, x: 0.3 }, { t: 10, x: 0.3 }], shots });
  assert.match(graph, /\[fit\]\[crop\]overlay=0:0:enable='between\(t,0\.000,4\.938\)'/);
  assert.match(layoutFilter({ width: 1920, height: 1080 }, { layout: 'fit', focusX: 0.5 }, null), /^split=2\[bg\]/);
  assert.match(layoutFilter({ width: 1080, height: 1920 }, { layout: 'crop', focusX: 0.5 }, null), /^scale=1080:1920/);
});
