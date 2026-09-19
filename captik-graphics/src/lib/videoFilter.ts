// Video look adjustments (filters/grades) — expressed as a CSS `filter` string so the SAME
// pixels come out of every surface: the editor <video>, Lambda/web-renderer Remotion <Video>
// (headless Chromium), and the Element Capture stage all apply identical CSS filters.
// No ffmpeg pass, no LUT files, no extra render cost. Pure + unit-tested.

export type VideoFilterPresetId = 'none' | 'crisp' | 'film' | 'moody' | 'golden' | 'mono' | 'cool' | 'teal_orange' | 'vintage' | 'peach' | 'noir' | 'arctic' | 'faded' | 'sunset' | 'forest' | 'neon';

export interface VideoAdjust {
  /** 0.5–1.5, default 1. */
  brightness?: number;
  /** 0.5–1.5, default 1. */
  contrast?: number;
  /** 0–2, default 1. */
  saturation?: number;
  /** −50 (cool) … +50 (warm), default 0. */
  temperature?: number;
  /** A ready-made grade applied UNDER the sliders. */
  preset?: VideoFilterPresetId;
  /** Zoom into the frame, 1–3 (1 = off). */
  zoom?: number;
  /** Pan when zoomed, % of the frame, clamped so edges never show. */
  xPan?: number;
  yPan?: number;
}

/** LUT-style one-click grades (slider adjustments stack on top). */
export const FILTER_PRESETS: { id: VideoFilterPresetId; label: string; css: string }[] = [
  { id: 'none',   label: 'Original', css: '' },
  { id: 'crisp',  label: 'Crisp',    css: 'contrast(1.08) saturate(1.18)' },
  { id: 'film',   label: 'Film',     css: 'contrast(1.06) saturate(0.88) sepia(0.12)' },
  { id: 'moody',  label: 'Moody',    css: 'brightness(0.95) contrast(1.16) saturate(0.82)' },
  { id: 'golden', label: 'Golden',   css: 'sepia(0.24) saturate(1.22) brightness(1.04)' },
  { id: 'mono',   label: 'Mono',     css: 'grayscale(1) contrast(1.06)' },
  { id: 'cool',   label: 'Cool',     css: 'saturate(1.06) hue-rotate(-8deg) brightness(1.02)' },
  { id: 'teal_orange', label: 'Teal & Orange', css: 'contrast(1.1) saturate(1.28) hue-rotate(-6deg) sepia(0.08)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.35) contrast(0.94) brightness(1.04) saturate(0.85)' },
  { id: 'peach',   label: 'Peach',   css: 'sepia(0.16) saturate(1.15) brightness(1.06) hue-rotate(6deg)' },
  { id: 'noir',    label: 'Noir',    css: 'grayscale(1) contrast(1.25) brightness(0.94)' },
  { id: 'arctic',  label: 'Arctic',  css: 'saturate(0.8) hue-rotate(-14deg) brightness(1.06) contrast(1.05)' },
  { id: 'faded',   label: 'Faded',   css: 'contrast(0.85) saturate(0.75) brightness(1.08)' },
  { id: 'sunset',  label: 'Sunset',  css: 'sepia(0.28) hue-rotate(-12deg) saturate(1.35) contrast(1.05)' },
  { id: 'forest',  label: 'Forest',  css: 'hue-rotate(18deg) saturate(1.1) contrast(1.06) brightness(0.98)' },
  { id: 'neon',    label: 'Neon',    css: 'saturate(1.6) contrast(1.18) brightness(1.02)' },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** True when the adjust set is a no-op (skip the CSS filter entirely — zero cost). */
export function isDefaultAdjust(a?: VideoAdjust | null): boolean {
  if (!a) return true;
  return (a.preset ?? 'none') === 'none'
    && (a.brightness ?? 1) === 1
    && (a.contrast ?? 1) === 1
    && (a.saturation ?? 1) === 1
    && (a.temperature ?? 0) === 0
    && (a.zoom ?? 1) === 1;
}

/** CSS `transform` for zoom/pan, or undefined when off. Pan is clamped to the zoomed
 *  overflow so the frame edge can never slide into view. */
export function videoTransformCss(a?: VideoAdjust | null): string | undefined {
  const z = clamp(a?.zoom ?? 1, 1, 3);
  if (z === 1) return undefined;
  const maxPan = (1 - 1 / z) * 50;   // % of the frame hidden per side at this zoom
  const x = clamp(a?.xPan ?? 0, -maxPan, maxPan);
  const y = clamp(a?.yPan ?? 0, -maxPan, maxPan);
  return `scale(${z.toFixed(3)}) translate(${x.toFixed(2)}%, ${y.toFixed(2)}%)`;
}

/** CSS `filter` value for the adjust set, or undefined when it's a no-op. */
export function videoFilterCss(a?: VideoAdjust | null): string | undefined {
  if (isDefaultAdjust(a)) return undefined;
  const parts: string[] = [];
  const preset = FILTER_PRESETS.find((p) => p.id === (a!.preset ?? 'none'));
  if (preset?.css) parts.push(preset.css);
  const b = clamp(a!.brightness ?? 1, 0.5, 1.5);
  const c = clamp(a!.contrast ?? 1, 0.5, 1.5);
  const s = clamp(a!.saturation ?? 1, 0, 2);
  const t = clamp(a!.temperature ?? 0, -50, 50);
  if (b !== 1) parts.push(`brightness(${b.toFixed(2)})`);
  if (c !== 1) parts.push(`contrast(${c.toFixed(2)})`);
  if (s !== 1) parts.push(`saturate(${s.toFixed(2)})`);
  // Temperature: warm = a touch of sepia; cool = a slight hue rotation toward blue.
  if (t > 0) parts.push(`sepia(${(t / 160).toFixed(3)})`);
  else if (t < 0) parts.push(`hue-rotate(${(t * 0.25).toFixed(1)}deg)`);
  return parts.length ? parts.join(' ') : undefined;
}
