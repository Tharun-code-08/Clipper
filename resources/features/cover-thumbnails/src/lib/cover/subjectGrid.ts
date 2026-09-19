// Downsamples the cut-out's alpha into the cover's OWN coordinates — the same cover-fit crop, pan and
// zoom the stage draws it with — so headline placement reasons about exactly what the cover shows.
// Browser-only (canvas); the placement maths it feeds is pure (headlinePlacement.ts).

import { coverFitRect, type CoverPreset } from './coverLayout';
import type { SubjectGrid } from './headlinePlacement';

export function subjectGridFor(
  cutout: HTMLCanvasElement,
  preset: CoverPreset,
  panX: number,
  panY: number,
  zoom: number,
  cols = 54,
): SubjectGrid | null {
  if (!cutout.width || !cutout.height) return null;
  const rows = Math.max(1, Math.round((cols * preset.height) / preset.width));
  const rect = coverFitRect(cutout.width, cutout.height, preset.width, preset.height, panX, panY, zoom);
  const k = cols / preset.width;

  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cutout, rect.dx * k, rect.dy * k, rect.dw * k, rect.dh * k);

  const data = ctx.getImageData(0, 0, cols, rows).data;
  const alpha = new Float32Array(cols * rows);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3] / 255;
  return { w: cols, h: rows, alpha };
}
