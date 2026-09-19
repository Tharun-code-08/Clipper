// Broadcast news strap: the amber top bar sweeps across first, the dark strap unrolls
// rightward under it (scaleX from left), the caps headline slides in, a LIVE chip pulses red,
// and the dim sub line drifts left like a slow ticker for the whole hold. The headline only
// fades in AFTER the unroll spring has effectively settled, so the scaleX stretch never
// touches a glyph — the strap distorts, type never does.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, outRamp, rgba } from '../motion';
import { LUXE, easeOutQuint } from '../luxe';
import { depthPose, smear, vel } from '../juice';

export const newsStrap = defineGraphicsTemplate({
  id: 'news_strap',
  name: 'News Strap',
  category: 'notify',
  tags: ['Strap', 'Broadcast', 'Live', 'Ticker', 'Lower third'],
  badge: 'New',
  design: { w: 900, h: 260 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 74, widthPercent: 76 },
  fonts: ['anton', 'montserrat'],

  elements: [
    { key: 'bar',      label: 'Accent bar' },
    { key: 'strap',    label: 'Strap', hideable: false },
    { key: 'headline', label: 'Headline', hideable: false },
    { key: 'live',     label: 'Live chip' },
    { key: 'sub',      label: 'Sub line' },
  ],

  params: [
    { type: 'text', key: 'headline', label: 'Headline', group: 'Content', default: 'THIS CHANGES THE GAME', maxLength: 40 },
    { type: 'text', key: 'sub',      label: 'Sub line', group: 'Content', default: 'The full story nobody is talking about', maxLength: 80 },
    { type: 'boolean', key: 'live',  label: 'LIVE chip', group: 'Content', default: true },

    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'bg',     label: 'Strap',  group: 'Style', default: '#0B0B0D' },
    { type: 'color', key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },
    { type: 'font',  key: 'font',   label: 'Headline font', group: 'Style', default: 'anton' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // DOCU: a long airy sweep under the build, a glass accent as the headline lands (760
  // mirrors its ramp), and a low blip when the LIVE chip arrives (980) — all delay-shifted.
  sfx: (p) => {
    const cues = [
      { atMs: p.delay + 30, id: 'sweep' as const, gain: 0.45 },
      { atMs: p.delay + 760, id: 'glass' as const, gain: 0.4 },
    ];
    return p.live ? [...cues, { atMs: p.delay + 980, id: 'blip' as const, gain: 0.3 }] : cues;
  },

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const out = outRamp(timeMs, durationMs, 320);

    const barIn = easeOutQuint(clamp01(t / 380));
    const unrollAt = (ms: number) => spring({
      frame: fr(ms - 240), fps: FPS,
      config: { damping: 24, mass: 0.8, stiffness: 150 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    const unroll = unrollAt(t);
    const headIn = easeOutQuint(clamp01((t - 760) / 450));
    const liveIn = easeOutQuint(clamp01((t - 980) / 380));
    const subIn = easeOutQuint(clamp01((t - 640) / 420));
    const pulse = 0.5 + 0.5 * Math.sin(t / 230);
    // Ticker drift: starts once the sub line has landed, then a slow constant crawl.
    const tickX = -Math.max(0, t - 1400) * 0.018;

    // DEPTH, whispered: broadcast chrome tips in on a very shallow bottom hinge and keeps a
    // ≤1° sway — present, never showy. The bar's sweep and the strap's unroll each ride their
    // own velocity as horizontal blur that dies the frame they settle; type never distorts.
    const enterU = clamp01(t / 420);
    const pose = depthPose(t, seed, { enter: enterU * (2 - enterU), rx: 7, z: -40, swayDeg: 0.6, periodMs: 4800 });
    const barXAt = (ms: number) => (easeOutQuint(clamp01(ms / 380)) - 1) * width;
    const barSmear = smear(vel(barXAt, t) * 0.45, 0);
    const strapSmear = smear(vel(unrollAt, t) * width * 0.35, 0);

    const barH = Math.max(4, Math.round(height * 0.028));
    const strapH = Math.round(height * 0.56);
    const subH = Math.round(height * 0.24);
    const padX = Math.round(width * 0.032);
    const fsHead = Math.round(strapH * 0.46);
    const fsSub = Math.round(subH * 0.42);

    return (
      <div style={{ position: 'absolute', inset: 0, opacity: out, fontFamily: fontStack('montserrat'), transform: pose, transformOrigin: '50% 80%' }}>
        {/* The bar SLIDES across (translate inside a clipped runner) — deliberately a different
            verb from the strap's scaleX unroll, so the two entrances read as two beats. */}
        <div style={{ width: '100%', height: barH, overflow: 'hidden', ...el('bar') }}>
          <div
            style={{
              width: '100%', height: '100%',
              background: p.accent,
              boxShadow: `0 0 14px ${rgba(p.accent, 0.45)}`,
              filter: barSmear.blurPx > 0.3 ? `blur(${barSmear.blurPx.toFixed(2)}px)` : undefined,
              transform: `translateX(${((barIn - 1) * 100).toFixed(2)}%)`,
            }}
          />
        </div>

        <div
          style={{
            position: 'relative', width: '100%', height: strapH, overflow: 'hidden',
            background: `linear-gradient(180deg, ${rgba('#FFFFFF', 0.06)} 0%, transparent 40%), ${p.bg}`,
            borderBottom: `1px solid ${LUXE.hairline}`,
            boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
            filter: strapSmear.blurPx > 0.3 ? `blur(${strapSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `scaleX(${(unroll * strapSmear.sx).toFixed(4)})`,
            transformOrigin: 'left center',
            ...el('strap'),
          }}
        >
          <span
            style={{
              position: 'absolute', left: padX, top: '50%',
              fontFamily: fontStack(p.font),
              fontSize: fsHead, fontWeight: 400, lineHeight: 1,
              letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap',
              color: p.ink,
              maxWidth: p.live ? width * 0.72 : width * 0.9,
              overflow: 'hidden',
              opacity: headIn,
              transform: `translate(${((1 - headIn) * -width * 0.04).toFixed(2)}px, -50%)`,
              ...el('headline'),
            }}
          >
            {p.headline}
          </span>

          {p.live && (
            <div
              style={{
                position: 'absolute', right: padX, top: '50%',
                display: 'flex', alignItems: 'center', gap: Math.round(fsHead * 0.18),
                padding: `${Math.round(fsHead * 0.14)}px ${Math.round(fsHead * 0.24)}px`,
                borderRadius: 6,
                background: rgba(LUXE.red, 0.14),
                border: `1px solid ${rgba(LUXE.red, 0.45)}`,
                opacity: liveIn,
                transform: 'translateY(-50%)',
                ...el('live'),
              }}
            >
              <div
                style={{
                  width: Math.round(fsHead * 0.18), height: Math.round(fsHead * 0.18), borderRadius: '50%',
                  background: LUXE.red,
                  opacity: 0.45 + 0.55 * pulse,
                  boxShadow: `0 0 ${Math.round(fsHead * 0.3)}px ${rgba(LUXE.red, 0.3 + 0.45 * pulse)}`,
                }}
              />
              <span style={{ fontSize: Math.round(fsHead * 0.3), fontWeight: 800, letterSpacing: '0.14em', color: p.ink }}>
                LIVE
              </span>
            </div>
          )}
        </div>

        <div
          style={{
            width: '100%', height: subH, overflow: 'hidden',
            display: 'flex', alignItems: 'center', paddingLeft: padX,
            background: rgba(p.bg, 0.82),
            opacity: subIn,
            ...el('sub'),
          }}
        >
          <span
            style={{
              fontSize: fsSub, fontWeight: 600, letterSpacing: '0.06em',
              color: LUXE.inkDim, whiteSpace: 'nowrap',
              transform: `translateX(${tickX.toFixed(2)}px)`,
            }}
          >
            {p.sub}
          </span>
        </div>
      </div>
    );
  },
});
