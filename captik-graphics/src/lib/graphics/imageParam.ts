// Turning a picked file into an `image` param value.
//
// The result MUST be a data: URL, never a blob: URL. A blob: URL is scoped to the tab that
// created it, and the cloud renderer loads the page from an S3 site in a headless browser on
// another machine — the image would simply be missing from the export while looking perfect in
// the editor. Data URLs are already proven down this whole path by the custom-font feature
// (page.tsx -> /api/render -> buildCustomFontCss), and oversized inputProps are uploaded to S3
// automatically by Remotion rather than failing.
//
// Everything is downscaled hard because the payload rides inside the render request.

/** Longest edge, in px, an image param is stored at. Graphics are small on screen (a 900-design-px
 *  card is ~950px on a 1080p export), so 512 is already generous. */
export const IMAGE_MAX_EDGE = 512;

/** Total data-URL bytes allowed across one project's image params, before we ask the user to
 *  remove one. Keeps the render payload sane. */
export const IMAGE_BUDGET_BYTES = 2_000_000;

export class ImageTooLargeError extends Error {}

/** Downscale + re-encode a picked file to a compact data URL.
 *  webp where supported (roughly a third the size of jpeg at the same quality), else jpeg. */
export async function fileToImageParam(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new ImageTooLargeError('That file is not an image.');
  }
  // 40MB guard on the SOURCE — decoding a 100MP camera raw would hang the tab before we ever
  // get to downscale it.
  if (file.size > 40 * 1024 * 1024) {
    throw new ImageTooLargeError('That image is too large. Try one under 40MB.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageTooLargeError('Could not read that image.');
    ctx.drawImage(bitmap, 0, 0, w, h);

    // PNG sources with transparency must stay PNG-capable — webp keeps alpha, jpeg does not.
    const webp = canvas.toDataURL('image/webp', 0.85);
    if (webp.startsWith('data:image/webp')) return webp;
    return canvas.toDataURL('image/png');
  } finally {
    bitmap.close();
  }
}

/** Approximate decoded byte size of a data URL, for the project budget. */
export function dataUrlBytes(url: string): number {
  const i = url.indexOf(',');
  if (i < 0) return 0;
  return Math.floor((url.length - i - 1) * 0.75);
}
