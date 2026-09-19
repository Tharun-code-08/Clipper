// Audiogram card: avatar tile + show/episode titles over a LIVE waveform and a progress
// hairline that fills across the template's whole window. The 24 bars ride three layered
// sines at incommensurate frequencies with per-bar phase offsets and a seeded bias — that
// mix never visibly repeats and reads as speech, where a single sine would read as a
// metronome. A centre-weighted envelope keeps the loud bars mid-card, like real audio.

import { random, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, inkOn, rgba } from '../motion';
import { LUXE, easeOutQuint, luxeGrain, luxeLabel, luxePanel } from '../luxe';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const BARS = 24;

export const podcastWave = defineGraphicsTemplate({
  id: 'podcast_wave',
  name: 'Podcast Card',
  category: 'device',
  tags: ['Podcast', 'Waveform', 'Audio', 'Bars', 'Player'],
  badge: 'New',
  design: { w: 900, h: 500 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 38, widthPercent: 78 },
  fonts: ['montserrat'],

  elements: [
    { key: 'panel',    label: 'Panel', hideable: false },
    { key: 'avatar',   label: 'Avatar' },
    { key: 'titles',   label: 'Titles' },
    { key: 'wave',     label: 'Waveform', hideable: false },
    { key: 'progress', label: 'Progress' },
  ],

  params: [
    { type: 'text', key: 'show',    label: 'Show',    group: 'Content', default: 'THE LEVERAGE POD', maxLength: 28 },
    { type: 'text', key: 'episode', label: 'Episode', group: 'Content', default: 'EP 12 — Escaping the 9–5', maxLength: 40 },
    { type: 'text', key: 'initial', label: 'Initial', group: 'Content', default: 'L', maxLength: 2 },
    { type: 'image', key: 'cover', label: 'Cover art', group: 'Content', default: '', help: 'Optional — a coloured tile with the initial is drawn when empty.' },

    { type: 'color', key: 'accent', label: 'Bars', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'tile',   label: 'Avatar tile', group: 'Style', default: '#D97706' },

    { type: 'number', key: 'speed', label: 'Wave speed', group: 'Motion', default: 100, min: 40, max: 220, step: 5, unit: '%' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // This template DEPICTS audio, so the design stays out of the mix: one physical cue only —
  // the glossy pop as the cover tile lands on the panel. No whooshes competing with the "track".
  sfx: (p) => [
    { atMs: p.delay + 180, id: 'pop', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack('montserrat');

    const enterAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 32, mass: 0.8, stiffness: 140 },
      durationInFrames: Math.max(1, Math.round(fr(550))),
    });
    const enter = enterAt(t);
    const avatarInAt = (ms: number) => spring({
      frame: fr(ms - 150), fps: FPS,
      config: { damping: 18, mass: 0.6, stiffness: 200 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const avatarIn = avatarInAt(t);
    const titleIn = easeOutQuint(clamp01((t - 260) / 400));

    // DEPTH: the panel arrives as a card through 3D — rise velocity smearing it until it seats —
    // then rests almost still (1° sway: a player card, not a floating title). Cover, titles and
    // wave parallax at different depths so the card reads as layered, and the popping cover tile
    // carries its own scale-velocity smear.
    const pose = depthPose(t, seed, { enter, rx: -12, z: -100, swayDeg: 1, periodMs: 4800 });
    const panelSmear = smear(0, vel((ms: number) => (1 - enterAt(ms)) * height * 0.05, t));
    const avSmearV = vel(avatarInAt, t) * height * 0.12;
    const avSmear = smear(0, avSmearV);
    const parAvatar = parallax(t, seed, 0.3, width * 0.008, 4800);
    const parTitles = parallax(t, seed, 0.22, width * 0.008, 4800);
    const parWave = parallax(t, seed, 0.15, width * 0.008, 4800);

    const ts = (Math.max(0, t) / 1000) * (p.speed / 100);
    const pad = width * 0.1;
    const avSize = Math.round(height * 0.224);
    const waveTop = height * 0.46;
    const waveH = height * 0.35;
    const barW = Math.round(width * 0.0155);
    const initial = p.initial.trim().slice(0, 2).toUpperCase();
    // Progress fills over the instance's WHOLE window — raw timeMs, not the delayed clock.
    const fillFrac = clamp01(timeMs / Math.max(1, durationMs));

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          ...luxePanel(Math.round(height * 0.064)),
          opacity: enter,
          filter: panelSmear.blurPx > 0.3 ? `blur(${panelSmear.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} translateY(${((1 - enter) * height * 0.05).toFixed(2)}px) scale(${panelSmear.sx.toFixed(4)}, ${panelSmear.sy.toFixed(4)})`,
          transformOrigin: 'center center',
          fontFamily: ff,
          overflow: 'hidden',
          ...el('panel'),
        }}
      >
        <div
          style={{
            position: 'absolute', left: width * 0.062, top: height * 0.104,
            width: avSize, height: avSize, borderRadius: 999,
            overflow: p.cover ? 'hidden' : undefined,
            background: p.cover ? undefined : p.tile,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 10px 26px ${rgba(p.tile, 0.35)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: Math.round(avSize * 0.42), fontWeight: 800, color: inkOn(p.tile),
            filter: avSmear.blurPx > 0.3 ? `blur(${avSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `${swingIn(avatarIn, { ry: -16, z: -50 })} translate(${parAvatar.x.toFixed(2)}px, ${parAvatar.y.toFixed(2)}px) scale(${(avatarIn * avSmear.sx).toFixed(4)}, ${(avatarIn * avSmear.sy).toFixed(4)})`,
            ...el('avatar'),
          }}
        >
          {p.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            initial
          )}
        </div>

        <div
          style={{
            position: 'absolute', left: width * 0.062 + avSize + width * 0.031, top: height * 0.128,
            display: 'flex', flexDirection: 'column', gap: Math.round(height * 0.024),
            opacity: titleIn,
            transform: `translate(${parTitles.x.toFixed(2)}px, ${(parTitles.y + (1 - titleIn) * 12).toFixed(2)}px)`,
            ...el('titles'),
          }}
        >
          <span style={{ fontSize: Math.round(height * 0.076), fontWeight: 700, color: LUXE.ink, whiteSpace: 'nowrap' }}>
            {p.show}
          </span>
          <span style={{ ...luxeLabel(Math.round(height * 0.04)), whiteSpace: 'nowrap' }}>
            {p.episode}
          </span>
        </div>

        <div
          style={{
            position: 'absolute', left: pad, right: pad, top: waveTop, height: waveH,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            filter: `drop-shadow(0 0 12px ${rgba(p.accent, 0.35)})`,
            transform: `translate(${parWave.x.toFixed(2)}px, ${parWave.y.toFixed(2)}px)`,
            ...el('wave'),
          }}
        >
          {Array.from({ length: BARS }, (_, i) => {
            const s = 0.5
              + 0.3 * Math.sin(ts * 2.3 + i * 0.83)
              + 0.18 * Math.sin(ts * 4.1 + i * 1.97 + 1.7)
              + 0.08 * Math.sin(ts * 7.9 + i * 3.3);
            const level = clamp01(s + (random(`${seed}-b${i}`) - 0.5) * 0.18);
            const mid = (BARS - 1) / 2;
            const env = 1 - 0.4 * Math.pow((i - mid) / mid, 2);
            const waveIn = easeOutQuint(clamp01((t - 350 - i * 16) / 280));
            const h = waveH * env * (0.22 + 0.78 * level) * waveIn;
            return (
              <div
                key={i}
                style={{
                  width: barW, height: `${Math.max(0, h).toFixed(1)}px`,
                  borderRadius: 999, background: p.accent,
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute', left: pad, right: pad, bottom: height * 0.084, height: 3,
            borderRadius: 999, background: 'rgba(255,255,255,0.12)',
            ...el('progress'),
          }}
        >
          <div
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${(fillFrac * 100).toFixed(2)}%`,
              borderRadius: 999, background: p.accent,
              boxShadow: `0 0 10px ${rgba(p.accent, 0.5)}`,
            }}
          />
        </div>

        <div style={luxeGrain(0.045)} />
      </div>
    );
  },
});
