import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Brand Kit logo must appear on EVERY surface that paints a frame, through the ONE shared
 * component, layered like the watermark — mounted before it so the watermark always paints on top.
 * The failure this guards is the classic one in this codebase: a new export path (or a new props
 * literal in page.tsx) that forgets the prop, so the preview shows the logo and the file doesn't.
 * (Rendered-output checks live in the Remotion still renders; this pins the wiring.)
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const SURFACES: { file: string; watermark: string }[] = [
  { file: 'src/components/editor/VideoCanvas.tsx',       watermark: '<PreviewWatermark' },
  { file: 'src/remotion/CaptionExportComposition.tsx',   watermark: '<Watermark />' },
  { file: 'src/remotion/LambdaCaptionComposition.tsx',   watermark: '<Watermark />' },
  { file: 'src/lib/export/elementCaptureExport.tsx',     watermark: '<WatermarkLockup' },
];

describe('brand logo overlay — render-surface parity', () => {
  it.each(SURFACES)('$file mounts the shared BrandLogoOverlay just before its watermark', ({ file, watermark }) => {
    const src = read(file);
    expect(src).toMatch(/import \{ BrandLogoOverlay \} from '(?:@\/remotion|\.)\/BrandLogoOverlay'/);
    const logoAt = src.indexOf('<BrandLogoOverlay');
    const wmAt = src.indexOf(watermark);
    expect(logoAt).toBeGreaterThan(-1);
    expect(wmAt).toBeGreaterThan(logoAt);
  });

  it.each(['src/remotion/CaptionExportComposition.tsx', 'src/remotion/LambdaCaptionComposition.tsx'])(
    '%s validates the prop and holds capture until the logo decodes', (file) => {
      const src = read(file);
      expect(src).toMatch(/sanitizeBrandLogo\(brandLogo\)/);
      expect(src).toMatch(/useBrandLogoGate\(/);
      expect(src).toMatch(/onSettled=\{releaseLogo\}/);
    });

  it('the logo never gates the watermark: watermark conditions are unchanged', () => {
    expect(read('src/remotion/CaptionExportComposition.tsx')).toMatch(/\{!isPro && <Watermark \/>\}/);
    expect(read('src/remotion/LambdaCaptionComposition.tsx')).toMatch(/\{!isPro && auraAlphaLayer !== 'diff' && <Watermark \/>\}/);
  });

  describe('editor page wires the prop into every export', () => {
    const page = read('src/app/editor/page.tsx');

    it('every CaptionExportProps literal carries brandLogo', () => {
      const literals = [...page.matchAll(/: CaptionExportProps = \{([\s\S]*?)\n\s*\};/g)].map(m => m[1]);
      expect(literals.length).toBeGreaterThanOrEqual(4);
      for (const body of literals) expect(body).toMatch(/\bbrandLogo\b/);
    });

    it('the cloud render body carries brandLogo', () => {
      const body = /const renderBody = \{([\s\S]*?)\n\s*\};/.exec(page)?.[1] ?? '';
      expect(body).toMatch(/\bbrandLogo\b/);
    });

    it('the preview gets it, and both canvas-recorder fallbacks draw it', () => {
      expect(page).toMatch(/<VideoCanvas[\s\S]*?brandLogo=\{brandLogo\}/);
      const calls = [...page.matchAll(/await recordVideoWithCaptions\(([\s\S]*?)\);/g)].map(m => m[1]);
      expect(calls.length).toBeGreaterThanOrEqual(2);
      for (const args of calls) expect(args).toMatch(/\bbrandLogo\b/);
    });
  });
});
