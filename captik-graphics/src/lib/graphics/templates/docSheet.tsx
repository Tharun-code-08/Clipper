// Reference: graphics/morph-blocks.mp4  (window 680-7960ms, sheet full ~4200ms)
// A tilted document with a window bar, a typed command line, a blocky ASCII heading, and bullet
// lines filling in underneath.
//
// The heading is built from a 5x7 block font rather than a typeface, because the reference's
// letterforms are literal squares — rendering it as text and hoping for a blocky face would depend
// on a font that may not be there in the export.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { LUXE, luxeGrain } from '../luxe';
import { depthPose, swingIn } from '../juice';

const MAX_LINES = 8;
const LIGHTS = ['#ff5f57', '#febc2e', '#28c840'];

/** 5x7 block glyphs. Only the characters a short heading needs; anything else draws as a full box. */
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '11110', '10001', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '11100', '10010', '10001', '10001', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '11110', '10100', '10010', '10001', '10001'],
  S: ['01111', '10000', '01110', '00001', '00001', '10001', '01110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

export const docSheet = defineGraphicsTemplate({
  id: 'doc_sheet',
  name: 'Doc Sheet',
  category: 'story',
  tags: ['Document', 'Terminal', 'Notes', 'Luxury'],
  design: { w: 820, h: 1100 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 7600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 84 },
  fonts: ['inter', 'pixel'],

  elements: [
    { key: 'sheet',   label: 'Sheet', hideable: false },
    { key: 'bar',     label: 'Window bar' },
    { key: 'command', label: 'Command line' },
    { key: 'heading', label: 'Block heading' },
    { key: 'lines',   label: 'Body lines' },
  ],

  params: [
    { type: 'text', key: 'window',  label: 'Window title', group: 'Content', default: 'Terminal', maxLength: 24 },
    { type: 'text', key: 'command', label: 'Command',      group: 'Content', default: 'npx skills add link-dev/skills', maxLength: 60 },
    { type: 'text', key: 'heading', label: 'Block heading', group: 'Content', default: 'SKILLS', maxLength: 10,
      help: 'Drawn as blocks. Letters A-U supported; others render as solid boxes.' },
    { type: 'text', key: 'lines',   label: 'Body lines',   group: 'Content', multiline: true, maxLength: 300,
      default: 'Source: https://github.com/link-dev/skills\nRepository created\nPlaced 1 skill\nSkill link-dev/screenshots\nRefreshed 12 agents\nInstallation complete',
      help: 'One per line.' },

    { type: 'color',  key: 'paper', label: 'Sheet', group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'ink',   label: 'Text',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Secondary', group: 'Style', default: '#8B8778' },
    { type: 'font',   key: 'font',  label: 'Font',  group: 'Style', default: 'pixel' },
    { type: 'number', key: 'size',  label: 'Body size', group: 'Style', default: 15, min: 6, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'block', label: 'Block size', group: 'Style', default: 13, min: 3, max: 40, step: 1, unit: 'px' },
    { type: 'number', key: 'tilt',  label: 'Tilt',  group: 'Style', default: -2, min: -15, max: 15, step: 0.5, unit: '°' },
    { type: 'number', key: 'shadow', label: 'Shadow', group: 'Style', default: 0.14, min: 0, max: 0.5, step: 0.02 },

    { type: 'number', key: 'sheetAt', label: 'Sheet at',   group: 'Motion', default: 100, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'cps',     label: 'Command speed', group: 'Motion', default: 14, min: 1, max: 60, step: 1, unit: 'ch/s' },
    { type: 'number', key: 'headAt',  label: 'Heading at', group: 'Motion', default: 2600, min: 0, max: 8000, step: 50, unit: 'ms' },
    { type: 'number', key: 'linesAt', label: 'Body at',    group: 'Motion', default: 3400, min: 0, max: 9000, step: 50, unit: 'ms' },
    { type: 'number', key: 'perLine', label: 'Per line',   group: 'Motion', default: 420, min: 40, max: 1500, step: 20, unit: 'ms' },
  ],

  // Paper flick as the sheet lands, one soft key thock as the command starts typing
  // (sheetAt + 300 in the render), a dry snap when the block heading stamps in, a light
  // pass as the body lines start filling — all off the same Motion params as the render.
  sfx: (p) => [
    { atMs: p.sheetAt + 220, id: 'paper', gain: 0.45 },
    { atMs: p.sheetAt + 400, id: 'type', gain: 0.5 },
    { atMs: p.headAt + 120, id: 'snap', gain: 0.55 },
    { atMs: p.linesAt + 80, id: 'swish', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, width, seed }) => {
    const ff = fontStack(p.font);
    const lines = p.lines.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_LINES);

    const sheetIn = spring({
      frame: fr(timeMs - p.sheetAt), fps: FPS,
      config: { damping: 22, mass: 0.9, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    const typed = p.command.slice(0, Math.max(0, Math.floor(((timeMs - p.sheetAt - 300) / 1000) * p.cps)));
    const headIn = spring({
      frame: fr(timeMs - p.headAt), fps: FPS,
      config: { damping: 24, mass: 0.7, stiffness: 165 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });

    const chars = [...p.heading.toUpperCase()].slice(0, 10);
    const pad = width * 0.075;

    // The sheet is a scrap of paper on a desk: a shallow casual hinge in (keeping its own
    // tilt), then a sub-degree resting sway — never flat, never glossy. The entrance racks
    // into focus and the blur is gone the moment the spring settles.
    const pose = depthPose(timeMs - p.sheetAt, seed, { enter: sheetIn, rx: -10, z: -80, swayDeg: 1, periodMs: 4600 });
    const rack = (1 - Math.min(1, sheetIn)) * 3;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, ${rgba('#ffffff', 0.04)} 0%, ${rgba('#000000', 0.32)} 100%), ${p.paper}`,
          border: `1px solid ${LUXE.hairline}`,
          borderRadius: width * 0.022,
          overflow: 'hidden',
          padding: 0, boxSizing: 'border-box',
          fontFamily: ff,
          boxShadow: p.shadow > 0
            ? `0 ${width * 0.022}px ${width * 0.055}px ${rgba('#000000', Math.min(1, p.shadow * 1.6))}, 0 ${width * 0.06}px ${width * 0.13}px ${rgba('#000000', Math.min(1, p.shadow * 1.9))}, inset 0 1px 0 ${rgba('#ffffff', 0.06)}`
            : `inset 0 1px 0 ${rgba('#ffffff', 0.06)}`,
          opacity: clamp01(sheetIn * 1.8),
          filter: rack > 0.3 ? `blur(${rack.toFixed(2)}px)` : undefined,
          transform:
            `${pose} rotate(${(p.tilt * sheetIn).toFixed(2)}deg) `
            + `scale(${interpolate(sheetIn, [0, 1], [0.92, 1]).toFixed(4)})`,
          ...el('sheet'),
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: width * 0.012,
            padding: `${pad * 0.35}px ${pad * 0.5}px`,
            borderBottom: `1px solid ${rgba('#ffffff', 0.09)}`,
            background: rgba('#ffffff', 0.02),
            ...el('bar'),
          }}
        >
          {LIGHTS.map((c) => (
            <span key={c} style={{ width: width * 0.016, height: width * 0.016, borderRadius: '50%', background: c, opacity: 0.9 }} />
          ))}
          <span style={{ marginLeft: 'auto', marginRight: 'auto', fontSize: p.size * 0.85, color: p.dim, letterSpacing: '0.08em' }}>{p.window}</span>
        </div>

        <div style={{ padding: pad, display: 'flex', flexDirection: 'column', gap: p.size * 1.2 }}>
          <div style={{ fontSize: p.size, color: p.ink, whiteSpace: 'pre', ...el('command') }}>
            <span style={{ color: LUXE.gold, textShadow: `0 0 12px ${rgba(LUXE.gold, 0.4)}` }}>❯ </span>
            {typed}
            <span style={{ color: LUXE.gold, opacity: typed.length < p.command.length ? 1 : 0 }}>▌</span>
          </div>

          <div
            style={{
              display: 'flex', gap: p.block * 1.2,
              opacity: clamp01(headIn * 1.8),
              // The block heading stamps in as an OBJECT — a top-hinged swing on its own
              // spring, so the ASCII slab arrives in space instead of fading in place.
              transform: `${swingIn(headIn, { rx: -16, z: -60 })} translateY(${((1 - headIn) * p.block * 2).toFixed(2)}px)`,
              filter: `drop-shadow(0 0 ${p.block * 0.9}px ${rgba(p.ink, 0.22)})`,
              ...el('heading'),
            }}
          >
            {chars.map((ch, ci) => {
              const rows = GLYPHS[ch] ?? ['11111', '11111', '11111', '11111', '11111', '11111', '11111'];
              return (
                <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {rows.map((row, r) => (
                    <div key={r} style={{ display: 'flex', gap: 1 }}>
                      {[...row].map((bit, c) => (
                        <span
                          key={c}
                          style={{
                            width: p.block, height: p.block,
                            background: bit === '1' ? p.ink : 'transparent',
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: p.size * 0.6, ...el('lines') }}>
            {lines.map((l, i) => {
              const s = spring({
                frame: fr(timeMs - p.linesAt - i * p.perLine), fps: FPS,
                config: { damping: 28, mass: 0.6, stiffness: 175 },
                durationInFrames: Math.max(1, Math.round(fr(380))),
              });
              return (
                <div
                  key={i}
                  style={{
                    fontSize: p.size, color: i === 0 ? p.dim : p.ink, lineHeight: 1.4,
                    opacity: clamp01(s * 1.8),
                    transform: `translateX(${((1 - s) * width * 0.02).toFixed(2)}px)`,
                  }}
                >
                  {l}
                </div>
              );
            })}
          </div>
        </div>

        <div style={luxeGrain(0.045)} />
      </div>
    );
  },
});
