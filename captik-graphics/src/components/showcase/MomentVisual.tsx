'use client';

// THE VISUAL PER MOMENT KIND.
//
// This is the part that makes an edit an explanation rather than decoration: a figure is
// PROMOTED, a list is BUILT, a comparison PLACES BOTH, a mechanism REPRESENTS its parts, a
// warning is MARKED, a concept is NAMED. Same animation on all six would be decoration.
//
// Every value is a pure function of `t` (ms since the moment started), so scrubbing is exact
// and preview matches any future export. No CSS keyframes: they free-run on wall time.

import type { MomentKind } from '@/lib/autopilot/scriptPlan';

export interface Brand {
  ground: string; support: string; accent: string; ink: string;
  hero: string; body: string;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 2.6);
/** Overshoot then settle — the pop the references use on an object landing. */
const back = (t: number) => {
  const k = clamp01(t);
  return k >= 1 ? 1 : 1 - Math.pow(1 - k, 3) * Math.cos(k * Math.PI * 1.1);
};

export function MomentVisual({
  kind, anchor, items, t, brand, w, h,
}: {
  kind: MomentKind; anchor: string; items: string[];
  t: number; brand: Brand; w: number; h: number;
}) {
  const s = w / 270;                       // geometry authored at 270px wide
  const label = anchor.toUpperCase();

  // ── FIGURE — promote it. The number alone, hero scale, everything else clears.
  if (kind === 'figure') {
    const k = back(t / 420);
    const settle = easeOut((t - 420) / 900);
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', transform: `scale(${0.72 + 0.28 * k})`, opacity: clamp01(t / 180) }}>
          <div style={{
            fontFamily: brand.hero, fontSize: 92 * s, lineHeight: 0.88, color: brand.accent,
            letterSpacing: '-0.03em', textShadow: `0 ${8 * s}px ${30 * s}px rgba(0,0,0,.45)`,
          }}>{label}</div>
          <div style={{
            fontFamily: brand.body, fontWeight: 800, fontSize: 11 * s, letterSpacing: '.3em',
            color: brand.ink, marginTop: 8 * s,
            clipPath: `inset(0 ${(1 - settle) * 100}% 0 0)`,
          }}>{items[0]?.toUpperCase() ?? ''}</div>
        </div>
      </div>
    );
  }

  // ── LIST — build it. Items arrive one at a time and EARLIER ONES PERSIST.
  if (kind === 'list') {
    const STEP = 420;
    return (
      <div style={{ position: 'absolute', left: '12%', top: '26%', right: '12%' }}>
        {items.slice(0, 4).map((it, i) => {
          const k = easeOut((t - i * STEP) / 340);
          if (k <= 0) return null;
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10 * s, marginBottom: 12 * s,
              opacity: k, transform: `translateX(${(1 - k) * -18 * s}px)`,
            }}>
              <div style={{
                width: 22 * s, height: 22 * s, flexShrink: 0, background: brand.accent,
                color: brand.ground, fontFamily: brand.body, fontWeight: 800,
                fontSize: 11 * s, display: 'grid', placeItems: 'center',
              }}>{i + 1}</div>
              <div style={{
                fontFamily: brand.body, fontWeight: 700, fontSize: 15 * s, color: brand.ink,
                background: `${brand.ground}cc`, padding: `${3 * s}px ${8 * s}px`,
              }}>{it.toUpperCase()}</div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── COMPARISON — place BOTH. Two panels; the second lands after the first.
  if (kind === 'comparison') {
    const a = easeOut(t / 320);
    const b = easeOut((t - 260) / 320);
    const panel = (txt: string, k: number, top: string, colour: string) => (
      <div style={{
        position: 'absolute', left: '10%', right: '10%', top, height: '22%',
        background: colour, opacity: k, transform: `translateY(${(1 - k) * 14 * s}px)`,
        display: 'grid', placeItems: 'center',
        fontFamily: brand.body, fontWeight: 800, fontSize: 15 * s, color: brand.ink,
        letterSpacing: '.04em',
      }}>{txt.toUpperCase()}</div>
    );
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        {panel(items[0] ?? 'BEFORE', a, '28%', `${brand.support}ee`)}
        {panel(items[1] ?? label, b, '54%', brand.accent)}
        <div style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          fontFamily: brand.hero, fontSize: 16 * s, color: brand.ink, opacity: b,
        }}>VS</div>
      </div>
    );
  }

  // ── MECHANISM — represent it. Parts in order, connected, so the structure is the point.
  if (kind === 'mechanism') {
    // A mechanism is a SEQUENCE — one box represents nothing. Fall back to the anchor plus
    // a consequence so the shape still reads when the sentence yielded only one noun.
    const src = items.length >= 2 ? items : [label, ...items.filter((i) => i !== label), 'RESULT'];
    const parts = src.slice(0, 3);
    return (
      <div style={{
        position: 'absolute', left: '8%', right: '8%', top: '34%',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {parts.map((p, i) => {
          const k = easeOut((t - i * 300) / 300);
          if (k <= 0) return null;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div style={{
                flex: 1, textAlign: 'center', opacity: k,
                transform: `scale(${0.85 + 0.15 * k})`,
                border: `${2 * s}px solid ${brand.accent}`, padding: `${8 * s}px ${4 * s}px`,
                fontFamily: brand.body, fontWeight: 800, fontSize: 10 * s, color: brand.ink,
                background: `${brand.ground}dd`,
              }}>{p.toUpperCase()}</div>
              {i < parts.length - 1 && (
                <div style={{
                  width: 18 * s, height: 2 * s, background: brand.accent, margin: `0 ${3 * s}px`,
                  opacity: clamp01((t - i * 300 - 220) / 220), transformOrigin: 'left',
                }} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── WARNING — mark it. The thing lands, then a strike is drawn through it.
  if (kind === 'warning') {
    const k = back(t / 380);
    const strike = easeOut((t - 380) / 300);
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ position: 'relative', transform: `scale(${0.8 + 0.2 * k})`, opacity: clamp01(t / 160) }}>
          <div style={{
            fontFamily: brand.hero, fontSize: 40 * s, color: brand.ink,
            letterSpacing: '-0.01em', padding: `${4 * s}px ${10 * s}px`,
          }}>{label}</div>
          <div style={{
            position: 'absolute', left: 0, top: '52%', height: 5 * s, background: brand.accent,
            width: `${strike * 100}%`, transform: 'rotate(-4deg)',
            boxShadow: `0 ${2 * s}px ${8 * s}px rgba(0,0,0,.4)`,
          }} />
        </div>
      </div>
    );
  }

  // ── CONCEPT — name it. The term lands as an object and HOLDS long enough to read.
  const k = back(t / 400);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{
        transform: `translateY(${(1 - k) * 16 * s}px) scale(${0.9 + 0.1 * k})`,
        opacity: clamp01(t / 200),
        background: brand.ground, border: `${2 * s}px solid ${brand.accent}`,
        padding: `${10 * s}px ${18 * s}px`,
      }}>
        <div style={{
          fontFamily: brand.body, fontWeight: 800, fontSize: 8 * s, letterSpacing: '.32em',
          color: brand.accent, marginBottom: 4 * s,
        }}>NEW</div>
        <div style={{ fontFamily: brand.hero, fontSize: 26 * s, color: brand.ink, lineHeight: 1 }}>
          {label}
        </div>
      </div>
    </div>
  );
}
