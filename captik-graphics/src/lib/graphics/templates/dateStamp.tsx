// Corner timestamp: two tracked-caps lines type on and hold, with a REC-style blinking dot.
// fontVariantNumeric: 'tabular-nums' is the load-bearing choice — digits typing on would
// otherwise reflow the line width every character. The dot blink is a sine of timeMs (never
// a CSS animation), so it pulses identically in preview and every export frame.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp, fr, outRamp, rgba } from '../motion';
import { LUXE } from '../luxe';
import { depthPose, parallax } from '../juice';

export const dateStamp = defineGraphicsTemplate({
  id: 'date_stamp',
  name: 'Date Stamp',
  category: 'notify',
  tags: ['Timestamp', 'Date', 'Recording', 'Camera', 'Corner'],
  badge: 'New',
  design: { w: 560, h: 180 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 76, yPercent: 18, widthPercent: 30 },
  fonts: ['montserrat'],

  elements: [
    { key: 'dot',   label: 'REC dot' },
    { key: 'line1', label: 'Date line', hideable: false },
    { key: 'line2', label: 'Time line' },
  ],

  params: [
    { type: 'text', key: 'line1', label: 'Line 1', group: 'Content', default: '26 JUL 2026', maxLength: 24 },
    { type: 'text', key: 'line2', label: 'Line 2', group: 'Content', default: '04:12:33 PM', maxLength: 24 },
    { type: 'boolean', key: 'showDot', label: 'Blinking dot', group: 'Content', default: true },

    { type: 'color', key: 'ink', label: 'Text', group: 'Style', default: '#F4F1E8' },
    { type: 'color', key: 'dotColor', label: 'Dot', group: 'Style', default: '#E5484D' },

    { type: 'number', key: 'typeMs', label: 'Type speed', group: 'Motion', default: 55, min: 20, max: 120, step: 5, unit: 'ms' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // DOCU whisper: a luxe glass ping as the REC dot lands, then ONE typewriter tick as the
  // date starts typing (240 mirrors the type-on start) — both shifted by the same delay.
  sfx: (p) => [
    { atMs: p.delay + 140, id: 'glass', gain: 0.4 },
    { atMs: p.delay + 240, id: 'tick', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, durationMs, height, seed }) => {
    const t = timeMs - p.delay;
    const out = outRamp(timeMs, durationMs, 250);

    // DEPTH, whispered: documentary corner chrome — a SHALLOW top-hinged swing on the way in
    // and a ≤1° resting sway (the pose never dies, but a camera-UI mimic must not dance); the
    // dot and the time line sit at faint parallax depths so the sway shears them by a hair.
    const enterU = clamp(t / 420, 0, 1);
    const pose = depthPose(t, seed, { enter: enterU * (2 - enterU), rx: -8, z: -40, swayDeg: 0.8, periodMs: 4400 });
    const parDot = parallax(t, seed, 0.5, height * 0.01, 4400);
    const parLine2 = parallax(t, seed, 0.3, height * 0.01, 4400);

    // The dot pops on a spring; the type-on IS the entrance for the text.
    const dotIn = spring({
      frame: fr(t - 120), fps: FPS,
      config: { damping: 20, mass: 0.6, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    // Blink: pure sine of timeMs — dips to a faint ember rather than fully off.
    const blink = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t / 260));

    const start1 = 240;
    const chars1 = clamp(Math.floor((t - start1) / Math.max(1, p.typeMs)), 0, p.line1.length);
    const start2 = start1 + p.line1.length * p.typeMs + 160;
    const chars2 = clamp(Math.floor((t - start2) / Math.max(1, p.typeMs)), 0, p.line2.length);

    const fs1 = Math.round(height * 0.26);
    const fs2 = Math.round(height * 0.17);
    const dotD = Math.round(fs1 * 0.5);
    const leftX = p.showDot ? Math.round(dotD * 1.7) : 0;
    const shadow = '0 1px 3px rgba(0,0,0,0.7), 0 3px 12px rgba(0,0,0,0.45)';

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: fontStack('montserrat'), opacity: out, transform: pose, transformOrigin: 'top center' }}>
        {p.showDot && (
          <div
            style={{
              position: 'absolute', left: 0, top: height * 0.2 + (fs1 - dotD) / 2,
              width: dotD, height: dotD, borderRadius: '50%',
              background: p.dotColor,
              opacity: (blink * Math.min(1, dotIn)).toFixed(3),
              transform: `translate(${parDot.x.toFixed(2)}px, ${parDot.y.toFixed(2)}px) scale(${Math.max(0, dotIn).toFixed(3)})`,
              boxShadow: `0 0 ${Math.round(dotD * 0.9)}px ${rgba(p.dotColor, 0.25 + 0.45 * blink)}`,
              ...el('dot'),
            }}
          />
        )}

        <span
          style={{
            position: 'absolute', left: leftX, top: height * 0.2,
            fontSize: fs1, fontWeight: 600, lineHeight: 1.1,
            letterSpacing: '0.2em', textTransform: 'uppercase', whiteSpace: 'pre',
            fontVariantNumeric: 'tabular-nums',
            color: p.ink, textShadow: shadow,
            ...el('line1'),
          }}
        >
          {p.line1.slice(0, chars1)}
        </span>

        <span
          style={{
            position: 'absolute', left: leftX, top: height * 0.2 + fs1 * 1.45,
            fontSize: fs2, fontWeight: 600, lineHeight: 1.1,
            letterSpacing: '0.24em', textTransform: 'uppercase', whiteSpace: 'pre',
            fontVariantNumeric: 'tabular-nums',
            color: LUXE.inkDim, textShadow: shadow,
            transform: `translate(${parLine2.x.toFixed(2)}px, ${parLine2.y.toFixed(2)}px)`,
            ...el('line2'),
          }}
        >
          {p.line2.slice(0, chars2)}
        </span>
      </div>
    );
  },
});
