// PUNCH word slam — up to four words hammer in one after another, each on its own seeded
// tilt and horizontal anchor, earlier words dimming to 60% as the next lands. The dim is keyed
// to the NEXT word's impact moment (not its spring start), so attention transfers on the hit
// itself. A '*' line prefix paints that word amber.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { smear, sway3d, swingIn, vel } from '../juice';

const INK = '#F4F1E8';
const BG = '#0B0B0D';

/** Decaying settle-shake: pure function of ms-since-impact — zero before the hit, a couple of
 *  fast oscillations after, dead within ~450ms. Never random per frame. */
function settle(ms: number, amp: number): { x: number; y: number } {
  if (ms <= 0 || amp <= 0) return { x: 0, y: 0 };
  const d = Math.exp(-ms / 130);
  return { x: Math.sin(ms / 34) * amp * d, y: Math.cos(ms / 26) * amp * 0.7 * d };
}

export const wordSlam = defineGraphicsTemplate({
  id: 'word_slam',
  name: 'Word Slam',
  category: 'title',
  tags: ['Words', 'Slam', 'Stacked', 'Tilted', 'Bold'],
  badge: 'New',
  design: { w: 900, h: 500 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 3500,
  defaultBox: { xPercent: 50, yPercent: 40, widthPercent: 80 },
  fonts: ['anton'],

  elements: [
    { key: 'word1', label: 'Word 1', hideable: false },
    { key: 'word2', label: 'Word 2' },
    { key: 'word3', label: 'Word 3' },
    { key: 'word4', label: 'Word 4' },
  ],

  params: [
    { type: 'text', key: 'words', label: 'Words', group: 'Content', multiline: true, maxLength: 80,
      default: 'THIS\nCHANGES\n*EVERYTHING',
      help: 'One word per line, up to 4. Prefix a line with * to paint that word amber.' },

    { type: 'color',   key: 'accent', label: 'Accent',          group: 'Style', default: '#F59E0B' },
    { type: 'font',    key: 'font',   label: 'Font',            group: 'Style', default: 'anton' },
    { type: 'boolean', key: 'plate',  label: 'Draw background', group: 'Style', default: true },

    { type: 'number', key: 'stagger', label: 'Word stagger', group: 'Motion', default: 550, min: 200, max: 1200, step: 10, unit: 'ms' },
    { type: 'number', key: 'shake',   label: 'Shake',        group: 'Motion', default: 3, min: 0, max: 10, step: 0.5, unit: 'px' },
    { type: 'number', key: 'delay',   label: 'Delay',        group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Air on the way in, then hits on the words' own impact beats — the LAST word (the payoff)
  // takes the lone full-gain slam. Impacts mirror impactOf() in render: start + 150ms.
  sfx: (p) => {
    const n = Math.max(1, Math.min(4, p.words.split('\n').map((s) => s.trim())
      .filter((s) => s.replace(/^\*/, '').trim().length > 0).length));
    const impact = (i: number) => p.delay + 220 + i * p.stagger + 150;
    const cues: { atMs: number; id: 'whoosh' | 'slam'; gain: number }[] = [
      { atMs: p.delay + 150, id: 'whoosh', gain: 0.6 },
    ];
    if (n > 1) cues.push({ atMs: impact(0), id: 'slam', gain: 0.55 });
    cues.push({ atMs: impact(n - 1), id: 'slam', gain: 1 });
    return cues;
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);
    const words = p.words.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 4)
      .map((raw) => ({ amber: raw.startsWith('*'), text: (raw.startsWith('*') ? raw.slice(1) : raw).trim() }))
      .filter((w) => w.text.length > 0);
    if (!words.length) return null;

    const rootIn = clamp01(t / 140);
    // Word i's spring starts here; it reaches full size ~150ms later — that is its impact.
    const startOf = (i: number) => 220 + i * p.stagger;
    const impactOf = (i: number) => startOf(i) + 150;

    const base = (height * 0.72) / words.length;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          opacity: rootIn,
          fontFamily: ff,
          borderRadius: 28,
          overflow: p.plate ? 'hidden' : 'visible',
          background: p.plate ? `linear-gradient(180deg, #17171A 0%, ${BG} 55%)` : 'transparent',
          border: p.plate ? '1px solid rgba(255,255,255,0.10)' : 'none',
          boxShadow: p.plate ? '0 24px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)' : 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: height * 0.012,
          // The stack never flattens back into a web page — a ±1.7° sway holds the card in space
          // through the whole run (rotation-only: safe under the midpoint-translate test).
          transform: sway3d(t, seed, 1.7),
        }}
      >
        {words.map((w, i) => {
          // Fast slam: scale stamps down from 2.1; damping 15 leaves a 1-2 frame overshoot that
          // reads as the word compressing into the card. Only ever ONE word mid-slam at a time.
          const slamAt = (ms: number) => spring({
            frame: fr(ms - startOf(i)), fps: FPS,
            config: { damping: 15, mass: 0.7, stiffness: 210 },
            durationInFrames: Math.max(1, Math.round(fr(460))),
          });
          const slam = slamAt(t);
          const scale = 2.1 - 1.1 * slam;
          const shk = settle(t - impactOf(i), p.shake);
          const dim = i < words.length - 1 ? 1 - 0.4 * clamp01((t - impactOf(i + 1)) / 180) : 1;
          const rot = (random(`${seed}-r${i}`) - 0.5) * 6;
          const dx = (random(`${seed}-x${i}`) - 0.5) * width * 0.09;
          const fs = Math.min(base, (width * 1.5) / Math.max(3, w.text.length));
          // Each word hammers in through 3D on its own hinge — side-hinged TOWARD its anchor
          // offset so the stack reads as objects arriving from different depths — and its slam
          // velocity drives a smear that is gone the frame it lands.
          const hinge = {
            rx: -11 - random(`${seed}-hx${i}`) * 8,
            ry: (dx >= 0 ? 1 : -1) * (12 + random(`${seed}-hy${i}`) * 9),
            z: -100,
          };
          const vW = vel(slamAt, t) * fs * 0.6;
          const sm = smear(0, vW, 1.05);
          return (
            <span
              key={i}
              style={{
                fontSize: Math.round(fs), fontWeight: 900, lineHeight: 0.95,
                letterSpacing: '0.02em', whiteSpace: 'nowrap', textTransform: 'uppercase',
                color: w.amber ? p.accent : INK,
                opacity: clamp01(slam * 3) * dim,
                filter: sm.blurPx > 0.3 ? `blur(${sm.blurPx.toFixed(2)}px)` : undefined,
                transform: `${swingIn(slam, hinge)} translate(${(dx + shk.x).toFixed(2)}px, ${shk.y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${(scale * sm.sx).toFixed(4)}, ${(scale * sm.sy).toFixed(4)})`,
                transformOrigin: 'center center',
                textShadow: w.amber
                  ? `0 0 ${Math.round(fs * 0.16)}px ${rgba(p.accent, 0.35)}, 0 8px 26px rgba(0,0,0,0.45)`
                  : '0 8px 26px rgba(0,0,0,0.45)',
                ...el(`word${i + 1}`),
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    );
  },
});
