'use client';

import {
  forwardRef, useCallback, useEffect, useImperativeHandle,
  useMemo, useRef, useState,
} from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, Grid3x3, Maximize2, Minimize2, Loader2, AlertCircle } from 'lucide-react';
import type { TranscriptWord, CaptionBoxConfig, TextOverrides, EmphasisStyle, LayoutMode, TemplateSlotOverrides } from '@/types/transcript';
import { mergeTemplateSlots } from '@/lib/kineticSlots';
import { type AspectRatio, aspectValue, ASPECT_OPTIONS, logicalCanvasSize } from '@/lib/aspect';
import type { BleepRange } from '@/lib/profanity';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import { CaptionOverlay } from './CaptionOverlay';
import { splitsAroundSubject } from '@/lib/looks/lookSpec';
import { depthGridFromBitmap, publishDepthGrid } from '@/lib/looks/depthLive';
import { CaptionBoundingBox } from './CaptionBoundingBox';
import PreviewWatermark from './PreviewWatermark';
import ProgressBar from '@/components/ui/ProgressBar';
import Tooltip from '@/components/ui/Tooltip';
import { customFontStack } from '@/lib/textParser';
import { HEVC_UNSUPPORTED_MSG } from '@/lib/mediaInfo';
import type { SubjectMatte } from '@/lib/matte/subjectMatte';

type Phase = 'idle' | 'extracting' | 'transcribing' | 'aligning' | 'ready' | 'error';

export interface VideoCanvasHandle {
  toggle():        void;
  seekTo(ms: number): void;
  isPlaying():     boolean;
}

interface VideoCanvasProps {
  videoSrc:              string;
  words:                 TranscriptWord[];
  phase:                 Phase;
  /** 0-100 while transcribing (chunks done / total); null = indeterminate. */
  phaseProgress?:        number | null;
  /** True on low-RAM devices: shows a brief reassurance note while we degrade gracefully. */
  lowMemoryMode?:        boolean;
  errMsg:                string;
  /** Fired when the <video> element fails to decode/play the source. `code` is the
   *  MediaError.code (0 when the element exposed no error object) for diagnostics. */
  onVideoError?:         (message: string, code?: number) => void;
  dominantColor:         string;
  accentColor:           string;
  bleepRanges:           BleepRange[];
  captionStyle:          CaptionStyleId;
  captionSegments?:      string[][];
  durationMs:            number;
  captionFontScale?:     number;
  captionLines?:         'single' | 'double';
  captionTextColor?:     string;
  captionFont?:          string | null;
  captionBox?:            CaptionBoxConfig;
  segmentBoxOverrides?:   Record<string, CaptionBoxConfig>;
  /** Per-caption font scale overrides, keyed like segmentBoxOverrides. */
  segmentFontScaleOverrides?: Record<string, number>;
  segmentStyleOverrides?: Record<string, CaptionStyleId>;
  activeSegmentKey?:      string | null;
  /** Live drag/resize preview box (uncommitted) — overrides effectiveBox while present. */
  pendingBox?:            CaptionBoxConfig | null;
  /** Live resize preview font scale (uncommitted) — wins while the handles are being dragged.
   *  Committed together with pendingBox by the scope chooser, discarded on cancel. */
  pendingFontScale?:      number | null;
  /** Resize-handle font scale PREVIEW (→ pendingFontScale). Distinct from
   *  onCaptionFontScaleChange, which COMMITS immediately (pinch / Size slider). */
  onBoxFontScalePreview?: (scale: number) => void;
  // ── "Big Reveal" second (title) box — mirrors the lower-caption box props above ──
  captionEmphBox?:          CaptionBoxConfig;
  segmentEmphBoxOverrides?: Record<string, CaptionBoxConfig>;
  segmentEmphFontScaleOverrides?: Record<string, number>;
  pendingEmphBox?:          CaptionBoxConfig | null;
  pendingEmphFontScale?:    number | null;
  onEmphBoxChange?:         (box: CaptionBoxConfig) => void;
  onEmphBoxScope?:          (scope: 'all' | 'block') => void;
  onEmphBoxCancel?:         () => void;
  /** Scope panel dismissed by clicking outside it → resolve (commit/revert) the pending title-box
   *  gesture instead of letting it silently outlive the panel. */
  onEmphBoxOutside?:        () => void;
  /** Independent title font scale (Big Reveal) + the title box resize PREVIEW callback. */
  emphFontScale?:           number;
  onEmphBoxFontScalePreview?: (scale: number) => void;
  /** How many caption segments are currently selected (drives the scope panel label). */
  selectedSegmentCount?: number;
  /** Box editing mode: 'auto' (desktop / normal tap) prompts for a scope on release; 'manual'
   *  (mobile Position overlay) only previews — an external footer commits the scope. */
  boxScopeMode?:         'auto' | 'manual';
  /** True while the user is actively dragging the scrubber/timeline — coalesces seeks and
   *  suspends the stall-watchdog play() nudge so rapid seeks don't fight playback. */
  isScrubbing?:          boolean;
  captionGapMs?:         number;
  onCaptionBoxChange?:         (box: CaptionBoxConfig) => void;
  onCaptionBoxScope?:          (scope: 'all' | 'block') => void;
  onCaptionBoxCancel?:         () => void;
  /** Scope panel dismissed by clicking outside it → resolve (commit/revert) the pending caption-box
   *  gesture instead of letting it silently outlive the panel (export would then use the committed
   *  box while the preview shows the pending one). */
  onCaptionBoxOutside?:        () => void;
  onCaptionFontScaleChange?:   (scale: number) => void;
  onTimeUpdate?:               (ms: number) => void;
  onPlayStateChange?:          (playing: boolean) => void;
  aspectRatio?:                AspectRatio;
  onAspectRatioChange?:        (ratio: AspectRatio) => void;
  mobile?:                     boolean;
  videoDims?:                  { w: number; h: number } | null;
  /** Free tier: show the animated Captik bug over the preview (matches the export). */
  watermarked?:                boolean;
  /** Reference-parity styling (Text tab) — passed straight to CaptionOverlay. */
  textOverrides?:              TextOverrides;
  emphasisStyle?:              EmphasisStyle;
  layoutMode?:                 LayoutMode;
  /** Per-line typography overrides keyed by segment first-word id — merged over
      the global textOverrides for whichever segment is on screen. */
  lineTextOverrides?:          Record<string, Partial<TextOverrides>>;
  /** Per-template slot overrides (editor_masala/illusion/aura) — global. */
  templateSlots?:              TemplateSlotOverrides;
  /** Per-line slot overrides keyed by segment first-word id — merged over the global slots. */
  lineSlotOverrides?:          Record<string, TemplateSlotOverrides>;
  /** "Behind the subject": per-frame subject cut-outs, blitted onto a canvas OVER the captions so
      the text reads as behind the person. Frame-accurate to the source (no separate video). */
  matte?:                      SubjectMatte | null;
  /** Whether the TARGET caption(s) (selected, else on-screen) have behindSubject on. */
  behindSubject?:              boolean;
  /** How many captions the toggle will affect (selection count, else 1 if a caption is on screen,
   *  else 0 → the button is disabled with a hint). */
  behindSubjectCount?:         number;
  /** Toggle behindSubject for the selected / on-screen caption. */
  onToggleBehindSubject?:      (on: boolean) => void;
  /** Matte generation lifecycle — drives a small progress/notice badge. */
  matteStatus?:                'idle' | 'generating' | 'ready' | 'error' | 'unsupported';
  matteProgress?:              number;
}

const PHASE_LABELS: Partial<Record<Phase, string>> = {
  extracting:   'Extracting audio…',
  transcribing: 'Transcribing your video…',
  aligning:     'Syncing captions to audio…',
};

const DEFAULT_BOX: CaptionBoxConfig = { xPercent: 50, yPercent: 85, widthPercent: 84 };
// "Big Reveal" title box default — high up so it sits above the subject's head.
const DEFAULT_EMPH_BOX: CaptionBoxConfig = { xPercent: 50, yPercent: 24, widthPercent: 84 };

const VideoCanvas = forwardRef<VideoCanvasHandle, VideoCanvasProps>(function VideoCanvas(
  {
    videoSrc, words, phase, phaseProgress = null, lowMemoryMode = false, errMsg, onVideoError,
    dominantColor, accentColor, bleepRanges, captionStyle, captionSegments,
    durationMs, captionFontScale, captionLines, captionTextColor, captionFont,
    captionBox = DEFAULT_BOX, segmentBoxOverrides = {}, segmentFontScaleOverrides = {},
    segmentStyleOverrides = {}, activeSegmentKey,
    pendingBox, pendingFontScale, onBoxFontScalePreview,
    selectedSegmentCount = 0, boxScopeMode = 'auto', isScrubbing = false,
    captionEmphBox = DEFAULT_EMPH_BOX, segmentEmphBoxOverrides = {},
    segmentEmphFontScaleOverrides = {}, pendingEmphBox, pendingEmphFontScale,
    onEmphBoxChange, onEmphBoxScope, onEmphBoxCancel, onEmphBoxOutside,
    emphFontScale = 1, onEmphBoxFontScalePreview,
    captionGapMs = 0,
    onCaptionBoxChange, onCaptionBoxScope, onCaptionBoxCancel, onCaptionBoxOutside, onCaptionFontScaleChange,
    onTimeUpdate, onPlayStateChange,
    aspectRatio, onAspectRatioChange, mobile, videoDims, watermarked,
    textOverrides, emphasisStyle, layoutMode, lineTextOverrides,
    templateSlots, lineSlotOverrides,
    matte, behindSubject = false, behindSubjectCount = 0, onToggleBehindSubject,
    matteStatus = 'idle', matteProgress = 0,
  },
  ref,
) {
  const videoRef       = useRef<HTMLVideoElement>(null);
  const cutoutCanvasRef = useRef<HTMLCanvasElement>(null);
  const matteRef        = useRef<SubjectMatte | null>(null);
  const rafRef        = useRef<number>(0);
  // True while the cut-out is being driven by requestVideoFrameCallback (locked to presented frames)
  // so the RAF loop below doesn't also paint it (which would use a slightly-off currentTime).
  const usingVfcRef   = useRef(false);
  const shouldPlayRef = useRef(false); // user intent — survives buffering stalls

  // "Behind the subject": blit the cut-out onto the overlay canvas (above the captions). `atMs` is
  // the EXACT presentation time of the frame being shown when driven by requestVideoFrameCallback
  // (frame-perfect sync with the background <video>); it falls back to currentTime for seek/pause.
  const drawCutout = useCallback((atMs?: number) => {
    const cv = cutoutCanvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const m = matteRef.current; const v = videoRef.current;
    if (!m || !v) { publishDepthGrid(null); return; }
    const tMs = atMs != null ? atMs : v.currentTime * 1000;
    const bmp = m.peek(tMs);
    // Full-frame cut-out (the middle layer). For Big Reveal the TITLE renders on a layer BELOW this
    // canvas and the lower caption on a layer ABOVE it, so the person sits between them.
    if (bmp) ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    // the same cut-out, as the 24x24 grid the depth treatment reads (see depthLive.ts)
    publishDepthGrid(bmp ? depthGridFromBitmap(bmp) : null);
    void m.warm(tMs);   // decode current ± a few; onDecoded repaints when ready
  }, []);
  const drawCutoutRef = useRef(drawCutout);
  const [localMs,  setLocalMs]   = useState(0);
  const [zoom,     setZoom]      = useState(100);
  const [showGrid, setShowGrid]  = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Enlarge: fullscreen the whole preview pane (toolbar + canvas) on a black bg.
  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onFs = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const [canExport,setCanExport] = useState<boolean | null>(null);

  // Pinch-to-zoom: track the initial touch distance and font scale at gesture start.
  const pinchStartDistRef  = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);
  // Controlled by page.tsx when aspectRatio prop is supplied (so export matches the
  // viewing orientation); falls back to internal state otherwise.
  const [ratioInternal, setRatioInternal] = useState<AspectRatio>('original');
  const ratio = aspectRatio ?? ratioInternal;
  const setRatio = (r: AspectRatio) => { setRatioInternal(r); onAspectRatioChange?.(r); };

  const onTimeUpdateRef  = useRef(onTimeUpdate);
  const onPlayStateRef   = useRef(onPlayStateChange);
  useEffect(() => { onTimeUpdateRef.current  = onTimeUpdate;      }, [onTimeUpdate]);
  useEffect(() => { onPlayStateRef.current   = onPlayStateChange; }, [onPlayStateChange]);

  // Track the active matte + repaint the cut-out when it (re)mounts or a frame finishes decoding.
  useEffect(() => {
    matteRef.current = matte ?? null;
    drawCutoutRef.current = drawCutout;
    matte?.setOnDecoded(() => drawCutout());
    drawCutout();

    // Lock the cut-out paint to the video's own frame callback so it never drifts from the
    // background <video>. requestVideoFrameCallback fires once per PRESENTED frame with the exact
    // mediaTime — self-reschedules during playback, idles when paused (no new frames). When it's
    // unavailable (older Firefox) we fall back to the RAF path in trackTime (usingVfc stays false).
    type VfcVideo = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
      cancelVideoFrameCallback?: (h: number) => void;
    };
    const v = videoRef.current as VfcVideo | null;
    let handle = 0;
    if (matte && v?.requestVideoFrameCallback) {
      usingVfcRef.current = true;
      const loop = (_now: number, meta: { mediaTime: number }) => {
        drawCutoutRef.current(meta.mediaTime * 1000);
        handle = v.requestVideoFrameCallback!(loop);
      };
      handle = v.requestVideoFrameCallback(loop);
    }
    return () => {
      matte?.setOnDecoded(undefined);
      usingVfcRef.current = false;
      if (handle && v?.cancelVideoFrameCallback) v.cancelVideoFrameCallback(handle);
    };
  }, [matte, drawCutout]);
  // Throttle page-level re-renders to ~20 fps; caption overlay runs at full 60 fps via localMs.
  const lastPageUpdateMs = useRef(0);
  // Stall watchdog: tracks the last observed currentTime so we can detect a silent
  // freeze (video stops advancing while the user intends to play) and nudge it.
  const lastTickMsRef = useRef(0);
  const lastTickAtRef = useRef(0);
  // Phone playback is main-thread bound (decode competes with React re-renders),
  // so the time-tracking callbacks throttle off this. Synced from `isMobile` each render.
  const isMobileRef       = useRef(false);
  const lastLocalUpdateMs = useRef(0);
  // Timestamp of the last decode-error recovery attempt — distinguishes a lone
  // transient hiccup (recover) from a genuinely broken file (rapid repeats → fatal).
  const lastRecoverAtRef  = useRef(0);
  // Auto reload attempts for the CURRENT source after a fetch failure (NETWORK/ABORTED).
  // The blob load can transiently fail under the memory peak while transcription is still
  // holding the source in memory; that memory is freed by the time this fires, so one
  // reload of the same source usually succeeds. Reset whenever the source changes.
  const loadRetryRef      = useRef(0);
  // While the user scrubs, prefer keyframe seeks and suspend the play() watchdog (kept in a ref
  // so the stable trackTime/seekTo callbacks see the latest value without re-binding).
  const isScrubbingRef    = useRef(false);
  isScrubbingRef.current  = isScrubbing;
  // Phone-only recoverable playback error (e.g. a repeated decode hiccup under memory pressure):
  // surfaced as a dismissible "tap to reload" overlay that keeps the editing session alive,
  // instead of flipping the whole editor into the fatal phase==='error' state.
  const [recoverError, setRecoverError] = useState<string | null>(null);

  // ── Imperative handle exposed to page.tsx ───────────────────────────────
  useImperativeHandle(ref, () => ({
    toggle() {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) {
        shouldPlayRef.current = true;
        v.play().catch(err => {
          // AbortError fires when play() is interrupted by a concurrent pause/seek.
          // Retry once after the browser settles (typically < 80 ms).
          if (err?.name === 'AbortError') {
            setTimeout(() => {
              if (videoRef.current?.paused && shouldPlayRef.current) {
                videoRef.current.play().catch(() => {});
              }
            }, 80);
          }
        });
      } else {
        shouldPlayRef.current = false;
        v.pause();
      }
    },
    seekTo(ms: number) {
      const v = videoRef.current;
      if (!v) return;
      // A caption/word can carry a non-finite timestamp (NaN/±Infinity) after a merge/split/edit
      // or an untimed import; `HTMLMediaElement.currentTime = NaN` throws a non-finite TypeError
      // (CAPTIK-APP-1G, 18 events). Guard at this single choke point so every caller — timeline
      // scrub, caption/word navigation, keyboard shortcuts — is protected. A bogus seek is ignored
      // (video stays put) rather than propagating NaN downstream to the timeline / active-word.
      if (!Number.isFinite(ms)) return;
      const t = ms / 1000;
      // During an active scrub, keyframe-seek (fastSeek) so a rapid stream of seeks doesn't
      // queue exact decodes and stutter; land an exact seek otherwise (caption navigation).
      if (isScrubbingRef.current && typeof v.fastSeek === 'function') {
        try { v.fastSeek(t); } catch { v.currentTime = t; }
      } else {
        v.currentTime = t;
      }
      drawCutoutRef.current();
      setLocalMs(ms);
      onTimeUpdateRef.current?.(ms);
    },
    isPlaying() {
      return videoRef.current ? !videoRef.current.paused : false;
    },
  }), []);

  // ── RAF-based time tracking ────────────────────────────────────────────
  // localMs updates at 60 fps → smooth caption overlay.
  // Page-level onTimeUpdate (timeline, active word) throttled to ~20 fps to
  // prevent cascading re-renders across the whole editor from killing playback.
  const trackTime = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const ms = Math.round(v.currentTime * 1000);
    const now = performance.now();
    const onMobile = isMobileRef.current;

    // The caption overlay re-renders whenever localMs changes. On phones the main
    // thread is shared with video decode, so cap that to ~30fps (imperceptible for
    // captions) to stop playback stuttering; keep the full 60fps on desktop.
    if (!onMobile || now - lastLocalUpdateMs.current >= 33) {
      lastLocalUpdateMs.current = now;
      setLocalMs(ms);
    }

    // Stall watchdog — if the user intends to play but currentTime hasn't advanced
    // for ~700ms (silent decoder/main-thread stall), nudge playback to resume. Suspended
    // during an active scrub, where currentTime legitimately jumps around.
    if (shouldPlayRef.current && !v.paused && !v.ended && !isScrubbingRef.current) {
      if (ms !== lastTickMsRef.current) {
        lastTickMsRef.current = ms;
        lastTickAtRef.current = now;
      } else if (now - lastTickAtRef.current > 700) {
        lastTickAtRef.current = now;
        v.play().catch(() => {});
      }
    } else {
      lastTickMsRef.current = ms;
      lastTickAtRef.current = now;
    }

    // Repaint the cut-out only when NOT driven by requestVideoFrameCallback (the frame-locked path);
    // otherwise the rVFC loop owns it and a second RAF paint here would use a slightly-off currentTime.
    if (matteRef.current && !usingVfcRef.current) drawCutoutRef.current();

    // Page-level updates fan out to the whole editor (timeline, active word);
    // throttle them harder on mobile so that re-render can't starve video decode.
    if (now - lastPageUpdateMs.current >= (onMobile ? 100 : 50)) {
      lastPageUpdateMs.current = now;
      onTimeUpdateRef.current?.(ms);
    }
    rafRef.current = requestAnimationFrame(trackTime);
  }, []);

  const handlePlay = useCallback(() => {
    shouldPlayRef.current = true;
    cancelAnimationFrame(rafRef.current); // avoid double-RAF if onPlay fires twice
    rafRef.current = requestAnimationFrame(trackTime);
    onPlayStateRef.current?.(true);
  }, [trackTime]);

  const handlePause = useCallback(() => {
    shouldPlayRef.current = false;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    drawCutoutRef.current();   // ensure the paused frame's cut-out is painted
    onPlayStateRef.current?.(false);
  }, []);

  // When the video finishes buffering after a stall, resume if the user intended to play.
  const handleCanPlay = useCallback(() => {
    const v = videoRef.current;
    if (v && shouldPlayRef.current && v.paused) {
      v.play().catch(() => {});
    }
  }, []);

  // A stall fires `waiting` without pausing — make sure the rAF watchdog is running
  // so it can detect the freeze and nudge playback back.
  const handleWaiting = useCallback(() => {
    if (shouldPlayRef.current && !rafRef.current) {
      rafRef.current = requestAnimationFrame(trackTime);
    }
  }, [trackTime]);

  const handleSeeked = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    drawCutoutRef.current();   // repaint the cut-out for the new frame
    const ms = Math.round(v.currentTime * 1000);
    setLocalMs(ms);
    onTimeUpdateRef.current?.(ms);
  }, []);

  // Reload the <video> and resume from the same spot — shared by the automatic transient-decode
  // recovery and the manual "tap to reload" affordance.
  const reloadVideoFrom = useCallback((at: number, resume: boolean) => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      v.removeEventListener('loadeddata', onLoaded);
      try { v.currentTime = at; } catch { /* best-effort seek-back */ }
      if (resume) v.play().catch(() => {});
    };
    v.addEventListener('loadeddata', onLoaded);
    try { v.load(); } catch { v.removeEventListener('loadeddata', onLoaded); }
  }, []);

  const handleManualReload = useCallback(() => {
    const v = videoRef.current;
    setRecoverError(null);
    if (v) reloadVideoFrom(v.currentTime, shouldPlayRef.current);
  }, [reloadVideoFrom]);

  // The <video> can emit a transient MEDIA_ERR_DECODE during heavy phone playback
  // (decoder hiccup), which previously killed the whole session. Genuinely
  // undecodable files (HEVC) are caught up front by probeMediaInfo and surface a
  // SRC_NOT_SUPPORTED here — those stay fatal. For a lone decode error, reload and
  // resume from the same spot once. On rapid repeats: phones get a recoverable
  // "tap to reload" (usually transient memory pressure, not a broken file) so the
  // editing session survives; desktop stays fatal (broken file).
  const handleVideoError = useCallback(() => {
    const v = videoRef.current;
    const err = v?.error;
    const code = err?.code;
    if (v && code === MediaError.MEDIA_ERR_DECODE) {
      const now = performance.now();
      if (now - lastRecoverAtRef.current > 4000) {
        lastRecoverAtRef.current = now;
        reloadVideoFrom(v.currentTime, shouldPlayRef.current);
        return;
      }
      if (isMobileRef.current) {
        setRecoverError('Playback hit a snag. Tap to reload the video.');
        return;
      }
    }
    // A fetch failure (NETWORK/ABORTED, or a code-less error) means the <video> couldn't
    // read the source blob at all — NOT a codec problem (that surfaces as SRC_NOT_SUPPORTED
    // below). The usual trigger is the transient memory peak while transcription was still
    // holding the whole source in memory; that memory is freed by the time this fires, so
    // reload the same source once before giving up.
    const isFetchFailure = code === MediaError.MEDIA_ERR_NETWORK
      || code === MediaError.MEDIA_ERR_ABORTED
      || !code;
    if (v && isFetchFailure && loadRetryRef.current < 1) {
      loadRetryRef.current += 1;
      reloadVideoFrom(v.currentTime, shouldPlayRef.current);
      return;
    }
    const msg = code === MediaError.MEDIA_ERR_DECODE || code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
      ? HEVC_UNSUPPORTED_MSG
      : 'The video failed to load. Re-add the file and try again.';
    onVideoError?.(msg, code ?? 0);
  }, [onVideoError, reloadVideoFrom]);

  // A fresh source clears any stale recoverable-error overlay and resets the per-source
  // reload budget.
  useEffect(() => { setRecoverError(null); loadRetryRef.current = 0; }, [videoSrc]);

  // ── Pinch-to-zoom caption font scale ──────────────────────────────────────
  // Commits through onCaptionFontScaleChange (the page scopes it: selection → only those
  // captions, else global). Start from the on-screen caption's EFFECTIVE scale so pinching a
  // caption that already has its own size doesn't jump to the global value on the first tick.
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchStartDistRef.current  = Math.sqrt(dx * dx + dy * dy);
    pinchStartScaleRef.current = (activeSegmentKey ? segmentFontScaleOverrides[activeSegmentKey] : undefined)
      ?? captionFontScale ?? 1;
  }, [captionFontScale, activeSegmentKey, segmentFontScaleOverrides]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2 || pinchStartDistRef.current === null) return;
    e.preventDefault();
    const dx   = e.touches[0].clientX - e.touches[1].clientX;
    const dy   = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const next = Math.max(0.5, Math.min(3, pinchStartScaleRef.current * (dist / pinchStartDistRef.current)));
    onCaptionFontScaleChange?.(Math.round(next * 100) / 100);
  }, [onCaptionFontScaleChange]);

  const handleTouchEnd = useCallback(() => {
    pinchStartDistRef.current = null;
  }, []);

  // ── Auto-bleep via volume ────────────────────────────────────────────────
  const isBleep = useMemo(
    () => bleepRanges.some(r => localMs >= r.startMs && localMs <= r.endMs),
    [bleepRanges, localMs],
  );
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = isBleep ? 0 : 1;
  }, [isBleep]);

  // Cleanup RAF on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── WebCodecs export support check ──────────────────────────────────────
  useEffect(() => {
    import('@remotion/web-renderer')
      .then(({ canRenderMediaOnWeb }) =>
        canRenderMediaOnWeb({ width: 1920, height: 1080, videoCodec: 'h264', container: 'mp4' }),
      )
      .then(r => setCanExport(r.canRender))
      .catch(() => setCanExport(false));
  }, []);

  const isMobile = mobile ?? (typeof window !== 'undefined' && window.innerWidth < 768);
  isMobileRef.current = isMobile; // keep the stable trackTime/error callbacks in sync

  // Logical canvas sized to the chosen aspect ratio inside a fixed design box.
  // The whole canvas (captions included) is then scaled to fit, preserving WYSIWYG.
  // Presets resolve to the same dims as before (9:16→270×480, 16:9→640×360).
  const rValue = aspectValue(ratio, videoDims);
  // Shared with the pixel-perfect export so the caption canvas can't drift between them.
  const { w: canvasW, h: canvasH } = logicalCanvasSize(rValue);

  // Measure the preview area and auto-fit the canvas into it (never overflow).
  const areaRef = useRef<HTMLDivElement>(null);
  // Seed from window dimensions so fitScale is correct on the very first render —
  // avoids the flash where area={0,0} → fitScale=1 → 640px canvas overflows mobile screen.
  const [area, setArea] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth  : 640,
    h: typeof window !== 'undefined' ? window.innerHeight : 480,
  }));
  useEffect(() => {
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      setArea({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fitScale = Math.min(area.w / canvasW, area.h / canvasH, 1);

  // Per-segment override wins over global box / style. A live drag/resize preview
  // (pendingBox) wins over everything so the move is visible without committing it.
  const effectiveBox: CaptionBoxConfig = pendingBox
    ?? (activeSegmentKey ? segmentBoxOverrides[activeSegmentKey] : undefined)
    ?? captionBox;
  const effectiveEmphBox: CaptionBoxConfig = pendingEmphBox
    ?? (activeSegmentKey ? segmentEmphBoxOverrides[activeSegmentKey] : undefined)
    ?? captionEmphBox;
  const effectiveStyle: CaptionStyleId = (activeSegmentKey ? segmentStyleOverrides[activeSegmentKey] : undefined)
    ?? captionStyle;
  // Effective font scales mirror the boxes: live resize preview wins, then the on-screen
  // caption's own override, then the global. Feeds BOTH the overlay (so the drag previews on the
  // caption itself) and the bounding box (so a resize starts from the caption's own size).
  const effectiveFontScale = pendingFontScale
    ?? (activeSegmentKey ? segmentFontScaleOverrides[activeSegmentKey] : undefined)
    ?? captionFontScale ?? 1;
  const effectiveEmphFontScale = pendingEmphFontScale
    ?? (activeSegmentKey ? segmentEmphFontScaleOverrides[activeSegmentKey] : undefined)
    ?? emphFontScale;
  // How many captions a per-caption ('block') commit would write to — mirrors the page's scope
  // handler exactly (timeline selection, else the caption under the playhead). Drives whether the
  // box even offers the choice; 0 means a release can only mean "all".
  const blockTargetCount = selectedSegmentCount || (activeSegmentKey ? 1 : 0);
  // Per-line typography merges over the global Text-tab overrides for the visible segment.
  const lineText = activeSegmentKey ? lineTextOverrides?.[activeSegmentKey] : undefined;
  const effectiveTextOverrides: TextOverrides | undefined =
    lineText ? { ...textOverrides, ...lineText } : textOverrides;
  // Per-template slots merge the visible segment's per-line overrides over the global slots.
  const lineSlots = activeSegmentKey ? lineSlotOverrides?.[activeSegmentKey] : undefined;
  const effectiveTemplateSlots = mergeTemplateSlots(templateSlots, lineSlots);

  // Designs whose caption reads in front of the person while a title goes behind — Big Reveal, and
  // looks with an impact word — render in THREE stacked layers so the subject sits between them: the
  // TITLE on a back layer (behind the cut-out), the caption on a front layer (above it). They also
  // get the second (Title) box.
  const splitsSubject = splitsAroundSubject(effectiveStyle);


  return (
    <div ref={rootRef} className="flex-1 flex flex-col bg-[#0B0B0D] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-white/[0.04] shrink-0">
        <span className="text-[10px] text-zinc-700 font-medium uppercase tracking-widest shrink-0">Preview</span>
        <div className="flex items-center gap-0.5">
          {canExport === false && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 mr-2">
              <AlertCircle className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] text-amber-300 font-medium">Use Chrome for 4K export</span>
            </div>
          )}
          {/* Aspect ratio — Original keeps the source video's own ratio */}
          <div className="flex items-center gap-0.5 mr-1 bg-white/[0.04] rounded-lg p-0.5 overflow-x-auto max-w-[230px] sm:max-w-none">
            {ASPECT_OPTIONS.map((opt) => (
              <Tooltip
                key={opt.id}
                label={
                  opt.id === 'original' ? "Match the source video's aspect ratio"
                  : opt.id === '9:16'   ? '9:16 — Reels, Shorts & TikTok (crops the frame)'
                  : opt.id === '16:9'   ? '16:9 — YouTube & landscape'
                  : opt.id === '1:1'    ? '1:1 — square feed posts'
                  : opt.id === '4:5'    ? '4:5 — Instagram feed'
                  : `Crop the preview & export to ${opt.label}`
                }
              >
              <button
                onClick={() => setRatio(opt.id)}
                aria-label={opt.id === 'original' ? 'Original aspect ratio' : opt.label}
                aria-pressed={ratio === opt.id}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  ratio === opt.id ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                {opt.label}
              </button>
              </Tooltip>
            ))}
          </div>
          {/* Secondary controls — hidden on phones to avoid a cramped, overflowing bar */}
          <div className="hidden sm:flex items-center gap-0.5">
            <div className="w-px h-3.5 bg-white/[0.06] mx-0.5" />
            <Tooltip label="Zoom the preview out (display only — doesn't affect the export)">
            <button onClick={() => setZoom(z => Math.max(25, z - 25))} aria-label="Zoom out"
              className="p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            </Tooltip>
            <span className="text-[10px] text-zinc-600 w-8 text-center font-mono">{zoom}%</span>
            <Tooltip label="Zoom the preview in (display only — doesn't affect the export)">
            <button onClick={() => setZoom(z => Math.min(200, z + 25))} aria-label="Zoom in"
              className="p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            </Tooltip>
            <div className="w-px h-3.5 bg-white/[0.06] mx-1" />
            <Tooltip label="Alignment grid — helps you centre the caption box">
            <button onClick={() => setShowGrid(v => !v)} aria-label="Toggle grid" aria-pressed={showGrid}
              className={`p-1 rounded transition-colors cursor-pointer ${showGrid ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5'}`}>
              <Grid3x3 className="w-3.5 h-3.5" />
            </button>
            </Tooltip>
            <Tooltip label={isFullscreen ? 'Exit fullscreen' : 'Enlarge the preview'}>
            <button onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className={`p-1 rounded transition-colors cursor-pointer ${isFullscreen ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5'}`}>
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Canvas area — auto-fits the preview into the available space */}
      <div
        ref={areaRef}
        data-tour="canvas"
        className="flex-1 flex items-center justify-center p-1.5 sm:p-6 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-x pan-y' }}
      >
        <motion.div
          initial={{ scale: (zoom / 100) * fitScale }}
          animate={{ scale: (zoom / 100) * fitScale }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="relative shrink-0"
          style={{ width: canvasW, height: canvasH }}
        >
          {/* Phone frame for 9:16 */}
          {ratio === '9:16' && (
            <div
              className="absolute pointer-events-none z-40"
              style={{
                inset: -10,
                borderRadius: 36,
                border: '2px solid rgba(255,255,255,0.10)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
              }}
            >
              {/* Notch */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-white/10" />
              {/* Home bar */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/10" />
            </div>
          )}
          <div
            className="relative bg-black overflow-hidden shadow-2xl border border-white/[0.08]"
            style={{ width: canvasW, height: canvasH, borderRadius: ratio === '9:16' ? 24 : 8 }}
          >
            {/* Grid overlay */}
            {showGrid && (
              <div
                className="absolute inset-0 opacity-20 pointer-events-none z-10"
                style={{
                  backgroundImage: 'linear-gradient(rgba(245,158,11,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,.3) 1px, transparent 1px)',
                  backgroundSize: '80px 80px',
                }}
                aria-hidden="true"
              />
            )}

            {/* Loading overlay */}
            {(phase === 'extracting' || phase === 'transcribing' || phase === 'aligning') && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 z-20">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-400 flex items-center justify-center shadow-xl"
                >
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </motion.div>
                <p className="text-sm font-semibold text-white">{PHASE_LABELS[phase]}</p>
                {lowMemoryMode && (
                  <p className="text-[11px] text-zinc-400 text-center max-w-[15rem] -mt-2 leading-snug">
                    Optimizing for your device — this may take a little longer.
                  </p>
                )}
                <div className="w-44">
                  <ProgressBar value={(phase === 'transcribing' || phase === 'aligning') && phaseProgress !== null ? phaseProgress : undefined} height={5} />
                  {(phase === 'transcribing' || phase === 'aligning') && phaseProgress !== null && (
                    <p className="text-[10px] text-zinc-500 text-center mt-1.5 tabular-nums">{phaseProgress}%</p>
                  )}
                </div>
              </div>
            )}

            {/* Error overlay */}
            {phase === 'error' && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 z-20">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <p className="text-sm text-red-300 text-center px-8">{errMsg}</p>
              </div>
            )}

            {/* Native HTML5 video — render as soon as we have a src so the user
                can preview/hear the video even while transcription is in progress.
                The loading/error overlays sit on top (z-20) and hide the black frame. */}
            {videoSrc && (
              <video
                ref={videoRef}
                src={videoSrc}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                onPlay={handlePlay}
                onPause={handlePause}
                onEnded={handlePause}
                onSeeked={handleSeeked}
                onCanPlay={handleCanPlay}
                onWaiting={handleWaiting}
                onStalled={handleWaiting}
                // Without this an undecodable file (e.g. HEVC on an unsupported
                // browser) is just a silent black rectangle. Transient phone
                // decode hiccups self-recover; see handleVideoError.
                onError={handleVideoError}
                // 'metadata' avoids eagerly buffering/decoding the whole blob (a major
                // memory/stall trigger): always on phones, and on desktop too until the
                // pipeline reaches 'ready' — buffering the full source blob WHILE transcription
                // still holds it (its ArrayBuffer + decoded PCM) in memory is what pushed large
                // files over the tab's memory budget and failed the load. Once 'ready' that
                // memory is freed, so upgrade to 'auto' for instant scrubbing. Preview-during-
                // transcription still works: 'metadata' loads on demand when the user hits play.
                preload={isMobile || phase !== 'ready' ? 'metadata' : 'auto'}
                playsInline
              />
            )}

            {/* Caption overlay — lightweight React over native video.
                When a custom font is selected, an !important rule on caption <span>s
                overrides every style's hard-coded font so the preview matches the export.
                Scoped to this wrapper so it never touches the bounding-box handles. */}
            {phase === 'ready' && words.length > 0 && (
              <div
                data-captik-customfont={captionFont || undefined}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                {/* custom-font override — excludes font-locked templates (aura/pixelated/delhi/
                    editor_masala) whose typography IS the template; mirrors buildCustomFontCss */}
                {captionFont && (
                  <style>{`[data-captik-customfont] span:not([data-cfont-lock] *){font-family:${customFontStack(captionFont)} !important;}`}</style>
                )}
                <CaptionOverlay
                  words={words}
                  currentTimeMs={localMs}
                  captionStyle={effectiveStyle}
                  accentColor={accentColor}
                  bleepRanges={bleepRanges}
                  segments={captionSegments}
                  captionYPercent={effectiveBox.yPercent}
                  captionXPercent={effectiveBox.xPercent}
                  captionWidthPercent={effectiveBox.widthPercent}
                  emphBoxYPercent={effectiveEmphBox.yPercent}
                  emphBoxXPercent={effectiveEmphBox.xPercent}
                  emphBoxWidthPercent={effectiveEmphBox.widthPercent}
                  emphFontScale={effectiveEmphFontScale}
                  captionFontScale={effectiveFontScale}
                  captionLines={captionLines}
                  captionTextColor={captionTextColor}
                  captionGapMs={captionGapMs}
                  canvasWidthPx={canvasW}
                  canvasHeightPx={canvasH}
                  videoBackdrop
                  faceTrack={matte?.faceTrack ?? null}
                  textOverrides={effectiveTextOverrides}
                  emphasisStyle={emphasisStyle}
                  layoutMode={layoutMode}
                  templateSlots={effectiveTemplateSlots}
                  // Back layer of a split design: the title only (its caption renders above the
                  // cut-out in the front layer below). Ignored by every other style.
                  subjectLayer={splitsSubject ? 'behind' : undefined}
                />
              </div>
            )}

            {/* "Behind the subject" — the cut-out person, drawn OVER the captions on a canvas sized
                to the matte (same aspect as the source) and CSS-contained so it lines up with the
                source video. Painted per-frame by drawCutout (trackTime/seek/pause/decode).
                pointerEvents:none keeps the bounding box interactive. */}
            {phase === 'ready' && matte && (
              <canvas
                ref={cutoutCanvasRef}
                width={matte.width}
                height={matte.height}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
              />
            )}

            {/* FRONT layer of a split design — the caption, ABOVE the cut-out so it reads in front
                of the subject (the title is on the back layer, the cut-out in the middle). */}
            {phase === 'ready' && words.length > 0 && splitsSubject && (
              <div
                data-captik-customfont={captionFont || undefined}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                {captionFont && (
                  <style>{`[data-captik-customfont] span:not([data-cfont-lock] *){font-family:${customFontStack(captionFont)} !important;}`}</style>
                )}
                <CaptionOverlay
                  words={words}
                  currentTimeMs={localMs}
                  captionStyle={effectiveStyle}
                  accentColor={accentColor}
                  bleepRanges={bleepRanges}
                  segments={captionSegments}
                  captionYPercent={effectiveBox.yPercent}
                  captionXPercent={effectiveBox.xPercent}
                  captionWidthPercent={effectiveBox.widthPercent}
                  emphBoxYPercent={effectiveEmphBox.yPercent}
                  emphBoxXPercent={effectiveEmphBox.xPercent}
                  emphBoxWidthPercent={effectiveEmphBox.widthPercent}
                  emphFontScale={effectiveEmphFontScale}
                  captionFontScale={effectiveFontScale}
                  captionLines={captionLines}
                  captionTextColor={captionTextColor}
                  captionGapMs={captionGapMs}
                  canvasWidthPx={canvasW}
                  canvasHeightPx={canvasH}
                  videoBackdrop
                  faceTrack={matte?.faceTrack ?? null}
                  textOverrides={effectiveTextOverrides}
                  emphasisStyle={emphasisStyle}
                  layoutMode={layoutMode}
                  templateSlots={effectiveTemplateSlots}
                  subjectLayer="front"
                />
              </div>
            )}

            {/* Matte generation status badge */}
            {matteStatus === 'generating' && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white text-[11px] font-medium rounded-full px-3 py-1 flex items-center gap-2 pointer-events-none">
                <Loader2 className="w-3 h-3 animate-spin" />
                Cutting out subject… {Math.round(matteProgress * 100)}%
              </div>
            )}
            {matteStatus === 'error' && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-red-900/85 text-red-100 text-[11px] font-medium rounded-full px-3 py-1 text-center max-w-[90%] pointer-events-none">
                Couldn’t cut out the subject — try desktop Chrome on a clear, well-lit clip.
              </div>
            )}
            {matteStatus === 'unsupported' && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-amber-900/85 text-amber-100 text-[11px] font-medium rounded-full px-3 py-1 text-center max-w-[90%] pointer-events-none">
                “Behind the subject” needs desktop Google Chrome.
              </div>
            )}

            {/* Free-tier watermark bug — same lockup the export burns in */}
            {videoSrc && watermarked && phase !== 'idle' && (
              <PreviewWatermark canvasW={canvasW} canvasH={canvasH} />
            )}

            {/* Interactive bounding box — drag/resize/scope. On phones it's intrusive on the
                small preview (and its scope popup blocks caption taps), so it's shown only inside
                the dedicated Position mode (boxScopeMode==='manual'); desktop always shows it. */}
            {onCaptionBoxChange && onCaptionBoxScope && (!isMobile || boxScopeMode === 'manual') && (
              <CaptionBoundingBox
                box={effectiveBox}
                canvasW={canvasW}
                canvasH={canvasH}
                onBoxChange={onCaptionBoxChange}
                onApplyScope={onCaptionBoxScope}
                onCancelScope={onCaptionBoxCancel}
                onOutsideResolve={onCaptionBoxOutside}
                selectedCount={selectedSegmentCount}
                blockTargetCount={blockTargetCount}
                visible={phase === 'ready' && words.length > 0}
                fontScale={effectiveFontScale}
                onFontScaleChange={onBoxFontScalePreview}
                manualCommit={boxScopeMode === 'manual'}
                displayScale={(zoom / 100) * fitScale}
                behindSubject={behindSubject}
                behindSubjectCount={behindSubjectCount}
                // Big Reveal cuts the subject out automatically across the whole video, so the
                // per-caption toggle would be redundant/confusing → hide it for that template.
                onToggleBehindSubject={effectiveStyle === 'big_reveal' ? undefined : onToggleBehindSubject}
                label={splitsSubject ? 'Caption' : undefined}
              />
            )}

            {/* Big Reveal: the SECOND box for the emphasised TITLE that sits behind the subject.
                Independent content selector + accent so it auto-heights and reads distinctly from
                the lower caption box. (The Big Red keeps ONE box — its title and caption are one
                stacked lockup, centred on each other by construction.) */}
            {splitsSubject && onEmphBoxChange && onEmphBoxScope
              && (!isMobile || boxScopeMode === 'manual') && (
              <CaptionBoundingBox
                box={effectiveEmphBox}
                canvasW={canvasW}
                canvasH={canvasH}
                onBoxChange={onEmphBoxChange}
                onApplyScope={onEmphBoxScope}
                onCancelScope={onEmphBoxCancel}
                onOutsideResolve={onEmphBoxOutside}
                selectedCount={selectedSegmentCount}
                blockTargetCount={blockTargetCount}
                visible={phase === 'ready' && words.length > 0}
                manualCommit={boxScopeMode === 'manual'}
                displayScale={(zoom / 100) * fitScale}
                contentSelector={'[data-caption-content="emph"]'}
                label="Title"
                accent="#FFE800"
                fontScale={effectiveEmphFontScale}
                onFontScaleChange={onEmphBoxFontScalePreview}
              />
            )}

            {/* Recoverable playback snag (phones) — keeps the session alive, offers a manual
                reload instead of the fatal phase==='error' state. */}
            {recoverError && (
              <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-3 z-50 px-8 text-center">
                <AlertCircle className="w-7 h-7 text-amber-400" />
                <p className="text-sm text-zinc-200">{recoverError}</p>
                <button
                  onClick={handleManualReload}
                  className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold active:scale-95 transition-transform cursor-pointer"
                  style={{ touchAction: 'manipulation' }}
                >
                  Tap to reload
                </button>
              </div>
            )}

            {/* Idle placeholder */}
            {phase === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage: 'repeating-conic-gradient(#27272a 0% 25%, transparent 0% 50%)',
                    backgroundSize: '20px 20px',
                  }}
                  aria-hidden="true"
                />
                <p className="relative text-sm font-medium text-zinc-500">Upload a video to begin</p>
              </div>
            )}

            {/* Resolution / codec badge */}
            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/70 border border-white/[0.08] rounded text-[10px] text-zinc-500 font-mono z-30">
              {isMobile ? '1080p' : '4K'}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
});

export default VideoCanvas;
