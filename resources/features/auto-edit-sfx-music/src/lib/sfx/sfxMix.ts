// Pure ffmpeg filter graph that mixes placed sound effects over a source audio track. Used by the
// Element Capture exporter's ffmpeg.wasm mux (its captured video carries no audio). No ffmpeg
// import here, so the graph is unit-testable and can be checked against a real ffmpeg.

export interface SfxMixInput {
  /** Export-clock ms where the sound starts. */
  atMs: number;
  /** 0..1.5 */
  gain: number;
}

/** Background music mixed under everything else, with the duck curve already computed. */
export interface MusicMixInput {
  /** Export-clock ms where the track starts. */
  startMs: number;
  /** An ffmpeg `volume` expression in `t` (see lib/music/duck duckVolumeExpr). */
  volumeExpr: string;
  fadeInMs: number;
  fadeOutMs: number;
  /** Export length, so the tail fade lands at the end of the video. */
  durationMs: number;
}

/**
 * `sourceInput` is the ffmpeg input index of the source (its first audio stream is the bed);
 * sounds are inputs `firstSfxInput`, `firstSfxInput + 1`, … in `sfx` order. Output label [aout].
 *
 * Every stream is brought to 48 kHz stereo so amix never has to guess, each sound is delayed to
 * its moment, and amix runs with normalize=0 — without that, amix divides by the input count and
 * the whole voice track drops in level the moment one sound is added.
 */
export function buildSfxMixGraph(
  sfx: readonly SfxMixInput[],
  sourceInput = 1,
  firstSfxInput = 2,
  music?: MusicMixInput | null,
): string {
  const norm = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  const parts = [`[${sourceInput}:a]${norm}[bed]`];
  const labels = ['[bed]'];
  sfx.forEach((s, i) => {
    const delay = Math.max(0, Math.round(Number.isFinite(s.atMs) ? s.atMs : 0));
    const gain = Math.max(0, Math.min(1.5, Number.isFinite(s.gain) ? s.gain : 1));
    parts.push(`[${firstSfxInput + i}:a]${norm},volume=${gain.toFixed(3)},adelay=delays=${delay}:all=1[s${i}]`);
    labels.push(`[s${i}]`);
  });
  if (music) {
    // Music is the LAST input. eval=frame because the duck curve is a function of time; the fades
    // are separate from it so a duck at the very start can't be mistaken for the opening fade.
    const mi = firstSfxInput + sfx.length;
    const delay = Math.max(0, Math.round(Number.isFinite(music.startMs) ? music.startMs : 0));
    const fadeIn = Math.max(0, music.fadeInMs) / 1000;
    const fadeOut = Math.max(0, music.fadeOutMs) / 1000;
    const outStart = Math.max(0, music.durationMs / 1000 - fadeOut);
    const fades = (fadeIn > 0 ? `,afade=t=in:st=${(delay / 1000).toFixed(3)}:d=${fadeIn.toFixed(3)}` : '')
      + (fadeOut > 0 ? `,afade=t=out:st=${outStart.toFixed(3)}:d=${fadeOut.toFixed(3)}` : '');
    parts.push(`[${mi}:a]${norm}${delay > 0 ? `,adelay=delays=${delay}:all=1` : ''},volume='${music.volumeExpr}':eval=frame${fades}[mus]`);
    labels.push('[mus]');
  }
  parts.push(`${labels.join('')}amix=inputs=${labels.length}:duration=first:dropout_transition=0:normalize=0[aout]`);
  return parts.join(';');
}
