'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Zero-cost, pixel-perfect export via the Element Capture API + WebCodecs.
//
// For the caption styles the Remotion web-renderer can't draw (backdrop-filter,
// blend modes, SVG-url() blur), we capture the browser's REAL compositor output of
// a live stage that mounts the SAME CaptionOverlay + watermark + fonts the preview
// uses — so it's pixel-identical (incl. custom + Google fonts) at ₹0, no cloud.
//
// Frame-sync: the stage paints a tiny bottom MARKER strip encoding the frame number.
// We drain-until-match (validated by the /dev/ec-spike spike), then CROP the marker
// strip off before encoding → the output frame is pixel-perfect.
//
// Audio: video encoded with WebCodecs + mp4-muxer; original audio muxed in with the
// already-bundled ffmpeg.wasm (copy video, re-encode audio to AAC for any source).
//
// Entirely gated + throws on any failure so the caller falls back to the Lambda path.
// Chrome ≥132 desktop only. ─────────────────────────────────────────────────────

import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { CaptionOverlay } from '@/components/editor/CaptionOverlay';
import { WatermarkLockup } from '@/remotion/WatermarkLockup';
import { buildFontsCss, buildIndicFontsCss, buildCustomFontCss } from '@/remotion/KineticCaptionComposition';
import { mergeTemplateSlots } from '@/lib/kineticSlots';
import { fontFamiliesFromCss } from '@/lib/fontFamilies';
import { logicalCanvasSize, webExportBitrate } from '@/lib/aspect';
import { resolveSegments, activeSegmentIndexAt } from '@/lib/captionSegments';
import type { CaptionExportProps } from '@/remotion/CaptionExportComposition';
import type { SubjectMatte } from '@/lib/matte/subjectMatte';
import { buildSfxMixGraph, type MusicMixInput } from '@/lib/sfx/sfxMix';

const MARKER_H = 10;        // px tall sync strip at the bottom of the stage (cropped before encode)
const MAX_DRAIN = 30;       // max stale frames to drain per step before giving up (spike: usually ≤2)

// ── capability gate ──────────────────────────────────────────────────────────
export function canElementCapture(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  const phone = /Mobi|Android|iPhone|iPod/i.test(navigator.userAgent);
  return !phone
    && typeof (w.RestrictionTarget as { fromElement?: unknown } | undefined)?.fromElement === 'function'
    && typeof w.MediaStreamTrackProcessor === 'function'
    && typeof w.VideoEncoder === 'function'
    && typeof w.VideoFrame === 'function'
    && !!navigator.mediaDevices?.getDisplayMedia;
}

// ── frame marker (8 levels/channel, ±16 tolerant — survives capture colour conversion) ──
function encodeMarker(n: number): string {
  return `rgb(${(n & 7) * 32 + 16}, ${((n >> 3) & 7) * 32 + 16}, ${((n >> 6) & 7) * 32 + 16})`;
}
function decodeChannel(v: number): number { return Math.max(0, Math.min(7, Math.round((v - 16) / 32))); }

const nextPaint = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

interface StageCtl { setMs: (ms: number) => void; video: HTMLVideoElement; rootEl: HTMLDivElement; marker: HTMLDivElement }

// ── the live stage: pixel-twin of CaptionExportComposition, driven by us frame-by-frame ──
function ECStage(props: CaptionExportProps & { exW: number; exH: number; onReady: (c: StageCtl) => void }) {
  const { exW, exH, onReady, videoSrc, words, accentColor, captionTextColor = '#ffffff', bleepRanges,
    captionStyle, captionSegments = [], isPro = false,
    captionBox = { xPercent: 50, yPercent: 85, widthPercent: 84 },
    segmentBoxOverrides = {}, segmentFontScaleOverrides = {}, segmentStyleOverrides = {},
    captionFontScale = 1, captionLines = 'single',
    captionEmphBox = { xPercent: 50, yPercent: 24, widthPercent: 84 }, segmentEmphBoxOverrides = {},
    emphFontScale = 1, segmentEmphFontScaleOverrides = {},
    captionGapMs = 0, customFontName, customFontDataUrl, textOverrides, emphasisStyle, layoutMode,
    lineTextOverrides, templateSlots, lineSlotOverrides } = props;

  const [ms, setMs] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rootRef.current && videoRef.current && markerRef.current) {
      onReady({ setMs, video: videoRef.current, rootEl: rootRef.current, marker: markerRef.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { w: logicalW, h: logicalH } = logicalCanvasSize(exW / exH);
  const scale = exW / logicalW;
  const RS = logicalW < logicalH ? logicalW / 270 : logicalW / 640;

  // Per-frame active segment → effective box/style/overrides, resolved through the SHARED display
  // window (activeSegmentIndexAt) — the exact window the CaptionOverlay below paints with, and the
  // one CaptionExportComposition / LambdaCaptionComposition / the live preview all use.
  //
  // This used to run its own [start−80, end+150] scan. That tail is UNCLAMPED and the scan returns
  // the FIRST match, so on back-to-back captions it kept resolving the OUTGOING caption for up to
  // 150ms after the next one was already on screen — painting the new caption with the previous
  // caption's box, template and text overrides, then snapping mid-caption ("the caption position
  // keeps changing in the export"). This is the behind-subject + native-script export path, so it
  // was the one surface still doing that after the parity fix.
  const resolved = resolveSegments(captionSegments, words);
  const activeIdx = activeSegmentIndexAt(resolved, ms, captionGapMs);
  const key: string | null = activeIdx >= 0 ? resolved[activeIdx].key : null;
  const lineText = key ? lineTextOverrides?.[key] : undefined;
  const lineSlots = key ? lineSlotOverrides?.[key] : undefined;
  const effBox = (key ? segmentBoxOverrides[key] : undefined) ?? captionBox;
  const effEmphBox = (key ? segmentEmphBoxOverrides[key] : undefined) ?? captionEmphBox;
  const effStyle = (key ? segmentStyleOverrides[key] : undefined) ?? captionStyle;
  const effFontScale = (key ? segmentFontScaleOverrides[key] : undefined) ?? captionFontScale;
  const effEmphFontScale = (key ? segmentEmphFontScaleOverrides[key] : undefined) ?? emphFontScale;
  const effOverrides = lineText ? { ...textOverrides, ...lineText } : textOverrides;
  // Per-template slot edits (editor_masala/illusion/aura) — global merged with the on-screen
  // segment's per-line slots, mirroring CaptionExportComposition so the capture matches the preview.
  const effTemplateSlots = mergeTemplateSlots(templateSlots, lineSlots);

  return (
    <div ref={rootRef} style={{ isolation: 'isolate', width: exW, height: exH + MARKER_H, position: 'relative', background: '#000' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: exW, height: exH, overflow: 'hidden', background: '#000' }}>
        <style dangerouslySetInnerHTML={{ __html: buildFontsCss() + buildIndicFontsCss(words.map((w) => w.text).join(' ')) + buildCustomFontCss(customFontName, customFontDataUrl) }} />
        <video ref={videoRef} src={videoSrc} muted playsInline preload="auto"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, width: logicalW, height: logicalH, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
          <CaptionOverlay
            words={words} currentTimeMs={ms} captionStyle={effStyle} accentColor={accentColor}
            bleepRanges={bleepRanges} segments={captionSegments}
            captionYPercent={effBox.yPercent} captionXPercent={effBox.xPercent} captionWidthPercent={effBox.widthPercent}
            emphBoxYPercent={effEmphBox.yPercent} emphBoxXPercent={effEmphBox.xPercent} emphBoxWidthPercent={effEmphBox.widthPercent}
            emphFontScale={effEmphFontScale}
            captionFontScale={effFontScale} captionLines={captionLines} captionTextColor={captionTextColor}
            captionGapMs={captionGapMs} canvasWidthPx={logicalW} textOverrides={effOverrides}
            emphasisStyle={emphasisStyle} layoutMode={layoutMode} templateSlots={effTemplateSlots} />
          {!isPro && <WatermarkLockup t={ms / 1000} sz={(n: number) => Math.round(n * RS)} gradId="captik-wm-ec" />}
        </div>
        {/* "Behind the subject" is NOT drawn in the DOM here — the cut-out is composited directly
            onto each captured frame in the encode loop (guaranteed in the output, independent of
            what Element Capture captures). */}
      </div>
      <div ref={markerRef} style={{ position: 'absolute', bottom: 0, left: 0, width: exW, height: MARKER_H, background: encodeMarker(0) }} />
    </div>
  );
}

async function pickCodec(width: number, height: number, fps: number, bitrate: number): Promise<string> {
  const VE = (window as unknown as { VideoEncoder: { isConfigSupported: (c: unknown) => Promise<{ supported?: boolean }> } }).VideoEncoder;
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e01e']) {
    try { if ((await VE.isConfigSupported({ codec, width, height, bitrate, framerate: fps })).supported) return codec; } catch { /* try next */ }
  }
  return 'avc1.42e01e';
}

export interface ElementCaptureOpts {
  props:    CaptionExportProps;          // same shape the WYSIWYG path builds
  sourceBlob: Blob;                      // source video (for the audio track)
  matte?:   SubjectMatte | null;         // "behind the subject" per-frame cut-outs (optional)
  width:    number;
  height:   number;
  fps:      number;
  durationMs: number;
  fileName: string;
  onProgress?: (pct: number) => void;
  /** Placed sound effects on the export clock, as playable URIs — mixed over the source audio. */
  sfx?:     { uri: string; atMs: number; gain: number }[];
  /** Background music on the export clock: a playable URI plus its already-computed duck curve. */
  music?:   MusicMixInput & { uri: string };
}

/** Throws on any failure → caller falls through to the Lambda export path. */
export async function exportViaElementCapture(opts: ElementCaptureOpts): Promise<void> {
  if (!canElementCapture()) throw new Error('Element Capture unsupported (need Chrome ≥132 desktop)');
  const { props, sourceBlob, matte = null, width, height, fps, durationMs, fileName, onProgress, sfx = [], music = null } = opts;
  const W = (window as unknown as Record<string, unknown>);
  const RestrictionTarget = W.RestrictionTarget as { fromElement: (el: Element) => Promise<unknown> };
  const MSTP = W.MediaStreamTrackProcessor as new (i: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> };

  const totalFrames = Math.max(1, Math.ceil((durationMs / 1000) * fps));
  // The stage must be ON-SCREEN (within the tab's rendered surface) for restrictTo to capture it —
  // a far-off-screen element gets paint-culled and yields black frames. We hide it from the user
  // with an opaque cover instead; Element Capture is occlusion-independent, so the cover (and the
  // rest of the page) never appear in the captured frames.
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:1;';
  document.body.appendChild(container);
  const cover = document.createElement('div');
  cover.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#0a0a0a;color:#e4e4e7;'
    + 'display:flex;align-items:center;justify-content:center;font:600 15px system-ui,sans-serif;letter-spacing:.2px;';
  const coverLabel = document.createElement('div');
  coverLabel.textContent = 'Rendering locally…';
  cover.appendChild(coverLabel);
  document.body.appendChild(cover);
  const progress = (pct: number) => { coverLabel.textContent = `Rendering locally… ${pct}%`; onProgress?.(pct); };
  let root: Root | null = createRoot(container);
  let stream: MediaStream | null = null;
  let stallTimer: ReturnType<typeof setInterval> | null = null;

  try {
    // mount stage + wait for it + the source video metadata
    const ctl = await new Promise<StageCtl>((resolve) => {
      root!.render(<ECStage {...props} exW={width} exH={height} onReady={resolve} />);
    });
    await new Promise<void>((res) => {
      if (ctl.video.readyState >= 1) return res();
      ctl.video.addEventListener('loadedmetadata', () => res(), { once: true });
    });
    // "Behind the subject" cut-out is composited onto each captured frame in the encode step below
    // (objectFit:contain math to match the source video's letterbox). Computed once.
    const matteContain = matte ? (() => {
      const sAR = matte.width / matte.height, dAR = width / height;
      const dw = sAR > dAR ? width : Math.round(height * sAR);
      const dh = sAR > dAR ? Math.round(width / sAR) : height;
      return { dx: Math.round((width - dw) / 2), dy: Math.round((height - dh) / 2), dw, dh };
    })() : null;
    // Big Reveal: the cut-out must occlude only the TITLE (upper), never the lower caption — clip
    // the matte to the band above the lower caption box (margin for text height). null = full frame.
    const matteClipFrac = props.captionStyle === 'big_reveal'
      ? Math.max(0.05, Math.min(1, ((props.captionBox?.yPercent ?? 85) - 10) / 100))
      : null;
    // Fonts: EVERY bundled face (+ any custom font) must be decoded before frame 0 — fonts load
    // lazily, so a sparsely-used family (e.g. aura's Playfair-italic feature word) otherwise swaps
    // in mid-capture and the caption jitters/reflows. Mirror the Lambda / WYSIWYG font gate: force
    // each family (normal + italic) to load, THEN await the rest. (document.fonts.ready alone can
    // resolve while an as-yet-unused face is still unloaded.)
    if (typeof document !== 'undefined' && document.fonts) {
      const indicCss = buildIndicFontsCss(props.words.map((w) => w.text).join(' '));
      const families = fontFamiliesFromCss(buildFontsCss() + indicCss);
      if (props.customFontName) families.push(props.customFontName);
      if (props.customFontDataUrl) families.push('CaptikCustomFontData');
      await Promise.all(families.flatMap((f) => [
        document.fonts.load(`64px "${f}"`).catch(() => {}),
        document.fonts.load(`italic 64px "${f}"`).catch(() => {}),
      ]));
      await document.fonts.ready.catch(() => {});
    }

    // capture only the stage element
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, preferCurrentTab: true } as DisplayMediaStreamOptions);
    const track = stream.getVideoTracks()[0];
    const target = await RestrictionTarget.fromElement(ctl.rootEl);
    await (track as unknown as { restrictTo: (t: unknown) => Promise<void> }).restrictTo(target);
    const reader = new MSTP({ track }).readable.getReader();

    // encoder + muxer — shared with the WYSIWYG path so both in-browser encoders match.
    const bitrate = webExportBitrate(width, height, fps);
    const codec = await pickCodec(width, height, fps, bitrate);
    // firstTimestampBehavior 'offset': frames from a MediaStreamTrack carry document-relative
    // timestamps, so a capture that starts late hands the muxer a first chunk at e.g. DTS=14.6s
    // and mp4-muxer THROWS ("first chunk … must have a timestamp of 0"), killing the export
    // (CAPTIK-APP-1F). 'offset' re-bases every track so its first chunk lands at 0.
    const muxer = new Muxer({ target: new ArrayBufferTarget(), fastStart: 'in-memory', firstTimestampBehavior: 'offset', video: { codec: 'avc', width, height } });
    const VideoEncoderCtor = W.VideoEncoder as new (i: { output: (c: EncodedVideoChunk, m?: unknown) => void; error: (e: Error) => void }) => {
      configure: (c: unknown) => void; encode: (f: VideoFrame, o?: { keyFrame?: boolean }) => void; flush: () => Promise<void>; close: () => void;
    };
    let encErr: Error | null = null;
    const encoder = new VideoEncoderCtor({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta as never),
      error:  (e) => { encErr = e; },
    });
    encoder.configure({ codec, width, height, bitrate, framerate: fps, latencyMode: 'quality' });

    const seek = (tSec: number) => new Promise<void>((res) => {
      const v = ctl.video;
      const t = Math.min(tSec, Math.max(0, (v.duration || tSec + 1) - 1e-3));   // never seek past end
      if (Math.abs(v.currentTime - t) < 1e-3) return res();
      // 5s cap: a wedged decoder that never fires `seeked` must not strand the export behind the
      // cover — a slightly-stale video frame beats a hang the user can't dismiss.
      let to: ReturnType<typeof setTimeout> | null = null;
      const settle = () => { if (to) clearTimeout(to); res(); };
      to = setTimeout(settle, 5_000);
      v.addEventListener('seeked', settle, { once: true });
      try { v.currentTime = t; } catch { settle(); }
    });

    const cropCvs = document.createElement('canvas');
    cropCvs.width = width; cropCvs.height = height;
    const cropCtx = cropCvs.getContext('2d')!;
    const decCvs = document.createElement('canvas');
    const decCtx = decCvs.getContext('2d', { willReadFrequently: true })!;

    // Forward-progress watchdog: a capture track that delivers NO frames (paint-culled stage,
    // browser quirk) leaves reader.read() pending FOREVER — the export then sits at 0% behind the
    // opaque cover with nothing the user can do. Cancel the reader when no frame has arrived for
    // EC_STALL_MS; the loop below then sees the track as ended and throws, so the caller falls
    // through to the next renderer. Cancelling also covers the user clicking Chrome's
    // "Stop sharing" mid-export — either way an ended track must THROW, not silently finalize a
    // truncated file that looks like a successful export.
    const EC_STALL_MS = 45_000;
    let lastFrameAt = Date.now();
    let ecStalled = false;
    stallTimer = setInterval(() => {
      if (Date.now() - lastFrameAt > EC_STALL_MS) { ecStalled = true; reader.cancel().catch(() => { /* already done */ }); }
    }, 5_000);

    for (let n = 0; n < totalFrames; n++) {
      const tMs = (n / fps) * 1000;
      ctl.setMs(tMs);
      await seek(n / fps);
      ctl.marker.style.background = encodeMarker(n);
      await nextPaint();

      // drain-until-match (marker == n), then crop the marker strip off and encode
      let trackEnded = false;
      for (let k = 0; k < MAX_DRAIN; k++) {
        const { value: vf, done } = await reader.read();
        if (done || !vf) { trackEnded = true; break; }
        lastFrameAt = Date.now();
        const fw = vf.displayWidth, fh = vf.displayHeight;
        if (decCvs.width !== fw) decCvs.width = fw;
        if (decCvs.height !== fh) decCvs.height = fh;
        decCtx.drawImage(vf, 0, 0);
        // decode marker from the centre of the bottom strip
        const my = Math.round(fh * (height + MARKER_H / 2) / (height + MARKER_H));
        const d = decCtx.getImageData(Math.round(fw / 2) - 3, my - 1, 6, 2).data;
        let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const np = d.length / 4;
        const got = decodeChannel(r / np) + decodeChannel(g / np) * 8 + decodeChannel(b / np) * 64;
        if (got === n) {
          const frameH = Math.round(fh * height / (height + MARKER_H));  // captured px of the frame region
          // Pixel-perfect guard: the tab surface (≈ viewport × devicePixelRatio) can be SMALLER
          // than the export resolution for tall/large videos on small screens. Down-scaling a
          // larger capture stays sharp, but UP-scaling a smaller one would produce a soft frame
          // that is NOT pixel-perfect — so bail and let the caller fall back to Lambda instead.
          if (fw < width - 2 || frameH < height - 2) {
            vf.close();
            throw new Error(`ELEMENT_CAPTURE_LOWRES: captured ${fw}x${frameH} < export ${width}x${height} — falling back to cloud for full resolution`);
          }
          cropCtx.drawImage(vf, 0, 0, fw, frameH, 0, 0, width, height);  // crop strip + downscale to export dims
          vf.close();
          // "Behind the subject": composite the cut-out for THIS frame on top of the captured
          // video+captions (so the subject occludes the text). Drawn straight onto the encoded
          // frame — guaranteed in the output, independent of what Element Capture captured.
          if (matte && matteContain) {
            const bmp = await matte.getFrame(tMs);
            if (bmp) {
              if (matteClipFrac != null && matteClipFrac < 1) {
                // Draw only the top band of the cut-out (down to the clip line in FRAME space), so
                // the lower caption below it is not occluded by the subject.
                const clipY = matteClipFrac * height;
                const destH = Math.min(matteContain.dh, clipY - matteContain.dy);
                if (destH > 0) {
                  const srcH = Math.round((destH / matteContain.dh) * bmp.height);
                  cropCtx.drawImage(bmp, 0, 0, bmp.width, srcH, matteContain.dx, matteContain.dy, matteContain.dw, Math.round(destH));
                }
              } else {
                cropCtx.drawImage(bmp, matteContain.dx, matteContain.dy, matteContain.dw, matteContain.dh);
              }
            }
          }
          const out = new VideoFrame(cropCvs, { timestamp: Math.round((n / fps) * 1e6), duration: Math.round(1e6 / fps) });
          encoder.encode(out, { keyFrame: n % (fps * 2) === 0 });
          out.close();
          break;
        }
        vf.close();
      }
      if (trackEnded) {
        throw new Error(ecStalled
          ? 'ELEMENT_CAPTURE_STALL: no frames from the capture track'
          : 'ELEMENT_CAPTURE_ENDED: capture track ended mid-export (tab sharing stopped)');
      }
      if (encErr) throw encErr;
      progress(Math.round((n / totalFrames) * 70));   // 0..70% = capture+encode
    }
    clearInterval(stallTimer); stallTimer = null;

    await encoder.flush();
    encoder.close();
    muxer.finalize();
    const videoBuf = (muxer.target as ArrayBufferTarget).buffer;
    reader.cancel().catch(() => {});
    track.stop();
    progress(75);

    // mux original audio in (copy our video, re-encode source audio to AAC — robust for any container)
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
      wasmURL: await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
      classWorkerURL: new URL('/ffmpeg/worker.js', window.location.origin).href,
    });
    const srcExt = (sourceBlob.type.includes('webm') ? 'webm' : 'mp4');
    await ffmpeg.writeFile('v.mp4', new Uint8Array(videoBuf));
    await ffmpeg.writeFile(`src.${srcExt}`, await fetchFile(sourceBlob));
    let finalData: Uint8Array | null = null;
    // Placed sound effects: delay each to its moment and mix over the source audio. Any failure
    // (a source with no audio track, an undecodable sound) falls back to the plain mux below —
    // the export never dies on a sound effect.
    if (sfx.length > 0 || music) {
      try {
        const sfxInputs: string[] = [];
        for (let i = 0; i < sfx.length; i++) {
          await ffmpeg.writeFile(`sfx${i}.webm`, await fetchFile(sfx[i].uri));
          sfxInputs.push('-i', `sfx${i}.webm`);
        }
        // Music is the LAST input, matching buildSfxMixGraph's indexing.
        if (music) {
          await ffmpeg.writeFile('music.bin', await fetchFile(music.uri));
          sfxInputs.push('-i', 'music.bin');
        }
        const code = await ffmpeg.exec(['-i', 'v.mp4', '-i', `src.${srcExt}`, ...sfxInputs,
          '-filter_complex', buildSfxMixGraph(sfx, 1, 2, music),
          '-map', '0:v:0', '-map', '[aout]',
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'out.mp4']);
        if (code === 0) finalData = (await ffmpeg.readFile('out.mp4')) as Uint8Array;
      } catch { /* fall through to the plain mux */ }
      if (!finalData) {
        console.warn('[export] audio mix failed — exporting without sound effects or music');
        await ffmpeg.deleteFile('out.mp4').catch(() => {});
      }
    }
    if (!finalData) {
      try {
        await ffmpeg.exec(['-i', 'v.mp4', '-i', `src.${srcExt}`, '-map', '0:v:0', '-map', '1:a:0?',
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'out.mp4']);
        finalData = (await ffmpeg.readFile('out.mp4')) as Uint8Array;
      } catch {
        finalData = new Uint8Array(videoBuf);   // audio mux failed → ship video-only rather than nothing
      }
    }
    progress(95);

    const blob = new Blob([finalData as unknown as BlobPart], { type: 'video/mp4' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    progress(100);
  } finally {
    if (stallTimer) clearInterval(stallTimer);
    stream?.getTracks().forEach((t) => t.stop());
    if (root) { try { root.unmount(); } catch { /* ignore */ } root = null; }
    container.remove();
    cover.remove();
  }
}
