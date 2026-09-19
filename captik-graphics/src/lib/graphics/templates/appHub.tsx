// Reference: text/notion-animated-hub.mp4  (window 600-3280ms, page set by ~1920ms)
// A workspace page assembling: brand mark, then the sidebar items one at a time, then the title,
// body and link. Everything is left-aligned against a hairline column, which is what makes the
// staggered arrivals read as a page building rather than parts appearing at random.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGlow, luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, swingIn } from '../juice';

const MAX_NAV = 6;

export const appHub = defineGraphicsTemplate({
  id: 'app_hub',
  name: 'App Hub',
  category: 'device',
  tags: ['App', 'Workspace', 'Assemble'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 3600,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'page',  label: 'Page', hideable: false },
    { key: 'brand', label: 'Brand' },
    { key: 'nav',   label: 'Sidebar' },
    { key: 'title', label: 'Title' },
    { key: 'body',  label: 'Body' },
    { key: 'link',  label: 'Link' },
    ...Array.from({ length: MAX_NAV }, (_, i) => ({ key: `item${i + 1}`, label: `Nav ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'brand', label: 'Brand',  group: 'Content', default: 'Notion', maxLength: 24 },
    { type: 'text', key: 'nav',   label: 'Sidebar', group: 'Content', multiline: true, maxLength: 160,
      default: '⌂ Home\n◫ Docs\n✓ Tasks\n▤ Calendar\n⚙ Settings', help: 'One per line.' },
    { type: 'text', key: 'title', label: 'Title',  group: 'Content', default: 'Project Hub', maxLength: 40 },
    { type: 'text', key: 'body',  label: 'Body',   group: 'Content', multiline: true, maxLength: 160,
      default: 'Everything your team needs in\none place' },
    { type: 'text', key: 'link',  label: 'Link',   group: 'Content', default: 'Start with a template', maxLength: 40 },

    { type: 'color',  key: 'bg',    label: 'Page',   group: 'Style', default: '#0F0F13' },
    { type: 'color',  key: 'ink',   label: 'Title',  group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',   label: 'Sidebar text', group: 'Style', default: '#8F8B80' },
    { type: 'color',  key: 'accent', label: 'Link',  group: 'Style', default: '#F59E0B' },
    { type: 'font',   key: 'font',  label: 'Font',   group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',  label: 'Title size', group: 'Style', default: 84, min: 14, max: 140, step: 2, unit: 'px' },
    { type: 'number', key: 'navSize', label: 'Sidebar size', group: 'Style', default: 28, min: 8, max: 44, step: 1, unit: 'px' },
    { type: 'boolean', key: 'rule', label: 'Sidebar divider', group: 'Style', default: true },

    { type: 'number', key: 'brandAt', label: 'Brand at',   group: 'Motion', default: 120, min: 0, max: 2500, step: 20, unit: 'ms' },
    { type: 'number', key: 'navAt',   label: 'Sidebar at', group: 'Motion', default: 160, min: 0, max: 3000, step: 20, unit: 'ms' },
    { type: 'number', key: 'navGap',  label: 'Nav stagger', group: 'Motion', default: 280, min: 0, max: 500, step: 10, unit: 'ms' },
    { type: 'number', key: 'bodyAt',  label: 'Title at',   group: 'Motion', default: 420, min: 0, max: 4000, step: 20, unit: 'ms' },
    { type: 'number', key: 'bodyGap', label: 'Copy stagger', group: 'Motion', default: 220, min: 0, max: 900, step: 20, unit: 'ms' },
  ],

  // Device language, quiet: a glossy pop for the brand mark, a light pass as the sidebar starts
  // building, a dry snap when the title lands — all timed off the same stagger params.
  sfx: (p) => [
    { atMs: p.brandAt, id: 'pop', gain: 0.5 },
    { atMs: p.navAt, id: 'swish', gain: 0.35 },
    { atMs: p.bodyAt + 200, id: 'snap', gain: 0.45 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const items = p.nav.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_NAV);

    const at = (ms: number) => spring({
      frame: fr(timeMs - ms), fps: FPS,
      config: { damping: 26, mass: 0.6, stiffness: 185 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const rise = (s: number) => `translateY(${((1 - s) * height * 0.016).toFixed(2)}px)`;

    // DEPTH: the whole page is an app SCREEN — it swings in as a plane (side-hinged, deeper ry)
    // and then rests nearly still (sway 1.0), while the sidebar, brand and copy column shear at
    // different parallax depths. Each nav row and copy block arrives with its own small 3D fold
    // (z-stagger) so the page builds from objects, not divs.
    const pageIn = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 30, mass: 0.8, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(520))),
    });
    const pose = depthPose(timeMs, seed, { enter: pageIn, ry: 16, rx: -7, z: -120, swayDeg: 1.0 });
    const parBrand = parallax(timeMs, seed, 0.35, width * 0.008);
    const parNav = parallax(timeMs, seed, 0.3, width * 0.008);
    const parCopy = parallax(timeMs, seed, 0.18, width * 0.008);
    const titleIn = at(p.bodyAt);
    const focusTitle = (1 - titleIn) * 4;

    const pad = width * 0.05;

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.bg, fontFamily: ff,
          padding: pad, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: height * 0.072,
          opacity: clamp01(pageIn * 2.2),
          transform: pose,
          ...el('page'),
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: pad * 0.28,
            opacity: clamp01(at(p.brandAt) * 1.6),
            transform: `${swingIn(at(p.brandAt), { rx: -12, z: -60 })} translate(${parBrand.x.toFixed(2)}px, ${(parBrand.y + (1 - at(p.brandAt)) * height * 0.016).toFixed(2)}px)`,
            ...el('brand'),
          }}
        >
          <div style={{ width: p.size * 0.62, height: p.size * 0.62, borderRadius: p.size * 0.12, background: p.ink, color: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: p.size * 0.4, fontWeight: 800, boxShadow: '0 10px 26px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)' }}>
            {p.brand.trim().charAt(0) || 'N'}
          </div>
          <span style={{ fontSize: p.size * 0.78, fontWeight: 700, color: p.ink }}>{p.brand}</span>
        </div>

        <div style={{ display: 'flex', gap: pad * 0.9, alignItems: 'flex-start' }}>
          <div
            style={{
              position: 'relative',
              width: '26%', display: 'flex', flexDirection: 'column', gap: p.navSize * 0.8,
              paddingRight: pad * 0.5,
              transform: `translate(${parNav.x.toFixed(2)}px, ${parNav.y.toFixed(2)}px)`,
              ...el('nav'),
            }}
          >
            {p.rule && (
              // Rule grows with the revealed items so it never outruns the stagger.
              <div
                style={{
                  position: 'absolute', right: 0, top: 0, width: 2,
                  height: `${(items.reduce((a, _, i) => a + clamp01(at(p.navAt + i * p.navGap) * 1.7), 0) / Math.max(1, items.length) * 100).toFixed(1)}%`,
                  background: rgba(p.dim, 0.2),
                }}
              />
            )}
            {items.map((it, i) => {
              const s = at(p.navAt + i * p.navGap);
              return (
                <span
                  key={i}
                  style={{
                    fontSize: p.navSize, color: p.dim, whiteSpace: 'nowrap',
                    opacity: clamp01(s * 1.7),
                    transform: `${swingIn(s, { ry: -16, z: -50 })} translateX(${((1 - s) * -width * 0.02).toFixed(2)}px)`,
                    ...el(`item${i + 1}`),
                  }}
                >
                  {it}
                </span>
              );
            })}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: p.size * 0.28, paddingTop: p.size * 1.2, transform: `translate(${parCopy.x.toFixed(2)}px, ${parCopy.y.toFixed(2)}px)` }}>
            <span
              style={{
                fontSize: p.size, fontWeight: 700, color: p.ink, lineHeight: 1.1,
                letterSpacing: -p.size * 0.02,
                opacity: clamp01(titleIn * 1.6),
                filter: focusTitle > 0.3 ? `blur(${focusTitle.toFixed(2)}px)` : undefined,
                transform: `${swingIn(titleIn, { rx: -14, z: -70 })} ${rise(titleIn)}`,
                ...el('title'),
              }}
            >
              {p.title}
            </span>
            <span
              style={{
                fontSize: p.size * 0.4, color: p.dim, lineHeight: 1.45, whiteSpace: 'pre-line',
                opacity: clamp01(at(p.bodyAt + p.bodyGap) * 1.6),
                transform: `${swingIn(at(p.bodyAt + p.bodyGap), { rx: -10, z: -50 })} ${rise(at(p.bodyAt + p.bodyGap))}`,
                ...el('body'),
              }}
            >
              {p.body}
            </span>
            <span
              style={{
                fontSize: p.size * 0.38, color: p.accent, fontWeight: 500,
                textShadow: luxeGlow(p.accent, 0.5),
                opacity: clamp01(at(p.bodyAt + p.bodyGap * 2) * 1.6),
                transform: `${swingIn(at(p.bodyAt + p.bodyGap * 2), { rx: -10, z: -50 })} ${rise(at(p.bodyAt + p.bodyGap * 2))}`,
                ...el('link'),
              }}
            >
              {p.link}
            </span>
          </div>
        </div>

        <div style={luxeVignette(0.35)} />
        <div style={luxeGrain(0.045)} />
      </div>
    );
  },
});
