'use client';

import { useEffect, useRef, useState } from 'react';
import type { CaptionBoxConfig } from '@/types/transcript';

interface CaptionBoundingBoxProps {
  box:                 CaptionBoxConfig;
  canvasW:             number;
  canvasH:             number;
  onBoxChange:         (box: CaptionBoxConfig) => void;
  onApplyScope:        (scope: 'all' | 'block') => void;
  /** Discard an uncommitted drag preview (Escape / cancelled pointer). */
  onCancelScope?:      () => void;
  /** The scope panel was dismissed by interacting OUTSIDE it (Export button, side panels, any
   *  other control) — the parent resolves the pending gesture (commit or revert) instead of it
   *  silently outliving the panel. Falls back to onCancelScope when omitted. */
  onOutsideResolve?:   () => void;
  /** Number of caption segments selected in the timeline — labels the "Only selected" button. */
  selectedCount?:      number;
  /** How many captions a 'block' (per-caption) commit would actually write to: the timeline
   *  selection if any, else the caption under the playhead. 0 means there is no per-caption
   *  target at all, so the scope choice is meaningless and a release commits globally. */
  blockTargetCount?:   number;
  visible:             boolean;
  fontScale?:          number;
  onFontScaleChange?:  (scale: number) => void;
  /** Manual-commit mode (mobile "Position" overlay): drag/resize still PREVIEW via onBoxChange,
   *  but releasing never auto-applies a scope or shows the inline popup — an external footer
   *  commits via onApplyScope. Handles stay visible so the box reads as editable. */
  manualCommit?:       boolean;
  /** On-screen scale of the logical canvas ((zoom/100)*fitScale). Pointer deltas arrive in screen
   *  px; dividing by this converts them to logical-canvas px so the box tracks the finger 1:1 even
   *  on a small phone preview (where fitScale ≪ 1). */
  displayScale?:       number;
  /** "Behind the subject": current state of the target caption(s) + toggle. When the callback is
   *  omitted the button is hidden. */
  behindSubject?:      boolean;
  /** How many captions the toggle affects (selection, else 1 if on a caption, else 0 = disabled). */
  behindSubjectCount?: number;
  onToggleBehindSubject?: (on: boolean) => void;
  /** CSS selector of the element whose height auto-sizes this box. Defaults to the lower caption's
   *  marker; the "Big Reveal" title box passes its own marker so the two boxes measure independently. */
  contentSelector?:    string;
  /** Short tag shown at the box's top-left to distinguish it (e.g. "Title" vs "Caption"). */
  label?:              string;
  /** Border / label accent colour when active (defaults to white). Lets the title box read distinctly. */
  accent?:             string;
}

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLE_SIZE = 16; // larger for touch targets

const HANDLES: { dir: HandleDir; style: React.CSSProperties }[] = [
  { dir: 'nw', style: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nw-resize' } },
  { dir: 'n',  style: { top: -HANDLE_SIZE / 2, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' } },
  { dir: 'ne', style: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'ne-resize' } },
  { dir: 'e',  style: { top: '50%', right: -HANDLE_SIZE / 2, transform: 'translateY(-50%)', cursor: 'e-resize' } },
  { dir: 'se', style: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'se-resize' } },
  { dir: 's',  style: { bottom: -HANDLE_SIZE / 2, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' } },
  { dir: 'sw', style: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'sw-resize' } },
  { dir: 'w',  style: { top: '50%', left: -HANDLE_SIZE / 2, transform: 'translateY(-50%)', cursor: 'w-resize' } },
];

export function CaptionBoundingBox({
  box, canvasW, canvasH, onBoxChange, onApplyScope, onCancelScope, onOutsideResolve,
  selectedCount = 0, blockTargetCount = selectedCount, visible,
  fontScale = 1, onFontScaleChange, manualCommit = false, displayScale = 1,
  behindSubject = false, behindSubjectCount = 0, onToggleBehindSubject,
  contentSelector = '[data-caption-content="true"]', label, accent,
}: CaptionBoundingBoxProps) {
  // Guard against a transient 0 (pre-measure) so we never divide by zero.
  const scale = displayScale > 0.01 ? displayScale : 1;
  const [showPanel,     setShowPanel]     = useState(false);
  // What the scope panel is committing: a MOVE commits position; a RESIZE commits size (width +
  // font scale). Drives the panel heading so the user knows what the choice applies to.
  const [gesture,       setGesture]       = useState<'move' | 'resize'>('move');
  const [contentHeight, setContentHeight] = useState(40);
  const peakHeightRef = useRef(40);

  // When the box geometry changes the caption text re-wraps, so the measured peak height is stale
  // and must drop back to the 40px floor (the ResizeObserver below then re-measures upward). Uses
  // React's "store the previous value in STATE and adjust during render" pattern — no setState in
  // an effect, and no ref read during render. (The peak ref itself is reset inside the effect.)
  const geomKey = `${box.widthPercent}|${box.xPercent}`;
  const [prevGeom, setPrevGeom] = useState(geomKey);
  if (prevGeom !== geomKey) {
    setPrevGeom(geomKey);
    setContentHeight(40);
  }

  const dragState = useRef<{
    type:           'move' | 'resize';
    dir?:           HandleDir;
    startX:         number;
    startY:         number;
    startBox:       CaptionBoxConfig;
    startFontScale: number;
  } | null>(null);
  const pointerMoved = useRef(false);
  const rootRef      = useRef<HTMLDivElement>(null);

  const pxToPercX = (px: number) => (px / canvasW) * 100;
  const pxToPercY = (px: number) => (px / canvasH) * 100;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // ── Main box: move by drag, show panel on tap ────────────────────────────────
  const onMainPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerMoved.current = false;
    dragState.current = {
      type: 'move', startX: e.clientX, startY: e.clientY,
      startBox: box, startFontScale: fontScale,
    };
  };

  const onMainPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || dragState.current.type !== 'move') return;
    const { startX, startY, startBox } = dragState.current;
    const rawDx = e.clientX - startX;
    const rawDy = e.clientY - startY;
    if (Math.abs(rawDx) > 4 || Math.abs(rawDy) > 4) pointerMoved.current = true;
    if (!pointerMoved.current) return;
    e.preventDefault();
    // Convert screen px → logical-canvas px so the box follows the finger exactly at any scale.
    const dx = rawDx / scale, dy = rawDy / scale;
    onBoxChange({
      ...startBox,
      xPercent: clamp(startBox.xPercent + pxToPercX(dx), startBox.widthPercent / 2, 100 - startBox.widthPercent / 2),
      yPercent: clamp(startBox.yPercent + pxToPercY(dy), 5, 95),
    });
  };

  const onMainPointerUp = () => {
    // Manual-commit (position overlay): the drag already previewed via onBoxChange; an external
    // footer commits the scope. Never auto-apply or toggle the inline popup here.
    if (manualCommit) { dragState.current = null; pointerMoved.current = false; return; }
    if (pointerMoved.current) {
      // Released after a move: ALWAYS ask for the scope while a per-caption target exists.
      // This used to auto-apply 'all' whenever nothing was selected in the timeline — so the
      // natural gesture (scrub to a caption, drag its box) silently repositioned every caption
      // AND wiped every per-caption position already set. Only commit globally when there is
      // genuinely nothing per-caption to target (no caption under the playhead).
      setGesture('move');
      if (blockTargetCount > 0) setShowPanel(true);
      else onApplyScope('all');
    } else {
      setGesture('move');
      setShowPanel(p => !p);
    }
    dragState.current = null;
  };

  // ── Handle: resize by drag ───────────────────────────────────────────────────
  const onHandlePointerDown = (dir: HandleDir, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      type: 'resize', dir, startX: e.clientX, startY: e.clientY,
      startBox: box, startFontScale: fontScale,
    };
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || dragState.current.type !== 'resize') return;
    e.preventDefault();
    const { dir, startX, startY, startBox, startFontScale } = dragState.current;
    // Screen px → logical-canvas px (÷ scale) before converting to percent — matches the move.
    const dx = pxToPercX((e.clientX - startX) / scale);
    const dy = pxToPercY((e.clientY - startY) / scale);

    if (dir === 'e' || dir === 'ne' || dir === 'se') {
      const newW = clamp(startBox.widthPercent + dx * 2, 20, 98);
      onBoxChange({ ...startBox, widthPercent: newW });
      onFontScaleChange?.(clamp(startFontScale * (newW / startBox.widthPercent), 0.3, 4.0));
    } else if (dir === 'w' || dir === 'nw' || dir === 'sw') {
      const newW = clamp(startBox.widthPercent - dx * 2, 20, 98);
      onBoxChange({ ...startBox, widthPercent: newW });
      onFontScaleChange?.(clamp(startFontScale * (newW / startBox.widthPercent), 0.3, 4.0));
    } else if (dir === 'n' || dir === 's') {
      onBoxChange({ ...startBox, yPercent: clamp(startBox.yPercent + dy, 5, 95) });
    }
  };

  const onHandlePointerUp = () => {
    // Manual-commit: leave the previewed resize for the external footer to commit.
    if (manualCommit) { dragState.current = null; return; }
    // Same commit rule as a move: prompt for scope whenever a per-caption target exists.
    if (dragState.current?.type === 'resize') {
      setGesture('resize');
      if (blockTargetCount > 0) setShowPanel(true);
      else onApplyScope('all');
    }
    dragState.current = null;
  };

  // ── Content height tracking ──────────────────────────────────────────────────
  // Re-runs when the geometry changes (geomKey): resets the peak ref (a ref write in an effect is
  // fine) and re-observes the caption element to measure its new wrapped height.
  useEffect(() => {
    peakHeightRef.current = 40;
    let active = true;
    let observer: ResizeObserver | null = null;
    let currentObserved: Element | null = null;

    const measure = (el: HTMLElement) => {
      const h = el.clientHeight;
      if (h > peakHeightRef.current) {
        peakHeightRef.current = h;
        setContentHeight(h);
      }
    };

    const checkAndObserve = () => {
      if (!active) return;
      const el = document.querySelector(contentSelector) as HTMLElement | null;
      if (el && el !== currentObserved) {
        if (observer) observer.disconnect();
        observer = new ResizeObserver(() => { if (active) measure(el); });
        observer.observe(el);
        currentObserved = el;
        measure(el);
        return;
      }
      if (!currentObserved) requestAnimationFrame(checkAndObserve);
    };

    checkAndObserve();
    return () => { active = false; if (observer) observer.disconnect(); };
  }, [geomKey, contentSelector]);

  // Escape = explicit abort: discard the uncommitted preview.
  useEffect(() => {
    if (!showPanel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { onCancelScope?.(); setShowPanel(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPanel, onCancelScope]);

  // While the scope panel is open, ANY pointerdown outside the box+panel resolves the pending
  // gesture via onOutsideResolve. Previously only a canvas-sized backdrop caught dismissal, so
  // clicking a control OUTSIDE the canvas — the Export button, the Text tab — left the gesture
  // pending forever: the preview kept showing the moved/resized captions while the export
  // payload carried the committed (default) box. Capture phase so the resolution is flushed
  // before the outside control handles its own events — an Export click must build its render
  // payload AFTER the commit, not before.
  useEffect(() => {
    if (!showPanel) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      (onOutsideResolve ?? onCancelScope)?.();
      setShowPanel(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [showPanel, onOutsideResolve, onCancelScope]);

  // The browser stole the pointer mid-gesture (touch scroll, tab switch, alt-tab): without this
  // the drag never reaches pointerup, so no scope panel opens and the pending preview lingers
  // unresolvable — the same preview/export divergence as an ignored panel. Revert the preview;
  // manual-commit mode keeps it (its external footer owns the commit and prior nudges must
  // survive a stray cancelled drag).
  const onPointerCancel = () => {
    const wasDragging = !!dragState.current;
    dragState.current = null;
    pointerMoved.current = false;
    if (wasDragging && !manualCommit) onCancelScope?.();
  };

  if (!visible) return null;

  const widthPx  = (box.widthPercent / 100) * canvasW;
  const leftPx   = (box.xPercent / 100) * canvasW - widthPx / 2;
  const topPx    = (box.yPercent / 100) * canvasH;
  const heightPx = Math.max(40, contentHeight);

  return (
    <>
      {/* Interaction blocker under the panel — dismissal itself is handled by the window-level
          pointerdown listener above (which also covers clicks OUTSIDE the canvas). */}
      {showPanel && <div className="absolute inset-0 z-30" />}

      <div
        ref={rootRef}
        className="absolute z-40"
        style={{
          left:        leftPx,
          top:         topPx,
          width:       widthPx,
          height:      heightPx,
          transform:   'translateY(-50%)',
          cursor:      'move',
          border:      (showPanel || manualCommit)
            ? `1px dashed ${accent ?? 'rgba(255,255,255,0.55)'}`
            : `1px dashed ${accent ? accent : 'rgba(255,255,255,0.22)'}`,
          opacity:     (showPanel || manualCommit) ? 1 : (accent ? 0.55 : 1),
          boxSizing:   'border-box',
          touchAction: 'none',
        }}
        onPointerDown={onMainPointerDown}
        onPointerMove={onMainPointerMove}
        onPointerUp={onMainPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* Distinguishing tag (e.g. "Title" vs "Caption") when two boxes are on screen at once. */}
        {label && (
          <div
            className="absolute -top-[7px] left-1 px-1.5 rounded text-[9px] font-semibold leading-[14px] pointer-events-none"
            style={{ background: accent ?? 'rgba(255,255,255,0.55)', color: '#1a1a1a' }}
          >
            {label}
          </div>
        )}

        {/* Resize handles — always rendered but visible only when panel open */}
        {HANDLES.map(h => (
          <div
            key={h.dir}
            className="absolute bg-white border border-zinc-600 rounded-sm transition-opacity duration-150"
            style={{
              width:       HANDLE_SIZE,
              height:      HANDLE_SIZE,
              opacity:     (showPanel || manualCommit) ? 1 : 0,
              touchAction: 'none',
              ...h.style,
            }}
            onPointerDown={(e) => onHandlePointerDown(h.dir, e)}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onPointerCancel}
          />
        ))}

        {showPanel && (
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50
                       bg-zinc-900/95 border border-white/15 rounded-lg shadow-2xl
                       flex flex-col gap-1 p-2 min-w-max"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {onToggleBehindSubject && (
              <>
                {behindSubjectCount > 0 ? (
                  <button
                    className={`text-xs rounded-md px-3 py-1.5 font-medium transition-colors text-left flex items-center justify-between gap-3 ${
                      behindSubject ? 'bg-emerald-500 hover:bg-emerald-400 text-white' : 'text-white bg-zinc-700 hover:bg-zinc-600'}`}
                    onClick={(e) => { e.stopPropagation(); onToggleBehindSubject(!behindSubject); }}
                  >
                    <span>Behind the subject{behindSubjectCount > 1 ? ` (${behindSubjectCount} captions)` : ''}</span>
                    <span className="text-[10px] opacity-90">{behindSubject ? '✓ On' : 'Off'}</span>
                  </button>
                ) : (
                  <div className="text-[10.5px] text-zinc-400 bg-zinc-800/60 rounded-md px-3 py-1.5 text-left">
                    Behind the subject — move the playhead onto a caption (or select captions) first
                  </div>
                )}
                <div className="h-px bg-white/10 my-1" />
              </>
            )}
            <p className="text-[10px] text-zinc-400 font-medium px-1 pb-0.5">
              {gesture === 'resize' ? 'Apply size to:' : 'Apply position to:'}
            </p>
            {/* Per-caption first: it's the non-destructive choice, and the one users reach for
                most. "All captions" REPLACES every per-caption position, so it's labelled as
                such instead of reading like a harmless default. */}
            {blockTargetCount > 0 && (
              <button
                className="text-xs text-white bg-amber-500 hover:bg-amber-400
                           rounded-md px-3 py-1.5 font-medium transition-colors text-left"
                onClick={(e) => { e.stopPropagation(); onApplyScope('block'); setShowPanel(false); }}
              >
                {blockTargetCount > 1 ? `Only selected (${blockTargetCount})` : 'Only this caption'}
              </button>
            )}
            <button
              className={`text-xs rounded-md px-3 py-1.5 font-medium transition-colors text-left ${
                blockTargetCount > 0
                  ? 'text-white bg-zinc-700 hover:bg-zinc-600'
                  : 'text-white bg-amber-500 hover:bg-amber-400'}`}
              onClick={(e) => { e.stopPropagation(); onApplyScope('all'); setShowPanel(false); }}
            >
              <span>All captions</span>
              {blockTargetCount > 0 && (
                <span className="block text-[9.5px] font-normal opacity-70 leading-tight">
                  {gesture === 'resize' ? 'replaces every per-caption size' : 'replaces every per-caption position'}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
