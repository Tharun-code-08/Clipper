// Documentary location chip: the map pin draws on with a dash sweep, the place name types
// out in tracked caps, a hairline underline sweeps beneath it, then the dim coordinate line
// lands. The dash sweep uses a damping-200 spring — monotonic on purpose, a pin never
// un-draws — while the pin's inner dot pops on a SEPARATE springy beat, so one glyph gives
// two distinct entrance moments instead of one mushy blend.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp, clamp01, fr, outRamp, rgba } from '../motion';
import { LUXE, easeOutQuint, luxeLabel } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

// Classic pin outline + the hole, in a 24-unit box. Stroked, never filled — it draws on.
const PIN_PATH = 'M12 21.6C12 21.6 5 14.9 5 9.6C5 5.7 8.13 2.6 12 2.6C15.87 2.6 19 5.7 19 9.6C19 14.9 12 21.6 12 21.6Z';

export const locationTag = defineGraphicsTemplate({
  id: 'location_tag',
  name: 'Location Tag',
  category: 'notify',
  tags: ['Location', 'Map pin', 'Place', 'Travel', 'Documentary'],
  badge: 'New',
  design: { w: 720, h: 240 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 28, yPercent: 72, widthPercent: 42 },
  fonts: ['montserrat'],

  elements: [
    { key: 'pin',  label: 'Map pin' },
    { key: 'name', label: 'Place name', hideable: false },
    { key: 'rule', label: 'Underline' },
    { key: 'sub',  label: 'Sub line' },
  ],

  params: [
    { type: 'text', key: 'place', label: 'Place', group: 'Content', default: 'MUMBAI, INDIA', maxLength: 28 },
    { type: 'text', key: 'sub',   label: 'Sub line', group: 'Content', default: '19.0760° N — 72.8777° E', maxLength: 40 },

    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },

    { type: 'number', key: 'typeMs', label: 'Type speed', group: 'Motion', default: 45, min: 20, max: 120, step: 5, unit: 'ms' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // DOCU whisper: a glass ping as the pin draws on, ONE tick as the place starts typing (480
  // mirrors typeStart), and a softer glass as the underline sweeps — the sweep time derives
  // from the same place-length × typeMs arithmetic the render uses.
  sfx: (p) => [
    { atMs: p.delay + 100, id: 'glass', gain: 0.4 },
    { atMs: p.delay + 480, id: 'tick', gain: 0.4 },
    { atMs: p.delay + 480 + p.place.length * p.typeMs, id: 'glass', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const out = outRamp(timeMs, durationMs, 300);
    const ff = fontStack('montserrat');

    // Pin: monotonic dash sweep, then the dot pops as its own beat.
    const draw = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });
    const dotPop = spring({
      frame: fr(t - 420), fps: FPS,
      config: { damping: 18, mass: 0.6, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(450))),
    });

    // Typing: pure integer division of elapsed time.
    const typeStart = 480;
    const chars = clamp(Math.floor((t - typeStart) / Math.max(1, p.typeMs)), 0, p.place.length);
    const typed = p.place.slice(0, chars);
    const nameDone = typeStart + p.place.length * p.typeMs;
    const typing = t >= typeStart && t < nameDone;

    const sweepIn = easeOutQuint(clamp01((t - nameDone + 80) / 450));
    const subIn = easeOutQuint(clamp01((t - nameDone - 180) / 420));

    // DEPTH, whispered: left-anchored chrome swings in on a SHALLOW side hinge riding the
    // pin's own draw spring, then keeps a ≤1° sway; pin / rule / sub sit at faint parallax
    // depths so the sway shears the lockup by a hair. The underline is the one fast mover —
    // its sweep velocity smears it horizontally and the blur dies as the rule reaches width.
    const pose = depthPose(t, seed, { enter: draw, ry: -10, rx: -4, z: -50, swayDeg: 0.8, periodMs: 4600 });
    const parPin = parallax(t, seed, 0.55, height * 0.014, 4600);
    const parRule = parallax(t, seed, 0.2, height * 0.014, 4600);
    const parSub = parallax(t, seed, 0.3, height * 0.014, 4600);
    const ruleWAt = (ms: number) => width * 0.52 * easeOutQuint(clamp01((ms - nameDone + 80) / 450));
    const ruleSmear = smear(vel(ruleWAt, t), 0);

    const ps = Math.round(height * 0.5);
    const textX = Math.round(ps * 1.1);
    const fsName = Math.round(height * 0.185);
    const fsSub = Math.round(height * 0.095);
    // Generous over-estimate of the pin path length (24-unit space) for the dash sweep.
    const pinLen = 70;
    const shadow = '0 1px 3px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.4)';

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff, opacity: out, transform: pose, transformOrigin: 'left center' }}>
        <svg
          viewBox="0 0 24 24"
          style={{ position: 'absolute', left: 0, top: height * 0.1, width: ps, height: ps, overflow: 'visible', transform: `translate(${parPin.x.toFixed(2)}px, ${parPin.y.toFixed(2)}px)`, ...el('pin') }}
        >
          <path
            d={PIN_PATH}
            fill="none"
            stroke={p.accent}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={pinLen}
            strokeDashoffset={((1 - draw) * pinLen).toFixed(2)}
            style={{ filter: `drop-shadow(0 0 4px ${rgba(p.accent, 0.5)}) drop-shadow(0 2px 3px rgba(0,0,0,0.5))` }}
          />
          <circle cx={12} cy={9.6} r={(Math.max(0.01, dotPop) * 2.5).toFixed(3)} fill={p.accent} />
        </svg>

        <div
          style={{
            position: 'absolute', left: textX, top: height * 0.13,
            display: 'flex', alignItems: 'center',
            fontSize: fsName, fontWeight: 700, lineHeight: 1.15,
            letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'pre',
            color: p.ink, textShadow: shadow,
            ...el('name'),
          }}
        >
          {typed}
          <span
            style={{
              display: 'inline-block', flexShrink: 0,
              width: Math.max(2, Math.round(fsName * 0.07)), height: Math.round(fsName * 0.92),
              marginLeft: Math.round(fsName * 0.1),
              background: p.accent,
              opacity: typing ? 1 : 0,
            }}
          />
        </div>

        <div
          style={{
            position: 'absolute', left: textX, top: height * 0.44,
            width: (width * 0.52 * sweepIn).toFixed(1) + 'px', height: Math.max(2, height * 0.012),
            background: p.accent,
            boxShadow: `0 0 10px ${rgba(p.accent, 0.5)}`,
            filter: ruleSmear.blurPx > 0.3 ? `blur(${ruleSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `translate(${parRule.x.toFixed(2)}px, ${parRule.y.toFixed(2)}px) scaleX(${ruleSmear.sx.toFixed(4)})`,
            transformOrigin: 'left center',
            ...el('rule'),
          }}
        />

        <span
          style={{
            position: 'absolute', left: textX, top: height * 0.53,
            ...luxeLabel(fsSub, LUXE.inkDim),
            whiteSpace: 'nowrap',
            textShadow: shadow,
            opacity: subIn,
            transform: `translate(${(parSub.x + (1 - subIn) * -width * 0.015).toFixed(2)}px, ${parSub.y.toFixed(2)}px)`,
            ...el('sub'),
          }}
        >
          {p.sub}
        </span>
      </div>
    );
  },
});
