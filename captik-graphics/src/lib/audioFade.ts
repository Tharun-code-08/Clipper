// Music fade in/out — one pure gain curve shared by the preview (<audio> volume
// per timeupdate) and both Remotion compositions (volume callback per frame), so
// what you hear in the editor is exactly what exports.

/** Linear fade gain at `tSec` on a `durSec` timeline. 0s fades = no-op. */
export function fadeGain(tSec: number, durSec: number, fadeInSec = 0, fadeOutSec = 0): number {
  let g = 1;
  if (fadeInSec > 0) g = Math.min(g, tSec / fadeInSec);
  if (fadeOutSec > 0 && durSec > 0) g = Math.min(g, (durSec - tSec) / fadeOutSec);
  return Math.min(1, Math.max(0, g));
}
