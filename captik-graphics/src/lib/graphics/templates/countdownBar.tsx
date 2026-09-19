// Reference: social/apple-style-30-sec-counter-1.mp4  (30s capture; the counter and the rule run
// its whole length)
// A number counting down beside a rule that fills as it goes. Two readouts of one value: the digits
// and the bar are both derived from the same progress, so they can never disagree — a bar animated
// on its own timeline drifting a frame off the number is the classic version of this bug.
//
// The digit block is fixed-width, so 28 -> 9 does not shove the rule sideways.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, vel } from '../juice';

export const countdownBar = defineGraphicsTemplate({
  id: 'countdown_bar',
  name: 'Countdown Bar',
  category: 'chart',
  tags: ['Counter', 'Timer', 'Minimal'],
  design: { w: 900, h: 260 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 9000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 66 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'row',   label: 'Row', hideable: false },
    { key: 'value', label: 'Number' },
    { key: 'track', label: 'Track' },
    { key: 'fill',  label: 'Fill' },
  ],

  params: [
    { type: 'number', key: 'from', label: 'From', group: 'Content', default: 30, min: 0, max: 999, step: 1 },
    { type: 'number', key: 'to',   label: 'To',   group: 'Content', default: 0, min: 0, max: 999, step: 1 },
    { type: 'text',   key: 'suffix', label: 'Suffix', group: 'Content', default: '', maxLength: 8,
      help: 'Optional, e.g. "s" or "%".' },

    { type: 'color',  key: 'ink',   label: 'Number', group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'bar',   label: 'Fill',   group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'track', label: 'Track',  group: 'Style', default: '#33312B' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Number size', group: 'Style', default: 180, min: 20, max: 220, step: 4, unit: 'px' },
    { type: 'number', key: 'weight', label: 'Weight', group: 'Style', default: 700, min: 300, max: 900, step: 100 },
    { type: 'number', key: 'thick', label: 'Rule width', group: 'Style', default: 12, min: 1, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'gap',   label: 'Gap',    group: 'Style', default: 34, min: 0, max: 140, step: 2, unit: 'px' },
    { type: 'number', key: 'digits', label: 'Digit slots', group: 'Style', default: 2, min: 1, max: 4, step: 1,
      help: 'Reserved width, so the rule does not shift as the number shortens.' },

    { type: 'number', key: 'startAt', label: 'Starts at', group: 'Motion', default: 1400, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'runMs',   label: 'Runs over', group: 'Motion', default: 30000, min: 200, max: 60000, step: 100, unit: 'ms' },
  ],

  // Minimal: air pass on the swing-in, ONE tick as the count starts. No payoff cue — with
  // the default 30s run the finish lands beyond the default duration, so it stays silent.
  sfx: (p) => [
    { atMs: 40, id: 'whoosh', gain: 0.4 },
    { atMs: p.startAt, id: 'tick', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, seed }) => {
    const ff = fontStack(p.font);

    const t = interpolate(timeMs, [p.startAt, p.startAt + p.runMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    // ONE value drives both readouts. The readout only leaves its start value after a FULL unit has
    // elapsed (ceil when counting down, floor when counting up) — rounding flips it half a unit early.
    const raw = p.from + (p.to - p.from) * t;
    const value = p.to < p.from ? Math.ceil(raw) : Math.floor(raw);

    const enterAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 24, mass: 0.7, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(460))),
    });
    const enter = enterAt(timeMs);
    // Depth: the row swings in top-hinged with a velocity smear that dies at rest, then
    // holds a faint 3D sway; the digits parallax over the rule so the pose never flattens.
    const pose = depthPose(timeMs, seed, { enter, rx: -14, z: -70, swayDeg: 1.4 });
    const vIn = vel(enterAt, timeMs) * p.size * 0.5;
    const rowSm = smear(0, vIn, 0.8);
    const parNum = parallax(timeMs, seed, 0.5, p.size * 0.03);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: p.gap,
          fontFamily: ff,
          opacity: clamp01(enter * 1.6),
          filter: rowSm.blurPx > 0.3 ? `blur(${rowSm.blurPx.toFixed(2)}px)` : undefined,
          transform: pose,
          transformOrigin: '50% 40%',
          ...el('row'),
        }}
      >
        <div
          style={{
            // Fixed slot count: the rule must not move when 30 becomes 9.
            minWidth: p.size * 0.62 * p.digits,
            textAlign: 'right',
            fontSize: p.size, fontWeight: p.weight, color: p.ink, lineHeight: 1,
            letterSpacing: -p.size * 0.02, whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            transform: `translate(${parNum.x.toFixed(2)}px, ${parNum.y.toFixed(2)}px)`,
            ...el('value'),
          }}
        >
          {value}{p.suffix}
        </div>

        <div
          style={{
            flex: 1, height: p.thick, borderRadius: 999,
            background: rgba(p.track, 1),
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05)',
            overflow: 'hidden',
            ...el('track'),
          }}
        >
          <div
            style={{
              width: `${(t * 100).toFixed(2)}%`, height: '100%',
              borderRadius: 999,
              background: `linear-gradient(180deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 55%), ${p.bar}`,
              boxShadow: `0 0 ${p.thick * 1.2}px ${rgba(p.bar, 0.5)}`,
              ...el('fill'),
            }}
          />
        </div>
      </div>
    );
  },
});
