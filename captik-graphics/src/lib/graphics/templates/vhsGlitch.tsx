// Full-frame VHS pass — scanline field, a rolling tracking band, seeded RGB-split burst strips
// and a pixel-font PLAY OSD with a running counter. Craft: every jitter re-rolls on a 40-45ms
// floor() clock — per-frame randomness reads as digital static, but poses HELD for 1-2 frames
// read as tape error. fullBleed: render() gets the REAL frame at any aspect, so every size here
// is a fraction of min(width,height) — absolute px would break preview/export parity.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';

const CHROMA_R = 'rgba(255,0,60,';
const CHROMA_C = 'rgba(0,255,240,';
const STRIPS = 5;

export const vhsGlitch = defineGraphicsTemplate({
  id: 'vhs_glitch',
  name: 'VHS Glitch',
  category: 'fx',
  tags: ['VHS', 'Glitch', 'Scanlines', 'Retro', 'Static'],
  badge: 'New',
  design: { w: 900, h: 900 },
  // Frame-wide effect: hugs the REAL video frame at any aspect; the footage shows through.
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['pixel'],

  elements: [
    { key: 'scan',   label: 'Scanlines', hideable: false },
    { key: 'band',   label: 'Tracking band' },
    { key: 'bursts', label: 'Glitch bursts' },
    { key: 'osd',    label: 'Play OSD' },
  ],

  params: [
    { type: 'text',   key: 'label',   label: 'OSD label',     group: 'Content', default: 'PLAY', maxLength: 10 },
    { type: 'number', key: 'tcStart', label: 'Counter start', group: 'Content', default: 754, min: 0, max: 30000, step: 1, unit: 's' },

    { type: 'color',  key: 'ink',       label: 'OSD ink',   group: 'Style', default: '#F4F1E8' },
    { type: 'number', key: 'intensity', label: 'Intensity', group: 'Style', default: 1, min: 0.3, max: 1.5, step: 0.05 },

    { type: 'number', key: 'rollMs', label: 'Band roll', group: 'Motion', default: 2800, min: 600, max: 8000, step: 100, unit: 'ms',
      help: 'How long the tracking band takes to roll down the whole frame. It loops.' },
    { type: 'number', key: 'bursts', label: 'Glitch bursts', group: 'Motion', default: 3, min: 0, max: 6, step: 1,
      help: 'RGB-split bursts spread across the window, each at a seeded moment.' },
    { type: 'number', key: 'delay',  label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // A dry snap as the OSD lands, a rounded blip on the FIRST glitch burst only (its time is
  // deterministic below precisely so this cue can be honest). Later bursts stay unscored —
  // scoring every burst reads as noise.
  sfx: (p) => [
    { atMs: p.delay + 120, id: 'snap', gain: 0.35 },
    { atMs: p.delay + 750, id: 'blip', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;

    const m = Math.min(width, height);
    const intens = p.intensity;

    // Scanline pitch + slow crawl — a fraction of the frame, never absolute px.
    const lh = Math.max(1, m * 0.0035);
    const crawl = (t / 60) % (lh * 2);

    // Tracking band rolls top -> bottom on a loop; its x jitter holds for 45ms per pose.
    const bh = m * 0.055;
    const roll = (t % Math.max(1, p.rollMs)) / Math.max(1, p.rollMs);
    const yBand = roll * (height + bh * 2) - bh;
    const step = Math.floor(t / 45);
    const jx = (random(`${seed}-bx${step}`) - 0.5) * m * 0.02;
    const off = m * 0.0045;

    // OSD pops on with the one spring — a quick horizontal snap, then a subtle CRT flicker.
    const os = spring({
      frame: fr(t - 120), fps: FPS,
      config: { damping: 22, mass: 0.8, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(400))),
    });
    const flick = 0.9 + 0.1 * Math.sin(t / 47);
    const sec = Math.max(0, Math.round(p.tcStart)) + Math.floor(t / 1000);
    const tc = `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    const fsO = m * 0.034;
    const chromaShadow = `${(m * 0.0018).toFixed(1)}px 0 ${CHROMA_R}0.75), -${(m * 0.0018).toFixed(1)}px 0 ${CHROMA_C}0.75)`;

    const nBursts = Math.max(0, Math.round(p.bursts));

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', fontFamily: fontStack('pixel') }}>
        <div style={{ position: 'absolute', inset: 0, ...el('scan') }}>
          <div
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: `repeating-linear-gradient(180deg, rgba(0,0,0,${(0.16 * intens).toFixed(3)}) 0px, rgba(0,0,0,${(0.16 * intens).toFixed(3)}) ${lh.toFixed(2)}px, transparent ${lh.toFixed(2)}px, transparent ${(lh * 2).toFixed(2)}px)`,
              backgroundPosition: `0px ${crawl.toFixed(2)}px`,
            }}
          />
          {/* Chroma fringe on the frame edges — the lens/tape colour error that sells "VHS". */}
          <div
            style={{
              position: 'absolute', inset: 0,
              background: `linear-gradient(90deg, ${CHROMA_R}${(0.06 * intens).toFixed(3)}) 0%, transparent 7%, transparent 93%, ${CHROMA_C}${(0.06 * intens).toFixed(3)}) 100%)`,
            }}
          />
          <div style={luxeVignette(0.38 * Math.min(1, intens))} />
        </div>

        <div style={{ position: 'absolute', inset: 0, ...el('band') }}>
          <div
            style={{
              position: 'absolute', left: 0, right: 0,
              top: yBand.toFixed(1), height: bh.toFixed(1),
              transform: `translateX(${jx.toFixed(2)}px)`,
              opacity: 0.85 * Math.min(1, intens),
            }}
          >
            <div style={{ ...luxeGrain(0.55), mixBlendMode: 'screen', backgroundPosition: `${(random(`${seed}-gp${step}`) * 128).toFixed(1)}px 0px` }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: '16%', height: '24%', background: `${CHROMA_R}${(0.28 * intens).toFixed(3)})`, mixBlendMode: 'screen', transform: `translateX(${off.toFixed(2)}px)` }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: '58%', height: '24%', background: `${CHROMA_C}${(0.28 * intens).toFixed(3)})`, mixBlendMode: 'screen', transform: `translateX(${(-off).toFixed(2)}px)` }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(1, m * 0.0018), background: 'rgba(255,255,255,0.3)' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.max(1, m * 0.0018), background: 'rgba(255,255,255,0.3)' }} />
          </div>
          {/* Head-switching tear pinned to the bottom edge — every real VHS has one. */}
          <div
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              height: (m * 0.014).toFixed(1),
              transform: `translateX(${((random(`${seed}-tx${step}`) - 0.5) * m * 0.03).toFixed(2)}px)`,
              opacity: 0.8 * Math.min(1, intens),
            }}
          >
            <div style={{ ...luxeGrain(0.7), mixBlendMode: 'screen' }} />
          </div>
        </div>

        <div style={{ position: 'absolute', inset: 0, ...el('bursts') }}>
          {Array.from({ length: nBursts }, (_, i) => {
            // The FIRST burst is at a fixed 750ms so the sound cue can land exactly on it at any
            // duration; the rest stay seeded across the window so the pattern reads organic.
            const bt = i === 0 ? 750 : durationMs * ((i + 0.25 + random(`${seed}-bt${i}`) * 0.5) / Math.max(1, nBursts));
            const bDur = 130 + random(`${seed}-bd${i}`) * 90;
            const a = t - bt;
            if (a < 0 || a >= bDur) return null;
            const fade = 1 - a / bDur;
            const jstep = Math.floor(a / 40);
            return Array.from({ length: STRIPS }, (_, j) => {
              const sh = m * (0.005 + random(`${seed}-b${i}h${j}`) * 0.016);
              const y = random(`${seed}-b${i}y${j}`) * (height - sh);
              const dx = (random(`${seed}-b${i}j${j}s${jstep}`) - 0.5) * m * 0.03;
              const op = 0.5 * intens * fade;
              return (
                <div key={`${i}-${j}`} style={{ position: 'absolute', left: 0, right: 0, top: y.toFixed(1), height: sh.toFixed(1) }}>
                  <div style={{ position: 'absolute', inset: 0, background: `${CHROMA_R}0.4)`, mixBlendMode: 'screen', opacity: op.toFixed(3) as unknown as number, transform: `translateX(${(dx + off).toFixed(2)}px)` }} />
                  <div style={{ position: 'absolute', inset: 0, background: `${CHROMA_C}0.4)`, mixBlendMode: 'screen', opacity: op.toFixed(3) as unknown as number, transform: `translateX(${(dx - off).toFixed(2)}px)` }} />
                  <div style={{ ...luxeGrain(0.6), mixBlendMode: 'screen', opacity: op, transform: `translateX(${dx.toFixed(2)}px)` }} />
                </div>
              );
            });
          })}
        </div>

        <div
          style={{
            position: 'absolute',
            left: (m * 0.045).toFixed(1), top: (m * 0.04).toFixed(1),
            color: p.ink,
            fontSize: fsO.toFixed(1),
            letterSpacing: '0.1em',
            textShadow: chromaShadow,
            opacity: clamp01(os * 2),
            transform: `translateX(${((1 - os) * m * 0.012).toFixed(2)}px)`,
            ...el('osd'),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: fsO * 0.4, opacity: flick.toFixed(3) as unknown as number }}>
            <span>{p.label}</span>
            <svg viewBox="0 0 100 100" width={(fsO * 0.72).toFixed(1)} height={(fsO * 0.72).toFixed(1)}>
              <polygon points="8,4 96,50 8,96" fill={p.ink} opacity={0.95} />
            </svg>
          </div>
          <div style={{ marginTop: (fsO * 0.4).toFixed(1), fontSize: (fsO * 0.78).toFixed(1), color: rgba(p.ink, 0.85) }}>
            {tc}
          </div>
        </div>
      </div>
    );
  },
});
