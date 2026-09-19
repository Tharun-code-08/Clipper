// Cinematic letterbox: black bars close in from top and bottom (the "film moment" cue),
// a tracked-out title fades up between them with a slow 2% push-in, and the bars breathe
// open again at the end. The whole template is an overlay — footage stays visible between
// the bars, so it turns any shot into a title shot without a cut.

import { Easing, interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain } from '../luxe';
import { smear, vel } from '../juice';

export const letterboxTitle = defineGraphicsTemplate({
  id: 'letterbox_title',
  name: 'Letterbox Title',
  category: 'title',
  tags: ['Cinematic', 'Bars', 'Widescreen', 'Film', 'Title'],
  badge: 'New',
  design: { w: 900, h: 1600 },
  // The bars MUST hug the real frame edges — as a fixed-aspect sticker this template is
  // meaningless. Type is sized off min(width, height) so the title reads the same weight on
  // 16:9, 9:16 and 1:1; bar depth stays a fraction of the actual frame height.
  fullBleed: true,
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat', 'playfair'],

  elements: [
    { key: 'bars',  label: 'Bars', hideable: false },
    { key: 'title', label: 'Title', hideable: false },
    { key: 'sub',   label: 'Subtitle' },
  ],

  params: [
    { type: 'text', key: 'title', label: 'Title', group: 'Content', default: 'CHAPTER ONE', maxLength: 32 },
    { type: 'text', key: 'sub',   label: 'Subtitle', group: 'Content', default: 'the beginning', maxLength: 40 },

    { type: 'select', key: 'face', label: 'Typeface', group: 'Style', default: 'sans',
      options: [
        { value: 'sans',  label: 'Tracked sans' },
        { value: 'serif', label: 'Serif italic' },
      ] },
    { type: 'color',  key: 'ink',    label: 'Title colour', group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'accent', label: 'Subtitle colour', group: 'Style', default: '#F59E0B' },
    { type: 'number', key: 'depth',  label: 'Bar depth', group: 'Style', default: 16, min: 8, max: 28, step: 1, unit: '%' },
    { type: 'boolean', key: 'grain', label: 'Film grain', group: 'Style', default: true },

    { type: 'number', key: 'closeMs', label: 'Bars close over', group: 'Motion', default: 700, min: 200, max: 2000, step: 20, unit: 'ms' },
    { type: 'boolean', key: 'exit',   label: 'Open at the end', group: 'Motion', default: true },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Cinematic, not PUNCH: the matte closing is a low air pass, the title setting is a single soft
  // bell. Both hang off delay + closeMs — the only params that time the motion.
  sfx: (p) => [
    { atMs: p.delay, id: 'whoosh', gain: 0.5 },
    { atMs: p.delay + p.closeMs * 0.6, id: 'chime', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height }) => {
    const t = timeMs - p.delay;
    // The frame can be any shape — min-dim keeps the type the same optical size at every aspect,
    // and keeps preview/export parity (fullBleed canvas px differ between the two).
    const m = Math.min(width, height);

    // Bars close with a decisive ease-out; optionally release near the end. Sampled as ONE
    // closure of the clock so the matte's true px/ms is available to the smear below — it covers
    // the close AND the release without a second copy of the maths.
    const barHAt = (ms: number) => {
      const close = interpolate(ms - p.delay, [0, p.closeMs], [0, 1], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
      });
      const rel = p.exit
        ? interpolate(durationMs - ms, [0, 600], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic),
          })
        : 1;
      return (p.depth / 100) * height * close * rel;
    };
    const closeIn = interpolate(t, [0, p.closeMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
    });
    const barH = barHAt(timeMs);
    // This template IS the camera — the frame never swings or sways in 3D. The only honest blur
    // is on the matte's own travelling EDGE: the hairline smears at the speed the bar is moving
    // and lands razor-sharp. The solid bars stay unblurred so the frame edge can never feather.
    const edgeBlur = smear(0, vel(barHAt, timeMs), 1).blurPx;

    const titleIn = spring({
      frame: fr(t - p.closeMs * 0.6), fps: FPS,
      config: { damping: 34, mass: 0.9, stiffness: 110 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    const subIn = clamp01((t - p.closeMs * 0.6 - 350) / 500);
    // Slow push-in on the type block — the "hold this shot" cue.
    const push = 1 + Math.min(1, t / Math.max(1, durationMs)) * 0.02;
    // RACK FOCUS on the type — the lens finds the title instead of the title fading up. Dead at
    // rest, like every blur in this library.
    const focusTitle = (1 - titleIn) * m * 0.007;
    const focusSub = (1 - subIn) * m * 0.004;

    const serif = p.face === 'serif';
    const fsTitle = Math.round(m * (serif ? 0.08 : 0.066));
    const fsSub = Math.round(m * 0.036);
    const hairline = Math.max(1, m * 0.0011);

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, ...el('bars') }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: barH, background: '#000000' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: barH, background: '#000000' }} />
          {/* Hairline edges sell the bars as a matte, not a crop — and they carry the smear. */}
          <div
            style={{
              position: 'absolute', left: 0, right: 0, top: barH, height: hairline,
              background: 'rgba(255,255,255,0.12)',
              filter: edgeBlur > 0.3 ? `blur(${edgeBlur.toFixed(2)}px)` : undefined,
            }}
          />
          <div
            style={{
              position: 'absolute', left: 0, right: 0, bottom: barH, height: hairline,
              background: 'rgba(255,255,255,0.12)',
              filter: edgeBlur > 0.3 ? `blur(${edgeBlur.toFixed(2)}px)` : undefined,
            }}
          />
        </div>

        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: m * 0.021,
            transform: `scale(${push.toFixed(4)})`,
          }}
        >
          <span
            style={{
              fontFamily: serif ? fontStack('playfair') : fontStack('montserrat'),
              fontStyle: serif ? 'italic' : 'normal',
              fontWeight: serif ? 600 : 700,
              fontSize: fsTitle,
              letterSpacing: serif ? '0.02em' : '0.42em',
              textTransform: serif ? 'none' : 'uppercase',
              color: p.ink,
              textShadow: `0 ${(m * 0.0022).toFixed(1)}px ${(m * 0.027).toFixed(1)}px rgba(0,0,0,0.8)`,
              opacity: titleIn,
              filter: focusTitle > 0.3 ? `blur(${focusTitle.toFixed(2)}px)` : undefined,
              transform: `translateY(${((1 - titleIn) * m * 0.014).toFixed(2)}px)`,
              // Serif keeps its case; tracked sans reads as a locked title.
              paddingLeft: serif ? 0 : '0.42em',
              ...el('title'),
            }}
          >
            {p.title}
          </span>
          {p.sub && (
            <span
              style={{
                fontFamily: fontStack('montserrat'),
                fontSize: fsSub, fontWeight: 600,
                letterSpacing: '0.3em', textTransform: 'uppercase',
                color: rgba(p.accent, 0.9),
                textShadow: `0 0 ${(m * 0.02).toFixed(1)}px ${rgba(p.accent, 0.4)}, 0 ${(m * 0.0022).toFixed(1)}px ${(m * 0.013).toFixed(1)}px rgba(0,0,0,0.7)`,
                opacity: subIn,
                filter: focusSub > 0.3 ? `blur(${focusSub.toFixed(2)}px)` : undefined,
                paddingLeft: '0.3em',
                ...el('sub'),
              }}
            >
              {p.sub}
            </span>
          )}
        </div>

        {p.grain && <div style={{ ...luxeGrain(0.05), opacity: closeIn * 0.05 }} />}
      </div>
    );
  },
});
