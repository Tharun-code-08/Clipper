// ─────────────────────────────────────────────────────────────────────────────
// Clean up audio — background-noise reduction and loudness levelling for the exported video,
// built as an ffmpeg filter chain and run by the browser's ffmpeg.wasm in the same pass as the
// Auto-Edit cut (./cutVideo). Pure (log parsing + chain building), so it is unit-testable in node.
//
// MEASURED 2026-09-16 on real Hinglish speech with pink noise at 15 dB SNR plus 50 Hz hum, scoring
// noise left in a 2.5 s pause and how close the speech spectrum is to the clean recording:
//   · afftdn at its default noise floor (-50 dB) removed only 1.6 dB. The floor has to be MEASURED
//     per video (10th-percentile 50 ms RMS); with it, nr=20 removed 7.7 dB and the speech spectrum
//     moved closer to the clean recording (corr 0.686 → 0.736).
//   · a 2:1 downward expander 6 dB above that floor then took the gaps down 28.7 dB with the same
//     speech fidelity. 4:1 went a little further but started to dull the speech.
//   · on an already-clean recording the chain is near-transparent (spectrum corr 0.98).
//   · loudnorm's dynamic mode pumped the noise back up between phrases (only 4 dB net); a static
//     gain to -16, measured before the chain, plus a limiter does not. (In the browser build that
//     measurement comes from volumedetect — see loudnessArgs.)
// ─────────────────────────────────────────────────────────────────────────────

export interface AudioCleanupOptions {
  /** Reduce steady background noise (fans, hum, room hiss) and quiet the gaps between phrases. */
  denoise: boolean;
  /** Bring the whole video to a consistent loudness (the short-form norm — see TARGET_MEAN_DB). */
  level: boolean;
}

export interface AudioAnalysis {
  /** Background-noise floor in dBFS (null when there was too little audio to measure). */
  floorDb: number | null;
  /** Mean (RMS) level of the source in dBFS (null when it could not be measured). */
  meanDb: number | null;
  /** Peak level in dBFS — diagnostics only; the limiter handles headroom. */
  maxDb?: number | null;
}

/** Short-form loudness target, as a mean (RMS) level — see loudnessArgs. */
export const TARGET_MEAN_DB = -16;
/** Never push more than this much gain — a whisper-quiet file would otherwise blast its noise. */
export const MAX_GAIN_DB = 12;
const FLOOR_MIN_DB = -80;   // afftdn's accepted noise-floor range
const FLOOR_MAX_DB = -20;
const RMS_KEY = 'lavfi.astats.Overall.RMS_level';

export const cleanupEnabled = (o: AudioCleanupOptions | null | undefined): o is AudioCleanupOptions =>
  !!o && (o.denoise || o.level);

// The two measurements run as SEPARATE passes on purpose. In the app's own ffmpeg.wasm build,
// chaining ebur128 with astats (or passing it framelog=) dies with "Error reinitializing filters!",
// which killed the whole command — and because cleanup fails open, the export then quietly shipped
// the untouched audio. Measured in the browser build, not assumed.

/** ffmpeg arguments for the noise-floor pass: per-audio-frame RMS levels, no output file. */
export function floorArgs(input: string): string[] {
  return [
    '-i', input, '-map', '0:a:0', '-vn',
    '-af', `astats=metadata=1:reset=1,ametadata=mode=print:key=${RMS_KEY}`,
    '-f', 'null', '-',
  ];
}

/**
 * ffmpeg arguments for the loudness pass, no output file. MEASURED: the browser build's ebur128
 * runs but reports -70 LUFS (its silence value) for real audio, so loudness comes from
 * volumedetect's mean (RMS) level instead — on the calibration clip that read -15.2 dB against a
 * true -15.4 LUFS, so the same -16 target holds.
 */
export function loudnessArgs(input: string): string[] {
  return ['-i', input, '-map', '0:a:0', '-vn', '-af', 'volumedetect', '-f', 'null', '-'];
}

/** Background-noise floor: the 10th-percentile frame level, clamped to afftdn's range. */
export function noiseFloorDb(levels: readonly number[]): number | null {
  const v = levels
    .filter((x) => !Number.isNaN(x))
    .map((x) => (Number.isFinite(x) ? x : FLOOR_MIN_DB))   // digital silence reads -inf
    .sort((a, b) => a - b);
  if (v.length < 20) return null;                           // under a second of audio
  const p10 = v[Math.floor((v.length - 1) * 0.1)];
  return Math.round(Math.max(FLOOR_MIN_DB, Math.min(FLOOR_MAX_DB, p10)));
}

/** Reads the analysis pass's log lines (ffmpeg.wasm 'log' events). */
export function parseAnalysisLog(lines: readonly string[]): AudioAnalysis {
  const levels: number[] = [];
  let meanDb: number | null = null;
  let maxDb: number | null = null;
  const rmsRe = new RegExp(`${RMS_KEY.replace(/\./g, '\\.')}=(-?inf|-?\\d+(?:\\.\\d+)?)`, 'i');
  for (const line of lines) {
    const m = rmsRe.exec(line);
    if (m) {
      levels.push(/inf/i.test(m[1]) ? -Infinity : Number(m[1]));
      continue;
    }
    const mean = /mean_volume:\s+(-?\d+(?:\.\d+)?)\s*dB/.exec(line);
    if (mean) meanDb = Number(mean[1]);
    const max = /max_volume:\s+(-?\d+(?:\.\d+)?)\s*dB/.exec(line);
    if (max) maxDb = Number(max[1]);
  }
  // Digital silence measures around -91 dB; a pass that never ran leaves nothing to correct.
  const usable = meanDb !== null && Number.isFinite(meanDb) && meanDb > -60 && meanDb < -1;
  return { floorDb: noiseFloorDb(levels), meanDb: usable ? meanDb : null, maxDb };
}

/** The audio filter chain for these options, or null when there is nothing to apply. */
export function buildAudioCleanupChain(opts: AudioCleanupOptions, a: AudioAnalysis): string | null {
  const parts: string[] = [];
  if (opts.denoise && a.floorDb !== null) {
    // agate's threshold is linear and bottoms out at ~-60 dBFS.
    const gate = Math.max(0.001, Math.min(1, 10 ** ((a.floorDb + 6) / 20)));
    parts.push('highpass=f=80', `afftdn=nr=20:nf=${a.floorDb}:tn=1`, `agate=threshold=${gate.toFixed(5)}:ratio=2:attack=10:release=250`);
  }
  if (opts.level && a.meanDb !== null) {
    const gain = Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, TARGET_MEAN_DB - a.meanDb));
    if (Math.abs(gain) >= 0.5) parts.push(`volume=${gain.toFixed(2)}dB`);
    parts.push('alimiter=limit=0.89:level=0');
  }
  return parts.length ? parts.join(',') : null;
}
