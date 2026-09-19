import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, rgba } from '../motion';
import { depthPose, smear, sway3d, vel } from '../juice';

export const countdown = defineGraphicsTemplate({
  id: 'countdown',
  name: 'Countdown',
  category: 'title',
  tags: ['Countdown', 'Timer', 'Hook'],
  design: { w: 460, h: 460 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 42 },
  fonts: ['anton', 'inter'],

  elements: [
    { key: 'ring',     label: 'Ring', hideable: false },
    { key: 'ringTrack', label: 'Ring track' },
    { key: 'ringFill', label: 'Ring progress' },
    { key: 'number',   label: 'Number', hideable: false },
  ],

  params: [
    { type: 'number',  key: 'from',  label: 'Count from', group: 'Content', default: 3, min: 1, max: 10, step: 1 },
    { type: 'text',    key: 'end',   label: 'Final word', group: 'Content', default: 'GO', maxLength: 12 },
    { type: 'boolean', key: 'ring',  label: 'Show ring',  group: 'Content', default: true },

    { type: 'font',   key: 'font',      label: 'Font',      group: 'Style', default: 'anton' },
    { type: 'color',  key: 'color',     label: 'Number',    group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'ringColor', label: 'Ring',      group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'trackColor', label: 'Ring track', group: 'Style', default: '#26231C', showIf: { key: 'ring', equals: true } },
    { type: 'number', key: 'thick',     label: 'Ring width', group: 'Style', default: 10, min: 4, max: 40, step: 1, unit: 'px', showIf: { key: 'ring', equals: true } },
  ],

  // The count is driven by durationMs / (from + 1), which sfx() cannot see — so the cues are cut
  // to the same division of the template's own 4000ms default window, and `from` retimes them.
  // ONE tick on the opening number (a tick per beat is a metronome), air on the final approach,
  // and the lone full-gain hit when the final word lands.
  sfx: (p) => [
    { atMs: 0, id: 'tick', gain: 0.45 },
    { atMs: (4000 * Math.max(0, p.from - 1)) / (p.from + 1), id: 'whoosh', gain: 0.55 },
    { atMs: (4000 * p.from) / (p.from + 1), id: 'slam', gain: 1 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const steps = p.from + 1;                       // n numbers plus the final word
    const stepMs = Math.max(1, durationMs / steps);
    // Math.floor on the millisecond clock — every frame at the same ms picks the same number,
    // which is the whole reason this cannot be a CSS animation.
    const idx = Math.min(steps - 1, Math.floor(timeMs / stepMs));
    const local = timeMs - idx * stepMs;
    const isEnd = idx === steps - 1;
    const shown = isEnd ? p.end : String(p.from - idx);

    // Each tick springs in from slightly oversized, then settles.
    const tickAt = (ms: number) => spring({
      frame: (ms / 1000) * FPS, fps: FPS,
      config: { damping: 13, mass: 0.55, stiffness: 170 },
      durationInFrames: 12,
    });
    const tick = tickAt(local);
    const scaleAt = (ms: number) => interpolate(tickAt(ms), [0, 1], [1.45, 1]);
    const scale = scaleAt(local);
    // Only the FIRST number fades up. Later ticks hard-cut and pop, which is how a real countdown
    // reads — and it avoids a one-frame blank at every tick boundary.
    const opacity = idx === 0 ? interpolate(tick, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }) : 1;

    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) / 2 - p.thick;
    const circ = 2 * Math.PI * r;
    // Ring drains over the whole countdown, not per tick.
    const drained = clamp01(timeMs / Math.max(1, durationMs));
    const fs = Math.round(Math.min(width, height) * (isEnd ? 0.34 : 0.52));

    // Every tick is a NEW object arriving in space: the same spring that stamps the scale down
    // also swings the numeral off a hinge that alternates side per step, and the pose keeps a
    // ±2° breath between ticks so the held number never flattens out. The ring sways shallower
    // than the numeral, which is what makes it read as the plate BEHIND the count.
    const hingeY = (random(`${seed}-cd${idx}`) - 0.5) * 34;
    const pose = depthPose(timeMs, seed, { enter: tick, rx: -15, ry: hingeY, z: -120, swayDeg: 2 });
    const ringPose = sway3d(timeMs, seed, 1.1);
    // The stamp's own velocity at the glyph edge — peaks mid-flight, dead the frame it lands.
    const numSm = smear(0, vel(scaleAt, local) * fs * 0.5, 1.1);

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: fontStack(p.font) }}>
        {p.ring && (
          <svg
            width={width} height={height}
            style={{ position: 'absolute', inset: 0, transform: ringPose, transformOrigin: 'center center', ...el('ring') }}
            aria-hidden="true"
          >
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={p.trackColor} strokeWidth={p.thick} style={el('ringTrack')} />
            <circle
              cx={cx} cy={cy} r={r} fill="none"
              stroke={p.ringColor} strokeWidth={p.thick} strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * drained}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ filter: `drop-shadow(0 0 ${Math.round(p.thick * 0.8)}px ${rgba(p.ringColor, 0.5)})`, ...el('ringFill') }}
            />
          </svg>
        )}
        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `${pose} scale(${(scale * numSm.sx).toFixed(4)}, ${(scale * numSm.sy).toFixed(4)})`,
            transformOrigin: 'center center',
            opacity,
          }}
        >
          <span
            style={{
              fontSize: fs, fontWeight: 900, color: p.color, lineHeight: 1,
              filter: numSm.blurPx > 0.3 ? `blur(${numSm.blurPx.toFixed(2)}px)` : undefined,
              letterSpacing: isEnd ? '0.04em' : '0',
              fontVariantNumeric: 'tabular-nums',
              textShadow: `0 ${fs * 0.025}px ${fs * 0.07}px ${rgba('#000000', 0.35)}, 0 ${fs * 0.09}px ${fs * 0.24}px ${rgba('#000000', 0.3)}`,
              ...el('number'),
            }}
          >
            {shown}
          </span>
        </div>
      </div>
    );
  },
});
