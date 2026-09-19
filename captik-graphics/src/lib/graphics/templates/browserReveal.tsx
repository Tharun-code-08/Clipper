// Reference: social/website-reveal.mp4  (window 240-2440ms, sharp by ~1040ms)
// A browser window resolving out of a defocus: it arrives soft and slightly oversized and pulls
// into focus rather than sliding or popping. Measured at 386x508 in a 422x752 capture (0.76:1),
// with the blur gone by ~800ms.
//
// The capture lays its whole page out at once behind the blur. Here each region gets its own short
// spring underneath the focus pull, so the page assembles while it sharpens — the founder bar is
// that no two parts move as one block, and a defocus alone would be exactly that.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, vel } from '../juice';

const LIGHTS = ['#ff5f57', '#febc2e', '#28c840'];
const MAX_POSTS = 3;

export const browserReveal = defineGraphicsTemplate({
  id: 'browser_reveal',
  name: 'Browser Reveal',
  category: 'device',
  tags: ['Browser', 'Website', 'Mockup'],
  design: { w: 900, h: 1180 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 88 },
  fonts: ['inter'],

  elements: [
    { key: 'window',  label: 'Window', hideable: false },
    { key: 'chrome',  label: 'Title bar' },
    { key: 'url',     label: 'Address' },
    { key: 'header',  label: 'Page header' },
    { key: 'sidebar', label: 'Profile card' },
    ...Array.from({ length: MAX_POSTS }, (_, i) => ({ key: `post${i + 1}`, label: `Post ${i + 1}` })),
    { key: 'rail',    label: 'Side rail' },
  ],

  params: [
    { type: 'text',   key: 'url',   label: 'Address', group: 'Content', default: 'yoursite.com', maxLength: 40 },
    { type: 'image',  key: 'shot',  label: 'Page screenshot', group: 'Content', default: '', help: 'Optional — a skeleton page layout is drawn when empty.' },
    { type: 'number', key: 'posts', label: 'Feed cards', group: 'Content', default: 2, min: 1, max: 3, step: 1 },
    { type: 'number', key: 'rows',  label: 'Rail rows',  group: 'Content', default: 4, min: 2, max: 6, step: 1 },

    { type: 'color',  key: 'brand',  label: 'Brand',    group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'bar',    label: 'Title bar', group: 'Style', default: '#141418' },
    { type: 'color',  key: 'page',   label: 'Page',     group: 'Style', default: '#101014' },
    { type: 'color',  key: 'card',   label: 'Cards',    group: 'Style', default: '#17171C' },
    { type: 'color',  key: 'line',   label: 'Placeholder', group: 'Style', default: '#4A463E' },
    { type: 'font',   key: 'font',   label: 'Font',     group: 'Style', default: 'inter' },
    { type: 'number', key: 'radius', label: 'Corner',   group: 'Style', default: 16, min: 0, max: 60, step: 2, unit: 'px' },
    { type: 'number', key: 'shadow', label: 'Shadow',   group: 'Style', default: 0.3, min: 0, max: 0.6, step: 0.01 },

    { type: 'number', key: 'blur',    label: 'Defocus',   group: 'Motion', default: 22, min: 0, max: 60, step: 1, unit: 'px' },
    { type: 'number', key: 'focusMs', label: 'Focus pull', group: 'Motion', default: 800, min: 100, max: 2500, step: 20, unit: 'ms' },
    { type: 'number', key: 'rise',    label: 'Rise',      group: 'Motion', default: 34, min: 0, max: 200, step: 2, unit: 'px' },
    { type: 'number', key: 'stagger', label: 'Content stagger', group: 'Motion', default: 90, min: 0, max: 400, step: 10, unit: 'ms' },
  ],

  // Air pass as the plane swings in, a dry snap when the focus rack lands sharp, and one soft
  // UI pop as the last page region (the rail, part 6) settles — device language, no slams.
  sfx: (p) => [
    { atMs: 0, id: 'whoosh', gain: 0.45 },
    { atMs: p.focusMs * 0.92, id: 'snap', gain: 0.5 },
    { atMs: p.focusMs * 0.35 + 6 * p.stagger + 180, id: 'pop', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);

    const openAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 200, mass: 0.9, stiffness: 120 },
      durationInFrames: Math.max(1, Math.round(fr(p.focusMs))),
    });
    const open = openAt(timeMs);
    // Blur trails the scale slightly, so the window is already settling when it snaps sharp —
    // pulling both on the same curve reads as a cross-fade instead of a focus rack.
    const sharp = interpolate(timeMs, [0, p.focusMs * 0.92], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const blur = p.blur * (1 - sharp) ** 1.6;

    // DEPTH: the window arrives as a PLANE — side-hinged swing through house perspective — and
    // then rests nearly still (sway 1.1: it is a screen mimic, not a floating card). Its rise
    // velocity drives a motion smear that dies exactly when the focus rack lands, and the page
    // regions parallax subtly against the glass at different depths.
    const pose = depthPose(timeMs, seed, { enter: open, ry: 18, rx: -8, z: -140, swayDeg: 1.1 });
    const vRise = vel((ms: number) => (1 - openAt(ms)) * p.rise, timeMs);
    const wSmear = smear(0, vRise);
    const blurAll = blur + wSmear.blurPx;
    const parHead = parallax(timeMs, seed, 0.22, width * 0.008);
    const parSide = parallax(timeMs, seed, 0.3, width * 0.008);
    const parPost = parallax(timeMs, seed, 0.25, width * 0.008);
    const parRail = parallax(timeMs, seed, 0.35, width * 0.008);

    /** Each region's own entrance, offset behind the focus pull. */
    const part = (i: number) => spring({
      frame: fr(timeMs - p.focusMs * 0.35 - i * p.stagger), fps: FPS,
      config: { damping: 24, mass: 0.6, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(360))),
    });

    const chromeH = Math.round(height * 0.045);
    const pad = Math.round(width * 0.022);
    const dot = Math.round(chromeH * 0.22);
    const cardR = Math.round(width * 0.011);
    const colGap = Math.round(width * 0.018);

    /** A grey placeholder bar — the whole page is built from these. */
    const bar = (w: string | number, h: number, tone = 1) => (
      <div style={{ width: w, height: h, borderRadius: h / 2, background: rgba(p.line, tone), flexShrink: 0 }} />
    );

    const posts = Array.from({ length: p.posts }, (_, i) => i);
    const rows = Array.from({ length: p.rows }, (_, i) => i);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          borderRadius: p.radius, overflow: 'hidden',
          background: p.page, fontFamily: ff,
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: p.shadow > 0 ? `0 ${width * 0.02}px ${width * 0.05}px ${rgba('#000000', p.shadow * 0.8)}, 0 ${width * 0.06}px ${width * 0.16}px ${rgba('#000000', p.shadow)}, inset 0 1px 0 rgba(255,255,255,0.06)` : undefined,
          opacity: clamp01(open * 2.5),
          filter: blurAll > 0.15 ? `blur(${blurAll.toFixed(2)}px)` : undefined,
          transform:
            `${pose} translateY(${((1 - open) * p.rise).toFixed(2)}px) `
            + `scale(${(interpolate(open, [0, 1], [1.06, 1]) * wSmear.sx).toFixed(4)}, ${(interpolate(open, [0, 1], [1.06, 1]) * wSmear.sy).toFixed(4)})`,
          ...el('window'),
        }}
      >
        <div
          style={{
            height: chromeH, background: p.bar,
            display: 'flex', alignItems: 'center', padding: `0 ${pad * 0.7}px`, gap: dot * 0.7,
            boxSizing: 'border-box',
            ...el('chrome'),
          }}
        >
          {LIGHTS.map((c) => (
            <div key={c} style={{ width: dot, height: dot, borderRadius: '50%', background: c }} />
          ))}
          <div
            style={{
              margin: '0 auto',
              height: chromeH * 0.52, padding: `0 ${pad}px`, borderRadius: 99,
              background: rgba('#ffffff', 0.12),
              display: 'flex', alignItems: 'center', gap: pad * 0.3,
              fontSize: Math.round(chromeH * 0.3), color: rgba('#ffffff', 0.8),
              opacity: interpolate(part(0), [0, 0.7], [0, 1], { extrapolateRight: 'clamp' }),
              ...el('url'),
            }}
          >
            <span style={{ width: dot * 0.6, height: dot * 0.6, borderRadius: 2, background: '#28c840' }} />
            {p.url}
          </div>
          {[0, 1, 2, 3].map((k) => (
            <div key={k} style={{ width: dot * 1.1, height: dot * 1.1, borderRadius: 2, background: rgba('#ffffff', 0.16) }} />
          ))}
        </div>

        {p.shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.shot} alt="" style={{ width: '100%', height: `calc(100% - ${chromeH}px)`, objectFit: 'cover', display: 'block', transform: `translate(${parPost.x.toFixed(2)}px, ${parPost.y.toFixed(2)}px) scale(1.04)` }} />
        ) : (
        <div style={{ padding: pad, display: 'flex', flexDirection: 'column', gap: pad * 0.8, boxSizing: 'border-box' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: pad * 0.5,
              opacity: interpolate(part(1), [0, 0.7], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `translate(${parHead.x.toFixed(2)}px, ${(parHead.y + (1 - part(1)) * height * 0.012).toFixed(2)}px)`,
              ...el('header'),
            }}
          >
            <div style={{ width: pad * 1.9, height: pad * 1.9, borderRadius: cardR, background: p.brand }} />
            <span style={{ flex: 1 }} />
            {[0, 1, 2, 3].map((k) => (
              <div key={k} style={{ width: pad * 1.1, height: pad * 1.1, borderRadius: cardR * 0.5, background: rgba(p.line, 0.9), flexShrink: 0 }} />
            ))}
          </div>

          <div style={{ display: 'flex', gap: colGap, alignItems: 'flex-start' }}>
            <div
              style={{
                width: '26%', background: p.card, borderRadius: cardR, overflow: 'hidden', flexShrink: 0,
                border: '1px solid rgba(255,255,255,0.07)', boxSizing: 'border-box',
                opacity: interpolate(part(2), [0, 0.6], [0, 1], { extrapolateRight: 'clamp' }),
                transform: `translate(${parSide.x.toFixed(2)}px, ${(parSide.y + (1 - part(2)) * height * 0.016).toFixed(2)}px)`,
                ...el('sidebar'),
              }}
            >
              <div style={{ height: pad * 2.4, background: p.brand }} />
              <div style={{ padding: pad * 0.6, display: 'flex', flexDirection: 'column', gap: pad * 0.35 }}>
                <div style={{ width: pad * 2.6, height: pad * 2.6, borderRadius: '50%', background: rgba(p.line, 1), border: `${pad * 0.16}px solid ${p.card}`, marginTop: -pad * 1.7, boxSizing: 'border-box' }} />
                {bar('72%', pad * 0.42)}
                {bar('46%', pad * 0.34, 0.7)}
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: colGap }}>
              {posts.map((i) => {
                const s = part(3 + i);
                return (
                  <div
                    key={i}
                    style={{
                      background: p.card, borderRadius: cardR, padding: pad * 0.6,
                      border: '1px solid rgba(255,255,255,0.07)',
                      display: 'flex', flexDirection: 'column', gap: pad * 0.35,
                      opacity: interpolate(s, [0, 0.6], [0, 1], { extrapolateRight: 'clamp' }),
                      transform: `translate(${parPost.x.toFixed(2)}px, ${(parPost.y + (1 - s) * height * 0.018).toFixed(2)}px)`,
                      ...el(`post${i + 1}`),
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: pad * 0.4 }}>
                      <div style={{ width: pad * 1.3, height: pad * 1.3, borderRadius: '50%', background: rgba(p.line, 1), flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: pad * 0.2 }}>
                        {bar(pad * 5, pad * 0.34)}
                        {bar(pad * 3, pad * 0.26, 0.7)}
                      </div>
                    </div>
                    {bar('96%', pad * 0.3, 0.85)}
                    {bar('88%', pad * 0.3, 0.85)}
                    {bar('54%', pad * 0.3, 0.85)}
                  </div>
                );
              })}
            </div>

            <div
              style={{
                width: '24%', background: p.card, borderRadius: cardR, padding: pad * 0.6, flexShrink: 0,
                border: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', flexDirection: 'column', gap: pad * 0.45, boxSizing: 'border-box',
                opacity: interpolate(part(6), [0, 0.6], [0, 1], { extrapolateRight: 'clamp' }),
                transform: `translate(${parRail.x.toFixed(2)}px, ${(parRail.y + (1 - part(6)) * height * 0.016).toFixed(2)}px)`,
                ...el('rail'),
              }}
            >
              {bar('60%', pad * 0.36)}
              {rows.map((k) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: pad * 0.35 }}>
                  <div style={{ width: pad * 0.8, height: pad * 0.8, borderRadius: '50%', background: rgba(p.line, 1), flexShrink: 0 }} />
                  {bar(k % 2 === 0 ? '78%' : '62%', pad * 0.28, 0.8)}
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
      </div>
    );
  },
});
