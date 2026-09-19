import React from 'react';
import {
  elementPose, devicePose,
  type Scene, type SceneElement, type ColorRole, type SceneDevice,
} from '@/lib/showcase/sceneSpec';
import type { Brand } from './MomentVisual';

/**
 * THE INTERPRETER — the model's animation, executed.
 *
 * Everything is a pure function of `t`, so this renders identically in the Player and on
 * Lambda. Nothing here decides how the animation looks; the scene does. What this owns is
 * the things a model should not be trusted with: the type scale, the brand mapping, and the
 * guarantee that a value out of range still produces a legible frame.
 */

export function MomentScene({
  scene, t, holdMs, brand, w, h,
}: {
  scene: Scene;
  /** ms since the moment started. */
  t: number;
  holdMs: number;
  brand: Brand;
  w: number;
  h: number;
}) {
  // Type scale, as a fraction of frame height. Hero is the "promote it" size — the figure
  // alone, big enough that nothing else needs to move out of its way.
  const SIZE: Record<string, number> = { hero: 0.115, lead: 0.052, body: 0.030, kicker: 0.017 };

  // Does the wheel carry the moment's words? Answered once for the scene, not per element:
  // whether a numeral is an index or the headline is a property of the SCENE, and deciding it
  // per node made the one with copy behave differently from its own neighbours.
  const carriesCopy = scene.elements.some(
    (e) => e.angle !== undefined && (e.ox !== undefined || e.oy !== undefined),
  );

  const paint = (role: ColorRole | undefined): string | undefined => {
    switch (role) {
      case 'accent': return brand.accent;
      case 'ink': return brand.ink;
      case 'ground': return brand.ground;
      case 'support': return brand.support;
      default: return undefined;
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* The page is painted by the composition, UNDER the footage. Drawing it again here
          would put it back on top and hide the speaker entirely. */}
      {/* The device's guide curve, drawn behind its members. */}
      {scene.device && scene.device.stroke !== 'none' && (
        <DeviceGuide device={scene.device} t={t} holdMs={holdMs}
          stroke={paint(scene.device.stroke) ?? brand.support} w={w} h={h} />
      )}

      {scene.elements.map((el, i) => {
        const p = elementPose(el, t, holdMs);
        if (!p.visible || p.opacity <= 0) return null;

        // A member of the device is placed BY the device, and its emphasis comes from how
        // close it is to the active angle — that is what makes one number huge and the rest
        // ghosts on the curve, without them being different objects.
        let placed = el;
        let extra = 1;
        let dim = 1;
        if (scene.device && el.angle !== undefined) {
          const o = devicePose(scene.device, el.angle, holdMs > 0 ? t / holdMs : 0, w / h);
          // The label rides its node: same angle, fixed offset, so the pair moves as one item.
          placed = { ...el, x: o.x + (el.ox ?? 0), y: o.y + (el.oy ?? 0) };

          // A node is PROMOTED as it reaches the active angle, not merely un-dimmed. In the
          // reference the live numeral is the biggest thing on screen and its neighbours are
          // hairline ghosts; scaling a lead to lead kept every number the same size and the
          // wheel read as a list. So the active node lands at hero size whatever it was
          // declared as, and the ghosts fall to well under half.
          // ...unless the wheel is carrying copy. Then the numerals are INDICES and the words
          // riding with them are the message; promoting a numeral too leaves two hero-sized
          // things fighting over one corner, and promoting the OUTGOING one — which is active
          // at t=0 — made the number being left behind the biggest thing on screen.
          const isRider = el.ox !== undefined || el.oy !== undefined;
          const isNode = (el.size === 'lead' || el.size === 'hero') && !isRider && !carriesCopy;
          const GHOST = 0.42;
          const promote = isNode ? SIZE.hero / (SIZE[el.size ?? 'body'] ?? SIZE.body) : 1;

          // The copy is the message. It travels with its node, but it does not wait for the
          // wheel to finish turning to become readable — its own entrance already says when
          // it arrives, and dimming it by focus left the point of the moment at a third
          // opacity for most of the hold.
          extra = isRider ? 1 : isNode ? GHOST + (promote - GHOST) * o.focus : 0.7 + 0.3 * o.focus;
          dim = isRider ? 1 : 0.16 + 0.84 * o.focus;   // ghosts sit near a sixth opacity
        }

        return (
          <Element
            key={i}
            el={placed}
            pose={{ ...p, scale: p.scale * extra, opacity: p.opacity * dim }}
            brand={brand} paint={paint} SIZE={SIZE} w={w} h={h}
            /**
             * ON A PAGE ONLY WHEN THE PAGE IS ACTUALLY VISIBLE.
             *
             * A page gives type its contrast, so type on one needs no shadow — flat editorial
             * type with a heavy shadow is the fastest way to stop looking like the reference.
             * But a scene can declare a plate AND still play the footage over it, and then the
             * page is behind the video where it helps nothing: rendered, a near-white hero over
             * a bright keyboard shot had no shadow and no page, and simply washed out. The page
             * is only doing its job when the footage is hidden.
             */
            onPage={scene.plate !== undefined && scene.plate !== 'none' && scene.footage === 'none'}
          />
        );
      })}
    </div>
  );
}

/**
 * The device's visible track, and the marker sitting on its active point.
 *
 * It is drawn rather than implied because the line is what makes the members look like they
 * are ON something — nodes alone read as a scatter. Each kind gets the track it actually has:
 * a curve for a wheel, a straight rule for a strip or a stack, and nothing for a grid, whose
 * structure is its cells rather than a line through them.
 */
function DeviceGuide({
  device, t, holdMs, stroke, w, h,
}: {
  device: SceneDevice; t: number; holdMs: number; stroke: string; w: number; h: number;
}) {
  const progress = holdMs > 0 ? Math.min(1, Math.max(0, t / holdMs)) : 0;
  const px = (p: ReturnType<typeof devicePose>) => [p.x * w / 100, p.y * h / 100];

  // The marker sits where the ACTIVE point is: position 0, which is fixed under the moving
  // structure. Drawn for every kind, because "this one" is the whole idea of a device.
  const [mx, my] = px(devicePose(device, -device.spinDeg * progress, progress, w / h));
  const dot = <circle cx={mx} cy={my} r={Math.max(2, h * 0.004)} fill={stroke} />;

  if (device.kind === 'grid') {
    return (
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {dot}
      </svg>
    );
  }

  // Sampled rather than an SVG arc command: the ellipse is squashed by the frame aspect, and
  // sampling keeps the curve honest without solving for rotated-ellipse parameters. A track
  // samples the same way, over slots instead of degrees.
  const steps = 48;
  const [lo, hi] = device.kind === 'arc'
    ? [Math.min(device.from, device.to), Math.max(device.from, device.to)]
    : [-2.5, 2.5];
  const d = Array.from({ length: steps + 1 }, (_, i) => {
    const [x, y] = px(devicePose(device, lo + ((hi - lo) * i) / steps, progress, w / h));
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={w} height={h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <path d={d} fill="none" stroke={stroke} strokeWidth={Math.max(1, h * 0.0012)} opacity={0.5} />
      {dot}
    </svg>
  );
}

/** A brand colour at a given strength. Roles stay roles; only the opacity is local. */
function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function Element({
  el, pose, brand, paint, SIZE, w, h, onPage,
}: {
  el: SceneElement;
  pose: ReturnType<typeof elementPose>;
  brand: Brand;
  paint: (r: ColorRole | undefined) => string | undefined;
  SIZE: Record<string, number>;
  w: number;
  h: number;
  /** The scene has its own page behind it, so type does not need a shadow to survive. */
  onPage: boolean;
}) {
  const common: React.CSSProperties = {
    position: 'absolute',
    left: `${el.x + pose.dx}%`,
    top: `${el.y + pose.dy}%`,
    transform: `translate(-50%, -50%) scale(${pose.scale.toFixed(3)}) rotate(${el.rotate ?? 0}deg)`,
    opacity: pose.opacity,
  };

  const fg = paint(el.color) ?? brand.ink;
  const bg = paint(el.bg);
  const bd = paint(el.border);

  if (el.type === 'text') {
    const fontPx = (SIZE[el.size ?? 'body'] ?? SIZE.body) * h * (el.scale ?? 1);
    const isHero = el.size === 'hero';
    return (
      <div style={{
        ...common,
        // A wipe/draw entrance on text reveals it left-to-right rather than moving it.
        clipPath: pose.reveal < 1 ? `inset(0 ${(1 - pose.reveal) * 100}% 0 0)` : undefined,
        fontFamily: isHero || el.size === 'lead' ? brand.hero : brand.body,
        fontWeight: 800,
        fontSize: fontPx,
        lineHeight: 1.02,
        letterSpacing: el.size === 'kicker' ? '0.28em' : isHero ? '-0.02em' : '0',
        color: fg,
        whiteSpace: 'pre',
        textTransform: el.size === 'kicker' ? 'uppercase' : 'none',
        ...(bg ? { background: bg, padding: `${fontPx * 0.14}px ${fontPx * 0.3}px` } : {}),
        ...(bd ? { border: `${Math.max(2, h * 0.0022)}px solid ${bd}` } : {}),
        // Type over footage needs a shadow or it disappears on a light frame. On the
        // reference's own page it does NOT: the page already gives it contrast, and a heavy
        // shadow on flat editorial type is the single fastest way to look unlike the
        // reference, which is flat by design.
        /**
         * CONTRAST IS A GUARANTEE, AND OVER FOOTAGE IT HAS TO BE EARNED PER FRAME.
         *
         * On the reference's own page type needs no shadow — the page gives it contrast, and a
         * heavy shadow on flat editorial type is the fastest way to stop looking like the
         * reference. Over FOOTAGE there is no such promise: the backdrop is whatever the camera
         * was pointed at, and rendered on a bright office shot both a near-white hero and an
         * accent-orange "99%" washed straight out. One soft shadow was not enough because it
         * only darkens what is already behind the glyph; what an edge needs is a tight halo
         * that follows its outline, with the soft drop underneath for depth.
         */
        textShadow: bg || onPage ? 'none' : [
          `0 0 ${(fontPx * 0.09).toFixed(1)}px rgba(0,0,0,.85)`,
          `0 0 ${(fontPx * 0.22).toFixed(1)}px rgba(0,0,0,.55)`,
          `0 ${h * 0.004}px ${h * 0.014}px rgba(0,0,0,.6)`,
        ].join(', '),
      }}>{el.text}</div>
    );
  }

  const boxW = `${(el.w ?? 30) * (el.scale ?? 1)}%`;
  const boxH = `${(el.h ?? 9) * (el.scale ?? 1)}%`;

  if (el.type === 'rule' || el.type === 'strike') {
    // A rule and a strike are the same object; the difference is what it means, which is
    // why they are both here and both DRAW rather than appear.
    return (
      <div style={{
        ...common,
        width: boxW, height: boxH,
        background: paint(el.color) ?? brand.accent,
        clipPath: `inset(0 ${(1 - pose.reveal) * 100}% 0 0)`,
      }} />
    );
  }

  if (el.type === 'arrow') {
    const stroke = paint(el.color) ?? brand.accent;
    const thick = Math.max(2, h * 0.0035);
    return (
      <div style={{ ...common, width: boxW, height: boxH }}>
        <div style={{
          position: 'absolute', top: '50%', left: 0, height: thick,
          width: `${pose.reveal * 100}%`, background: stroke, transform: 'translateY(-50%)',
        }} />
        {pose.reveal > 0.85 && (
          <div style={{
            position: 'absolute', top: '50%', right: 0, transform: 'translate(0,-50%)',
            width: 0, height: 0,
            borderTop: `${thick * 3}px solid transparent`,
            borderBottom: `${thick * 3}px solid transparent`,
            borderLeft: `${thick * 5}px solid ${stroke}`,
          }} />
        )}
      </div>
    );
  }

  /**
   * THE GRAPHICS.
   *
   * Everything above draws type and lines, and a moment built only out of those is a caption
   * with ambitions — measured against a "bar columns, one glowing element in a void" reference
   * it came back as five small chips on a black frame. These four are the shapes those
   * references are actually made of, and each carries its own motion so the hold is never
   * still: the fill is driven by `reveal`, which runs over the element's own entrance.
   */
  if (el.type === 'bar' || el.type === 'ring') {
    const level = (el.value ?? 0.5) * pose.reveal;
    const lit = paint(el.color) ?? brand.accent;
    /**
     * A column needs something to stand ON.
     *
     * At 0.18 the track was a hint, so a white bar over a bright shot had no edge and read as
     * a blank card floating on the picture. Over footage the track is a real dark backing —
     * that is what gives the column a silhouette whatever is behind it; on a page it stays the
     * quiet hint it was, because the page is already doing the job.
     */
    const track = onPage
      ? withAlpha(paint(el.bg) ?? brand.support, 0.18)
      : withAlpha(brand.ground, 0.62);

    if (el.type === 'bar') {
      return (
        <div style={{
          ...common, width: boxW, height: boxH, background: track, borderRadius: h * 0.006,
          ...(onPage ? {} : { boxShadow: `0 ${h * 0.004}px ${h * 0.018}px rgba(0,0,0,.55)` }),
        }}>
          {/* Grows from its base, the way a column of anything does. */}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: `${level * 100}%`, background: lit, borderRadius: h * 0.006,
          }} />
          {el.text && (
            <div style={{
              position: 'absolute', left: '50%', top: '100%', transform: 'translate(-50%, 35%)',
              fontFamily: brand.body, fontWeight: 800,
              // A chart's labels are the half that carries the meaning. At kicker size in the
              // support grey they rendered 12px and unreadable, and three of them ran together
              // into one grey smear — the bars were saying nothing at all.
              fontSize: SIZE.body * h * 0.82,
              letterSpacing: '0.08em', color: paint('ink') ?? brand.ink,
              whiteSpace: 'pre', textTransform: 'uppercase',
              textShadow: `0 ${h * 0.003}px ${h * 0.01}px rgba(0,0,0,.6)`,
            }}>{el.text}</div>
          )}
        </div>
      );
    }

    const ringPx = Math.max(3, h * 0.012);
    return (
      <div style={{ ...common, width: boxW, height: `${(el.w ?? 22) * (el.scale ?? 1) * (w / h)}%` }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `conic-gradient(${lit} ${level * 360}deg, ${track} 0deg)`,
          // Punched out to a ring, so it reads as a gauge rather than a pie.
          mask: `radial-gradient(circle, transparent calc(50% - ${ringPx}px), #000 calc(50% - ${ringPx}px))`,
          WebkitMask: `radial-gradient(circle, transparent calc(50% - ${ringPx}px), #000 calc(50% - ${ringPx}px))`,
        }} />
        {el.text && (
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            fontFamily: brand.hero, fontWeight: 800, fontSize: SIZE.lead * h,
            color: fg, whiteSpace: 'pre',
          }}>{el.text}</div>
        )}
      </div>
    );
  }

  if (el.type === 'glow') {
    // Light, not a shape: no edge, no border, and it never takes a reveal wipe.
    const c = paint(el.color) ?? brand.accent;
    return (
      <div style={{
        ...common,
        width: boxW, height: `${(el.h ?? 55) * (el.scale ?? 1)}%`,
        // `closest-side` on an ellipse is what keeps it LIGHT: a `circle` gradient in a wide box
        // is cut off by the box before it has faded, so it rendered as a muddy brown rectangle
        // with soft corners rather than a glow. This reaches full transparency inside its own
        // shortest edge, so there is no edge to see, and the core stays bright enough to read
        // as a source rather than a stain.
        background: `radial-gradient(ellipse closest-side, ${withAlpha(c, 0.62)} 0%, ${withAlpha(c, 0.3)} 30%, ${withAlpha(c, 0.09)} 58%, ${withAlpha(c, 0)} 82%)`,
        opacity: pose.opacity * (0.55 + 0.45 * pose.reveal),
      }} />
    );
  }

  if (el.type === 'dot') {
    return (
      <div style={{
        ...common, width: boxW, height: `${(el.w ?? 2.5) * (el.scale ?? 1) * (w / h)}%`,
        borderRadius: '50%', background: fg,
      }} />
    );
  }

  if (el.type === 'card') {
    return (
      <div style={{
        ...common, width: boxW, height: boxH,
        borderRadius: h * 0.022,
        background: bg ?? withAlpha(paint('support') ?? brand.support, 0.1),
        border: `${Math.max(2, h * 0.0016)}px solid ${withAlpha(bd ?? paint('support') ?? brand.support, 0.45)}`,
        clipPath: pose.reveal < 1 ? `inset(0 ${(1 - pose.reveal) * 100}% 0 0)` : undefined,
        display: 'grid', placeItems: 'center',
        color: fg, fontFamily: brand.body, fontWeight: 800,
        fontSize: (SIZE[el.size ?? 'body'] ?? SIZE.body) * h * 0.8,
        padding: `0 ${w * 0.015}px`, textAlign: 'center',
      }}>{el.text}</div>
    );
  }

  // box | chip
  const radius = el.type === 'chip' ? `${h * 0.02}px` : '0px';
  return (
    <div style={{
      ...common,
      width: boxW, height: boxH, borderRadius: radius,
      background: bg ?? 'transparent',
      border: bd ? `${Math.max(2, h * 0.0022)}px solid ${bd}` : undefined,
      clipPath: pose.reveal < 1 ? `inset(0 ${(1 - pose.reveal) * 100}% 0 0)` : undefined,
      display: 'grid', placeItems: 'center',
      color: fg,
      fontFamily: brand.body, fontWeight: 800,
      fontSize: (SIZE[el.size ?? 'body'] ?? SIZE.body) * h * 0.8,
      letterSpacing: '0.04em',
      padding: `0 ${w * 0.01}px`,
      textAlign: 'center',
    }}>{el.text}</div>
  );
}
