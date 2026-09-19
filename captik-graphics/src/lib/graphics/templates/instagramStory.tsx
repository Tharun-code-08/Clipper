// Reference: social/instagram-stories.mp4  (6.5s, running from frame 0)
// A story frame: segmented progress bar filling across the top, handle and timestamp, and a slow
// Ken Burns push on the photo. The segments are the interesting bit — each is a pure function of
// timeMs, so segment 2 is full, segment 3 is mid-fill and segment 4 is empty at any given instant,
// with no state and no timers.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { idleFloat, swingIn } from '../juice';

export const instagramStory = defineGraphicsTemplate({
  id: 'instagram_story',
  name: 'Story Frame',
  category: 'social',
  tags: ['Instagram', 'Story', 'Social'],
  design: { w: 620, h: 1100 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 6000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['inter'],

  elements: [
    { key: 'photo',    label: 'Photo', hideable: false },
    { key: 'progress', label: 'Progress bar' },
    { key: 'handle',   label: 'Username' },
  ],

  params: [
    { type: 'image', key: 'photo',  label: 'Photo',    group: 'Content', default: '' },
    { type: 'text',  key: 'handle', label: 'Username', group: 'Content', default: 'toolandtea', maxLength: 30 },
    { type: 'text',  key: 'ago',    label: 'Time ago', group: 'Content', default: '3h', maxLength: 8 },
    { type: 'number', key: 'segments', label: 'Segments', group: 'Content', default: 4, min: 1, max: 8, step: 1 },
    { type: 'number', key: 'active',   label: 'Active segment', group: 'Content', default: 2, min: 1, max: 8, step: 1 },

    { type: 'color',  key: 'ink',    label: 'Text',   group: 'Style', default: '#ffffff' },
    { type: 'font',   key: 'font',   label: 'Font',   group: 'Style', default: 'inter' },
    { type: 'number', key: 'radius', label: 'Corner', group: 'Style', default: 0, min: 0, max: 70, step: 2, unit: 'px' },
    { type: 'number', key: 'scrim',  label: 'Top scrim', group: 'Style', default: 0.35, min: 0, max: 0.8, step: 0.05 },

    { type: 'number',  key: 'zoom',  label: 'Ken Burns zoom', group: 'Motion', default: 8, min: 0, max: 30, step: 1, unit: '%' },
    { type: 'boolean', key: 'fill',  label: 'Active segment fills', group: 'Motion', default: true },
  ],

  // A story frame is a phone screen — device language, one soft UI pop as it lands.
  sfx: () => [
    { atMs: 80, id: 'pop', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const inRamp = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.7, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(360))),
    });

    const t = clamp01(timeMs / Math.max(1, durationMs));
    const zoom = 1 + (p.zoom / 100) * t;
    // DEPTH: the DEVICE swings in through 3D but rests dead flat (a phone screen must not sway);
    // behind the fixed chrome the photo pans slowly under its Ken Burns push, so the screen's own
    // layers parallax while the frame geometry stays believable.
    const framePose = swingIn(inRamp, { rx: -7, z: -50 });
    // Pan only inside the slack the zoom has already created, so the photo edge never shows.
    const panK = p.zoom >= 2 ? clamp01(t * 2.5) : 0;
    const pan = idleFloat(timeMs, seed, width * 0.009 * panK, 5200);
    const pad = width * 0.035;
    const barH = Math.max(2, width * 0.008);
    const gap = width * 0.012;
    const segW = (width - pad * 2 - gap * (p.segments - 1)) / p.segments;
    const fsHandle = Math.round(width * 0.036);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          borderRadius: p.radius, overflow: 'hidden',
          fontFamily: ff, background: '#0B0B0D',
          opacity: interpolate(inRamp, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
          transform: framePose,
          transformOrigin: '50% 42%',
        }}
      >
        {/* Photo with a slow push + drift pan behind the fixed chrome */}
        <div style={{ position: 'absolute', inset: 0, transform: `translate(${pan.x.toFixed(2)}px, ${pan.y.toFixed(2)}px) scale(${zoom.toFixed(4)})`, transformOrigin: 'center center', ...el('photo') }}>
          {p.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 72% 48% at 72% 10%, ${rgba('#F59E0B', 0.14)} 0%, transparent 70%), linear-gradient(160deg,#3E4550 0%,#23262E 52%,#141519 100%)` }} />
          )}
        </div>

        {/* Scrim so the chrome stays readable on any photo */}
        {p.scrim > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: height * 0.16, background: `linear-gradient(${rgba('#000000', p.scrim)}, ${rgba('#000000', 0)})` }} />
        )}

        {/* Segmented progress */}
        <div style={{ position: 'absolute', left: pad, right: pad, top: pad, display: 'flex', gap, ...el('progress') }}>
          {Array.from({ length: p.segments }).map((_, i) => {
            const idx = i + 1;
            const filled = idx < p.active ? 1
              : idx > p.active ? 0
              : p.fill ? t : 1;
            return (
              <div key={i} style={{ width: segW, height: barH, borderRadius: 99, background: rgba('#ffffff', 0.35), overflow: 'hidden' }}>
                <div style={{ width: `${(filled * 100).toFixed(2)}%`, height: '100%', borderRadius: 99, background: p.ink }} />
              </div>
            );
          })}
        </div>

        {/* Handle */}
        <div
          style={{
            position: 'absolute', left: pad, top: pad + barH + width * 0.028,
            display: 'flex', alignItems: 'center', gap: width * 0.018,
            opacity: interpolate(inRamp, [0.35, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            ...el('handle'),
          }}
        >
          <div style={{ width: fsHandle * 1.5, height: fsHandle * 1.5, borderRadius: '50%', background: rgba('#ffffff', 0.3), border: `1.5px solid ${rgba('#ffffff', 0.7)}` }} />
          <span style={{ fontSize: fsHandle, fontWeight: 600, color: p.ink, textShadow: '0 1px 8px rgba(0,0,0,0.35)' }}>{p.handle}</span>
          <span style={{ fontSize: fsHandle * 0.9, color: rgba(p.ink, 0.7), textShadow: '0 1px 8px rgba(0,0,0,0.35)' }}>{p.ago}</span>
        </div>
      </div>
    );
  },
});
