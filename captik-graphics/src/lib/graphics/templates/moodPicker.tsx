// Reference: graphics/wellness-app-moods.mp4  (window 200-8440ms, ~1400ms per mood)
// Full-bleed mood cards that swap: a coloured field, a big drawn face, the mood name, a prompt, and
// a tick strip at the foot with the marker sliding to the live mood.
//
// The faces are DRAWN from eye and mouth primitives, not emoji: an emoji renders in whatever the
// platform font decides, which would differ between the preview and Lambda's Chromium — exactly the
// per-surface substitution this whole module exists to avoid.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { parallax, smear, swingIn, vel } from '../juice';

const MAX_MOODS = 6;
const TICKS = 40;

type Face = 'happy' | 'calm' | 'sad' | 'stressed' | 'flat';
const FACES: Face[] = ['happy', 'calm', 'sad', 'stressed', 'flat'];

export const moodPicker = defineGraphicsTemplate({
  id: 'mood_picker',
  name: 'Mood Picker',
  category: 'device',
  tags: ['Wellness', 'App', 'Faces', 'Luxury'],
  design: { w: 900, h: 1600 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 8400,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 100 },
  fonts: ['montserrat', 'inter'],

  elements: [
    { key: 'card',   label: 'Card', hideable: false },
    { key: 'face',   label: 'Face' },
    { key: 'name',   label: 'Mood name' },
    { key: 'prompt', label: 'Prompt' },
    { key: 'ticks',  label: 'Tick strip' },
  ],

  params: [
    { type: 'text', key: 'moods', label: 'Moods', group: 'Content', multiline: true, maxLength: 300,
      default:
        'Happy|happy|#D97706|#12100B\n'
        + 'Calm|calm|#5E7E99|#0C1014\n'
        + 'Confuse|sad|#A06A48|#120E0B\n'
        + 'Stressed|stressed|#7A6AA0|#0F0D14\n'
        + 'Flat|flat|#596470|#0E0F11',
      help: 'One per line: name | face (happy/calm/sad/stressed/flat) | face colour | background.' },
    { type: 'text', key: 'prompt', label: 'Prompt', group: 'Content', default: "Select your today's mood", maxLength: 40 },

    { type: 'color',  key: 'ink',   label: 'Text',  group: 'Style', default: '#F4F1E8' },
    { type: 'font',   key: 'font',  label: 'Font',  group: 'Style', default: 'montserrat' },
    { type: 'number', key: 'size',  label: 'Name size', group: 'Style', default: 60, min: 14, max: 140, step: 2, unit: 'px' },
    { type: 'number', key: 'faceSize', label: 'Face size', group: 'Style', default: 520, min: 120, max: 800, step: 10, unit: 'px' },
    { type: 'number', key: 'stroke', label: 'Line weight', group: 'Style', default: 14, min: 2, max: 40, step: 1, unit: 'px' },
    { type: 'boolean', key: 'ticks', label: 'Tick strip', group: 'Style', default: true },

    { type: 'number', key: 'hold', label: 'Time per mood', group: 'Motion', default: 1400, min: 300, max: 5000, step: 50, unit: 'ms' },
    { type: 'number', key: 'swapMs', label: 'Swap over', group: 'Motion', default: 420, min: 60, max: 1500, step: 20, unit: 'ms' },
  ],

  // Wellness language, no impacts: one soft UI pop as each incoming face lands, on the first
  // four swap beats — timed off the same hold the crossfade reads.
  sfx: (p) => [0, 1, 2, 3].map((k) => ({ atMs: p.hold * k + 140, id: 'pop' as const, gain: 0.4 })),

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const moods = p.moods.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_MOODS)
      .map((l) => {
        const [name = '', face = 'happy', colour = '#D97706', bg = '#0E0F11'] = l.split('|').map((s) => s.trim());
        return { name, face: (FACES.includes(face as Face) ? face : 'happy') as Face, colour, bg };
      });
    if (!moods.length) return null;

    const i = Math.floor(timeMs / Math.max(1, p.hold)) % moods.length;
    const within = timeMs - Math.floor(timeMs / Math.max(1, p.hold)) * p.hold;
    const cur = moods[i];
    const prev = moods[(i - 1 + moods.length) % moods.length];

    const fade = interpolate(within, [0, p.swapMs], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const popAtMs = (ms: number) => spring({
      frame: fr(ms - Math.floor(timeMs / Math.max(1, p.hold)) * p.hold), fps: FPS,
      config: { damping: 17, mass: 0.7, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(560))),
    });
    const pop = popAtMs(timeMs);
    // DEPTH: the screen is a full-bleed app mimic (no sway on the card itself), but the incoming
    // face swings in off a top hinge with an arrival smear that dies as it seats, and the three
    // content layers drift at 0.2-0.35 parallax depths so the held pose never goes dead.
    const faceSmear = smear(0, vel(popAtMs, timeMs) * p.faceSize * 0.35);
    const parName = parallax(timeMs, seed, 0.2, width * 0.008);
    const parFace = parallax(timeMs, seed, 0.28, width * 0.008);
    const parPrompt = parallax(timeMs, seed, 0.35, width * 0.008);

    const F = p.faceSize;
    const sw = p.stroke;
    const eyeY = F * 0.36;
    const eyeX = F * 0.24;

    /** Eyes and mouth as primitives — see the header on why this is not an emoji. */
    const eye = (face: Face, side: -1 | 1) => {
      const common = { position: 'absolute' as const, left: F / 2 + side * eyeX, top: eyeY };
      if (face === 'calm') {
        return (
          <div style={{ ...common, width: F * 0.16, height: F * 0.09, marginLeft: -F * 0.08, borderBottom: `${sw}px solid ${p.ink}`, borderRadius: `0 0 ${F}px ${F}px` }} />
        );
      }
      if (face === 'stressed') {
        return (
          <div style={{ ...common, width: F * 0.16, height: F * 0.16, marginLeft: -F * 0.08, marginTop: -F * 0.08 }}>
            <div style={{ position: 'absolute', inset: 0, borderTop: `${sw}px solid ${p.ink}`, transform: 'rotate(38deg)' }} />
            <div style={{ position: 'absolute', inset: 0, borderTop: `${sw}px solid ${p.ink}`, transform: 'rotate(-38deg)' }} />
          </div>
        );
      }
      return (
        <div style={{ ...common, width: F * 0.115, height: F * 0.145, marginLeft: -F * 0.057, marginTop: -F * 0.072, borderRadius: '50%', background: p.ink }} />
      );
    };

    const mouth = (face: Face) => {
      const base = {
        position: 'absolute' as const, left: '50%', top: F * 0.6,
        width: F * 0.44, marginLeft: -F * 0.22,
      };
      if (face === 'flat') return <div style={{ ...base, height: 0, borderTop: `${sw}px solid ${p.ink}` }} />;
      if (face === 'sad') {
        return <div style={{ ...base, height: F * 0.2, marginTop: F * 0.06, borderTop: `${sw}px solid ${p.ink}`, borderRadius: `${F}px ${F}px 0 0` }} />;
      }
      if (face === 'stressed') {
        return (
          <div style={{ ...base, height: F * 0.1, display: 'flex' }}>
            {[0, 1, 2, 3].map((k) => (
              <div key={k} style={{ flex: 1, borderTop: `${sw}px solid ${p.ink}`, transform: `rotate(${k % 2 === 0 ? 22 : -22}deg)` }} />
            ))}
          </div>
        );
      }
      return <div style={{ ...base, height: F * 0.2, borderBottom: `${sw}px solid ${p.ink}`, borderRadius: `0 0 ${F}px ${F}px` }} />;
    };

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: ff, ...el('card') }}>
        <div style={{ position: 'absolute', inset: 0, background: prev.bg }} />
        <div style={{ position: 'absolute', inset: 0, background: cur.bg, opacity: fade }} />

        {/* BOTH cards are drawn and cross-faded. Drawing only the incoming one leaves the frame
            empty for the first moments of every swap, because its entrance starts at zero. */}
        {[{ m: prev, o: 1 - fade, live: false }, { m: cur, o: fade, live: true }].map((layer, li) => (
          <div key={li} style={{ position: 'absolute', inset: 0, opacity: layer.o }}>
            <div
              style={{
                position: 'absolute', left: 0, right: 0, top: '9%',
                textAlign: 'center', fontSize: p.size, fontWeight: 700, color: p.ink, letterSpacing: '0.04em',
                transform: layer.live
                  ? `${swingIn(pop, { rx: -10, z: -40 })} translate(${parName.x.toFixed(2)}px, ${(parName.y + (1 - pop) * height * 0.012).toFixed(2)}px)`
                  : `translate(${parName.x.toFixed(2)}px, ${parName.y.toFixed(2)}px)`,
                ...el('name'),
              }}
            >
              {layer.m.name}
            </div>

            <div
              style={{
                position: 'absolute', left: '50%', top: '44%',
                width: F, height: F, marginLeft: -F / 2, marginTop: -F / 2,
                borderRadius: '50%', background: layer.m.colour,
                boxShadow: `0 ${F * 0.06}px ${F * 0.2}px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)`,
                filter: layer.live && faceSmear.blurPx > 0.3 ? `blur(${faceSmear.blurPx.toFixed(2)}px)` : undefined,
                transform: layer.live
                  ? `${swingIn(pop, { rx: -15, z: -90 })} translate(${parFace.x.toFixed(2)}px, ${parFace.y.toFixed(2)}px) scale(${(interpolate(pop, [0, 1], [0.86, 1]) * faceSmear.sx).toFixed(4)}, ${(interpolate(pop, [0, 1], [0.86, 1]) * faceSmear.sy).toFixed(4)})`
                  : `translate(${parFace.x.toFixed(2)}px, ${parFace.y.toFixed(2)}px)`,
                ...el('face'),
              }}
            >
              {eye(layer.m.face, -1)}
              {eye(layer.m.face, 1)}
              {mouth(layer.m.face)}
            </div>

            <div
              style={{
                position: 'absolute', left: 0, right: 0, top: '78%',
                textAlign: 'center', fontSize: p.size * 0.42, color: rgba(p.ink, 0.55), lineHeight: 1.4,
                fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase',
                padding: `0 ${width * 0.12}px`,
                transform: `translate(${parPrompt.x.toFixed(2)}px, ${parPrompt.y.toFixed(2)}px)`,
                ...el('prompt'),
              }}
            >
              {p.prompt}
            </div>
          </div>
        ))}

        {p.ticks && (
          <div
            style={{
              position: 'absolute', left: '6%', right: '6%', bottom: '6%',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              height: height * 0.03,
              ...el('ticks'),
            }}
          >
            {Array.from({ length: TICKS }).map((_, k) => {
              // The marker slides continuously to the live mood rather than jumping per card.
              const target = ((i + fade) / moods.length) * TICKS;
              const near = Math.abs(k - target) < 0.6;
              return (
                <span
                  key={k}
                  style={{
                    width: 2, height: near ? '100%' : '46%',
                    background: near ? cur.colour : rgba(p.ink, 0.28),
                  }}
                />
              );
            })}
          </div>
        )}

        <div style={luxeVignette(0.4)} />
        <div style={luxeGrain(0.05)} />
      </div>
    );
  },
});
