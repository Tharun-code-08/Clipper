import { spawn } from 'node:child_process';
import { config } from './config.js';
import { clamp } from './util.js';

export const TRACK_FPS = 8;
const TRACK_W = 192;
// Measured on TED footage: close-ups ~36-41% skin pixels, wide stage shots 0.9-4%, slides/audience 0%.
const PERSON_SKIN = 0.005;
// Mean luma change inside the skin mask: people 1.7-3.4 (wide) / 27-30 (close-up); orange chart bars and still photos 0.00.
const PERSON_MOTION = 0.8;
const MIN_SHOT_SEC = 1.5;

/** Decode [start, start+duration) of the source as tiny rgb24 frames at TRACK_FPS. */
function readFrames(sourceFile, start, duration, w, h) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', '-ss', start.toFixed(3), '-t', duration.toFixed(3), '-i', sourceFile,
      '-an', '-vf', `fps=${TRACK_FPS},scale=${w}:${h}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'];
    const child = spawn(config.ffmpeg, args, { windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (d) => chunks.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`subject tracking decode exited ${code}`));
      const buf = Buffer.concat(chunks);
      const size = w * h * 3;
      const frames = [];
      for (let o = 0; o + size <= buf.length; o += size) frames.push(buf.subarray(o, o + size));
      resolve(frames);
    });
  });
}

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** 32-bin normalised luma histogram. */
export function histogram(rgb, w, h) {
  const hist = new Float32Array(32);
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const y = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
    hist[Math.min(31, y >> 3)] += 1 / n;
  }
  return hist;
}

export const histDistance = (a, b) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);

/**
 * A hard cut is a single-frame spike in histogram distance. Camera moves, zooms and stage lights raise
 * the distance for many frames in a row, so they never clear the 3x-neighbourhood test.
 * Verified against ffmpeg's native-fps scene detection: precision 0.80 / recall 1.00 (mean-diff: 0.05 / 1.00).
 */
export function detectCuts(dists, { threshold = 0.35, spike = 3 } = {}) {
  return dists.map((d, i) => {
    if (i === 0) return false;
    const around = [...dists.slice(Math.max(1, i - 4), i), ...dists.slice(i + 1, i + 5)];
    return d > threshold && d > spike * Math.max(0.02, median(around) ?? 0);
  });
}

/**
 * Per-frame column signal. People are found with a YCbCr skin-tone test (weight 3), movement vs the
 * previous frame (1.5) and edge energy (0.5).
 */
export function frameSignal(rgb, prevLuma, w, h) {
  const skin = new Float32Array(w);
  const motion = new Float32Array(w);
  const edge = new Float32Array(w);
  const luma = new Float32Array(w * h);
  let skinDiff = 0;
  let skinCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = rgb[i * 3];
      const g = rgb[i * 3 + 1];
      const b = rgb[i * 3 + 2];
      const Y = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      luma[i] = Y;
      const isSkin = Y > 50 && cb >= 77 && cb <= 127 && cr >= 135 && cr <= 173;
      if (isSkin) skin[x] += 1;
      if (x > 0) edge[x] += Math.abs(Y - luma[i - 1]);
      if (prevLuma) {
        const d = Math.abs(Y - prevLuma[i]);
        if (d > 18) motion[x] += 1;
        if (isSkin) { skinDiff += d; skinCount += 1; }
      }
    }
  }
  const norm = (arr) => {
    let max = 0;
    for (const v of arr) max = Math.max(max, v);
    return max > 0 ? arr.map((v) => v / max) : arr;
  };
  const skinN = norm(skin);
  const motionN = norm(motion);
  const edgeN = norm(edge);
  const skinMass = skin.reduce((a, v) => a + v, 0) / (w * h);
  const motionMass = motion.reduce((a, v) => a + v, 0) / (w * h);
  const cols = new Float32Array(w);
  for (let x = 0; x < w; x++) cols[x] = 3 * skinN[x] * Math.min(1, skinMass * 40) + 1.5 * motionN[x] * Math.min(1, motionMass * 20) + 0.5 * edgeN[x];
  return { cols, luma, skin: skinMass, skinMotion: prevLuma && skinCount ? skinDiff / skinCount : null, strength: skinMass * 40 + motionMass * 20 };
}

/** Centre (0..1) of the crop window that captures the most signal, and how dominant that window is. */
export function bestWindow(cols, windowFrac) {
  const w = cols.length;
  const win = Math.max(1, Math.round(windowFrac * w));
  let sum = 0;
  let total = 0;
  for (let x = 0; x < w; x++) total += cols[x];
  for (let x = 0; x < win; x++) sum += cols[x];
  let best = sum;
  let bestX = 0;
  for (let x = win; x < w; x++) {
    sum += cols[x] - cols[x - win];
    if (sum > best) { best = sum; bestX = x - win + 1; }
  }
  return { center: (bestX + win / 2) / w, share: total > 0 ? best / total : 0 };
}

/**
 * Split observations [{t, skin, skinMotion, cut}] into shots and choose a layout for each:
 * 'crop' when a moving person is on screen (tracked 9:16 crop), 'fit' otherwise so nothing important is cut off:
 * slides, screens, audience, still photos, and skin-coloured graphics like orange chart bars (they never move). Shots shorter than MIN_SHOT_SEC inherit a neighbour's mode.
 */
export function shotModes(obs, { duration }) {
  if (!obs.length) return [{ from: 0, to: duration, mode: 'crop' }];
  const half = 1 / TRACK_FPS / 2;
  const shots = [];
  let cur = [];
  const close = () => {
    if (!cur.length) return;
    const moving = cur.map((o) => o.skinMotion).filter((m) => m !== null && m !== undefined);
    const person = (median(cur.map((o) => o.skin)) ?? 0) >= PERSON_SKIN && (median(moving) ?? 0) >= PERSON_MOTION;
    shots.push({ from: shots.length ? cur[0].t - half : 0, mode: person ? 'crop' : 'fit' });
    cur = [];
  };
  for (const o of obs) {
    if (o.cut) close();
    cur.push(o);
  }
  close();
  shots.forEach((s, i) => { s.to = i + 1 < shots.length ? shots[i + 1].from : duration; });
  shots.forEach((s, i) => {
    if (s.to - s.from < MIN_SHOT_SEC && shots.length > 1) s.mode = (shots[i - 1] || shots[i + 1]).mode;
  });
  const merged = [];
  for (const s of shots) {
    const last = merged[merged.length - 1];
    if (last && last.mode === s.mode) last.to = s.to;
    else merged.push({ ...s });
  }
  return merged.map((s) => ({ from: +s.from.toFixed(3), to: +s.to.toFixed(3), mode: s.mode }));
}

/**
 * Turn per-frame observations [{t, center, share, strength, cut}] into crop keyframes [{t, x}]
 * (x = crop centre, 0..1 of source width). Hard jumps only happen on detected cuts; inside a shot the
 * crop holds still inside a dead zone and otherwise glides at a capped speed.
 */
export function planCrop(obs, { prior = 0.5, windowFrac, duration, deadZone = 0.07, maxSpeed = 0.35 }) {
  if (!obs.length) return [{ t: 0, x: prior }];
  const half = windowFrac / 2;
  const lim = (x) => clamp(x, half, 1 - half);
  const shots = [];
  let cur = [];
  for (const o of obs) {
    if (o.cut && cur.length) { shots.push(cur); cur = []; }
    cur.push(o);
  }
  if (cur.length) shots.push(cur);

  const keys = [];
  let carry = lim(prior);
  const step = 1 / TRACK_FPS;
  for (const shot of shots) {
    const reliable = shot.filter((o) => o.strength > 0.15 && o.share > windowFrac * 1.15);
    const seed = median(reliable.slice(0, TRACK_FPS * 2).map((o) => o.center)) ?? median(reliable.map((o) => o.center));
    let x = lim(seed ?? carry);
    const shotStart = shot[0].t === obs[0].t ? 0 : shot[0].t - step / 2;
    keys.push({ t: shotStart, x, cut: shotStart > 0 });
    let lastKey = x;
    for (let i = 0; i < shot.length; i++) {
      const windowObs = shot.slice(Math.max(0, i - 4), i + 5).filter((o) => o.strength > 0.15);
      const target = median(windowObs.map((o) => o.center));
      if (target !== null && Math.abs(lim(target) - x) > deadZone) {
        x = lim(x + clamp(lim(target) - x, -maxSpeed * step, maxSpeed * step));
      }
      if (Math.abs(x - lastKey) > 0.012 || i === shot.length - 1) {
        keys.push({ t: shot[i].t, x });
        lastKey = x;
      }
    }
    carry = x;
  }
  keys.push({ t: duration, x: keys[keys.length - 1].x });

  // Drop keyframes that sit on a straight line between their neighbours (keeps the ffmpeg expression short).
  const out = [keys[0]];
  for (let i = 1; i < keys.length - 1; i++) {
    const a = out[out.length - 1];
    const b = keys[i];
    const c = keys[i + 1];
    if (b.cut || c.cut) { out.push(b); continue; }
    const expected = a.x + ((c.x - a.x) * (b.t - a.t)) / Math.max(1e-6, c.t - a.t);
    if (Math.abs(expected - b.x) > 0.01) out.push(b);
  }
  out.push(keys[keys.length - 1]);
  return out.length > 80 ? out.filter((k, i) => k.cut || i % Math.ceil(out.length / 80) === 0 || i === out.length - 1) : out;
}

/** Track the subject through a clip. Returns {keys, shots, cuts, frames}. */
export async function trackSubject({ sourceFile, probe, clip, prior = 0.5 }) {
  const h = Math.max(2, Math.round((TRACK_W * probe.height) / probe.width / 2) * 2);
  const frames = await readFrames(sourceFile, clip.start, clip.duration, TRACK_W, h);
  const windowFrac = Math.min(1, (probe.height * 9) / 16 / probe.width);
  const hists = frames.map((f) => histogram(f, TRACK_W, h));
  const cutFlags = detectCuts(hists.map((hh, i) => (i ? histDistance(hh, hists[i - 1]) : 0)));
  const obs = [];
  let prevLuma = null;
  frames.forEach((rgb, i) => {
    // Motion across a cut compares two different shots, so it is skipped on the first frame of a shot.
    const sig = frameSignal(rgb, cutFlags[i] ? null : prevLuma, TRACK_W, h);
    const { center, share } = bestWindow(sig.cols, windowFrac);
    obs.push({ t: i / TRACK_FPS, center, share, strength: sig.strength, skin: sig.skin, skinMotion: sig.skinMotion, cut: cutFlags[i] });
    prevLuma = sig.luma;
  });
  return {
    keys: planCrop(obs, { prior, windowFrac, duration: clip.duration }),
    shots: shotModes(obs, { duration: clip.duration }),
    cuts: cutFlags.filter(Boolean).length,
    frames: frames.length,
  };
}

/** ffmpeg expression for the crop's left edge (source px) over clip time t, from centre keyframes. */
export function cropXExpression(keys, { width, cropW }) {
  const px = (x) => Math.round(clamp(x * width - cropW / 2, 0, width - cropW));
  if (keys.length === 1) return String(px(keys[0].x));
  let expr = String(px(keys[keys.length - 1].x));
  for (let i = keys.length - 2; i >= 0; i--) {
    const a = keys[i];
    const b = keys[i + 1];
    const span = b.t - a.t;
    const seg = b.cut || span < 1e-3 || px(a.x) === px(b.x)
      ? String(px(a.x))
      : `${px(a.x)}+${px(b.x) - px(a.x)}*(t-${a.t.toFixed(3)})/${span.toFixed(3)}`;
    expr = `if(lt(t,${b.t.toFixed(3)}),${seg},${expr})`;
  }
  return `trunc(${expr})`;
}
