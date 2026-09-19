// Brand Kit logo overlay — the render contract shared by EVERY surface that paints a frame:
//   · live preview              → src/components/editor/VideoCanvas.tsx
//   · in-browser WebCodecs      → src/remotion/CaptionExportComposition.tsx
//   · cloud (Lambda / box)      → src/remotion/LambdaCaptionComposition.tsx
//   · Element Capture           → src/lib/export/elementCaptureExport.tsx
//   · canvas-recorder fallback  → recordVideoWithCaptions (src/app/editor/page.tsx)
// The DOM surfaces all mount ONE component, src/remotion/BrandLogoOverlay.tsx; the canvas fallback
// draws with brandLogoBox below. Geometry is computed in frame pixels from the frame WIDTH, so a
// 270px-wide preview and a 1080px-wide export put the logo on proportionally identical pixels.
//
// Pure and dependency-free on purpose: it is bundled into the Remotion site.

export type BrandLogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const BRAND_LOGO_POSITIONS: readonly BrandLogoPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/** What a render surface receives. Built from the applied kit by brandLogoFromKit (lib/brandKit). */
export interface BrandLogoProps {
  /** data: URL of a PNG / JPEG / WebP / SVG image — never a remote URL (see sanitizeBrandLogo). */
  src: string;
  /** Natural width ÷ height, measured when the logo was uploaded. */
  aspect: number;
  position: BrandLogoPosition;
  /** Logo width as a percentage of the frame width. */
  sizePct: number;
  /** 0.1 – 1. */
  opacity: number;
}

export const BRAND_LOGO_SIZE = { min: 5, max: 40, default: 16 } as const;
export const BRAND_LOGO_OPACITY = { min: 0.1, max: 1, default: 0.9 } as const;
/** Inset from the two nearest frame edges, as a fraction of the frame WIDTH (same px on both axes). */
export const BRAND_LOGO_MARGIN_FRAC = 0.04;
/** A very tall logo is capped at this fraction of the frame height (its width shrinks to match). */
export const BRAND_LOGO_MAX_HEIGHT_FRAC = 0.4;
/** A 1 MB file is ~1.37M base64 characters; the headroom covers an SVG rasterised to PNG. */
export const BRAND_LOGO_MAX_SRC_CHARS = 1_600_000;

const LOGO_DATA_URL = /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]*={0,2}$/;

const finiteOr = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** True for an inline base64 image data URL of an allowed type and size. */
export function isBrandLogoDataUrl(src: unknown): src is string {
  return typeof src === 'string' && src.length <= BRAND_LOGO_MAX_SRC_CHARS && LOGO_DATA_URL.test(src);
}

/**
 * Validate a logo prop that arrived from outside the type system — the cloud route forwards the
 * client's JSON body into the Lambda inputProps verbatim. Anything malformed returns null (the
 * frame simply renders without a logo; a bad logo must never fail an export), and the src must be
 * an inline data URL so a crafted body can't make the renderer fetch an arbitrary URL.
 */
export function sanitizeBrandLogo(input: unknown): BrandLogoProps | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  if (!isBrandLogoDataUrl(o.src)) return null;
  const position = BRAND_LOGO_POSITIONS.includes(o.position as BrandLogoPosition)
    ? (o.position as BrandLogoPosition)
    : 'top-right';
  return {
    src: o.src,
    aspect: clamp(finiteOr(o.aspect, 1), 0.05, 20),
    position,
    sizePct: clamp(finiteOr(o.sizePct, BRAND_LOGO_SIZE.default), BRAND_LOGO_SIZE.min, BRAND_LOGO_SIZE.max),
    opacity: clamp(finiteOr(o.opacity, BRAND_LOGO_OPACITY.default), BRAND_LOGO_OPACITY.min, BRAND_LOGO_OPACITY.max),
  };
}

export interface BrandLogoBox {
  /** Top-left corner and size, in frame pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the logo sits in a frame of the given size. The single source of logo geometry. */
export function brandLogoBox(
  frameWidth: number,
  frameHeight: number,
  logo: Pick<BrandLogoProps, 'aspect' | 'position' | 'sizePct'>,
): BrandLogoBox {
  const fw = Math.max(1, frameWidth);
  const fh = Math.max(1, frameHeight);
  const aspect = clamp(finiteOr(logo.aspect, 1), 0.05, 20);
  const sizePct = clamp(finiteOr(logo.sizePct, BRAND_LOGO_SIZE.default), BRAND_LOGO_SIZE.min, BRAND_LOGO_SIZE.max);
  let width = (fw * sizePct) / 100;
  let height = width / aspect;
  const maxHeight = fh * BRAND_LOGO_MAX_HEIGHT_FRAC;
  if (height > maxHeight) { height = maxHeight; width = height * aspect; }
  const margin = fw * BRAND_LOGO_MARGIN_FRAC;
  const left = logo.position === 'top-left' || logo.position === 'bottom-left';
  const top = logo.position === 'top-left' || logo.position === 'top-right';
  return {
    x: left ? margin : fw - margin - width,
    y: top ? margin : fh - margin - height,
    width,
    height,
  };
}
