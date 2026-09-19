// ─────────────────────────────────────────────────────────────────────────────
// Auto-Edit — reason → label + Tailwind chip styling. Uses captik's palette
// (zinc surfaces, amber accent) so the removed-clips list matches the editor.
// ─────────────────────────────────────────────────────────────────────────────

import type { RemovalReason } from './types';

export interface ReasonStyle {
  label: string;
  /** Chip classes (text + bg + border). */
  chip: string;
  /** Solid colour for timeline overlays (rgba so it can sit over the track). */
  overlay: string;
}

export const REASON_STYLES: Record<RemovalReason, ReasonStyle> = {
  silence: {
    label: 'Silence',
    chip: 'text-zinc-300 bg-zinc-500/15 border-zinc-400/20',
    overlay: 'rgba(161,161,170,0.35)',
  },
  filler: {
    label: 'Filler',
    chip: 'text-amber-300 bg-amber-500/15 border-amber-400/25',
    overlay: 'rgba(245,158,11,0.35)',
  },
  repetition: {
    label: 'Retake',
    chip: 'text-sky-300 bg-sky-500/15 border-sky-400/25',
    overlay: 'rgba(56,189,248,0.35)',
  },
  offtopic: {
    label: 'Off-topic',
    chip: 'text-rose-300 bg-rose-500/15 border-rose-400/25',
    overlay: 'rgba(244,63,94,0.35)',
  },
  manual: {
    label: 'Manual cut',
    chip: 'text-violet-300 bg-violet-500/15 border-violet-400/25',
    overlay: 'rgba(167,139,250,0.35)',
  },
};

export function reasonStyle(reason: RemovalReason): ReasonStyle {
  return REASON_STYLES[reason] ?? REASON_STYLES.silence;
}
