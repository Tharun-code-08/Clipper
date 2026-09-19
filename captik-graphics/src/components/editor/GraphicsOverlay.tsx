'use client';

// The ONE renderer for scene / overlay graphics.
//
// Mounted identically by the editor preview (VideoCanvas) and by every export surface
// (LambdaCaptionComposition, CaptionExportComposition, ECStage). Preview and export therefore
// agree BY CONSTRUCTION — the same component, driven by the same millisecond. This is the lesson
// the caption system learned the hard way: it once had a second, independently-tuned Lambda
// renderer, and exports came out a different font/size/weight than the preview.
// DO NOT add a second graphics renderer.
//
// TIMES ARE SOURCE-CLOCK MILLISECONDS — the same clock as TranscriptWord.startMs and the
// `currentTimeMs` CaptionOverlay receives. Not output time, not frames.
//
// `editable` is the only thing that differs between the editor and an export: it adds selection
// chrome, drag/resize and pointer events. Exports leave it false and get a pure render.

import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GraphicsBox, GraphicsInstance } from '@/types/graphics';
import { elementStyler, getGraphicsTemplate, resolveParams } from '@/lib/graphics/registry';
import { useImportedTemplatesFor } from '@/lib/graphics/useImportedTemplates';
import {
  cinemaBloomStyle, cinemaContactShadow, cinemaFilter, cinemaGrainStyle, cinemaOf,
  cinemaTransform, cinemaVignetteStyle,
} from '@/lib/graphics/cinema';

/** The four scale handles. Hoisted to module scope deliberately: rebuilding this array every
 *  render makes the React compiler lint plugin give up on the whole subtree. */
const HANDLES = [
  { key: 'tl', top: true,  left: true,  sign: -1, cursor: 'nwse-resize' },
  { key: 'tr', top: true,  left: false, sign:  1, cursor: 'nesw-resize' },
  { key: 'bl', top: false, left: true,  sign: -1, cursor: 'nesw-resize' },
  { key: 'br', top: false, left: false, sign:  1, cursor: 'nwse-resize' },
] as const;

/** Pointer travel, in screen px, before a press becomes a drag. Without it a plain click to
 *  select would push an undo entry and nudge the graphic by a pixel. */
const DRAG_DEADZONE_PX = 3;
/** Half-width of the magnetic centre snap, in canvas percent. */
const SNAP_PCT = 1.6;

export interface GraphicsOverlayProps {
  graphics: readonly GraphicsInstance[];
  /** Source-clock ms. Identical to the value handed to CaptionOverlay on the same surface. */
  currentTimeMs: number;
  /** Logical canvas size in px. Preview: VideoCanvas's canvasW/canvasH. Export: logicalCanvasSize(). */
  canvasWidthPx: number;
  canvasHeightPx: number;
  /** Editor only — adds selection chrome and enables pointer events. Exports pass nothing. */
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, patch: Partial<GraphicsInstance>, undoable?: boolean) => void;
  /** On-screen px per canvas px (zoom x fit). Needed to convert pointer travel into canvas %. */
  displayScale?: number;
}

type Drag =
  | { kind: 'move'; id: string; x: number; y: number; box: GraphicsBox; moved: boolean }
  | { kind: 'resize'; id: string; x: number; box: GraphicsBox; moved: boolean; sign: 1 | -1 };

export default function GraphicsOverlay({
  graphics,
  currentTimeMs,
  canvasWidthPx,
  canvasHeightPx,
  editable = false,
  selectedId = null,
  onSelect,
  onChange,
  displayScale = 1,
}: GraphicsOverlayProps) {
  const drag = useRef<Drag | null>(null);
  const [snap, setSnap] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });

  // The imported library is a separate chunk. This is the ONE place every drawing surface passes
  // through — preview, the two Remotion compositions and the in-browser export all mount this
  // component — so asking for the chunk here means no surface can forget to. It only fires when
  // the project actually places an imported graphic; a project without one never pays for it.
  useImportedTemplatesFor(graphics);

  const ds = displayScale || 1;
  const clampPct = (v: number) => Math.min(100, Math.max(0, v));

  function begin(e: ReactPointerEvent, g: GraphicsInstance, kind: 'move' | 'resize', sign: 1 | -1 = 1) {
    onSelect?.(g.id);
    if (!onChange) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = kind === 'move'
      ? { kind, id: g.id, x: e.clientX, y: e.clientY, box: g.box, moved: false }
      : { kind, id: g.id, x: e.clientX, box: g.box, moved: false, sign };
  }

  function move(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d || !onChange) return;
    const dx = (e.clientX - d.x) / ds;
    const dy = d.kind === 'move' ? (e.clientY - d.y) / ds : 0;
    if (!d.moved && Math.hypot(dx * ds, dy * ds) < DRAG_DEADZONE_PX) return;
    // First real movement pushes ONE undo entry; the rest of the drag is a plain state update.
    const first = !d.moved;
    d.moved = true;

    if (d.kind === 'resize') {
      // Outward = wider, whichever corner you grabbed — hence `sign`, which is -1 on the left-hand
      // handles. Doubling the delta keeps the handle under the pointer, because the box grows from
      // its centre.
      const next = d.box.widthPercent + (d.sign * dx / canvasWidthPx) * 200;
      onChange(d.id, { box: { ...d.box, widthPercent: Math.min(100, Math.max(5, next)) } }, first);
      return;
    }

    let x = d.box.xPercent + (dx / canvasWidthPx) * 100;
    let y = d.box.yPercent + (dy / canvasHeightPx) * 100;
    const sx = Math.abs(x - 50) < SNAP_PCT;
    const sy = Math.abs(y - 50) < SNAP_PCT;
    if (sx) x = 50;
    if (sy) y = 50;
    setSnap({ x: sx, y: sy });
    onChange(d.id, { box: { ...d.box, xPercent: clampPct(x), yPercent: clampPct(y) } }, first);
  }

  function end(e: ReactPointerEvent) {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    drag.current = null;
    setSnap({ x: false, y: false });
  }

  if (!graphics.length) return null;

  const ordered = [...graphics].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  return (
    // data-cfont-lock is LOAD-BEARING, not decoration. buildCustomFontCss()
    // (KineticCaptionComposition.tsx:118-131) emits a GLOBAL
    //     span:not([data-cfont-lock] *) { font-family: "CaptikCustomFontData", … !important }
    // which LambdaCaptionComposition injects document-wide. The preview's copy of that rule is
    // scoped to the caption wrapper, so without this attribute a user who has picked a custom
    // font would see every graphics template silently re-fonted IN THE EXPORT ONLY.
    // registry.spec.ts asserts this attribute is present. DO NOT REMOVE.
    <div
      data-cfont-lock
      data-captik-graphics
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        pointerEvents: 'none',
        // Below CaptionBoundingBox (z-30) when idle so it never eats the caption box's drags;
        // above it while the Graphics tab is open, which is when VideoCanvas hides that box.
        zIndex: editable ? 31 : 25,
      }}
    >
      {editable && (snap.x || snap.y) && (
        <>
          {snap.x && <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(245,158,11,0.85)' }} />}
          {snap.y && <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(245,158,11,0.85)' }} />}
        </>
      )}

      {ordered.map((g) => {
        const tpl = getGraphicsTemplate(g.templateId);
        if (!tpl || g.hidden) return null;

        const local = currentTimeMs - g.startMs;
        const inRange = local >= 0 && local <= g.durationMs;
        // A graphic renders ONLY inside its window — no faint "ghost" outside it. The old
        // 35%-opacity frozen ghost read as a dead broken template stuck on the preview
        // (founder-rejected); positioning is handled by seeking INTO the clip on add/select
        // instead, and the timeline's drop block is the position affordance while dragging.
        if (!inRange) return null;

        const timeMs = Math.min(Math.max(local, 0), g.durationMs);
        // fullBleed templates hug the REAL video frame: no box, no scale transform — render()
        // receives the actual canvas size and must lay out for any aspect ratio. Everything else
        // is a sticker scaled from its drawn canvas into the instance box — and that canvas's
        // HEIGHT honours the instance aspect override: the template re-lays out for the new
        // shape (render() gets the reshaped canvas), it is never stretched.
        const fullBleed = !!tpl.fullBleed;
        const drawnW = tpl.design.w;
        const drawnH = !fullBleed && g.aspect && g.aspect > 0 ? drawnW / g.aspect : tpl.design.h;
        const scale = fullBleed ? 1 : (canvasWidthPx * (g.box.widthPercent / 100)) / drawnW;
        const params = resolveParams(tpl, g.params);
        const selected = editable && g.id === selectedId;
        // Instance override wins; otherwise the template says whether it wants the shared plate.
        // A frame-filling effect never gets one — it would black out the entire video.
        const withBackdrop = !fullBleed && (g.backdrop ?? tpl.backdrop !== false);
        // Counter-scale chrome so outlines and handles stay a constant on-screen size at any zoom.
        const px = (n: number) => n / (scale * ds);

        // ── Cinema finish: computed ONCE per instance, applied to every template identically.
        const cine = cinemaOf(g.cinema);
        const fw = fullBleed ? canvasWidthPx : drawnW;
        const fh = fullBleed ? canvasHeightPx : drawnH;
        // fullBleed = frame-locked: the finish may light it, but nothing may lean or slide it
        // off the frame edges it exists to cover.
        const camCss = cinemaTransform(cine, timeMs, g.durationMs, fw, fh, fullBleed);
        const contentFilter = cinemaFilter(cine, fw, fh);
        const bloomStyle = cinemaBloomStyle(cine, fw, fh);
        const grainStyle = cinemaGrainStyle(cine);
        const vignetteStyle = cinemaVignetteStyle(cine);
        // Rendered ONCE; the bloom layer reuses this element description rather than re-running
        // the template (render() is pure, but a second call is a second full build).
        const content = tpl.render({
          params,
          // fullBleed renders in real canvas px — rescale design-px nudges to match, or the
          // same nudge lands at different physical distances in preview vs export.
          el: elementStyler(tpl, params, fullBleed
            ? Math.min(canvasWidthPx, canvasHeightPx) / Math.min(tpl.design.w, tpl.design.h)
            : 1),
          timeMs,
          durationMs: g.durationMs,
          width: fw,
          height: fh,
          seed: g.id,
        });

        return (
          <div
            key={g.id}
            data-graphic={g.id}
            // A fullBleed graphic is selectable (click → params) but not draggable — there is
            // nowhere to drag a thing that is the whole frame.
            onPointerDown={editable ? (fullBleed ? (e) => { e.stopPropagation(); onSelect?.(g.id); } : (e) => begin(e, g, 'move')) : undefined}
            onPointerMove={editable && !fullBleed ? move : undefined}
            onPointerUp={editable && !fullBleed ? end : undefined}
            onPointerCancel={editable && !fullBleed ? end : undefined}
            style={fullBleed ? {
              position: 'absolute', inset: 0,
              // Camera + tilt on a frame-filling effect too: it is still an object in the scene.
              transform: camCss || undefined,
              transformOrigin: 'center center',
              opacity: g.opacity ?? 1,
              pointerEvents: editable ? 'auto' : 'none',
              touchAction: editable ? 'none' : undefined,
              outline: selected ? `${2 / ds}px dashed rgba(245,158,11,0.9)` : undefined,
              outlineOffset: selected ? `${-2 / ds}px` : undefined,
            } : {
              position: 'absolute',
              left: `${g.box.xPercent}%`,
              top: `${g.box.yPercent}%`,
              width: drawnW,
              height: drawnH,
              // Centre the element on (box.xPercent, box.yPercent), then scale design px → canvas px.
              // The transform list and transformOrigin must be read together: with origin 0 0 the
              // matrix is S·R·T(-50%,-50%), which maps the element's centre exactly onto the anchor
              // and rotates about that centre. (The `translate(-50%,-50%) scale(s)` spelling with
              // origin `center` resolves to the identical matrix — do not "fix" one into the other
              // and change only half of the pair, which is what actually breaks it.)
              // The cinema camera/tilt goes AFTER the placement scale and BEFORE the centring
              // translate, so it operates in the graphic's own space (a tilt must pivot about the
              // graphic's centre, not about the canvas anchor).
              transform:
                `scale(${scale})` +
                (g.rotationDeg ? ` rotate(${g.rotationDeg}deg)` : '') +
                (camCss ? ` ${camCss}` : '') +
                ' translate(-50%,-50%)',
              transformOrigin: '0 0',
              opacity: g.opacity ?? 1,
              pointerEvents: editable ? 'auto' : 'none',
              cursor: editable ? 'move' : undefined,
              touchAction: editable ? 'none' : undefined,
              outline: selected ? `${px(2)}px dashed rgba(245,158,11,0.9)` : undefined,
            }}
          >
            {/* The shared dark plate — for bare content that would be unreadable floating raw
                over bright footage. The template declares whether it wants one by default
                (templates that paint their own container, and transparent-by-design overlays,
                declare backdrop:false); the Arrange section's Background toggle overrides per
                instance. Drawn INSIDE the instance box, so every render surface (preview, EC,
                both Remotion comps) gets it for free. */}
            {withBackdrop && (
              <div
                style={{
                  position: 'absolute', inset: 0,
                  // Luxe glass plate (see lib/graphics/luxe.ts): near-black gradient,
                  // hairline border, deep shadow — inlined because this div is sized by
                  // the instance box, not a template design canvas.
                  background: 'linear-gradient(180deg, #1A190F 0%, #0B0B0D 100%)',
                  border: '1px solid rgba(255,255,255,0.13)',
                  boxShadow: [
                    '0 24px 70px rgba(0,0,0,0.5)',
                    'inset 0 1px 0 rgba(255,255,255,0.06)',
                    // A tilted plate whose shadow stays centred underneath reads as a sticker;
                    // this one leans opposite the tilt so the card stands in a lit space.
                    fullBleed ? undefined : cinemaContactShadow(cine, drawnW, drawnH),
                  ].filter(Boolean).join(', '),
                  borderRadius: Math.round(Math.min(drawnW, drawnH) * 0.05),
                }}
              />
            )}

            {/* ── THE CINEMA STACK ──────────────────────────────────────────────────────────
                Bloom copy → crisp graded copy → grain → vignette. `content` is rendered ONCE
                and reused by reference: the bloom layer paints the same element description a
                second time rather than re-running the template. See lib/graphics/cinema.ts. */}
            {bloomStyle && <div style={bloomStyle} aria-hidden>{content}</div>}
            <div style={{ position: 'absolute', inset: 0, filter: contentFilter }}>
              {content}
            </div>
            {grainStyle && <div style={grainStyle} aria-hidden />}
            {vignetteStyle && <div style={vignetteStyle} aria-hidden />}

            {/* A handle on EVERY corner. One bottom-right handle means half the time you have to
                move the graphic before you can scale it — and on a graphic pushed against the
                right edge of the frame, that handle is the one off-screen. */}
            {selected && !fullBleed && HANDLES.map((h) => (
              <div
                key={h.key}
                onPointerDown={(e) => begin(e, g, 'resize', h.sign)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                title="Drag to scale"
                style={{
                  position: 'absolute',
                  top: h.top ? px(-7) : undefined,
                  bottom: h.top ? undefined : px(-7),
                  left: h.left ? px(-7) : undefined,
                  right: h.left ? undefined : px(-7),
                  width: px(14), height: px(14),
                  borderRadius: '50%',
                  background: '#f59e0b',
                  border: `${px(2)}px solid #0b0b0d`,
                  cursor: h.cursor,
                  touchAction: 'none',
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
