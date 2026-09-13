'use client';

import { parseMedia } from '@remotion/media-parser';

// One header-only probe of the source video, run when a file is selected.
// Serves three fixes at once:
//  - real fps for the render paths (hardcoded 30 made captions drift on 24/25/60fps footage),
//  - container duration (more reliable than <video>.duration for some files),
//  - codec detection (HEVC iPhone clips silently black-screen in browsers that can't decode them).

export interface MediaInfo {
  fps:        number | null;
  durationMs: number | null;
  width:      number | null;
  height:     number | null;
  /** Container-level codec id, e.g. 'h264', 'h265', 'vp9', 'av1'. */
  videoCodec: string | null;
}

export async function probeMediaInfo(file: Blob): Promise<MediaInfo | null> {
  try {
    const r = await parseMedia({
      src: file,
      acknowledgeRemotionLicense: true,
      // HEADER-ONLY. Every field here resolves from the container header, so the probe finishes
      // in a few ms regardless of file size. Crucially, this runs on the transcription-START
      // critical path (startTranscription awaits it BEFORE the editor opens), so it must never
      // scan the file body. `slowFps` is deliberately NOT requested here — for Matroska/WebM/TS/
      // m3u8 the header declares no fps, so media-parser can only satisfy `slowFps` by reading
      // the WHOLE file; awaiting that froze the dashboard on "Generate Transcription" (looked
      // like nothing happened) for the length of a full-file read. The measured rate is obtained
      // off the critical path via measureVideoFps() instead.
      fields: {
        fps:               true,
        durationInSeconds: true,
        dimensions:        true,
        videoCodec:        true,
      },
    });
    return {
      fps:        r.fps && Number.isFinite(r.fps) && r.fps > 0 ? r.fps : null,
      durationMs: r.durationInSeconds && Number.isFinite(r.durationInSeconds)
        ? Math.round(r.durationInSeconds * 1000) : null,
      width:      r.dimensions?.width  ?? null,
      height:     r.dimensions?.height ?? null,
      videoCodec: r.videoCodec ?? null,
    };
  } catch {
    // Unparseable container (or worker hiccup) — every consumer falls back to
    // the <video>-element metadata it used before this probe existed.
    return null;
  }
}

/**
 * Measured (average) frame rate via `slowFps`. This is the rate the "export jittery sometimes"
 * fix needs: the container's DECLARED fps is null (Matroska/WebM/TS) or lies (variable-frame-rate
 * phone screen recordings / social downloads), so exportFps defaulted to 30 and the render sampled
 * e.g. 60fps footage onto a 30-frame grid.
 *
 * SLOW: for containers with no header fps, media-parser scans the whole file to measure the rate.
 * MUST be run OFF the critical path — never awaited before the editor opens (that freeze is the
 * exact bug that made "Generate Transcription" do nothing on WebM/MKV). Returns null on failure,
 * so callers keep whatever the header-only probe already gave them.
 */
export async function measureVideoFps(file: Blob): Promise<number | null> {
  try {
    const r = await parseMedia({
      src: file,
      acknowledgeRemotionLicense: true,
      fields: { slowFps: true },
    });
    return r.slowFps && Number.isFinite(r.slowFps) && r.slowFps > 0 ? r.slowFps : null;
  } catch {
    return null;
  }
}

/**
 * Effective fps for export: the probed value rounded to 3 decimals, clamped to a
 * sane range, defaulting to 30 when the probe failed (the old behaviour).
 */
export function exportFps(info: MediaInfo | null): number {
  const fps = info?.fps;
  if (!fps || !Number.isFinite(fps)) return 30;
  return Math.min(120, Math.max(10, Math.round(fps * 1000) / 1000));
}

/** True when the browser likely cannot decode this file (HEVC without support). */
export async function checkDecodable(info: MediaInfo | null): Promise<boolean> {
  const codec = info?.videoCodec ?? '';
  if (codec !== 'h265') return true;   // every target browser decodes h264/vp9/av1

  // HEVC: ask MediaCapabilities (most accurate), fall back to canPlayType.
  try {
    if (navigator.mediaCapabilities?.decodingInfo) {
      const res = await navigator.mediaCapabilities.decodingInfo({
        type: 'file',
        video: {
          contentType: 'video/mp4; codecs="hvc1.1.6.L123.B0"',
          width:  info?.width  ?? 1920,
          height: info?.height ?? 1080,
          bitrate: 8_000_000,
          framerate: info?.fps ?? 30,
        },
      });
      return res.supported;
    }
  } catch { /* fall through */ }
  const v = document.createElement('video');
  return v.canPlayType('video/mp4; codecs="hvc1"') !== '';
}

// Sample-entry + config fourccs that mark an HEVC track in an ISO/MOV container. Plain HEVC uses
// `hvc1`/`hev1` sample entries with an `hvcC` config box. Dolby Vision HEVC — which iPhone 12+
// record BY DEFAULT — uses `dvh1`/`dvhe` sample entries and `dvcC`/`dvvC` config boxes, and
// crucially @remotion/media-parser reports its codec as NULL (it doesn't recognise the DV sample
// entry), so this byte scan (not the codec id) is the ONLY thing that catches those clips.
const HEVC_FOURCCS = ['hvcC', 'hvc1', 'hev1', 'dvh1', 'dvhe', 'dvcC', 'dvvC'].map(
  (s) => [s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)] as const,
);

/**
 * Byte-level HEVC fallback for when the header probe couldn't identify the codec (media-parser
 * threw/returned null — the norm for iPhone Dolby Vision HEVC, and for some odd .mov clips). We
 * DON'T rely on decodability: the product rule is "no HEVC in the pipeline" (the cloud renderer
 * can't decode it), so we detect the codec directly from the container.
 *
 * The marker fourccs live in the `moov`→…→`stsd` sample entry. `moov` sits at the file HEAD for
 * faststart MP4 but at the TAIL for default iPhone .mov — and it GROWS with clip length, so for a
 * longer clip the `stsd` sits several MB in from the tail. The old 2 MB window missed exactly that
 * case (moov > 2 MB, sample entry between the head and tail windows) → the clip slipped past the
 * gate into a silent black preview with no error. Scan a generous 12 MB tail + 4 MB head instead
 * (Blob.slice, only when the codec probe already came back unidentified — i.e. rarely). Each fourcc
 * must be preceded by a plausible ISO-BMFF box size so random bytes in `mdat` don't false-positive.
 */
export async function looksLikeHevc(file: Blob): Promise<boolean> {
  try {
    const scanFor = (buf: Uint8Array): boolean => {
      for (let i = 4; i + 4 <= buf.length; i++) {
        // A fourcc is always preceded by its 4-byte big-endian box size. Requiring a sane size
        // (8 B .. 16 MB) rejects coincidental byte matches in media data. HEVC/DV sample-entry and
        // config boxes are small, so they never use the 64-bit largesize form (size field == 1).
        const size = ((buf[i - 4] << 24) | (buf[i - 3] << 16) | (buf[i - 2] << 8) | buf[i - 1]) >>> 0;
        if (size < 8 || size > 0x0100_0000) continue;
        for (const n of HEVC_FOURCCS) {
          if (buf[i] === n[0] && buf[i + 1] === n[1] && buf[i + 2] === n[2] && buf[i + 3] === n[3]) return true;
        }
      }
      return false;
    };
    const HEAD = 4 * 1024 * 1024;
    const TAIL = 12 * 1024 * 1024;
    const read = async (start: number, end?: number): Promise<Uint8Array> =>
      new Uint8Array(await file.slice(start, end).arrayBuffer());

    if (file.size <= HEAD + TAIL) return scanFor(await read(0));   // small file — one read covers it
    if (scanFor(await read(file.size - TAIL))) return true;        // tail first (iPhone moov lives here)
    return scanFor(await read(0, HEAD));
  } catch {
    return false;   // unreadable → let the normal pipeline surface any real problem
  }
}

/**
 * Is this source HEVC/H.265? Deterministic, browser-independent (iOS Safari CAN decode HEVC, but the
 * cloud renderer cannot, so HEVC is rejected at import everywhere). Fast path: the header probe's
 * codec id. When the probe couldn't determine a codec (null), fall back to the byte scan.
 */
export async function isHevcSource(info: MediaInfo | null, file?: Blob | null): Promise<boolean> {
  if (info?.videoCodec === 'h265') return true;
  if (info?.videoCodec == null && file) return looksLikeHevc(file);
  return false;
}

export const HEVC_UNSUPPORTED_MSG =
  'This video is in HEVC (H.265) format, which isn’t supported. ' +
  'Please convert it to H.264 (MP4) and upload again. ' +
  'On iPhone, record in H.264 by setting Settings › Camera › Formats › “Most Compatible”.';
