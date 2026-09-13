import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { run, runOk } from './util.js';

export async function probe(file) {
  const { stdout } = await runOk(config.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  const j = JSON.parse(stdout);
  const v = j.streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const a = j.streams.find((s) => s.codec_type === 'audio');
  let width = v?.width || 0;
  let height = v?.height || 0;
  const rotation = Number(v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v?.tags?.rotate ?? 0);
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
  const [n, d] = String(v?.avg_frame_rate || v?.r_frame_rate || '30/1').split('/').map(Number);
  const fps = d ? n / d : n;
  return {
    duration: Number(j.format.duration) || Number(v?.duration) || 0,
    width,
    height,
    fps: Number.isFinite(fps) && fps > 0 ? Math.round(fps * 1000) / 1000 : 30,
    hasVideo: Boolean(v),
    hasAudio: Boolean(a),
    sizeBytes: Number(j.format.size) || 0,
  };
}

/** 16 kHz mono 32 kbps mp3: ~14 MB per hour, well under Groq's 25 MB request cap per chunk. */
export async function extractAudio(file, out) {
  await runOk(config.ffmpeg, ['-v', 'error', '-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', out]);
}

/**
 * Plan STT chunks. Neighbours overlap by `overlapSec` so no word is cut in half;
 * each chunk only keeps words that START inside [keepFrom, keepTo).
 */
export function planChunks(duration, chunkSec = 600, overlapSec = 2) {
  const chunks = [];
  for (let start = 0; start < duration; start += chunkSec) {
    const last = start + chunkSec >= duration;
    chunks.push({
      start: Math.max(0, start - overlapSec),
      end: Math.min(duration, start + chunkSec + overlapSec),
      keepFrom: start,
      keepTo: last ? Infinity : start + chunkSec,
    });
    if (last) break;
  }
  return chunks;
}

export async function cutAudio(audio, { start, end }, out) {
  await runOk(config.ffmpeg, ['-v', 'error', '-y', '-ss', start.toFixed(3), '-t', (end - start).toFixed(3), '-i', audio, '-c', 'copy', out]);
}

/** RMS loudness (dBFS) per `stepSec` window, decoded at 8 kHz — cheap and good enough for energy. */
export function loudnessMap(audio, stepSec = 0.5) {
  return new Promise((resolve, reject) => {
    const rate = 8000;
    const perWindow = Math.round(rate * stepSec);
    const child = spawn(config.ffmpeg, ['-v', 'error', '-i', audio, '-f', 's16le', '-ac', '1', '-ar', String(rate), '-'], { windowsHide: true });
    const db = [];
    let sum = 0;
    let count = 0;
    let carry = null;
    child.stdout.on('data', (buf) => {
      if (carry) { buf = Buffer.concat([carry, buf]); carry = null; }
      const usable = buf.length - (buf.length % 2);
      for (let i = 0; i < usable; i += 2) {
        const s = buf.readInt16LE(i) / 32768;
        sum += s * s;
        if (++count === perWindow) {
          db.push(Math.round(10 * Math.log10(sum / count + 1e-10) * 10) / 10);
          sum = 0;
          count = 0;
        }
      }
      if (usable < buf.length) carry = buf.subarray(usable);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg loudness pass exited ${code}`));
      if (count > perWindow / 4) db.push(Math.round(10 * Math.log10(sum / count + 1e-10) * 10) / 10);
      resolve({ stepSec, db });
    });
  });
}

/**
 * One decode pass: scene-cut times (2 fps, 160 px) and a thumbnail every `frameEvery` seconds.
 * Tries hardware decode first, then plain software decode.
 */
export async function scanVideo(file, dir, { frameEvery, frameWidth = 384 }) {
  const framesDir = path.join(dir, 'frames');
  await fs.rm(framesDir, { recursive: true, force: true });
  await fs.mkdir(framesDir, { recursive: true });
  const graph = [
    '[0:v]split[a][b]',
    "[a]fps=2,scale=160:-2,select='gt(scene,0.30)',metadata=print:file=scenes.txt,nullsink",
    `[b]fps=1/${frameEvery},scale=${frameWidth}:-2[th]`,
  ].join(';');
  const base = ['-v', 'error', '-y', '-an', '-sn', '-dn', '-i', file, '-filter_complex', graph, '-map', '[th]', '-q:v', '5', 'frames/f_%04d.jpg'];
  let r = await run(config.ffmpeg, ['-hwaccel', 'auto', ...base], { cwd: dir });
  if (r.code !== 0) r = await run(config.ffmpeg, base, { cwd: dir });
  if (r.code !== 0) throw new Error(`Video scan failed: ${r.stderr.trim().split(/\r?\n/).pop()}`);

  const scenesTxt = await fs.readFile(path.join(dir, 'scenes.txt'), 'utf8').catch(() => '');
  const scenes = [...scenesTxt.matchAll(/pts_time:([\d.]+)/g)].map((m) => Math.round(Number(m[1]) * 100) / 100);
  const names = (await fs.readdir(framesDir)).filter((n) => n.endsWith('.jpg')).sort();
  const frames = names.map((name, i) => ({ t: i * frameEvery, file: `frames/${name}` }));
  return { scenes, frames };
}

/** A single frame at time t, for posters and crop checks. */
export async function grabFrame(file, t, out, width = 540) {
  await runOk(config.ffmpeg, ['-v', 'error', '-y', '-ss', Math.max(0, t).toFixed(2), '-i', file, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '3', out]);
}
