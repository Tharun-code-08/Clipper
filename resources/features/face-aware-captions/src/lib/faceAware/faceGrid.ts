// "Keep captions off faces" — turning a segmentation mask into the coarse coverage grid the
// placement works on. PURE (no DOM / MediaPipe), unit-tested in faceGrid.spec.ts; the browser-side
// sampler (lib/matte/faceGridSampler.ts) feeds it MediaPipe's confidence masks.
//
// Why the FACE, not the whole person: in a typical talking-head frame the body fills the lower half
// of the picture, exactly where captions live. Avoiding the whole subject would push nearly every
// caption up over the head. The thing a caption must never sit on is the face, so the grid holds
// face-skin probability (plus hair at a lower weight, so the top of the head counts a little).

/**
 * Coarse probability grid in SOURCE-VIDEO space (not caption-canvas space — the placement maps it
 * through the objectFit:contain rect so one grid serves every aspect ratio).
 * `data[row * cols + col]` ∈ [0, 1].
 */
export interface CoverageGrid { cols: number; rows: number; data: Float32Array }

/** Grid resolution: 54 × 96 — one cell per 20 px of a 1080 × 1920 frame. */
export const GRID_COLS = 54;
export const GRID_ROWS = 96;

/** How much a hair pixel counts relative to a face-skin pixel. */
export const HAIR_WEIGHT = 0.5;

/**
 * Soft threshold on a model confidence — the SAME 0.30 → 0.70 ramp the behind-subject cut-out uses,
 * so both features agree on where the person is and low-confidence background noise sums to 0.
 */
export function maskRamp(p: number): number {
  return p <= 0.30 ? 0 : p >= 0.70 ? 1 : (p - 0.30) / 0.40;
}

function accumulate(
  width: number, height: number, cols: number, rows: number,
  value: (i: number) => number,
): CoverageGrid {
  const sum = new Float64Array(cols * rows);
  const count = new Uint32Array(cols * rows);
  for (let y = 0; y < height; y++) {
    const r = Math.min(rows - 1, Math.floor((y * rows) / height));
    for (let x = 0; x < width; x++) {
      const c = Math.min(cols - 1, Math.floor((x * cols) / width));
      const cell = r * cols + c;
      sum[cell] += value(y * width + x);
      count[cell]++;
    }
  }
  const data = new Float32Array(cols * rows);
  for (let i = 0; i < data.length; i++) data[i] = count[i] ? sum[i] / count[i] : 0;
  return { cols, rows, data };
}

/**
 * Face grid from a multiclass selfie segmentation (face-skin + hair confidence masks, both
 * `width × height`, row-major). Head probability is thresholded as a whole, then split by class
 * weight — thresholding face and hair separately would zero the boundary pixels where the model
 * shares the probability between the two classes.
 */
export function downsampleFaceMask(o: {
  width: number; height: number;
  face: Float32Array; hair?: Float32Array | null;
  cols?: number; rows?: number;
}): CoverageGrid {
  const cols = o.cols ?? GRID_COLS, rows = o.rows ?? GRID_ROWS;
  const { face, hair } = o;
  return accumulate(o.width, o.height, cols, rows, (i) => {
    const f = face[i] ?? 0;
    const h = hair ? (hair[i] ?? 0) : 0;
    const head = f + h;
    if (head <= 0) return 0;
    return Math.min(1, maskRamp(head) * ((f + HAIR_WEIGHT * h) / head));
  });
}

/**
 * Fallback for a single-class model (person vs background): the whole person, thresholded. Only
 * used if the multiclass face channel is unavailable.
 */
export function downsampleSubjectMask(o: {
  width: number; height: number; subject: Float32Array; cols?: number; rows?: number;
}): CoverageGrid {
  const cols = o.cols ?? GRID_COLS, rows = o.rows ?? GRID_ROWS;
  return accumulate(o.width, o.height, cols, rows, (i) => maskRamp(o.subject[i] ?? 0));
}

export function emptyGrid(cols = GRID_COLS, rows = GRID_ROWS): CoverageGrid {
  return { cols, rows, data: new Float32Array(cols * rows) };
}
