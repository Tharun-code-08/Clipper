'use client';

// Free-floating text overlays — the ONE component every surface renders (editor preview,
// Lambda composition, web-renderer twin, Element Capture stage), so text layers can never
// drift between preview and export. Animations are time-parameterized pure functions
// (lib/textAnims.ts) evaluated at the surface's own clock — no CSS transitions, so a
// per-frame capture always sees the correct pose.
//
// `editable` (preview only) adds the CapCut-style interactions:
//   drag         → move (x/yPercent)
//   double-click → INLINE text editing (type right on the video; Enter/blur commits, Esc cancels)
//   corner dot   → resize (font size for text, width for images)
// Every gesture pushes ONE undo step via the `undoable` flag on its first change.

import { useEffect, useRef, useState } from 'react';
// Img blocks the frame capture until the image has DECODED (delayRender under the hood) — a
// plain <img> intermittently misses from rendered frames. getRemotionEnvironment is a plain
// function, safe outside Remotion too, so the preview/EC keep the ordinary <img>.
import { Img, Sequence, useVideoConfig, getRemotionEnvironment } from 'remotion';
// PiP layers render as a real Remotion video on every rendering surface —
// @remotion/media's Video works on Lambda AND the in-browser web-renderer.
import { Video as RemotionMediaVideo } from '@remotion/media';
import type { TextLayer } from '@/types/textLayers';
import { animPose, glowShadow } from '@/lib/textAnims';
import { getFontFamily } from '@/lib/textParser';

interface TextLayerOverlayProps {
  layers: TextLayer[];
  /** SOURCE-clock ms (the same clock the layers' start/end use). */
  currentTimeMs: number;
  /** Preview only: whether the main video is playing — PiP layers play/pause with it. */
  playing?: boolean;
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, patch: Partial<TextLayer>, undoable?: boolean) => void;
  /** Image layers double-click here (their editing lives in the panel). */
  onEditRequest?: (id: string) => void;
}

export function TextLayerOverlay({
  layers, currentTimeMs, playing = false, editable = false, selectedId = null, onSelect, onChange, onEditRequest,
}: TextLayerOverlayProps) {
  const dragRef = useRef<{ id: string; startX: number; startY: number; x0: number; y0: number; el: HTMLElement; undone: boolean } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // CapCut on-screen guides: while dragging, layers magnet to the canvas centre
  // (guide lines flash) and a title-safe frame appears. Editable preview only —
  // exports render with editable=false and never see any of this.
  const [guides, setGuides] = useState<{ v: boolean; h: boolean; dragging: boolean }>({ v: false, h: false, dragging: false });
  const editRef = useRef<HTMLSpanElement | null>(null);

  // Focus + select-all when inline editing starts, so typing replaces the sample text.
  useEffect(() => {
    if (!editingId) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editingId]);

  if (!layers.length) return null;

  const beginDrag = (e: React.PointerEvent, l: TextLayer) => {
    if (!editable || editingId === l.id) return;
    e.stopPropagation();
    onSelect?.(l.id);
    const host = (e.currentTarget as HTMLElement).parentElement!; // the inset-0 stage
    dragRef.current = { id: l.id, startX: e.clientX, startY: e.clientY, x0: l.xPercent, y0: l.yPercent, el: host, undone: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const r = d.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // 3px dead-zone so a plain click never counts as a move (and never pushes undo).
    if (!d.undone && Math.abs(e.clientX - d.startX) < 3 && Math.abs(e.clientY - d.startY) < 3) return;
    let nx = Math.min(98, Math.max(2, d.x0 + ((e.clientX - d.startX) / r.width) * 100));
    let ny = Math.min(98, Math.max(2, d.y0 + ((e.clientY - d.startY) / r.height) * 100));
    // Magnetic centre: CapCut-style centring guides.
    const snapV = Math.abs(nx - 50) < 1.5;
    const snapH = Math.abs(ny - 50) < 1.5;
    if (snapV) nx = 50;
    if (snapH) ny = 50;
    setGuides({ v: snapV, h: snapH, dragging: true });
    onChange?.(d.id, { xPercent: Math.round(nx * 10) / 10, yPercent: Math.round(ny * 10) / 10 }, !d.undone);
    d.undone = true;
  };
  const endDrag = () => {
    dragRef.current = null;
    setGuides(g => (g.dragging || g.v || g.h ? { v: false, h: false, dragging: false } : g));
  };

  const beginResize = (e: React.PointerEvent, l: TextLayer) => {
    e.stopPropagation();
    if (!onChange) return;
    const handle = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    const sized = l.kind === 'image' || l.kind === 'video';
    const base = sized ? (l.widthPx ?? (l.kind === 'video' ? 120 : 80)) : l.fontSizePx;
    let undone = false;
    const move = (ev: PointerEvent) => {
      const k = 1 + (ev.clientX - startX) / 120;
      if (sized) {
        onChange(l.id, { widthPx: Math.round(Math.min(260, Math.max(24, base * k))) }, !undone);
      } else {
        onChange(l.id, { fontSizePx: Math.round(Math.min(80, Math.max(8, base * k))) }, !undone);
      }
      undone = true;
    };
    const up = () => handle.removeEventListener('pointermove', move);
    try { handle.setPointerCapture(e.pointerId); } catch { /* older engines */ }
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
  };

  const commitEdit = (l: TextLayer, cancel: boolean) => {
    const el = editRef.current;
    setEditingId(null);
    if (cancel || !el) return;
    const next = (el.textContent ?? '').replace(/\n+/g, ' ').trim();
    if (next && next !== l.text) onChange?.(l.id, { text: next }, true);
  };

  return (
    // zIndex 35: ABOVE GraphicsOverlay (25 idle / 31 editing) so text/PiP stay the topmost user
    // content on every surface. DOM order alone cannot guarantee this — GraphicsOverlay carries a
    // real z-index, and a positioned z-auto sibling always loses to it regardless of order.
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 35 }}>
      {/* On-screen guides — only while a layer is being dragged in the preview. */}
      {editable && guides.dragging && (
        <>
          {/* Title-safe frame: keeps text clear of TikTok/Reels UI chrome. */}
          <div style={{ position: 'absolute', inset: '5% 8%', border: '1px dashed rgba(255,255,255,0.18)', borderRadius: 6 }} />
          {guides.v && <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(45,212,191,0.9)' }} />}
          {guides.h && <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(45,212,191,0.9)' }} />}
        </>
      )}
      {layers.map((l) => {
        // While editing, the selected layer stays visible outside its time range (ghosted) so
        // the user can reposition it without chasing the playhead. Exports never ghost.
        const inRange = currentTimeMs >= l.startMs && currentTimeMs <= l.endMs;
        const ghost = editable && !inRange && l.id === selectedId;
        if (!inRange && !ghost) return null;

        const editing = editable && editingId === l.id;
        // Freeze the settled pose while typing so the box doesn't animate under the caret;
        // ghosted layers also hold the settled pose.
        const pose = editing || !inRange
          ? { opacity: 1, transform: 'none' as const }
          : animPose(l.anim, currentTimeMs - l.startMs, l.endMs - l.startMs);
        const isImage = l.kind === 'image' && !!l.imageDataUrl;
        const isVideo = l.kind === 'video' && !!l.pipUrl;
        const text = l.uppercase ? l.text.toUpperCase() : l.text;
        const shown = pose.clipChars != null ? text.slice(0, pose.clipChars) : text;
        const native = getFontFamily(l.text);
        const family = native !== 'system-ui, sans-serif' ? native : (l.fontFamily || 'Inter, sans-serif');
        const shadows: string[] = [];
        if (l.glow) shadows.push(glowShadow(l.color));
        if (l.shadow) shadows.push('0 2px 10px rgba(0,0,0,0.65)');
        const sel = editable && l.id === selectedId;

        const textStyle: React.CSSProperties = {
          display: 'inline-block',
          fontFamily: family,
          fontWeight: l.fontWeight ?? 800,
          fontStyle: l.italic ? 'italic' : 'normal',
          fontSize: l.fontSizePx,
          lineHeight: 1.15,
          color: l.color,
          letterSpacing: `${pose.letterSpacingEm ?? l.letterSpacingEm ?? 0}em`,
          textShadow: shadows.join(', ') || undefined,
          background: l.background || undefined,
          padding: l.background ? '0.18em 0.55em' : undefined,
          borderRadius: l.background ? '0.35em' : undefined,
          whiteSpace: l.widthPercent ? 'normal' : 'nowrap',
          opacity: pose.opacity,
          transform: pose.transform,
          filter: pose.filter,
          willChange: 'transform, opacity',
        };

        return (
          <div
            key={l.id}
            data-text-layer={l.id}
            onPointerDown={editable ? (e) => beginDrag(e, l) : undefined}
            onPointerMove={editable ? moveDrag : undefined}
            onPointerUp={editable ? endDrag : undefined}
            onDoubleClick={editable ? (e) => {
              e.stopPropagation();
              if (isImage || isVideo) onEditRequest?.(l.id);
              else { onSelect?.(l.id); setEditingId(l.id); }
            } : undefined}
            style={{
              position: 'absolute',
              top: `${l.yPercent}%`,
              left: `${l.xPercent}%`,
              width: l.widthPercent ? `${l.widthPercent}%` : 'max-content',
              maxWidth: '96%',
              // Static placement transform; the ANIMATED transform lives on the inner span so
              // dragging/selection geometry never fights the entrance motion.
              transform: `translate(-50%, -50%)${l.rotationDeg ? ` rotate(${l.rotationDeg}deg)` : ''}`,
              pointerEvents: editable ? 'auto' : 'none',
              cursor: editable && !editing ? 'move' : undefined,
              opacity: ghost ? 0.35 : 1,
              outline: sel ? '1.5px dashed rgba(245,158,11,0.9)' : 'none',
              outlineOffset: 4,
              textAlign: l.align ?? 'center',
              userSelect: editing ? 'text' : 'none',
            }}
          >
            {isVideo ? (
              getRemotionEnvironment().isRendering ? (
                <PipVideoRender l={l} pose={pose} />
              ) : (
                <PipVideoPreview l={l} pose={pose} currentTimeMs={currentTimeMs} playing={playing && inRange} />
              )
            ) : isImage ? (
              getRemotionEnvironment().isRendering ? (
                <Img
                  src={l.imageDataUrl!}
                  style={{
                    display: 'inline-block',
                    width: l.widthPx ?? 80,
                    filter: l.shadow ? 'drop-shadow(0 2px 8px rgba(0,0,0,0.55))' : undefined,
                    opacity: pose.opacity,
                    transform: pose.transform,
                  }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- data-URL sticker, next/image can't optimise it
                <img
                  src={l.imageDataUrl}
                  alt={l.text || 'sticker'}
                  draggable={false}
                  style={{
                    display: 'inline-block',
                    width: l.widthPx ?? 80,
                    filter: l.shadow ? 'drop-shadow(0 2px 8px rgba(0,0,0,0.55))' : undefined,
                    opacity: pose.opacity,
                    transform: pose.transform,
                    willChange: 'transform, opacity',
                  }}
                />
              )
            ) : editing ? (
              <span
                ref={editRef}
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit(l, false); }
                  if (e.key === 'Escape') { e.preventDefault(); commitEdit(l, true); }
                  e.stopPropagation();
                }}
                onBlur={() => commitEdit(l, false)}
                style={{ ...textStyle, opacity: 1, transform: 'none', filter: undefined, outline: 'none', cursor: 'text', minWidth: 12 }}
              >
                {l.uppercase ? l.text.toUpperCase() : l.text}
              </span>
            ) : (
              <span style={textStyle}>{shown}</span>
            )}

            {/* Corner resize dot — CapCut-style scale for the selected layer. */}
            {sel && !editing && (
              <div
                onPointerDown={(e) => beginResize(e, l)}
                title="Drag to resize"
                style={{
                  position: 'absolute', right: -9, bottom: -9, width: 14, height: 14,
                  borderRadius: '50%', background: '#f59e0b', border: '2px solid #fff',
                  cursor: 'nwse-resize', pointerEvents: 'auto',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const pipStyle = (l: TextLayer, pose: { opacity?: number; transform?: string }): React.CSSProperties => ({
  display: 'inline-block',
  width: l.widthPx ?? 120,
  // A keyed layer has no rectangle any more — rounding its corners is moot,
  // and the drop-shadow correctly hugs the keyed silhouette instead.
  borderRadius: l.chromaKey ? undefined : 8,
  filter: [
    l.chromaKey ? `url(#ck-${l.id})` : null,
    l.shadow ? 'drop-shadow(0 2px 8px rgba(0,0,0,0.55))' : null,
  ].filter(Boolean).join(' ') || undefined,
  opacity: pose.opacity,
  transform: pose.transform,
});

/** Chroma key as an SVG filter — the SAME def + `filter: url()` renders on every
 *  surface (preview, Lambda, box, web-renderer, Element Capture), so the keyed
 *  result can't drift between preview and export. Two colour-matrix masks
 *  (key − R and key − B/G) screen-combined approximate alpha = 1 − s·(key −
 *  max(other two) − t): pure key colour drops out, yellows/skin/black survive
 *  (the offset keeps black opaque — the classic single-matrix keyer bug). */
function ChromaKeyDefs({ l }: { l: TextLayer }) {
  const strength = Math.min(1, Math.max(0, l.chromaStrength ?? 0.5));
  const s = (5 + 5 * strength).toFixed(3);
  const o = (1 + (5 + 5 * strength) * (0.25 - 0.2 * strength)).toFixed(3);
  const white = '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ';
  const [m1, m2] = l.chromaKey === 'blue'
    ? [`${white}${s} 0 -${s} 0 ${o}`, `${white}0 ${s} -${s} 0 ${o}`]
    : [`${white}${s} -${s} 0 0 ${o}`, `${white}0 -${s} ${s} 0 ${o}`];
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter id={`ck-${l.id}`} colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values={m1} result="m1" />
        <feColorMatrix in="SourceGraphic" type="matrix" values={m2} result="m2" />
        {/* screen(a1, a2) = a1 + a2 − a1·a2 — opaque if EITHER mask keeps the pixel */}
        <feComposite in="m1" in2="m2" operator="arithmetic" k1="-1" k2="1" k3="1" k4="0" result="mask" />
        <feComposite in="SourceGraphic" in2="mask" operator="in" />
      </filter>
    </svg>
  );
}

/** Rendering surfaces (Lambda / box / in-browser web-renderer): the PiP is a real
 *  Remotion video sequenced at the layer's window, so every frame decodes
 *  deterministically at exactly compositionTime − startMs. */
function PipVideoRender({ l, pose }: { l: TextLayer; pose: { opacity?: number; transform?: string } }) {
  const { fps } = useVideoConfig();
  if (!l.pipUrl) return null;
  const from = Math.round((l.startMs / 1000) * fps);
  const dur = Math.max(1, Math.round(((l.endMs - l.startMs) / 1000) * fps));
  return (
    <Sequence from={from} durationInFrames={dur} layout="none">
      {l.chromaKey && <ChromaKeyDefs l={l} />}
      <RemotionMediaVideo src={l.pipUrl} muted={!!l.pipMuted} style={pipStyle(l, pose)} />
    </Sequence>
  );
}

/** Editor preview + Element Capture: a plain <video> drift-synced to the layer's
 *  clock — plays/pauses with the main video, seeks only when drift exceeds the
 *  threshold so playback stays smooth. */
function PipVideoPreview({ l, pose, currentTimeMs, playing }: {
  l: TextLayer; pose: { opacity?: number; transform?: string }; currentTimeMs: number; playing: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const want = Math.max(0, (currentTimeMs - l.startMs) / 1000);
    if (playing) {
      if (v.paused) v.play().catch(() => {});
      if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - want) > 0.05) v.currentTime = want;
    }
  }, [currentTimeMs, playing, l.startMs]);
  return (
    <>
      {l.chromaKey && <ChromaKeyDefs l={l} />}
      <video
        ref={ref}
        data-pip-video={l.id}
        src={l.pipUrl}
        muted={!!l.pipMuted}
        playsInline
        preload="auto"
        style={{ ...pipStyle(l, pose), pointerEvents: 'none' }}
      />
    </>
  );
}
