import { z } from 'zod';

// Bounds-checking schemas for the expensive API routes. These are deliberately
// loose objects: each route keeps its existing field handling, the schema just
// rejects absurd payloads (10MB word arrays, 8K renders, hour-long fontData)
// before they reach Lambda/ffmpeg/Sarvam.

// Sized for the duration cap: 6h of fast speech (~170wpm) ≈ 60k words. A lower
// cap would 400 exports of long videos the upload/transcribe flow accepts.
// These are anti-abuse guards against absurd payloads, NOT the real length limit
// (that's the per-path platform timeout — Vercel ~800s burn / AWS Lambda 900s/chunk).
export const MAX_WORDS       = 60_000;
export const MAX_DURATION_MS = 6 * 60 * 60 * 1000;        // 6h
export const MAX_DIMENSION   = 4_096;                     // covers 4K DCI
export const MAX_FONT_B64    = 20 * 1024 * 1024;          // ~15MB font binary

const dimension = z.number().int().min(2).max(MAX_DIMENSION)
  .refine(n => n % 2 === 0, 'dimension must be even');

// Caption words are REPAIRED, not rejected. A word whose startMs/endMs is NaN/Infinity/missing
// arrives as `null` (JSON has no NaN) and a strict `.finite()` 400'd the whole request — which the
// browser treats as terminal and then rebuilds identically on every retry, so the export became
// permanently impossible for that project. One malformed word is not a reason to refuse a render;
// the client repairs timings properly (src/lib/renderPayload.ts) and this is the backstop for
// payloads it didn't build (older cached bundles, the NLE plugin). Text is clipped, not rejected,
// for the same reason. Everything else about the schema stays strict.
const msTimestamp = z.preprocess(
  (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0),
  z.number(),
);
const word = z.looseObject({
  text:    z.preprocess(
    (v) => (typeof v === 'string' ? v : String(v ?? '')).slice(0, 200),
    z.string(),
  ),
  startMs: msTimestamp,
  endMs:   msTimestamp,
});

export const renderBodySchema = z.looseObject({
  // Optional ONLY for alpha overlay renders (no source video is decoded); every non-alpha
  // route path re-checks presence explicitly and 400s without it.
  videoKey:   z.string().min(1).max(300).optional(),
  width:      dimension,
  height:     dimension,
  durationMs: z.number().finite().positive().max(MAX_DURATION_MS),
  fps:        z.number().min(10).max(120).optional(),
  words:      z.array(word).max(MAX_WORDS).optional(),
  // "Behind the subject": key of the uploaded matte pack — the worker composites the cut-out over
  // the render. When present the render stays single-pass (the composite needs the full video).
  matteKey:   z.string().max(300).optional(),
  // Optional plugin device-id for trial anti-abuse. Optional so old .zxp shells
  // that don't send it never 400.
  fingerprint: z.string().max(128).optional(),
  // Optional device-local project id. When the ₹9 first-export unlock was bought for this
  // project, the server makes its export watermark-free (permanent, re-export stays clean).
  projectRef: z.string().max(200).optional(),
  // Transparent caption overlay (plugin "Transparent overlay (.mov)"): captions rendered on an
  // alpha channel (ProRes 4444), no video underneath. videoKey is NOT required for these — no
  // source is decoded. auraAlphaLayer splits Aura into its base pass and its difference-words
  // pass (the NLE's track Difference blend recreates the effect).
  alpha:          z.boolean().optional(),
  auraAlphaLayer: z.enum(['base', 'diff']).optional(),
  // Placed sound effects (editor Sounds tab): bank ids on the EXPORT clock. Optional, and bounded
  // so a crafted payload can't make the renderer schedule thousands of audio sequences.
  sfx: z.array(z.looseObject({
    id:    z.string().max(40),
    sfxId: z.string().regex(/^[a-z0-9_]{1,40}$/),
    atMs:  z.number().finite().nonnegative().max(MAX_DURATION_MS),
    gain:  z.number().finite().min(0).max(1.5),
  })).max(300).optional(),
});

export const renderFastBodySchema = z.looseObject({
  videoKey: z.string().min(1).max(300),
  meta: z.looseObject({
    words:     z.array(word).min(1).max(MAX_WORDS),
    styleId:   z.string().max(60),
    width:     dimension,
    height:    dimension,
    fontScale: z.number().min(0.1).max(5).optional(),
  }),
  fontData: z.string().max(MAX_FONT_B64).optional(),
});

// HEVC → H.264 transcode of an already-uploaded source (browser can't decode HEVC).
export const transcodeBodySchema = z.looseObject({
  videoKey: z.string().min(1).max(300),
  // Optional downscale target (long edge, px). The editor sends 1920 for non-4K plans so a 4K source
  // transcodes straight to 1080p (render decodes 1080p, not 4K). Omitted for 4K-capable plans.
  maxLongEdge: z.number().min(240).max(4320).optional(),
});

// Stitch the chunks of a chunked parallel render (keys come from /api/render-hq).
export const stitchBodySchema = z.looseObject({
  chunkKeys:  z.array(z.string().min(1).max(300)).min(1).max(12),
  videoKey:   z.string().min(1).max(300),  // source — for the audio track
  finalKey:   z.string().min(1).max(300),
  durationMs: z.number().finite().positive().max(MAX_DURATION_MS),
});

export const multipartBodySchema = z.discriminatedUnion('action', [
  z.looseObject({
    action:      z.literal('create'),
    ext:         z.string().max(8).optional(),
    contentType: z.string().max(80).optional(),
  }),
  z.looseObject({
    action:   z.literal('sign'),
    key:      z.string().min(1).max(300),
    uploadId: z.string().min(1).max(1024),
    parts:    z.number().int().min(1).max(1_000),
  }),
  z.looseObject({
    action:   z.literal('complete'),
    key:      z.string().min(1).max(300),
    uploadId: z.string().min(1).max(1024),
  }),
  z.looseObject({
    action:   z.literal('abort'),
    key:      z.string().min(1).max(300),
    uploadId: z.string().min(1).max(1024),
  }),
]);

export const transcribeBodySchema = z.looseObject({
  transcript:   z.string().min(1).max(200_000),
  languageCode: z.string().max(20).optional().default(''),
  durationMs:   z.number().finite().positive().max(MAX_DURATION_MS).optional(),
  timestamps:   z.unknown().optional(),
});

/** Parse or build the standard 400 response body. */
export function parseOr400<T extends z.ZodType>(schema: T, data: unknown):
  { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, data: r.data };
  const first = r.error.issues[0];
  return { ok: false, error: `${first?.path?.join('.') || 'body'}: ${first?.message || 'invalid'}` };
}
