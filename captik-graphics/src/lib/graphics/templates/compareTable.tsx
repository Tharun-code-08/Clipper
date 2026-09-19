// The "us vs them" comparison table on documentary glass. Two option columns, feature rows
// landing one per beat; each row's verdicts stamp in — amber check for OUR column, dim gray
// X for theirs. The right (ours) column carries a faint amber wash and lifts 4px above the
// panel so the eye reads the winner before a single row lands.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, easeOutQuint, luxeGrain, luxeLabel, luxePanel } from '../luxe';
import { depthPose, parallax, swingIn } from '../juice';

const MAX = 5;

export const compareTable = defineGraphicsTemplate({
  id: 'compare_table',
  name: 'Comparison Table',
  category: 'chart',
  tags: ['Compare', 'Table', 'Checks', 'Versus', 'Features'],
  badge: 'New',
  design: { w: 900, h: 800 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5500,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 80 },
  fonts: ['montserrat'],

  elements: [
    { key: 'panel',  label: 'Panel', hideable: false },
    { key: 'heads',  label: 'Column headers' },
    ...Array.from({ length: MAX }, (_, i) => ({ key: `row${i + 1}`, label: `Row ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'left',  label: 'Their column', group: 'Content', default: 'OTHERS', maxLength: 16 },
    { type: 'text', key: 'right', label: 'Your column',  group: 'Content', default: 'US', maxLength: 16 },
    { type: 'text', key: 'rows',  label: 'Features', group: 'Content', multiline: true, maxLength: 300,
      default: 'Fast delivery|x|y\n24/7 support|x|y\nFlat pricing|y|y\nNo lock-in|x|y',
      help: 'One per line: feature | their verdict | your verdict. Use y for a check, x for a cross. Up to 5.' },

    { type: 'color', key: 'accent', label: 'Your colour', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'good',   label: 'Check', group: 'Style', default: '#4ADE80' },

    { type: 'number', key: 'stagger', label: 'Row stagger', group: 'Motion', default: 420, min: 100, max: 1200, step: 20, unit: 'ms' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Quiet DOCU palette: one air sweep on the swing-in, one chime as the last row's hero
  // verdict draws — the payoff beat computed off stagger exactly like the motion.
  sfx: (p) => {
    const n = Math.max(1, Math.min(MAX, p.rows.split('\n').map((l) => l.trim()).filter(Boolean).length));
    return [
      { atMs: p.delay + 60, id: 'whoosh', gain: 0.45 },
      { atMs: p.delay + 350 + (n - 1) * p.stagger + 400, id: 'chime', gain: 0.5 },
    ];
  },

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');

    const rows = p.rows.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX)
      .map((l) => {
        const [, theirs = 'x', ours = 'y'] = l.split('|').map((s) => s.trim().toLowerCase());
        return { feat: l.split('|')[0]?.trim() ?? '', theirs: theirs === 'y', ours: ours !== 'x' };
      });
    if (!rows.length) return null;

    const enter = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 30, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });
    // Depth: the glass swings in top-hinged on the entrance spring and holds a ±1.8° sway;
    // the amber wash (backplate) and the column headers ride different parallax depths so
    // the sway shears them over the rows, which stay glued to the glass.
    const pose = depthPose(t, seed, { enter, rx: -12, z: -80, swayDeg: 1.8 });
    const parWash = parallax(t, seed, 0.3, height * 0.008);
    const parHeads = parallax(t, seed, 0.55, height * 0.008);

    const padX = width * 0.06;
    const headH = height * 0.15;
    const rowH = (height * 0.98 - headH) / Math.max(3, rows.length);
    const colTheirX = width * 0.56;
    const colOursX = width * 0.79;
    // Type must FIT the columns horizontally, so it caps at the height the design aspect
    // would give this width — in a taller instance aspect the rows spread but the type
    // doesn't double into the verdict columns.
    const typeH = Math.min(height, width * (800 / 900));
    const fsFeat = Math.round(typeH * 0.041);
    const fsHead = Math.round(typeH * 0.033);
    const mark = Math.round(typeH * 0.036);

    // A verdict glyph: drawn check or cross, sweeping on with dash-offset.
    const glyph = (ok: boolean, prog: number, hero: boolean) => {
      const len = mark * 3;
      const col = ok ? (hero ? p.good : rgba(LUXE.ink, 0.55)) : rgba(LUXE.ink, 0.3);
      const sw = hero ? 4 : 3;
      return (
        <svg width={mark * 2} height={mark * 2} viewBox="0 0 40 40" style={{ display: 'block' }}>
          {ok ? (
            <path
              d="M 8 21 L 17 30 L 33 11"
              fill="none" stroke={col} strokeWidth={sw + 1.5} strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={len} strokeDashoffset={(1 - prog) * len}
              style={hero ? { filter: `drop-shadow(0 0 6px ${rgba(p.good, 0.55)})` } : undefined}
            />
          ) : (
            <>
              <path d="M 11 11 L 29 29" fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round"
                strokeDasharray={len} strokeDashoffset={(1 - clamp01(prog * 1.6)) * len} />
              <path d="M 29 11 L 11 29" fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round"
                strokeDasharray={len} strokeDashoffset={(1 - clamp01(prog * 1.6 - 0.4)) * len} />
            </>
          )}
        </svg>
      );
    };

    return (
      <div
        style={{
          position: 'absolute', inset: 0, fontFamily: ff, overflow: 'hidden',
          ...luxePanel(Math.round(height * 0.045)),
          opacity: enter,
          transform: `${pose} translateY(${((1 - enter) * height * 0.04).toFixed(2)}px)`,
          transformOrigin: '50% 30%',
          ...el('panel'),
        }}
      >
        {/* Our column's amber wash + hairline lift, behind everything. */}
        <div
          style={{
            position: 'absolute', top: height * 0.035, bottom: height * 0.035,
            left: colOursX - width * 0.093, width: width * 0.186,
            background: `linear-gradient(180deg, ${rgba(p.accent, 0.14)} 0%, ${rgba(p.accent, 0.05)} 100%)`,
            border: `1px solid ${rgba(p.accent, 0.35)}`,
            borderRadius: Math.round(height * 0.028),
            boxShadow: `0 8px 30px ${rgba(p.accent, 0.12)}`,
            transform: `translate(${parWash.x.toFixed(2)}px, ${parWash.y.toFixed(2)}px)`,
          }}
        />

        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, height: headH,
            transform: `translate(${parHeads.x.toFixed(2)}px, ${parHeads.y.toFixed(2)}px)`,
            ...el('heads'),
          }}
        >
          <span style={{ position: 'absolute', left: colTheirX, top: '50%', transform: 'translate(-50%,-50%)', ...luxeLabel(fsHead) }}>
            {p.left}
          </span>
          <span style={{ position: 'absolute', left: colOursX, top: '50%', transform: 'translate(-50%,-50%)', ...luxeLabel(fsHead, p.accent), textShadow: `0 0 14px ${rgba(p.accent, 0.4)}` }}>
            {p.right}
          </span>
        </div>

        {rows.map((r, i) => {
          const at = 350 + i * p.stagger;
          const rowIn = spring({
            frame: fr(t - at), fps: FPS,
            config: { damping: 26, mass: 0.6, stiffness: 175 },
            durationInFrames: Math.max(1, Math.round(fr(420))),
          });
          const verdict = easeOutQuint(clamp01((t - at - 220) / 380));
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: padX, right: padX,
                top: headH + i * rowH, height: rowH,
                display: 'flex', alignItems: 'center',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                opacity: rowIn,
                // Z-stagger: each row swings in side-hinged from its own slightly different
                // angle (overshoot in the row spring tips it past flat and settles).
                transform: `${swingIn(rowIn, { ry: -14 - i * 2, z: -50 })} translateX(${((1 - rowIn) * -width * 0.02).toFixed(2)}px)`,
                transformOrigin: 'left center',
                ...el(`row${i + 1}`),
              }}
            >
              <span style={{ fontSize: fsFeat, fontWeight: 600, color: LUXE.ink, flex: 1 }}>{r.feat}</span>
              <div style={{ position: 'absolute', left: colTheirX - padX, transform: 'translateX(-50%)' }}>
                {glyph(r.theirs, verdict, false)}
              </div>
              <div style={{ position: 'absolute', left: colOursX - padX, transform: 'translateX(-50%)' }}>
                {glyph(r.ours, verdict, true)}
              </div>
            </div>
          );
        })}

        <div style={luxeGrain(0.045)} />
      </div>
    );
  },
});
