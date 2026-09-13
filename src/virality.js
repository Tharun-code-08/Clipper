import path from 'node:path';
import { TRAINING_DIR } from './config.js';
import { clamp, readJson, writeJson } from './util.js';

/**
 * The virality score blends two kinds of evidence:
 *  - judgement features the curator LLM scores 0-10 from transcript + frames
 *  - measured features computed from the audio, word timings and scene cuts
 * Each feature is normalised to 0..1; the score is their weighted mean x 100.
 * Weights start from DEFAULT_WEIGHTS and are re-fit from creator feedback (trainWeights).
 */
export const FEATURES = [
  { key: 'hook', label: 'Hook', source: 'llm', hint: 'First 3 seconds stop the scroll' },
  { key: 'emotion', label: 'Emotion', source: 'llm', hint: 'Laughter, surprise, anger, vulnerability' },
  { key: 'value', label: 'Value', source: 'llm', hint: 'Insight, fact or story worth the time' },
  { key: 'shareability', label: 'Shareability', source: 'llm', hint: '"Send this to a friend" test' },
  { key: 'standalone', label: 'Standalone', source: 'llm', hint: 'Makes sense with zero context' },
  { key: 'trend', label: 'Trend fit', source: 'llm', hint: 'Matches formats/topics winning right now' },
  { key: 'payoff', label: 'Payoff', source: 'llm', hint: 'Ends on the punchline, not filler' },
  { key: 'hookEnergy', label: 'Hook energy', source: 'measured', hint: 'Loudness of the opening vs the whole video' },
  { key: 'pace', label: 'Pace', source: 'measured', hint: 'Words per second' },
  { key: 'deadAir', label: 'No dead air', source: 'measured', hint: 'Share of the clip without long pauses' },
  { key: 'lengthFit', label: 'Length fit', source: 'measured', hint: '20-60 s is the sweet spot' },
  { key: 'visual', label: 'Visual change', source: 'measured', hint: 'Scene cuts per minute' },
];

export const DEFAULT_WEIGHTS = {
  hook: 0.2, emotion: 0.12, value: 0.12, shareability: 0.14, standalone: 0.1, trend: 0.08, payoff: 0.08,
  hookEnergy: 0.04, pace: 0.04, deadAir: 0.03, lengthFit: 0.03, visual: 0.02,
};

const WEIGHTS_FILE = path.join(TRAINING_DIR, 'weights.json');

export async function loadModel() {
  const saved = await readJson(WEIGHTS_FILE);
  if (saved?.weights) return { ...saved, weights: { ...DEFAULT_WEIGHTS, ...saved.weights }, trained: true };
  return { weights: { ...DEFAULT_WEIGHTS }, trained: false };
}

export const saveModel = (model) => writeJson(WEIGHTS_FILE, model);

export function tierOf(score) {
  if (score >= 85) return 'Viral bet';
  if (score >= 70) return 'Strong';
  if (score >= 55) return 'Solid';
  return 'Long shot';
}

/** Percentile rank of `value` inside a sorted ascending array. */
function percentile(sorted, value) {
  if (!sorted.length) return 0.5;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1; else hi = mid;
  }
  return lo / sorted.length;
}

/** Build a context object once per video so every clip is measured against the same baseline. */
export function measureContext({ words, loudness, scenes }) {
  const speechDb = loudness.db.filter((d) => d > -45).sort((a, b) => a - b);
  return { words, loudness, scenes, speechDb };
}

export function measureClip({ start, end }, ctx) {
  const dur = Math.max(0.1, end - start);
  const { stepSec, db } = ctx.loudness;

  const i0 = Math.floor(start / stepSec);
  const i1 = Math.max(i0 + 1, Math.ceil(Math.min(end, start + 3) / stepSec));
  const open = db.slice(i0, i1);
  const openDb = open.length ? open.reduce((a, b) => a + b, 0) / open.length : -60;
  const hookEnergy = percentile(ctx.speechDb, openDb);

  const inClip = ctx.words.filter((w) => w.s >= start && w.e <= end + 0.05);
  const wps = inClip.length / dur;
  let pace = clamp((wps - 1.6) / (2.8 - 1.6), 0, 1);
  if (wps > 4.2) pace = clamp(pace - (wps - 4.2) * 0.5, 0, 1);

  let silent = 0;
  for (let i = 1; i < inClip.length; i++) silent += Math.max(0, inClip[i].s - inClip[i - 1].e - 0.7);
  const deadAir = clamp(1 - (silent / dur) * 4, 0, 1);

  let lengthFit = 1;
  if (dur < 20) lengthFit = clamp(0.4 + (0.6 * (dur - 12)) / 8, 0, 1);
  else if (dur > 60) lengthFit = clamp(1 - (0.6 * (dur - 60)) / 30, 0.4, 1);

  const cuts = ctx.scenes.filter((t) => t > start && t < end).length;
  const visual = clamp(cuts / (dur / 60) / 8, 0, 1);

  const r = (n) => Math.round(n * 1000) / 1000;
  return {
    features: { hookEnergy: r(hookEnergy), pace: r(pace), deadAir: r(deadAir), lengthFit: r(lengthFit), visual: r(visual) },
    stats: { wordsPerSec: r(wps), silentSec: r(silent), sceneCuts: cuts, openingDb: r(openDb) },
  };
}

/** Normalise the curator's 0-10 judgement scores into 0..1 features. */
export function llmFeatures(scores = {}) {
  const out = {};
  for (const f of FEATURES) if (f.source === 'llm') out[f.key] = clamp((Number(scores[f.key]) || 0) / 10, 0, 1);
  return out;
}

export function computeScore(features, weights = DEFAULT_WEIGHTS) {
  let num = 0;
  let den = 0;
  for (const { key } of FEATURES) {
    const w = Math.max(0, weights[key] ?? 0);
    num += w * (features[key] ?? 0);
    den += w;
  }
  return den ? Math.round((100 * num) / den) : 0;
}

/** Probability a liked clip outranks a disliked one (ties count half). */
export function auc(samples, scoreFn) {
  const pos = samples.filter((s) => s.label === 1).map(scoreFn);
  const neg = samples.filter((s) => s.label === 0).map(scoreFn);
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/**
 * Fit weights from feedback samples [{features, label: 1|0}].
 * Logistic regression on the features, L2-regularised toward the current weights so a
 * handful of thumbs can nudge the model without flipping it. Negative weights are clipped,
 * then everything is renormalised to sum to 1 so the score stays on a 0-100 scale.
 */
export function trainWeights(samples, prior = DEFAULT_WEIGHTS, { epochs = 1500, lr = 0.3, lambda = 0.05, scale = 8 } = {}) {
  const keys = FEATURES.map((f) => f.key);
  const X = samples.map((s) => keys.map((k) => s.features[k] ?? 0));
  const y = samples.map((s) => s.label);
  const beta0 = keys.map((k) => scale * (prior[k] ?? 0));
  const beta = [...beta0];
  const meanScore = X.reduce((acc, x) => acc + x.reduce((a, v, i) => a + v * beta0[i], 0), 0) / Math.max(1, X.length);
  let bias = -meanScore;
  const n = X.length;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const grad = new Array(keys.length).fill(0);
    let gBias = 0;
    for (let j = 0; j < n; j++) {
      const z = bias + X[j].reduce((a, v, i) => a + v * beta[i], 0);
      const err = 1 / (1 + Math.exp(-z)) - y[j];
      gBias += err;
      for (let i = 0; i < keys.length; i++) grad[i] += err * X[j][i];
    }
    bias -= (lr * gBias) / n;
    for (let i = 0; i < keys.length; i++) beta[i] -= lr * (grad[i] / n + lambda * (beta[i] - beta0[i]));
  }
  const clipped = beta.map((b) => Math.max(0, b));
  const total = clipped.reduce((a, b) => a + b, 0) || 1;
  const weights = Object.fromEntries(keys.map((k, i) => [k, Math.round((clipped[i] / total) * 1000) / 1000]));
  return {
    weights,
    samples: n,
    positives: y.filter((v) => v === 1).length,
    aucBefore: auc(samples, (s) => computeScore(s.features, prior)),
    aucAfter: auc(samples, (s) => computeScore(s.features, weights)),
  };
}
