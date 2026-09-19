'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Edit — build the export's source video in the browser with FFmpeg.wasm, from the
// same /ffmpeg/* core assets the audio pipeline loads:
//   · cuts: kept spans concatenated (frame-accurate trim + concat re-encode), so the cut
//     lines up with the remapped word timings;
//   · Clean up audio: a measured noise-reduction / loudness chain (./audioCleanup) on the
//     audio track — applied to the joined cut, or to the whole video with the picture copied.
// Runs only when an export has cuts or audio cleanup on; every export route (cloud upload
// and the in-browser renderers) starts from this file.
//
// Deliberately client-side: no server route, no worker to deploy, nothing that can
// exhaust the web container's memory. Single-threaded wasm is slower on long clips,
// so the engine is torn down after each run to hand its (large) heap back.
// ─────────────────────────────────────────────────────────────────────────────

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { buildCutFilterGraph, type Span } from './cutGraph';
import {
  buildAudioCleanupChain, cleanupEnabled, floorArgs, loudnessArgs, parseAnalysisLog, type AudioCleanupOptions,
} from './audioCleanup';

/** The wasm heap holds the input AND output; past this the tab is likely to crash. */
export const MAX_BROWSER_CUT_BYTES = 1024 ** 3;

async function loadFFmpeg(): Promise<FFmpeg> {
  const f = new FFmpeg();
  const doLoad = f.load({
    coreURL: await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
    wasmURL: await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
    classWorkerURL: new URL('/ffmpeg/worker.js', window.location.origin).href,
  });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('The video engine timed out while loading — please try the export again.')), 45_000));
  await Promise.race([doLoad, timeout]);
  return f;
}

export interface ProcessVideoOptions {
  /** Kept spans (SECONDS, frame-snapped via snapKeepsToFrames); null/absent = no cuts. */
  keeps?: readonly Span[] | null;
  /** The grid the spans were snapped to. */
  fps?: number;
  /** Clean up audio; null/absent or all-off = leave the audio as recorded. */
  cleanup?: AudioCleanupOptions | null;
  onProgress?: (p: number) => void;
}

const VIDEO_ENCODE = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p'];
const AUDIO_ENCODE = ['-c:a', 'aac', '-b:a', '192k'];

/** One contiguous H.264/AAC MP4 with the cuts and/or audio cleanup applied. */
export async function buildProcessedVideo(file: Blob, opts: ProcessVideoOptions): Promise<File> {
  if (opts.keeps && opts.keeps.length === 0) throw new Error('Auto-Edit left nothing to export.');
  const keeps = opts.keeps && opts.keeps.length ? opts.keeps : null;
  const cleanup = cleanupEnabled(opts.cleanup) ? opts.cleanup : null;
  const name = 'name' in file && typeof (file as File).name === 'string' ? (file as File).name : 'source.mp4';
  const asFile = () => (file instanceof File ? file : new File([file], name, { type: file.type || 'video/mp4' }));
  if (!keeps && !cleanup) return asFile();
  if (file.size > MAX_BROWSER_CUT_BYTES) {
    throw new Error(keeps
      ? 'This video is too large to apply Auto-Edit cuts in the browser (over 1 GB). Switch Auto-Edit to Original to export the full video.'
      : 'This video is too large to clean up its audio in the browser (over 1 GB). Turn off Clean up audio to export it.');
  }
  const f = await loadFFmpeg();
  const ext = (name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'mp4';
  const inName = `ae_in.${ext}`;
  const outName = 'ae_out.mp4';
  let stage: [number, number] = [0, 1];
  const onProg = ({ progress }: { progress: number }) =>
    opts.onProgress?.(Math.min(0.99, stage[0] + (stage[1] - stage[0]) * Math.min(1, Math.max(0, progress))));
  f.on('progress', onProg);
  try {
    await f.writeFile(inName, await fetchFile(file));

    // Measure the noise floor and loudness first: the chain is tuned to THIS recording.
    let chain: string | null = null;
    if (cleanup) {
      stage = [0, 0.2];
      const lines: string[] = [];
      const onLog = ({ message }: { message: string }) => { lines.push(message); };
      f.on('log', onLog);
      try {
        // Two passes: the browser build dies when ebur128 shares a chain with astats (audioCleanup.ts).
        const code = cleanup.denoise ? await f.exec(floorArgs(inName)) : 0;
        const loudCode = cleanup.level ? await f.exec(loudnessArgs(inName)) : 0;
        const analysis = parseAnalysisLog(lines);
        if (code === 0 || loudCode === 0) chain = buildAudioCleanupChain(cleanup, analysis);
        if (!chain) {
          // Fails open (the export still runs) — but say why, or a silent no-op looks like a working feature.
          console.warn(`[clean-audio] skipped ${JSON.stringify({ code, logLines: lines.length, analysis, tail: lines.slice(-6) })}`);
        } else {
          console.info(`[clean-audio] chain ${JSON.stringify({ analysis, chain })}`);
        }
      } catch (e) {
        // No audio track or an unreadable one: export without cleanup rather than fail the export.
        console.warn(`[clean-audio] analysis failed ${String(e)} ${JSON.stringify(lines.slice(-6))}`);
      } finally {
        f.off('log', onLog);
      }
      stage = [0.2, 1];
    }
    if (!keeps && !chain) return asFile();

    let code: number;
    if (keeps) {
      code = await f.exec([
        '-y', '-i', inName,
        '-filter_complex', buildCutFilterGraph(keeps, opts.fps, chain),
        '-map', '[outv]', '-map', '[outa]',
        ...VIDEO_ENCODE, ...AUDIO_ENCODE,
        '-movflags', '+faststart', outName,
      ]);
    } else {
      // Audio only: copy the picture untouched. Some sources can't be copied into MP4 — re-encode those.
      const audioArgs = ['-map', '0:a:0', '-af', chain as string, ...AUDIO_ENCODE, '-movflags', '+faststart', outName];
      code = await f.exec(['-y', '-i', inName, '-map', '0:v:0?', '-c:v', 'copy', ...audioArgs]);
      if (code !== 0) code = await f.exec(['-y', '-i', inName, '-map', '0:v:0?', ...VIDEO_ENCODE, ...audioArgs]);
    }
    if (code !== 0) {
      throw new Error(keeps
        ? `Couldn’t apply your Auto-Edit cuts (video engine exit ${code}).`
        : `Couldn’t clean up your audio (video engine exit ${code}).`);
    }
    const data = (await f.readFile(outName)) as Uint8Array;
    if (!data || !data.length) throw new Error('Processing your video produced an empty file.');
    const base = name.replace(/\.[^.]+$/, '') || 'video';
    // Copy out of the wasm heap so the File survives terminate().
    const buf = data.slice().buffer;
    opts.onProgress?.(1);
    return new File([buf], `${base}${keeps ? '_autoedit' : '_clean'}.mp4`, { type: 'video/mp4' });
  } finally {
    f.off('progress', onProg);
    try { f.terminate(); } catch { /* already gone */ }
  }
}

/**
 * Concatenate the kept spans (SECONDS, frame-snapped via snapKeepsToFrames) of `file`
 * into one contiguous H.264/AAC MP4. `fps` is the grid the spans were snapped to.
 */
export async function buildCutVideo(
  file: Blob,
  keeps: readonly Span[],
  fps?: number,
  onProgress?: (p: number) => void,
): Promise<File> {
  if (!keeps.length) throw new Error('Auto-Edit left nothing to export.');
  return buildProcessedVideo(file, { keeps, fps, onProgress });
}
