'use client';

import { useRef, useEffect, useState, useMemo, useCallback, type ReactNode } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Undo2, Redo2,
  AlignLeft, Palette, Scissors, X, Move, Trash2, Check,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ImageIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TranscriptWord, CaptionBoxConfig } from '@/types/transcript';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import { segmentKeyOf } from '@/lib/captionSegments';
import { buildMobileClips, type MobileClip } from '@/lib/mobileClips';
import SegmentStylePicker from './SegmentStylePicker';

// ─── types ────────────────────────────────────────────────────────────────────

type MobileTab = 'timeline' | 'captions' | 'style' | 'cover';

export interface MobileCapcutEditorProps {
  topBarEl:       ReactNode;
  videoCanvasEl:  ReactNode;
  rightPanelEl:   ReactNode;
  leftPanelEl:    ReactNode;

  isPlaying:     boolean;
  currentTimeMs: number;
  durationMs:    number;
  onPlayPause:   () => void;
  onSeek:        (ms: number) => void;
  /** Fires while the overview scrubber is actively dragged → coalesces seeks in VideoCanvas. */
  onScrubbingChange?: (scrubbing: boolean) => void;

  canUndo: boolean;
  canRedo: boolean;
  onUndo:  () => void;
  onRedo:  () => void;

  words:           TranscriptWord[];
  captionSegments: string[][];
  selectedWordId:  string | null;
  onWordSelect:    (id: string | null) => void;
  segmentStyleOverrides: Record<string, CaptionStyleId>;
  captionStyle:    CaptionStyleId;
  onSegmentStyleChange: (segKeys: string[], style: CaptionStyleId | null) => void;
  /** Lift the current caption selection (canonical segment keys) to the page so per-caption
   *  position/scope and the scope picker work on phones, mirroring the desktop timeline. */
  onSelectionChange?:   (segKeys: string[]) => void;
  /** Delete the selected caption line(s) by segment index. */
  onDeleteSegments?:    (segIdxs: number[]) => void;

  // ── Per-caption position ("Position" mode) — all writes route through the page handlers ──
  positionMode:         boolean;
  onPositionModeChange: (on: boolean) => void;
  captionBox:           CaptionBoxConfig;
  segmentBoxOverrides:  Record<string, CaptionBoxConfig>;
  pendingBox:           CaptionBoxConfig | null;
  onCaptionBoxChange:   (box: CaptionBoxConfig) => void;
  onCaptionBoxScope:    (scope: 'all' | 'block') => void;
  onCaptionBoxCancel:   () => void;

  // ── Cover (optional) ──
  /** Cover sheet content. Omitted → no Cover tab. */
  coverPanelEl?:        ReactNode;
  /** True while the Cover sheet is open (the page swaps the preview for the cover stage). */
  onCoverOpenChange?:   (open: boolean) => void;
  /** Increment to open the Cover sheet from outside (e.g. "Use as cover" in the AI Hook tab). */
  coverOpenSignal?:     number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const ZOOM_MIN = 20, ZOOM_MAX = 240, ZOOM_DEFAULT = 80;

// 44px touch target for the position-mode nudge d-pad.
const NUDGE_BTN =
  'w-11 h-11 rounded-xl bg-black/70 border border-white/10 flex items-center justify-center text-white active:bg-amber-500/30 active:scale-95 transition-transform cursor-pointer';

function getTouchDist(t: TouchList) {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── component ────────────────────────────────────────────────────────────────

export default function MobileCapcutEditor({
  topBarEl, videoCanvasEl, rightPanelEl, leftPanelEl,
  isPlaying, currentTimeMs, durationMs, onPlayPause, onSeek, onScrubbingChange,
  canUndo, canRedo, onUndo, onRedo,
  words, captionSegments, selectedWordId, onWordSelect,
  segmentStyleOverrides, captionStyle, onSegmentStyleChange,
  onSelectionChange, onDeleteSegments,
  positionMode, onPositionModeChange,
  captionBox, segmentBoxOverrides, pendingBox,
  onCaptionBoxChange, onCaptionBoxScope, onCaptionBoxCancel,
  coverPanelEl, onCoverOpenChange, coverOpenSignal = 0,
}: MobileCapcutEditorProps) {
  const [activeTab, setActiveTab] = useState<MobileTab>('timeline');
  const [sheetOpen, setSheetOpen] = useState<'captions' | 'style' | 'cover' | null>(null);
  // "Use as cover" from outside: open the Cover sheet (adjust-state-during-render, no effect).
  const [seenCoverSignal, setSeenCoverSignal] = useState(coverOpenSignal);
  if (coverOpenSignal !== seenCoverSignal) {
    setSeenCoverSignal(coverOpenSignal);
    if (coverPanelEl) { setSheetOpen('cover'); setActiveTab('cover'); }
  }
  const onCoverOpenChangeRef = useRef(onCoverOpenChange);
  useEffect(() => { onCoverOpenChangeRef.current = onCoverOpenChange; });
  useEffect(() => { onCoverOpenChangeRef.current?.(sheetOpen === 'cover'); }, [sheetOpen]);
  const [stylePicker, setStylePicker] = useState<{ segKeys: string[] } | null>(null);
  // Long-press a caption clip → selection mode; taps then toggle membership and
  // "Style" bulk-applies a template to every selected caption (CapCut pattern).
  const [multiSel, setMultiSel] = useState<Set<number>>(new Set());
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True once a long-press has fired its selection, so the phantom click that follows on touch
  // doesn't immediately toggle that caption back off.
  const longPressFired = useRef(false);
  // Position-mode scope: write the box to only the selected caption(s) ('block') or everyone ('all').
  const [posScope, setPosScope] = useState<'block' | 'all'>('block');

  // Lock html/body scroll while the mobile editor is mounted so the page
  // cannot be pulled/bounced on iOS or scrolled on Android.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOSB:      html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOSB:      body.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyWidth:    body.style.width,
      bodyHeight:   body.style.height,
    };
    html.style.overflow          = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow          = 'hidden';
    body.style.overscrollBehavior = 'none';
    // position:fixed is the only reliable way to suppress iOS Safari rubber-band
    body.style.position = 'fixed';
    body.style.width    = '100%';
    body.style.height   = '100dvh';
    return () => {
      html.style.overflow           = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOSB;
      body.style.overflow           = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOSB;
      body.style.position           = prev.bodyPosition;
      body.style.width              = prev.bodyWidth;
      body.style.height             = prev.bodyHeight;
    };
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef  = useRef<HTMLDivElement>(null);
  const scrubRef  = useRef<HTMLDivElement>(null);
  const scrubDrag = useRef(false);

  // ── zoom state ─────────────────────────────────────────────────────────────
  const [pxPerSec, setPxPerSec] = useState(ZOOM_DEFAULT);
  const pxRef = useRef(ZOOM_DEFAULT);
  useEffect(() => { pxRef.current = pxPerSec; }, [pxPerSec]);

  // ── fixed-centre-playhead state ─────────────────────────────────────────────
  // The playhead is pinned to the timeline's centre; the strip scrolls beneath it. We pad the
  // track by half the viewport on each side so both time 0 and the final frame can sit under the
  // centre. scrollLeft === currentTime*pxPerMs keeps the playhead on the current time.
  const [viewW, setViewW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 360));
  const halfViewW = viewW / 2;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, [sheetOpen]); // re-measure when the timeline re-mounts (a sheet unmounts it)
  // Arbitrate user-scrub vs the programmatic playback-sync scroll so they don't fight.
  const interactingRef = useRef(false);
  const scrolledRef    = useRef(false);
  const releaseTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekRafRef     = useRef(0);

  // Pinch-to-zoom on the timeline track. touchAction:'pan-x' lets the browser
  // handle single-finger scroll; two-finger pinch is intercepted here via
  // non-passive touchstart/touchmove (preventDefault stops native pinch-zoom).
  const pinchState = useRef<{
    dist0:   number;   // initial finger distance
    px0:     number;   // initial pxPerSec
    midX:    number;   // pinch midpoint clientX
    scroll0: number;   // initial scrollLeft
  } | null>(null);
  // When the second finger lifts, the browser may still fire a click — remember
  // when the pinch ended so that ghost click doesn't seek/deselect.
  const lastPinchEnd = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      pinchState.current = {
        dist0:   getTouchDist(e.touches),
        px0:     pxRef.current,
        midX:    (e.touches[0].clientX + e.touches[1].clientX) / 2,
        scroll0: el.scrollLeft,
      };
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchState.current) return;
      e.preventDefault();
      const { dist0, px0, midX, scroll0 } = pinchState.current;
      const scale  = getTouchDist(e.touches) / dist0;
      const next   = Math.round(clamp(px0 * scale, ZOOM_MIN, ZOOM_MAX));
      const rect   = el.getBoundingClientRect();
      const offsetX = midX - rect.left;           // pinch centre relative to viewport
      const tSec   = (scroll0 + offsetX) / px0;  // time (s) under pinch centre
      setPxPerSec(next);
      requestAnimationFrame(() => { el.scrollLeft = tSec * next - offsetX; });
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && pinchState.current) {
        pinchState.current = null;
        lastPinchEnd.current = Date.now();
      }
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    el.addEventListener('touchend',   onEnd);
    el.addEventListener('touchcancel',onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
      el.removeEventListener('touchend',   onEnd);
      el.removeEventListener('touchcancel',onEnd);
    };
  }, []);

  // ── derived ────────────────────────────────────────────────────────────────
  const pxPerMs = pxPerSec / 1000;
  const durationSec = durationMs / 1000;
  // Content (strip/ruler/clips) lives in an inner band; the track is padded by half a viewport
  // each side so any time can scroll under the fixed centre playhead.
  const contentWidth = Math.max(durationSec * pxPerSec, 200) + 40;
  const trackWidth   = halfViewW + contentWidth + halfViewW;
  const pct          = durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;

  // Canonical clips: `key` is segmentKeyOf(seg) — the single source of truth for every
  // per-caption read/write (template, position, selection) so the phone agrees with the
  // desktop timeline, the preview and the export. See lib/mobileClips.ts.
  const clips = useMemo<MobileClip[]>(
    () => (durationMs ? buildMobileClips(words, captionSegments) : []),
    [captionSegments, words, durationMs],
  );

  const selectedSegIdx = useMemo(() => {
    if (!selectedWordId) return -1;
    return captionSegments.findIndex(seg => seg.includes(selectedWordId));
  }, [captionSegments, selectedWordId]);

  // The captions currently selected, as canonical segment keys: the long-press multi-selection
  // if any, otherwise the single tapped caption. This is what the page lifts into
  // `selectedSegmentKeys` (driving per-caption position scope + the scope picker).
  const selectedSegKeys = useMemo<string[]>(() => {
    if (multiSel.size > 0) return clips.filter(c => multiSel.has(c.idx)).map(c => c.key);
    if (selectedSegIdx >= 0 && captionSegments[selectedSegIdx]) return [segmentKeyOf(captionSegments[selectedSegIdx])];
    return [];
  }, [multiSel, clips, selectedSegIdx, captionSegments]);

  // Segment INDICES currently selected (for index-based handlers like delete).
  const selectedSegIdxs = useMemo<number[]>(() => {
    if (multiSel.size > 0) return Array.from(multiSel);
    if (selectedSegIdx >= 0) return [selectedSegIdx];
    return [];
  }, [multiSel, selectedSegIdx]);

  // Bridge the selection up to the page (handleSelectionChange dedupes, so no render loop).
  useEffect(() => { onSelectionChange?.(selectedSegKeys); }, [selectedSegKeys, onSelectionChange]);

  const tickSec = useMemo(() => {
    if (pxPerSec >= 80)  return 1;
    if (pxPerSec >= 40)  return 2;
    if (pxPerSec >= 16)  return 5;
    return 10;
  }, [pxPerSec]);

  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let s = 0; s <= Math.ceil(durationSec); s += tickSec) arr.push(s);
    return arr;
  }, [durationSec, tickSec]);

  // ── centre the playhead on the current time (playback / external seeks) ──────
  // Skipped while the user is scrubbing so their drag isn't yanked back.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || interactingRef.current) return;
    const target = currentTimeMs * pxPerMs;
    if (Math.abs(el.scrollLeft - target) > 0.5) el.scrollLeft = target;
  }, [currentTimeMs, pxPerMs]);

  // Cleanup the scrub timers on unmount.
  useEffect(() => () => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    if (seekRafRef.current) cancelAnimationFrame(seekRafRef.current);
  }, []);

  // End a scrub: snap the video to whatever time is now under the centre playhead.
  const releaseScrub = useCallback(() => {
    interactingRef.current = false;
    if (scrolledRef.current) {
      scrolledRef.current = false;
      onScrubbingChange?.(false);
      const el = scrollRef.current;
      if (el) onSeek(clamp(el.scrollLeft / pxPerMs, 0, durationMs));
    }
  }, [onScrubbingChange, onSeek, pxPerMs, durationMs]);

  const armRelease = useCallback((ms: number) => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(() => { releaseTimer.current = null; releaseScrub(); }, ms);
  }, [releaseScrub]);

  const onTimelineTouchStart = useCallback(() => {
    interactingRef.current = true;
    scrolledRef.current = false;
    if (releaseTimer.current) { clearTimeout(releaseTimer.current); releaseTimer.current = null; }
  }, []);

  // The scroll handler IS the scrub: time under the centre = scrollLeft / pxPerMs.
  const onTimelineScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinchState.current) return;        // a pinch adjusts scrollLeft itself — not a scrub
    if (!interactingRef.current) return;   // our own playback-sync scroll — ignore
    if (!scrolledRef.current) { scrolledRef.current = true; onScrubbingChange?.(true); }
    if (!seekRafRef.current) {
      seekRafRef.current = requestAnimationFrame(() => {
        seekRafRef.current = 0;
        const e = scrollRef.current;
        if (e) onSeek(clamp(e.scrollLeft / pxPerMs, 0, durationMs));
      });
    }
    armRelease(140); // momentum keeps firing scroll → re-arms until it settles
  }, [onScrubbingChange, onSeek, pxPerMs, durationMs, armRelease]);

  const onTimelineTouchEnd = useCallback(() => { armRelease(180); }, [armRelease]);

  // ── seek / scrub handlers ──────────────────────────────────────────────────
  const handleTrackClick = useCallback(() => {
    // A click that lands right as a pinch ends is a zoom gesture, not a tap.
    if (pinchState.current || Date.now() - lastPinchEnd.current < 400) return;
    // Fixed-playhead model: you scrub by scrolling, so a tap on the empty strip doesn't seek —
    // it just deselects (clip taps stopPropagation, so this only fires on the background).
    onWordSelect(null);
  }, [onWordSelect]);

  const handleClipTap = useCallback((clip: MobileClip, e: React.MouseEvent) => {
    e.stopPropagation();
    // A long-press already handled this as a selection — swallow the trailing phantom click.
    if (longPressFired.current) { longPressFired.current = false; return; }
    // Selection mode: taps toggle membership instead of seeking.
    if (multiSel.size > 0) {
      setMultiSel(prev => {
        const next = new Set(prev);
        if (next.has(clip.idx)) next.delete(clip.idx); else next.add(clip.idx);
        return next;
      });
      return;
    }
    onWordSelect(clip.firstWordId);
    onSeek(clip.startMs);
  }, [onWordSelect, onSeek, multiSel.size]);

  // Long-press (500ms, no move) on a clip enters selection mode.
  const clipPressStart = useCallback((clip: MobileClip) => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;          // selects only — never opens templates
      setMultiSel(prev => new Set([...prev, clip.idx]));
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(15);
    }, 500);
  }, []);
  const clipPressEnd = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  const startScrub = useCallback((e: React.PointerEvent) => {
    if (!durationMs) return;
    scrubDrag.current = true;
    onScrubbingChange?.(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = scrubRef.current?.getBoundingClientRect();
    if (rect) onSeek(clamp(((e.clientX - rect.left) / rect.width) * durationMs, 0, durationMs));
  }, [durationMs, onSeek, onScrubbingChange]);

  const moveScrub = useCallback((e: React.PointerEvent) => {
    if (!scrubDrag.current || !durationMs) return;
    const rect = scrubRef.current?.getBoundingClientRect();
    if (rect) onSeek(clamp(((e.clientX - rect.left) / rect.width) * durationMs, 0, durationMs));
  }, [durationMs, onSeek]);

  const endScrub = useCallback(() => {
    if (scrubDrag.current) { scrubDrag.current = false; onScrubbingChange?.(false); }
  }, [onScrubbingChange]);

  // ── Position mode ────────────────────────────────────────────────────────────
  // The box currently being edited: live drag/nudge preview wins, else the selected caption's
  // own override, else the global box (mirrors VideoCanvas.effectiveBox for the selected caption).
  const positionKey  = selectedSegKeys[0] ?? null;
  const positionBox  = pendingBox ?? (positionKey ? segmentBoxOverrides[positionKey] : undefined) ?? captionBox;

  const enterPositionMode = useCallback(() => {
    // Seek to the first selected caption so the on-canvas box + preview show it.
    const sel = clips.filter(c => selectedSegIdxs.includes(c.idx));
    if (sel.length) onSeek(sel.reduce((a, b) => (b.startMs < a.startMs ? b : a)).startMs);
    setPosScope(selectedSegKeys.length ? 'block' : 'all');
    onPositionModeChange(true);
  }, [clips, selectedSegIdxs, selectedSegKeys.length, onSeek, onPositionModeChange]);

  const nudge = (dx: number, dy: number) => {
    onCaptionBoxChange({
      ...positionBox,
      xPercent: clamp(positionBox.xPercent + dx, 2, 98),
      yPercent: clamp(positionBox.yPercent + dy, 5, 95),
    });
  };

  const applyPosition = () => {
    onCaptionBoxScope(selectedSegKeys.length ? posScope : 'all');
    onPositionModeChange(false);
  };
  const cancelPosition = () => {
    onCaptionBoxCancel();
    onPositionModeChange(false);
  };

  // ── tab / sheet handlers ───────────────────────────────────────────────────
  const handleTabClick = (id: MobileTab) => {
    if (id === 'captions' || id === 'style' || id === 'cover') {
      if (sheetOpen === id) {
        setSheetOpen(null);
        setActiveTab('timeline');
      } else {
        setSheetOpen(id);
        setActiveTab(id);
      }
    } else {
      setSheetOpen(null);
      setActiveTab('timeline');
    }
  };

  const closeSheet = () => { setSheetOpen(null); setActiveTab('timeline'); };

  const tabs: { id: MobileTab; label: string; hint: string; Icon: typeof Scissors }[] = [
    { id: 'timeline', label: 'Edit',     hint: 'Timeline — scrub the video and select captions', Icon: Scissors  },
    { id: 'captions', label: 'Captions', hint: 'Edit caption text, split/merge & emphasis',       Icon: AlignLeft },
    { id: 'style',    label: 'Style',    hint: 'Fonts, colours, templates & position',            Icon: Palette   },
    ...(coverPanelEl ? [{ id: 'cover' as const, label: 'Cover', hint: 'Make a thumbnail cover from a frame', Icon: ImageIcon }] : []),
  ];

  // video height shrinks when sheet is open so the preview stays visible
  const videoH = sheetOpen === 'cover'
    ? 'clamp(160px, 34dvh, 320px)'   // the cover preview IS the point of this sheet
    : sheetOpen
    ? 'clamp(120px, 22dvh, 200px)'
    : 'clamp(200px, 42dvh, 420px)';

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[100dvh] bg-[#0B0B0D] overflow-hidden select-none" style={{ overscrollBehavior: 'none' }}>

      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      {topBarEl}

      {/* ── Video Preview ───────────────────────────────────────────────────── */}
      {/* Position mode EXPANDS this same wrapper to fullscreen via CSS (no second renderer, no
          video remount) and overlays the move controls. The on-canvas box drags directly; the
          d-pad fine-tunes. Both write a pendingBox preview; "Done" commits the chosen scope. */}
      <div
        className={positionMode
          ? 'fixed inset-0 z-[80] bg-black flex flex-col'
          : 'shrink-0 overflow-hidden bg-black flex flex-col'}
        style={positionMode ? undefined : {
          height: videoH,
          transition: 'height 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
      >
        {videoCanvasEl}

        {positionMode && (
          <>
            {/* Top bar: Cancel · title · Done */}
            <div
              className="absolute top-0 inset-x-0 z-[60] flex items-center justify-between px-3 h-12 bg-gradient-to-b from-black/85 to-transparent"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
            >
              <button onClick={cancelPosition} style={{ touchAction: 'manipulation' }}
                title="Discard these position changes"
                className="px-3 py-2 rounded-lg text-[13px] font-semibold text-zinc-200 bg-white/10 active:bg-white/20 cursor-pointer">
                Cancel
              </button>
              <span className="text-[13px] font-semibold text-white/90 flex items-center gap-1.5"
                title="Drag the box on the video, or use the arrows below, then choose who it applies to">
                <Move className="w-4 h-4 text-amber-400" /> Move caption
              </span>
              <button onClick={applyPosition} style={{ touchAction: 'manipulation' }}
                title="Apply the new position"
                className="px-3.5 py-2 rounded-lg text-[13px] font-bold text-black bg-amber-500 active:scale-95 transition-transform flex items-center gap-1 cursor-pointer">
                <Check className="w-4 h-4" /> Done
              </button>
            </div>

            {/* Scope toggle */}
            {selectedSegKeys.length > 0 && (
              <div className="absolute left-1/2 -translate-x-1/2 z-[60] flex items-center gap-0.5 p-0.5 rounded-xl bg-black/70 border border-white/10"
                style={{ top: 'calc(56px + env(safe-area-inset-top, 0px))' }}>
                {(['block', 'all'] as const).map(s => (
                  <button key={s} onClick={() => setPosScope(s)} style={{ touchAction: 'manipulation' }}
                    title={s === 'block' ? 'Apply this position to only the selected caption(s)' : 'Apply this position to every caption'}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      posScope === s ? 'bg-amber-500 text-black' : 'text-zinc-300'}`}>
                    {s === 'block'
                      ? (selectedSegKeys.length > 1 ? `These ${selectedSegKeys.length}` : 'This caption')
                      : 'All captions'}
                  </button>
                ))}
              </div>
            )}

            {/* Nudge d-pad + live X/Y */}
            <div className="absolute left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2"
              style={{ bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
              <span className="text-[10px] font-mono text-amber-300 bg-black/70 rounded px-2 py-0.5 tabular-nums">
                X {Math.round(positionBox.xPercent)}%  ·  Y {Math.round(positionBox.yPercent)}%
              </span>
              <div className="grid grid-cols-3 gap-1">
                <span />
                <button onClick={() => nudge(0, -2)} className={NUDGE_BTN} style={{ touchAction: 'manipulation' }} title="Nudge up" aria-label="Move up"><ChevronUp className="w-5 h-5" /></button>
                <span />
                <button onClick={() => nudge(-2, 0)} className={NUDGE_BTN} style={{ touchAction: 'manipulation' }} title="Nudge left" aria-label="Move left"><ChevronLeft className="w-5 h-5" /></button>
                <span />
                <button onClick={() => nudge(2, 0)} className={NUDGE_BTN} style={{ touchAction: 'manipulation' }} title="Nudge right" aria-label="Move right"><ChevronRight className="w-5 h-5" /></button>
                <span />
                <button onClick={() => nudge(0, 2)} className={NUDGE_BTN} style={{ touchAction: 'manipulation' }} title="Nudge down" aria-label="Move down"><ChevronDown className="w-5 h-5" /></button>
                <span />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Overview scrubber + time ─────────────────────────────────────────── */}
      {/* Hidden while a sheet is open so the Captions/Style panel gets the full height. */}
      <div data-tour="m-scrub" className={`shrink-0 items-center gap-3 px-4 h-9 bg-[#0A0A0E] border-t border-white/[0.04] ${sheetOpen && sheetOpen !== 'cover' ? 'hidden' : 'flex'}`}>
        <span className="font-mono text-[10px] text-zinc-600 tabular-nums shrink-0">
          {fmtMs(currentTimeMs)}
        </span>
        <div
          ref={scrubRef}
          className="flex-1 relative h-7 flex items-center cursor-pointer"
          onPointerDown={startScrub}
          onPointerMove={moveScrub}
          onPointerUp={endScrub}
          style={{ touchAction: 'none' }}
          title="Drag to scrub through the whole video"
          role="slider"
          aria-label="Playback position"
          aria-valuemin={0}
          aria-valuemax={durationMs}
          aria-valuenow={currentTimeMs}
        >
          <div className="absolute left-0 right-0 h-[3px] rounded-full bg-zinc-800/80 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#f59e0b,#fcd34d)' }}
            />
          </div>
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md shadow-amber-400/40 pointer-events-none"
            style={{ left: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-[10px] text-zinc-700 tabular-nums shrink-0">
          {fmtMs(durationMs)}
        </span>
      </div>

      {/* ── Playback Controls ────────────────────────────────────────────────── */}
      <div data-tour="m-controls" className={`shrink-0 items-center px-3 h-[52px] bg-[#0A0A0E] border-t border-white/[0.04] ${sheetOpen ? 'hidden' : 'flex'}`}>
        <button
          onClick={() => onSeek(Math.max(0, currentTimeMs - 5000))}
          className="p-2.5 text-zinc-500 active:text-zinc-200 active:scale-90 transition-transform cursor-pointer"
          style={{ touchAction: 'manipulation' }}
          title="Jump back 5 seconds"
          aria-label="Skip back 5s"
        >
          <SkipBack className="w-[18px] h-[18px]" />
        </button>

        <motion.button
          onClick={onPlayPause}
          whileTap={{ scale: 0.88 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="mx-1 w-11 h-11 rounded-full bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30 cursor-pointer"
          style={{ touchAction: 'manipulation' }}
          title={isPlaying ? 'Pause' : 'Play'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isPlaying ? (
              <motion.span key="pause" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.12 }}>
                <Pause className="w-[18px] h-[18px] text-white fill-white" />
              </motion.span>
            ) : (
              <motion.span key="play" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.12 }}>
                <Play className="w-[18px] h-[18px] text-white fill-white ml-0.5" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        <button
          onClick={() => onSeek(Math.min(durationMs, currentTimeMs + 5000))}
          className="p-2.5 text-zinc-500 active:text-zinc-200 active:scale-90 transition-transform cursor-pointer"
          style={{ touchAction: 'manipulation' }}
          title="Jump forward 5 seconds"
          aria-label="Skip forward 5s"
        >
          <SkipForward className="w-[18px] h-[18px]" />
        </button>

        <div className="flex-1" />

        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-2.5 rounded-lg active:scale-90 transition-transform cursor-pointer ${
            canUndo ? 'text-zinc-400 active:text-white' : 'text-zinc-800 pointer-events-none'
          }`}
          style={{ touchAction: 'manipulation' }}
          title="Undo the last change"
          aria-label="Undo"
        >
          <Undo2 className="w-[18px] h-[18px]" />
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-2.5 rounded-lg active:scale-90 transition-transform cursor-pointer ${
            canRedo ? 'text-zinc-400 active:text-white' : 'text-zinc-800 pointer-events-none'
          }`}
          style={{ touchAction: 'manipulation' }}
          title="Redo"
          aria-label="Redo"
        >
          <Redo2 className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* ── CapCut-style Timeline — hidden when sheet is open ───────────────── */}
      <AnimatePresence initial={false}>
      {!sheetOpen && (
      <motion.div
        key="timeline"
        data-tour="m-timeline"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 124, opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative shrink-0 bg-[#080810] border-t border-white/[0.05] overflow-hidden"
      >
        <div
          ref={scrollRef}
          className="h-full overflow-x-auto overflow-y-hidden"
          style={{ overscrollBehavior: 'contain', touchAction: 'pan-x' }}
          onScroll={onTimelineScroll}
          onTouchStart={onTimelineTouchStart}
          onTouchEnd={onTimelineTouchEnd}
        >
          <div
            ref={trackRef}
            className="relative h-full"
            style={{ width: trackWidth }}
            onClick={handleTrackClick}
          >
          {/* Half-viewport-padded content band → time 0 and the last frame both reach the centre */}
          <div className="absolute top-0 bottom-0" style={{ left: halfViewW, width: contentWidth }}>
            {/* Video strip */}
            <div
              className="absolute rounded-md overflow-hidden"
              style={{
                top: 8,
                left: 0,
                width: Math.max(durationSec * pxPerSec, 200),
                height: 44,
              }}
            >
              {/* Main strip background */}
              <div
                className="absolute inset-0"
                style={{
                  background: '#1a1a2e',
                  backgroundImage: `repeating-linear-gradient(
                    90deg,
                    rgba(255,255,255,0.05) 0px,
                    rgba(255,255,255,0.05) 1px,
                    transparent 1px,
                    transparent ${pxPerSec}px
                  )`,
                }}
              />
              {/* Filmstrip notches - top */}
              <div
                className="absolute top-0 left-0 right-0"
                style={{
                  height: 6,
                  background: 'repeating-linear-gradient(90deg, transparent 0px, transparent 4px, rgba(0,0,0,0.6) 4px, rgba(0,0,0,0.6) 9px)',
                }}
              />
              {/* Filmstrip notches - bottom */}
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{
                  height: 6,
                  background: 'repeating-linear-gradient(90deg, transparent 0px, transparent 4px, rgba(0,0,0,0.6) 4px, rgba(0,0,0,0.6) 9px)',
                }}
              />
              {durationMs === 0 && (
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-white/20 font-medium pointer-events-none select-none whitespace-nowrap">
                  Upload a video
                </span>
              )}
            </div>

            {/* Time ruler */}
            <div
              className="absolute left-0 right-0 pointer-events-none"
              style={{ top: 60, height: 18 }}
            >
              {ticks.map(s => (
                <div
                  key={s}
                  className="absolute top-0 flex items-start"
                  style={{ left: s * pxPerSec }}
                >
                  <div
                    className="w-px bg-white/[0.08]"
                    style={{ height: s % (tickSec * 2) === 0 ? 10 : 6, marginTop: 4 }}
                  />
                  {s % (tickSec * 2) === 0 && (
                    <span className="text-[8.5px] text-zinc-600 font-mono tabular-nums ml-1 mt-1">
                      {fmtMs(s * 1000)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Caption track */}
            <div
              className="absolute left-0 right-0"
              style={{ top: 78, height: 40 }}
            >
              {clips.length === 0 && durationMs > 0 && (
                <div className="flex items-center h-full pl-2">
                  <span className="text-[10px] text-zinc-700">Captions will appear here</span>
                </div>
              )}
              {clips.map(clip => {
                const left          = clip.startMs * pxPerMs;
                const width         = Math.max((clip.endMs - clip.startMs) * pxPerMs, 14);
                const active        = currentTimeMs >= clip.startMs && currentTimeMs < clip.endMs;
                const picked        = clip.idx === selectedSegIdx;
                const styleOverride = segmentStyleOverrides[clip.key];

                const inSel = multiSel.has(clip.idx);
                return (
                  <div
                    key={clip.idx}
                    onClick={(e) => handleClipTap(clip, e)}
                    onTouchStart={() => clipPressStart(clip)}
                    onTouchEnd={clipPressEnd}
                    onTouchMove={clipPressEnd}
                    title={`${clip.text} — tap to select, long-press to multi-select`}
                    // Long-press only SELECTS (clipPressStart → multiSel); template & position are
                    // changed from the selection dialog. Just suppress the native context menu here.
                    onContextMenu={(e) => e.preventDefault()}
                    className={[
                      'absolute rounded-lg overflow-hidden transition-all duration-150',
                      inSel
                        ? 'bg-amber-300 ring-2 ring-amber-200 ring-offset-1 ring-offset-[#080810] z-10'
                        : picked
                        ? 'bg-amber-400 ring-2 ring-amber-200 ring-offset-1 ring-offset-[#080810] z-10'
                        : active
                          ? 'bg-amber-500/75'
                          : 'bg-amber-500/45 active:bg-amber-500/70',
                    ].join(' ')}
                    // Fill the whole 40px lane: a 34px block left 6px of dead margin where a
                    // tap (now) deselects — frustrating when aiming for the clip on a phone.
                    style={{
                      left,
                      width,
                      top: 0,
                      height: 40,
                      touchAction: 'manipulation',
                      cursor: 'pointer',
                    }}
                  >
                    <div className="h-full flex flex-col justify-center px-2 pointer-events-none gap-0.5">
                      <span className={`text-[10px] font-semibold leading-none truncate ${picked ? 'text-black' : 'text-black/80'}`}>
                        {clip.text}
                      </span>
                      {styleOverride && (
                        <span className="text-[7px] font-medium leading-none bg-black/20 rounded px-1 py-px truncate text-black/60 self-start">
                          {styleOverride}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* "+" add button at end of track */}
            {durationMs > 0 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center pointer-events-none"
                style={{ left: Math.max(durationSec * pxPerSec, 200) + 10 }}
              >
                <span className="text-zinc-500 text-base leading-none select-none">+</span>
              </div>
            )}

          </div>{/* /content band */}
          </div>{/* /track */}
        </div>{/* /scroll viewport */}

        {/* Fixed centre playhead — pinned to the timeline's middle; the strip scrolls beneath it. */}
        {durationMs > 0 && (
          <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-30" style={{ width: 2, transform: 'translateX(-50%)' }}>
            <div className="absolute inset-y-0 left-0" style={{ width: 2, background: 'linear-gradient(180deg,#fbbf24 0%,#f59e0b 100%)', boxShadow: '0 0 6px 1px rgba(251,191,36,0.4)' }} />
            <div className="absolute top-0 left-1/2 w-2.5 h-2.5 bg-amber-400 rounded-[3px]" style={{ transform: 'translateX(-50%) rotate(45deg)' }} />
          </div>
        )}

        {/* Selection action bar — the floating pill, now ABOVE the caption clips (over the strip)
            so it never covers the clips or the tabs. pointer-events-none on the shell lets you keep
            scrubbing "through" it; only the buttons capture taps. */}
        {selectedSegIdxs.length > 0 && !positionMode && (
          <div className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 px-2 py-1 rounded-2xl bg-[#16161c]/95 backdrop-blur-sm border border-amber-400/30 shadow-2xl shadow-black/60">
            <span className="text-[11px] font-bold text-amber-300 whitespace-nowrap px-1">{selectedSegIdxs.length} selected</span>
            <button
              onClick={() => { if (selectedSegKeys.length) setStylePicker({ segKeys: selectedSegKeys }); }}
              style={{ touchAction: 'manipulation' }}
              title="Change the caption template for the selected line(s)"
              aria-label="Change template for selected captions"
              className="pointer-events-auto flex flex-col items-center gap-0.5 min-w-[48px] px-2 py-1 rounded-xl active:bg-white/5 cursor-pointer"
            >
              <Palette className="w-[17px] h-[17px] text-amber-300" />
              <span className="text-[10px] font-semibold text-amber-200">Style</span>
            </button>
            <button
              onClick={enterPositionMode}
              style={{ touchAction: 'manipulation' }}
              title="Move the selected caption(s) on screen — drag or nudge, then apply to this caption or all"
              aria-label="Move selected captions on screen"
              className="pointer-events-auto flex flex-col items-center gap-0.5 min-w-[48px] px-2 py-1 rounded-xl active:bg-white/5 cursor-pointer"
            >
              <Move className="w-[17px] h-[17px] text-amber-300" />
              <span className="text-[10px] font-semibold text-amber-200">Position</span>
            </button>
            <button
              onClick={() => {
                if (!selectedSegIdxs.length) return;
                onDeleteSegments?.(selectedSegIdxs);
                setMultiSel(new Set());
                onWordSelect(null);
              }}
              style={{ touchAction: 'manipulation' }}
              title="Delete the selected caption line(s)"
              aria-label="Delete selected captions"
              className="pointer-events-auto flex flex-col items-center gap-0.5 min-w-[48px] px-2 py-1 rounded-xl active:bg-white/5 cursor-pointer"
            >
              <Trash2 className="w-[17px] h-[17px] text-rose-400" />
              <span className="text-[10px] font-semibold text-rose-300">Delete</span>
            </button>
            <button
              onClick={() => { setMultiSel(new Set()); onWordSelect(null); }}
              style={{ touchAction: 'manipulation' }}
              title="Clear selection"
              aria-label="Clear selection"
              className="pointer-events-auto ml-0.5 w-9 h-9 flex items-center justify-center rounded-xl text-zinc-400 active:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </motion.div>
      )}
      </AnimatePresence>

      {/* ── Flex spacer — hosts the sliding bottom sheet ─────────────────────── */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <AnimatePresence>
          {sheetOpen && (
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="absolute inset-0 bg-[#111116] border-t border-white/[0.08] flex flex-col"
            >
              {/* Drag handle */}
              <div className="shrink-0 flex justify-center pt-2.5 pb-1">
                <div className="w-8 h-[3px] rounded-full bg-white/20" />
              </div>

              {/* Sheet header: title + close. Panel switching is the bottom nav's job — no
                  duplicate Captions/Style tabs here (frees vertical room for the panel). */}
              <div className="shrink-0 flex items-center border-b border-white/[0.06] px-3 h-10">
                <span className="text-[13px] font-bold text-white capitalize">
                  {sheetOpen === 'captions' ? 'Captions' : sheetOpen === 'cover' ? 'Cover' : 'Style'}
                </span>
                <div className="flex-1" />
                <button
                  onClick={closeSheet}
                  className="-mr-1 w-9 h-9 flex items-center justify-center rounded-lg text-zinc-500 active:text-zinc-200 cursor-pointer"
                  style={{ touchAction: 'manipulation' }}
                  title="Close this panel"
                  aria-label="Close panel"
                >
                  <X className="w-[18px] h-[18px]" />
                </button>
              </div>

              {/* Sheet content */}
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                {sheetOpen === 'captions' ? leftPanelEl : sheetOpen === 'cover' ? coverPanelEl : rightPanelEl}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom Tab Bar ───────────────────────────────────────────────────── */}
      <nav
        data-tour="m-tabs"
        className="flex shrink-0 bg-[#09090d] border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)]"
        aria-label="Editor panels"
      >
        {tabs.map(({ id, label, hint, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => handleTabClick(id)}
              title={hint}
              aria-label={`${label} — ${hint}`}
              aria-current={active ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[52px] relative cursor-pointer"
              style={{ touchAction: 'manipulation' }}
            >
              {active && (
                <motion.span
                  layoutId="capcut-tab-indicator"
                  className="absolute top-0 inset-x-[25%] h-[2px] rounded-full bg-amber-400"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <motion.span
                animate={{ scale: active ? 1.1 : 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <Icon
                  className={`w-[20px] h-[20px] transition-colors duration-200 ${active ? 'text-amber-400' : 'text-zinc-600'}`}
                  strokeWidth={active ? 2.25 : 1.75}
                />
              </motion.span>
              <span className={`text-[10px] font-semibold transition-colors duration-200 ${active ? 'text-amber-400' : 'text-zinc-600'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Long-press style picker (bottom sheet on mobile) */}
      {stylePicker && (
        <SegmentStylePicker
          segKeys={stylePicker.segKeys}
          currentEffectiveStyle={segmentStyleOverrides[stylePicker.segKeys[0]] ?? captionStyle}
          hasOverride={stylePicker.segKeys.some(k => k in segmentStyleOverrides)}
          x={0}
          y={0}
          mobile
          count={stylePicker.segKeys.length}
          onSelect={(style) => {
            onSegmentStyleChange(stylePicker.segKeys, style);
          }}
          onClose={() => { setStylePicker(null); setMultiSel(new Set()); }}
        />
      )}
    </div>
  );
}
