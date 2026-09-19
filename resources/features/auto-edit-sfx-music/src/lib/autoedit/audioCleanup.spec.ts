import { describe, it, expect } from 'vitest';
import {
  buildAudioCleanupChain, cleanupEnabled, floorArgs, loudnessArgs, MAX_GAIN_DB, noiseFloorDb, parseAnalysisLog, TARGET_MEAN_DB,
} from './audioCleanup';
import { buildCutFilterGraph } from './cutGraph';

// A frame line exactly as ffmpeg prints it during the analysis pass (captured 2026-09-16).
const rms = (v: string) => `[Parsed_ametadata_4 @ 000001ca24853d00] lavfi.astats.Overall.RMS_level=${v}`;

describe('audioCleanup', () => {
  it('measures the floor and the loudness in SEPARATE passes, writing no file', () => {
    // Chaining ebur128 with astats dies in the browser ffmpeg build ("Error reinitializing filters!"),
    // and because cleanup fails open the export then silently shipped untouched audio.
    const floor = floorArgs('in.mp4').join(' ');
    const loud = loudnessArgs('in.mp4').join(' ');
    expect(floor).toContain('astats=metadata=1:reset=1');
    expect(floor).not.toContain('ebur128');
    expect(loud).toContain('volumedetect');   // the build's ebur128 reports -70 LUFS for real audio
    expect(loud).not.toContain('astats');
    expect(floorArgs('in.mp4').slice(-3)).toEqual(['-f', 'null', '-']);
    expect(loudnessArgs('in.mp4').slice(-3)).toEqual(['-f', 'null', '-']);
  });

  it('an unmeasured loudness pass leaves nothing to correct', () => {
    expect(parseAnalysisLog([]).meanDb).toBeNull();
    expect(parseAnalysisLog(['    I:         -70.0 LUFS']).meanDb).toBeNull();   // ebur128 output is ignored
  });

  it('parses RMS frames and the integrated-loudness summary', () => {
    const lines = [
      ...Array.from({ length: 30 }, (_, i) => rms(i < 5 ? '-27.452090' : '-14.100000')),
      '[Parsed_volumedetect_0 @ 000001ca2485a000] mean_volume: -15.4 dB',
      '[Parsed_volumedetect_0 @ 000001ca2485a000] max_volume: -0.4 dB',
    ];
    const r = parseAnalysisLog(lines);
    expect(r.meanDb).toBeCloseTo(-15.4);
    expect(r.maxDb).toBeCloseTo(-0.4);
    expect(r.floorDb).toBe(-27);   // the 10th percentile sits in the quiet frames
  });

  it('noise floor: digital silence is the quietest floor; too little audio is unmeasurable', () => {
    expect(noiseFloorDb(Array(40).fill(-Infinity))).toBe(-80);
    expect(noiseFloorDb([-30, -20])).toBeNull();
    expect(noiseFloorDb(Array(40).fill(-5))).toBe(-20);   // clamped to afftdn's accepted range
    expect(parseAnalysisLog(Array.from({ length: 25 }, () => rms('-inf'))).floorDb).toBe(-80);
  });

  it('silence has no loudness to normalise', () => {
    expect(parseAnalysisLog(['[Parsed_volumedetect_0 @ 1] mean_volume: -91.0 dB']).meanDb).toBeNull();
  });

  it('denoise uses the MEASURED floor (the default -50 dB floor barely touched real noise)', () => {
    const c = buildAudioCleanupChain({ denoise: true, level: false }, { floorDb: -27, meanDb: -15 })!;
    expect(c).toContain('highpass=f=80');
    expect(c).toContain('afftdn=nr=20:nf=-27:tn=1');
    expect(c).toContain('agate=threshold=0.08913:ratio=2');   // 6 dB above the floor (-21 dBFS)
    expect(c).not.toContain('volume');
  });

  it('levelling is a static gain to the -16 target, clamped, plus a limiter — never loudnorm', () => {
    const quiet = buildAudioCleanupChain({ denoise: false, level: true }, { floorDb: -40, meanDb: -24 })!;
    expect(quiet).toContain(`volume=${(TARGET_MEAN_DB + 24).toFixed(2)}dB`);
    expect(quiet).toContain('alimiter');
    expect(quiet).not.toContain('loudnorm');
    const whisper = buildAudioCleanupChain({ denoise: false, level: true }, { floorDb: -60, meanDb: -50 })!;
    expect(whisper).toContain(`volume=${MAX_GAIN_DB.toFixed(2)}dB`);
    const already = buildAudioCleanupChain({ denoise: false, level: true }, { floorDb: -60, meanDb: -16.2 })!;
    expect(already).not.toContain('volume');
  });

  it('nothing to apply → null, so the exporter skips processing', () => {
    expect(buildAudioCleanupChain({ denoise: false, level: false }, { floorDb: -30, meanDb: -20 })).toBeNull();
    expect(buildAudioCleanupChain({ denoise: true, level: true }, { floorDb: null, meanDb: null })).toBeNull();
    expect(cleanupEnabled(null)).toBe(false);
    expect(cleanupEnabled({ denoise: false, level: false })).toBe(false);
    expect(cleanupEnabled({ denoise: true, level: false })).toBe(true);
  });

  it('the cut graph runs the cleanup chain on the joined audio track', () => {
    const g = buildCutFilterGraph([{ start: 0, end: 1 }, { start: 2, end: 3 }], 30, 'highpass=f=80');
    expect(g.endsWith('concat=n=2:v=1:a=1[outv][cuta];[cuta]highpass=f=80[outa]')).toBe(true);
    expect(buildCutFilterGraph([{ start: 0, end: 1 }], 30).endsWith('[outv][outa]')).toBe(true);
  });
});
