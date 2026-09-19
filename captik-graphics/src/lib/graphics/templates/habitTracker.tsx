// A cream habit-tracker card: habit heading, then a 7×4 month grid whose amber day-stamps
// pop in one per fast beat up to the 'filled' count; the rest stay outlined. The craft
// decision: every stamp carries its own seeded rotation and a slightly under-damped pop, so
// the fill reads as hand-stamping a paper tracker, not as a progress bar filling — and when
// the whole month lands, a wobbly streak ellipse wraps the final week.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, inkOn, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Hand-drawn ellipse in a w×h box: seeded radial noise, closed past its own start point. */
function wobblyEllipse(w: number, h: number, seed: string): string {
  const cx = w / 2, cy = h / 2, rx = w * 0.46, ry = h * 0.38;
  const N = 15;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI * 0.3;
    const n = 1 + (random(`${seed}-e${i}`) - 0.5) * 0.07;
    pts.push(`${(cx + Math.cos(a) * rx * n).toFixed(1)} ${(cy + Math.sin(a) * ry * n).toFixed(1)}`);
  }
  return 'M ' + pts.join(' L ');
}

export const habitTracker = defineGraphicsTemplate({
  id: 'habit_tracker',
  name: 'Habit Tracker',
  category: 'story',
  tags: ['Habit', 'Grid', 'Tracker', 'Streak', 'Calendar'],
  badge: 'New',
  design: { w: 900, h: 600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 58 },
  fonts: ['montserrat'],

  elements: [
    { key: 'card',    label: 'Card', hideable: false },
    { key: 'heading', label: 'Heading' },
    { key: 'grid',    label: 'Grid', hideable: false },
    { key: 'streak',  label: 'Streak circle' },
  ],

  params: [
    { type: 'text',   key: 'habit',  label: 'Habit', group: 'Content', default: 'Meditate daily', maxLength: 32 },
    { type: 'number', key: 'filled', label: 'Days filled', group: 'Content', default: 28, min: 0, max: 28, step: 1 },

    { type: 'color', key: 'paper',  label: 'Paper',  group: 'Style', default: '#F5F1E6' },
    { type: 'color', key: 'ink',    label: 'Ink',    group: 'Style', default: '#22201B' },
    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'beat',  label: 'Fill pace', group: 'Motion', default: 90, min: 40, max: 160, step: 5, unit: 'ms' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // PAPER + gamified: the tracker thumps down, ONE tick as the stamping run starts (a tick per
  // stamp at 90ms would be a metronome), then the payoff — a chime when a full month closes the
  // streak, a modest pop when the fill stops short. Beat/filled retime the payoff with the grid.
  sfx: (p) => {
    const fillEnd = 700 + Math.round(p.filled) * p.beat;
    return [
      { atMs: p.delay + 240, id: 'paper' as const, gain: 0.5 },
      { atMs: p.delay + 700, id: 'tick' as const, gain: 0.5 },
      Math.round(p.filled) >= 28
        ? { atMs: p.delay + fillEnd + 420, id: 'chime' as const, gain: 0.55 }
        : { atMs: p.delay + fillEnd + 120, id: 'pop' as const, gain: 0.45 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;
    const ff = fontStack('montserrat');

    const tilt = (random(`${seed}-tilt`) - 0.5) * 2;
    const enterAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 24, mass: 0.85, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });
    const enter = enterAt(t);
    // The card is TOSSED onto the desk (casual paper hinge, faint resting sway) and its drop
    // velocity smears it — blur and stretch die the frame it lands.
    const pose = depthPose(t, seed, { enter, rx: -12, ry: 5, z: -70, swayDeg: 0.9 });
    const vCard = vel((ms) => (1 - enterAt(ms)) * height * 0.07, t);
    const smCard = smear(0, vCard, 1.2);
    const parHead = parallax(t, seed, 0.45, height * 0.009);
    const headIn = spring({
      frame: fr(t - 180), fps: FPS,
      config: { damping: 21, mass: 0.7, stiffness: 170 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });

    // ── Grid geometry: 7 columns × 4 weeks, sized to whichever axis is tighter ──
    const padX = width * 0.075;
    const fsHead = Math.round(height * 0.082);
    const fsDay = Math.round(height * 0.032);
    const gap = width * 0.014;
    const availW = width - padX * 2;
    const dayTop = height * 0.19;
    const dayH = fsDay * 1.35;
    const cellsTop = dayH + height * 0.028; // within the grid container
    const cs = Math.min(
      (availW - gap * 6) / 7,
      (height * 0.955 - dayTop - cellsTop - gap * 3) / 4,
    );
    const gridW = cs * 7 + gap * 6;
    const gridX = padX + (availW - gridW) / 2;
    const radius = cs * 0.24;

    const fillStart = 700;
    const filled = Math.round(p.filled);
    const fillEnd = fillStart + filled * p.beat;

    // Streak ellipse wraps the final week (the bottom row) once the whole month is in.
    const streakOn = filled >= 28;
    const sw = gridW + cs * 0.56;
    const sh = cs * 1.4;
    const streakDraw = easeOutQuint(clamp01((t - fillEnd - 300) / 650));
    const streakPath = wobblyEllipse(sw, sh, `${seed}-st`);
    const lenS = (sw + sh) * 3.2;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.paper,
          borderRadius: 26,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
          opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
          filter: smCard.blurPx > 0.3 ? `blur(${smCard.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} translateY(${((1 - enter) * height * 0.07).toFixed(2)}px) rotate(${(tilt + (1 - enter) * 2).toFixed(3)}deg) scale(${smCard.sx.toFixed(4)}, ${smCard.sy.toFixed(4)})`,
          fontFamily: ff,
          overflow: 'hidden',
          ...el('card'),
        }}
      >
        <span
          style={{
            position: 'absolute', left: padX, top: height * 0.075, right: padX,
            fontSize: fsHead, fontWeight: 700, color: p.ink,
            lineHeight: 1.05, letterSpacing: '-0.01em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            opacity: interpolate(headIn, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
            transform: `translate(${parHead.x.toFixed(2)}px, ${(parHead.y + (1 - headIn) * height * 0.045).toFixed(2)}px)`,
            ...el('heading'),
          }}
        >
          {p.habit}
        </span>

        <div style={{ position: 'absolute', left: gridX, top: dayTop, width: gridW, ...el('grid') }}>
          <div style={{ display: 'flex', gap, height: dayH }}>
            {DAYS.map((d, i) => (
              <span
                key={i}
                style={{
                  width: cs, textAlign: 'center', flexShrink: 0,
                  fontSize: fsDay, fontWeight: 600, letterSpacing: '0.08em',
                  color: rgba(p.ink, 0.45),
                  opacity: easeOutQuint(clamp01((t - 300 - i * 40) / 300)),
                }}
              >
                {d}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap, width: gridW, marginTop: height * 0.028 }}>
            {Array.from({ length: 28 }, (_, i) => {
              const cellIn = easeOutQuint(clamp01((t - 380 - i * 14) / 260));
              const isFilled = i < filled;
              const pop = spring({
                frame: fr(t - fillStart - i * p.beat), fps: FPS,
                config: { damping: 16, mass: 0.55, stiffness: 230 },
                durationInFrames: Math.max(1, Math.round(fr(430))),
              });
              const rot = (random(`${seed}-r${i}`) - 0.5) * 8;
              const j = (k: number) => (random(`${seed}-t${i}-${k}`) - 0.5) * 8;
              return (
                <div
                  key={i}
                  style={{
                    position: 'relative', width: cs, height: cs, flexShrink: 0,
                    boxSizing: 'border-box',
                    border: `${Math.max(2, cs * 0.03).toFixed(1)}px solid ${rgba(p.ink, 0.16)}`,
                    background: rgba(p.ink, 0.04),
                    borderRadius: radius,
                    opacity: cellIn,
                  }}
                >
                  {isFilled && (
                    <div
                      style={{
                        position: 'absolute', inset: -1,
                        background: p.accent,
                        borderRadius: radius,
                        boxShadow: `0 ${(cs * 0.06).toFixed(1)}px ${(cs * 0.16).toFixed(1)}px ${rgba(p.accent, 0.35)}`,
                        opacity: clamp01(pop * 3),
                        transform: `rotate(${rot.toFixed(2)}deg) scale(${pop.toFixed(4)})`,
                      }}
                    >
                      <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                        <path
                          d={`M ${(26 + j(0)).toFixed(1)} ${(55 + j(1)).toFixed(1)} L ${(44 + j(2)).toFixed(1)} ${(71 + j(3)).toFixed(1)} L ${(75 + j(4)).toFixed(1)} ${(31 + j(5)).toFixed(1)}`}
                          fill="none" stroke={inkOn(p.accent)} strokeWidth={12}
                          strokeLinecap="round" strokeLinejoin="round" opacity={0.85}
                        />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {streakOn && (
            <svg
              viewBox={`0 0 ${sw.toFixed(1)} ${sh.toFixed(1)}`} width={sw} height={sh}
              style={{
                position: 'absolute',
                left: -cs * 0.28,
                top: cellsTop + 3 * (cs + gap) - cs * 0.2,
                overflow: 'visible',
                ...el('streak'),
              }}
            >
              <path
                d={streakPath} fill="none" stroke={p.accent}
                strokeWidth={Math.max(5, cs * 0.075)}
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={lenS} strokeDashoffset={((1 - streakDraw) * lenS).toFixed(1)}
              />
            </svg>
          )}
        </div>
      </div>
    );
  },
});
