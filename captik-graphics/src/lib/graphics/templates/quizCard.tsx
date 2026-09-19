// Quiz card — question + A/B/C answer pills; wrong answers die one beat apart BEFORE the
// right one celebrates, so the reveal order carries the suspense. Every verdict mark DRAWS
// (dash-swept wobbly strokes), and the strike rides a preserveAspectRatio="none" viewBox so
// it fits any answer length without DOM measurement.

import { interpolate, random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, inkOn, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, smear, swingIn, vel } from '../juice';

/** Straight-ish stroke with seeded hand jitter and a slight bow. */
function wobblyStroke(x0: number, y0: number, x1: number, y1: number, seed: string, amp: number): string {
  const N = 6;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const bow = Math.sin(f * Math.PI) * amp * 0.5;
    const x = x0 + (x1 - x0) * f + (random(`${seed}-x${i}`) - 0.5) * amp;
    const y = y0 + (y1 - y0) * f + bow + (random(`${seed}-y${i}`) - 0.5) * amp;
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return 'M ' + pts.join(' L ');
}

export const quizCard = defineGraphicsTemplate({
  id: 'quiz_card',
  name: 'Quiz Card',
  category: 'story',
  tags: ['Quiz', 'Question', 'Answers', 'Check', 'Cross'],
  badge: 'New',
  design: { w: 900, h: 760 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 6000,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 58 },
  fonts: ['montserrat'],

  elements: [
    { key: 'card',     label: 'Card', hideable: false },
    { key: 'question', label: 'Question', hideable: false },
    { key: 'ans1',     label: 'Answer A' },
    { key: 'ans2',     label: 'Answer B' },
    { key: 'ans3',     label: 'Answer C' },
  ],

  params: [
    { type: 'text', key: 'question', label: 'Question', group: 'Content',
      default: 'Which planet is closest to the Sun?', maxLength: 80 },
    { type: 'text', key: 'answers', label: 'Answers', group: 'Content', multiline: true, maxLength: 160,
      default: 'Venus\nMercury|right\nMars',
      help: 'One answer per line: text | right marks the correct one (up to 3).' },

    { type: 'color', key: 'paper',  label: 'Paper',   group: 'Style', default: '#F5F1E6' },
    { type: 'color', key: 'ink',    label: 'Ink',     group: 'Style', default: '#22201B' },
    { type: 'color', key: 'right',  label: 'Correct', group: 'Style', default: '#4ADE80' },
    { type: 'color', key: 'wrong',  label: 'Wrong',   group: 'Style', default: '#E5484D' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Suspense in sound: the card lands on a paper flick, each wrong answer takes a dry snap as
  // its X strikes, and the correct one gets the chime — same verdict schedule as the marks.
  sfx: (p) => {
    const n = p.answers.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).length;
    const wrongs = Math.max(0, n - 1);
    return [
      { atMs: p.delay + 240, id: 'paper' as const, gain: 0.45 },
      ...Array.from({ length: Math.min(2, wrongs) }, (_, k) => ({
        atMs: p.delay + 2500 + k * 520 + 150,
        id: 'snap' as const,
        gain: 0.45,
      })),
      { atMs: p.delay + 2500 + wrongs * 520 + 360, id: 'chime' as const, gain: 0.6 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t <= 0) return null;
    const ff = fontStack('montserrat');

    const rows = p.answers.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3)
      .map((l) => {
        const [text = '', flag = ''] = l.split('|').map((s) => s.trim());
        return { text, right: /^(right|correct|yes|true|1)$/i.test(flag) };
      });
    let rightIdx = rows.findIndex((r) => r.right);
    if (rightIdx < 0) rightIdx = 0;
    const wrongOrder = rows.map((_, i) => i).filter((i) => i !== rightIdx);

    const tilt = (random(`${seed}-tilt`) - 0.5) * 2.4;
    const enterAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 24, mass: 0.85, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(650))),
    });
    const enter = enterAt(t);
    // Casual paper toss: the quiz card hinges in on its existing spring and keeps a faint
    // desk-sway; the drop's velocity smears it and dies the frame it lands.
    const pose = depthPose(t, seed, { enter, rx: -12, ry: -5, z: -70, swayDeg: 0.9 });
    const vCard = vel((ms) => (1 - enterAt(ms)) * height * 0.06, t);
    const smCard = smear(0, vCard, 1.2);
    const questionIn = spring({
      frame: fr(t - 220), fps: FPS,
      config: { damping: 23, mass: 0.75, stiffness: 160 },
      durationInFrames: Math.max(1, Math.round(fr(540))),
    });

    // Verdict schedule: wrongs X out one beat apart, then the right one checks.
    const verdictT = 2500;
    const beat = 520;
    const rightT = verdictT + wrongOrder.length * beat + 260;

    const fsQ = Math.round(height * 0.058);
    const fsA = Math.round(height * 0.044);
    const rowH = height * 0.128;
    const chipS = Math.round(rowH * 0.55);
    const lenMark = chipS * 1.5;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: p.paper,
          borderRadius: 24,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
          opacity: interpolate(enter, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
          filter: smCard.blurPx > 0.3 ? `blur(${smCard.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} translateY(${((1 - enter) * height * 0.06).toFixed(2)}px) rotate(${(tilt + (1 - enter) * 1.8).toFixed(3)}deg) scale(${smCard.sx.toFixed(4)}, ${smCard.sy.toFixed(4)})`,
          fontFamily: ff,
          padding: `${Math.round(height * 0.07)}px ${Math.round(width * 0.065)}px`,
          boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          ...el('card'),
        }}
      >
        <span
          style={{
            fontSize: fsQ, fontWeight: 700, color: p.ink, lineHeight: 1.25,
            opacity: interpolate(questionIn, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
            transform: `translateY(${((1 - questionIn) * height * 0.035).toFixed(2)}px)`,
            ...el('question'),
          }}
        >
          {p.question}
        </span>

        <div style={{ marginTop: height * 0.055, display: 'flex', flexDirection: 'column', gap: height * 0.035 }}>
          {rows.map((row, i) => {
            const k = `ans${i + 1}`;
            // Z-STAGGER: each pill hinges in from a slightly different angle with a velocity
            // smear — the answers arrive in space, then hold crisp for the verdicts.
            const riseAt = (ms: number) => spring({
              frame: fr(ms - 750 - i * 320), fps: FPS,
              config: { damping: 22, mass: 0.7, stiffness: 175 },
              durationInFrames: Math.max(1, Math.round(fr(520))),
            });
            const rise = riseAt(t);
            const vRow = vel((ms) => (1 - riseAt(ms)) * rowH * 0.45, t);
            const smRow = smear(0, vRow, 1.2);

            const isRight = i === rightIdx;
            const wrongAt = verdictT + wrongOrder.indexOf(i) * beat;
            const strike = isRight ? 0 : easeOutQuint(clamp01((t - wrongAt) / 340));
            const x1 = isRight ? 0 : easeOutQuint(clamp01((t - wrongAt - 120) / 230));
            const x2 = isRight ? 0 : easeOutQuint(clamp01((t - wrongAt - 250) / 230));
            const check = isRight ? easeOutQuint(clamp01((t - rightT) / 380)) : 0;
            // Pulse 1 → 1.06 → 1: two ramps, up fast, settle slow.
            const pulse = isRight
              ? 1 + 0.06 * (easeOutQuint(clamp01((t - rightT) / 150)) - easeOutQuint(clamp01((t - rightT - 150) / 430)))
              : 1;
            const ring = isRight ? easeOutQuint(clamp01((t - rightT) / 560)) : 0;
            const dim = 1 - 0.55 * strike;

            return (
              <div
                key={k}
                style={{
                  display: 'flex', alignItems: 'center', gap: width * 0.03,
                  height: rowH,
                  padding: `0 ${Math.round(width * 0.032)}px`,
                  borderRadius: 20,
                  border: `2px solid ${rgba(p.ink, 0.14)}`,
                  background: check > 0 ? rgba(p.right, 0.1 * check) : rgba(p.ink, 0.035),
                  boxShadow: check > 0 ? `inset 0 0 0 2.5px ${rgba(p.right, check)}` : undefined,
                  opacity: interpolate(rise, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }) * dim,
                  filter: smRow.blurPx > 0.3 ? `blur(${smRow.blurPx.toFixed(2)}px)` : undefined,
                  transform: `${swingIn(rise, { rx: -13, ry: i % 2 ? 8 : -8, z: -55 })} translateY(${((1 - rise) * rowH * 0.45).toFixed(2)}px) scale(${(pulse * smRow.sx).toFixed(4)}, ${(pulse * smRow.sy).toFixed(4)})`,
                  ...el(k),
                }}
              >
                <div style={{ position: 'relative', width: chipS, height: chipS, flexShrink: 0 }}>
                  <div
                    style={{
                      position: 'absolute', inset: 0, borderRadius: 999,
                      border: `3px solid ${rgba(p.ink, 0.45)}`,
                      background: check > 0 ? rgba(p.right, check) : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: chipS * 0.48, fontWeight: 800,
                      color: rgba(p.ink, 0.75),
                    }}
                  >
                    <span style={{ opacity: 1 - Math.max(x1, check) }}>
                      {'ABC'[i]}
                    </span>
                  </div>
                  <svg
                    width={chipS} height={chipS} viewBox={`0 0 ${chipS} ${chipS}`}
                    style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
                  >
                    {!isRight && (
                      <>
                        <path
                          d={wobblyStroke(chipS * 0.26, chipS * 0.26, chipS * 0.74, chipS * 0.74, `${seed}-${k}-a`, 1.8)}
                          fill="none" stroke={p.wrong} strokeWidth={Math.max(4, chipS * 0.13)}
                          strokeLinecap="round" strokeLinejoin="round"
                          strokeDasharray={lenMark} strokeDashoffset={((1 - x1) * lenMark).toFixed(1)}
                        />
                        <path
                          d={wobblyStroke(chipS * 0.74, chipS * 0.26, chipS * 0.26, chipS * 0.74, `${seed}-${k}-b`, 1.8)}
                          fill="none" stroke={p.wrong} strokeWidth={Math.max(4, chipS * 0.13)}
                          strokeLinecap="round" strokeLinejoin="round"
                          strokeDasharray={lenMark} strokeDashoffset={((1 - x2) * lenMark).toFixed(1)}
                        />
                      </>
                    )}
                    {isRight && (
                      <path
                        d={`${wobblyStroke(chipS * 0.24, chipS * 0.54, chipS * 0.42, chipS * 0.72, `${seed}-${k}-c1`, 1.6)} L ${(chipS * 0.76).toFixed(1)} ${(chipS * 0.3).toFixed(1)}`}
                        fill="none" stroke={inkOn(p.right)} strokeWidth={Math.max(4, chipS * 0.13)}
                        strokeLinecap="round" strokeLinejoin="round"
                        strokeDasharray={lenMark} strokeDashoffset={((1 - check) * lenMark).toFixed(1)}
                      />
                    )}
                  </svg>
                  {isRight && ring > 0 && ring < 1 && (
                    <div
                      style={{
                        position: 'absolute', inset: -chipS * 0.14, borderRadius: 999,
                        border: `3px solid ${p.right}`,
                        opacity: 1 - ring,
                        transform: `scale(${(0.8 + 0.85 * ring).toFixed(4)})`,
                      }}
                    />
                  )}
                </div>

                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: fsA, fontWeight: 600, lineHeight: 1.2, color: p.ink,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {row.text}
                  </span>
                  {!isRight && strike > 0 && (
                    <svg
                      viewBox="0 0 100 12" preserveAspectRatio="none"
                      style={{ position: 'absolute', left: '-1%', right: '18%', top: '38%', height: fsA * 0.5, width: '83%' }}
                    >
                      <path
                        d={wobblyStroke(2, 6, 98, 6, `${seed}-${k}-s`, 2.2)}
                        fill="none" stroke={p.wrong} strokeWidth={1.6}
                        strokeLinecap="round" strokeLinejoin="round"
                        strokeDasharray={120} strokeDashoffset={((1 - strike) * 120).toFixed(1)}
                      />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
