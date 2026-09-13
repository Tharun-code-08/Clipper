import { spawn } from 'node:child_process';
import { config } from './config.js';

const RATE = 4000;
const HOP = 40; // 100 envelope samples per second → 10 ms alignment resolution
export const ENVELOPE_HZ = RATE / HOP;

/** Amplitude envelope (mean |sample| per 10 ms) of a slice of any media file's audio. */
export function envelope(file, start = 0, duration = null) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error'];
    if (start > 0) args.push('-ss', start.toFixed(3));
    args.push('-i', file);
    if (duration) args.push('-t', duration.toFixed(3));
    args.push('-vn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-');
    const child = spawn(config.ffmpeg, args, { windowsHide: true });
    const env = [];
    let acc = 0;
    let n = 0;
    let carry = null;
    child.stdout.on('data', (chunk) => {
      let buf = carry ? Buffer.concat([carry, chunk]) : chunk;
      carry = null;
      const usable = buf.length - (buf.length % 2);
      for (let i = 0; i < usable; i += 2) {
        acc += Math.abs(buf.readInt16LE(i));
        if (++n === HOP) { env.push(acc / HOP); acc = 0; n = 0; }
      }
      if (usable < buf.length) carry = buf.subarray(usable);
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(Float32Array.from(env)) : reject(new Error(`ffmpeg audio decode exited ${code}`))));
  });
}

/** Normalised cross-correlation of `needle` against every offset of `hay`. Returns the best lag. */
export function bestLag(needle, hay) {
  const m = needle.length;
  if (m < 50 || hay.length < m) return { lag: 0, score: 0 };
  let nMean = 0;
  for (const v of needle) nMean += v;
  nMean /= m;
  const nz = needle.map((v) => v - nMean);
  let nNorm = 0;
  for (const v of nz) nNorm += v * v;
  nNorm = Math.sqrt(nNorm) || 1;

  let best = { lag: 0, score: -Infinity };
  for (let lag = 0; lag + m <= hay.length; lag++) {
    let hMean = 0;
    for (let i = 0; i < m; i++) hMean += hay[lag + i];
    hMean /= m;
    let dot = 0;
    let hNorm = 0;
    for (let i = 0; i < m; i++) {
      const h = hay[lag + i] - hMean;
      dot += nz[i] * h;
      hNorm += h * h;
    }
    const score = dot / (nNorm * (Math.sqrt(hNorm) || 1));
    if (score > best.score) best = { lag, score };
  }
  return best;
}

/**
 * Where does a downloaded section actually start inside the source? HLS range downloads snap to
 * fragment/keyframe boundaries, so the file's t=0 is only roughly the requested time. Matching the
 * section's audio envelope against the full audio track pins it to 10 ms.
 * Returns {offset (source seconds at section t=0), score (0..1 correlation), aligned}.
 */
export async function alignSection({ sectionFile, sourceAudio, expectedStart, searchSec = 8, probeSec = 20 }) {
  const needle = await envelope(sectionFile, 0.5, probeSec);
  const hayStart = Math.max(0, expectedStart + 0.5 - searchSec);
  const hay = await envelope(sourceAudio, hayStart, probeSec + 2 * searchSec);
  const { lag, score } = bestLag(needle, hay);
  if (score < 0.6) return { offset: expectedStart, score, aligned: false };
  return { offset: hayStart + lag / ENVELOPE_HZ - 0.5, score, aligned: true };
}
