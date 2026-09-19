// PUNCH callout bar — plateless annotation for footage: an amber edge-bar grows vertically, a
// dark caps chip slides out THROUGH an overflow-hidden mask flush with the bar's right edge (so
// it emerges FROM the bar instead of flying in), then a thick arrow dash-draws toward the subject.
// The arrowhead is a separate popped triangle — dash-offsetting a path that included the head
// would draw the head sideways mid-stroke.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, inkOn, rgba } from '../motion';
import { smear, sway3d, vel } from '../juice';

const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

export const calloutBar = defineGraphicsTemplate({
  id: 'callout_bar',
  name: 'Callout Bar',
  category: 'fx',
  tags: ['Callout', 'Bar', 'Arrow', 'Chip', 'Label'],
  badge: 'New',
  design: { w: 800, h: 300 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3500,
  defaultBox: { xPercent: 34, yPercent: 45, widthPercent: 46 },
  fonts: ['montserrat'],

  elements: [
    { key: 'bar',   label: 'Edge bar', hideable: false },
    { key: 'chip',  label: 'Label chip' },
    { key: 'arrow', label: 'Arrow' },
  ],

  params: [
    { type: 'text', key: 'text', label: 'Label', group: 'Content', default: 'WATCH THIS', maxLength: 28 },
    { type: 'select', key: 'direction', label: 'Arrow points', group: 'Content', default: 'up',
      options: [
        { value: 'up',   label: 'Up' },
        { value: 'down', label: 'Down' },
        { value: 'left', label: 'Left' },
      ] },

    { type: 'color',  key: 'accent',   label: 'Accent',       group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'chipCol',  label: 'Chip',         group: 'Style', default: '#0B0B0D' },
    { type: 'font',   key: 'font',     label: 'Font',         group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'arrowLen', label: 'Arrow length', group: 'Style', default: 70, min: 40, max: 120, step: 5, unit: 'px' },

    { type: 'number', key: 'arrowAt', label: 'Arrow at', group: 'Motion', default: 900, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay',    group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Two light passes (bar snap, chip emerging from the mask), then a dry snap when the arrowhead
  // pops — all keyed off the same arrowAt the motion uses.
  sfx: (p) => [
    { atMs: p.delay + 60, id: 'swish', gain: 0.5 },
    { atMs: p.delay + 320, id: 'swish', gain: 0.4 },
    { atMs: p.delay + p.arrowAt + 300, id: 'snap', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    const barW = 16;
    const barX = Math.round(width * 0.14);
    const barH = Math.round(height * 0.60);
    const cy = height / 2;

    // Bar grows from its own center; slight scaleY overshoot reads as a snap, not a wipe.
    const bs = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 18, mass: 0.7, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(450))),
    });
    // Chip slides right out of the mask; damping 20 gives a small push past before settling.
    // A closure of absolute ms so vel() can sample the same motion for the smear.
    const csAt = (ms: number) => spring({
      frame: fr(ms - 260), fps: FPS,
      config: { damping: 20, mass: 0.8, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const cs = csAt(t);
    // MOTION BLUR: the chip's slide velocity (its travel is ~its own width — approximate in px
    // off the canvas) smears it horizontally through the mask and dies as it parks.
    const vChip = vel(csAt, t) * width * 0.45;
    const smChip = smear(vChip, 0, 0.9);
    // Arrowhead pop, after the shaft has mostly drawn — same-closure velocity smears the stamp.
    const hpAt = (ms: number) => spring({
      frame: fr(ms - p.arrowAt - 280), fps: FPS,
      config: { damping: 14, mass: 0.6, stiffness: 260 },
      durationInFrames: Math.max(1, Math.round(fr(360))),
    });
    const hp = hpAt(t);
    const vHead = vel(hpAt, t) * 30;
    const smHead = smear(vHead * 0.7, vHead * 0.7, 1.1);

    const arrowOn = t >= p.arrowAt;
    const draw = easeOut((t - p.arrowAt) / 320);
    // Shaft sweep velocity — blurs the fast dash-draw, crisp the frame it completes.
    const vDraw = vel((ms) => easeOut((ms - p.arrowAt) / 320), t);
    const drawBlur = t > p.arrowAt ? Math.min(2.5, Math.abs(vDraw) * p.arrowLen * 0.8) : 0;

    // A left arrow must stay inside the canvas, so its length caps at the room left of the bar.
    const len = p.direction === 'left' ? Math.min(p.arrowLen, barX - 24) : p.arrowLen;
    const ax = width * 0.4;
    let x1 = ax, y1 = cy - 62, x2 = ax, y2 = cy - 62 - len;
    if (p.direction === 'down') { y1 = cy + 62; y2 = y1 + len; }
    if (p.direction === 'left') { x1 = barX - 16; y1 = cy; x2 = x1 - len; y2 = cy; }
    const headPts =
      p.direction === 'up'   ? `${x2 - 15},${y2 + 20} ${x2 + 15},${y2 + 20} ${x2},${y2 - 2}`
      : p.direction === 'down' ? `${x2 - 15},${y2 - 20} ${x2 + 15},${y2 - 20} ${x2},${y2 + 2}`
      : `${x2 + 20},${y2 - 15} ${x2 + 20},${y2 + 15} ${x2 - 2},${y2}`;

    const fsChip = Math.round(Math.min(height * 0.24, (width * 0.58) / (0.62 * Math.max(4, p.text.length))));

    return (
      // Resting 3D sway — the whole callout keeps living on the footage (rotations only, ~1.2°,
      // never enough to drift off what it annotates).
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff, transform: sway3d(t, seed, 1.2) }}>
        <div
          style={{
            position: 'absolute', left: barX, top: (height - barH) / 2,
            width: barW, height: barH,
            background: p.accent, borderRadius: 5,
            boxShadow: `0 8px 26px ${rgba(p.accent, 0.35)}`,
            opacity: clamp01(bs * 2),
            transform: `scaleY(${bs.toFixed(4)})`,
            transformOrigin: 'center',
            ...el('bar'),
          }}
        />

        <div
          style={{
            position: 'absolute', left: barX + barW, top: 0, bottom: 0,
            display: 'flex', alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              padding: '14px 26px',
              background: p.chipCol,
              color: inkOn(p.chipCol),
              borderRadius: 6,
              boxShadow: '0 14px 34px rgba(0,0,0,0.38)',
              fontSize: fsChip, fontWeight: 800, lineHeight: 1.1,
              letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
              filter: smChip.blurPx > 0.3 ? `blur(${smChip.blurPx.toFixed(2)}px)` : undefined,
              transform: `translateX(${((cs - 1) * 103).toFixed(2)}%) scale(${smChip.sx.toFixed(4)}, ${smChip.sy.toFixed(4)})`,
              ...el('chip'),
            }}
          >
            {p.text}
          </span>
        </div>

        {arrowOn && (
          <svg viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', ...el('arrow') }}>
            <line
              x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)}
              stroke={p.accent} strokeWidth={12} strokeLinecap="round"
              strokeDasharray={len}
              strokeDashoffset={(len * (1 - draw)).toFixed(2)}
              style={{ filter: drawBlur > 0.3 ? `blur(${drawBlur.toFixed(2)}px)` : undefined }}
            />
            <polygon
              points={headPts}
              fill={p.accent}
              opacity={clamp01(hp * 2).toFixed(3)}
              transform={`translate(${x2} ${y2}) scale(${(Math.max(0, hp) * smHead.sx).toFixed(4)} ${(Math.max(0, hp) * smHead.sy).toFixed(4)}) translate(${-x2} ${-y2})`}
              style={{ filter: smHead.blurPx > 0.3 ? `blur(${smHead.blurPx.toFixed(2)}px)` : undefined }}
            />
          </svg>
        )}
      </div>
    );
  },
});
