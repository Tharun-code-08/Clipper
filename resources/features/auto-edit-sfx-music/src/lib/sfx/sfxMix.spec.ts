import { describe, it, expect } from 'vitest';
import { buildSfxMixGraph, type MusicMixInput } from './sfxMix';
import { duckVolumeExpr, duckWindows } from '@/lib/music/duck';

const music = (patch: Partial<MusicMixInput> = {}): MusicMixInput => ({
  startMs: 0,
  volumeExpr: duckVolumeExpr(duckWindows([{ startMs: 1000, endMs: 1400 }]), 0.35, -14),
  fadeInMs: 800,
  fadeOutMs: 800,
  durationMs: 30_000,
  ...patch,
});

describe('buildSfxMixGraph', () => {
  // The two assertions that predate music — kept verbatim so the exact graph stays pinned.
  it('delays and scales each sound, then mixes without normalising the voice track down', () => {
    const g = buildSfxMixGraph([{ atMs: 1500.4, gain: 0.8 }, { atMs: 0, gain: 9 }]);
    expect(g).toContain('[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[bed]');
    expect(g).toContain('[2:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.800,adelay=delays=1500:all=1[s0]');
    expect(g).toContain('[3:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=1.500,adelay=delays=0:all=1[s1]');
    expect(g.endsWith('[bed][s0][s1]amix=inputs=3:duration=first:dropout_transition=0:normalize=0[aout]')).toBe(true);
  });

  it('honours custom input indices and survives junk numbers', () => {
    const g = buildSfxMixGraph([{ atMs: Number.NaN, gain: Number.NaN }], 0, 5);
    expect(g).toContain('[0:a]aresample');
    expect(g).toContain('[5:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=1.000,adelay=delays=0:all=1[s0]');
  });

  it('mixes the source bed with each sound at its own moment', () => {
    const g = buildSfxMixGraph([{ atMs: 2000, gain: 0.8 }, { atMs: 5000, gain: 1 }]);
    expect(g).toContain('[1:a]');
    expect(g).toContain('adelay=delays=2000:all=1[s0]');
    expect(g).toContain('adelay=delays=5000:all=1[s1]');
    // normalize=0 — otherwise amix divides by the input count and the voice drops when a sound lands.
    expect(g).toContain('amix=inputs=3:duration=first:dropout_transition=0:normalize=0[aout]');
  });

  it('is unchanged when there is no music', () => {
    const plain = buildSfxMixGraph([{ atMs: 0, gain: 1 }]);
    expect(buildSfxMixGraph([{ atMs: 0, gain: 1 }], 1, 2, null)).toBe(plain);
    expect(plain).not.toContain('[mus]');
  });

  it('adds music as the last input, with the duck curve evaluated per frame', () => {
    const g = buildSfxMixGraph([{ atMs: 2000, gain: 1 }], 1, 2, music());
    expect(g).toContain('[3:a]');                    // source is 1, one sound is 2, music is 3
    expect(g).toMatch(/volume='[^']+':eval=frame/);  // a curve, not a constant
    expect(g).toContain('[mus]');
    expect(g).toContain('amix=inputs=3');            // bed + sound + music
  });

  it('music alone still mixes over the bed', () => {
    const g = buildSfxMixGraph([], 1, 2, music());
    expect(g).toContain('[2:a]');
    expect(g).toContain('amix=inputs=2');
  });

  it('a delayed track is delayed, and an undelayed one is not', () => {
    expect(buildSfxMixGraph([], 1, 2, music({ startMs: 4500 }))).toContain('adelay=delays=4500:all=1');
    expect(buildSfxMixGraph([], 1, 2, music({ startMs: 0 }))).not.toContain('adelay');
  });

  it('fades sit at the track start and at the end of the video', () => {
    const g = buildSfxMixGraph([], 1, 2, music({ startMs: 2000, fadeInMs: 500, fadeOutMs: 1000, durationMs: 30_000 }));
    expect(g).toContain('afade=t=in:st=2.000:d=0.500');
    expect(g).toContain('afade=t=out:st=29.000:d=1.000');
  });

  it('no fades requested → none in the graph', () => {
    const g = buildSfxMixGraph([], 1, 2, music({ fadeInMs: 0, fadeOutMs: 0 }));
    expect(g).not.toContain('afade');
  });
});
