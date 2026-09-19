// Reference: social/spotify-player-animation-1.mp4  (10.4s, no lead-in — it starts already playing)
// A music player where four things move on completely independent clocks: the artwork spins like a
// record, the title marquees left and wraps, the progress bar creeps, and the transport row holds.
// All four are pure functions of timeMs (modulo for the loops), which is what lets a 10s clip
// export frame-for-frame — a marquee done with CSS animation is the classic thing that renders as
// one frozen frame.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax } from '../juice';

export const spotifyPlayer = defineGraphicsTemplate({
  id: 'spotify_player',
  name: 'Music Player',
  category: 'social',
  tags: ['Spotify', 'Music', 'Player'],
  design: { w: 620, h: 900 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 9800,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 86 },
  fonts: ['inter', 'pixel'],

  elements: [
    { key: 'art',      label: 'Album art' },
    { key: 'title',    label: 'Title' },
    { key: 'artist',   label: 'Artist' },
    { key: 'progress', label: 'Progress bar' },
    { key: 'controls', label: 'Controls' },
  ],

  params: [
    { type: 'text',  key: 'title',  label: 'Track',  group: 'Content', default: "You've Got The Love (Jamie xx Rework)", maxLength: 80 },
    { type: 'text',  key: 'artist', label: 'Artist', group: 'Content', default: 'Florence + The Machine, The xx, Jamie xx', maxLength: 80 },
    { type: 'image', key: 'art',    label: 'Album art', group: 'Content', default: '' },

    { type: 'color',  key: 'bg',     label: 'Background', group: 'Style', default: '#101010' },
    { type: 'color',  key: 'ink',    label: 'Text',       group: 'Style', default: '#ffffff' },
    { type: 'color',  key: 'accent', label: 'Accent',     group: 'Style', default: '#1db954' },
    { type: 'color',  key: 'disc',   label: 'Record',     group: 'Style', default: '#232323' },
    { type: 'font',   key: 'font',   label: 'Font',       group: 'Style', default: 'pixel' },
    { type: 'number', key: 'radius', label: 'Corner',     group: 'Style', default: 0, min: 0, max: 80, step: 2, unit: 'px' },

    { type: 'number',  key: 'spinMs',  label: 'Record spin', group: 'Motion', default: 9000, min: 2000, max: 30000, step: 500, unit: 'ms' },
    { type: 'number',  key: 'scrollMs', label: 'Title scroll', group: 'Motion', default: 7000, min: 2000, max: 20000, step: 500, unit: 'ms' },
    { type: 'number',  key: 'from',    label: 'Progress from', group: 'Motion', default: 8, min: 0, max: 100, step: 1, unit: '%' },
    { type: 'number',  key: 'to',      label: 'Progress to',   group: 'Motion', default: 74, min: 0, max: 100, step: 1, unit: '%' },
  ],

  // This template depicts MUSIC we cannot provide — no faked track, no beeps. The only cue is
  // the physical one: a quiet air pass as the player glides in.
  sfx: () => [
    { atMs: 60, id: 'whoosh', gain: 0.35 },
  ],

  render: ({ params: p, el, timeMs, durationMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const inRamp = spring({
      frame: fr(timeMs), fps: FPS,
      config: { damping: 200, mass: 0.8, stiffness: 130 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });

    const pad = width * 0.055;
    const discR = width * 0.42;
    const artR = discR * 0.66;
    const spin = ((timeMs / p.spinMs) % 1) * 360;
    // Marquee wraps by translating a doubled string; modulo keeps it seamless and deterministic.
    const scroll = (timeMs / p.scrollMs) % 1;
    const pct = p.from + (p.to - p.from) * clamp01(timeMs / Math.max(1, durationMs));

    const fsTitle = Math.round(width * 0.058);
    const fsArtist = Math.round(width * 0.034);
    const ctrl = width * 0.062;

    // DEPTH: the player is a UI object — it swings IN through 3D on its existing ramp, then
    // rests with only a whisper of sway (±1°); the record, progress row and transport sit at
    // different parallax depths so the sway shears them and the card stops reading flat.
    const pose = depthPose(timeMs, seed, { enter: inRamp, rx: -10, z: -70, swayDeg: 1, periodMs: 4400 });
    const parArt = parallax(timeMs, seed, 0.3, width * 0.008, 4400);
    const parProg = parallax(timeMs, seed, 0.2, width * 0.008, 4400);
    const parCtrl = parallax(timeMs, seed, 0.4, width * 0.008, 4400);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, ${rgba('#ffffff', 0.05)} 0%, ${rgba('#ffffff', 0)} 36%), ${p.bg}`,
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: `0 ${Math.round(width * 0.04)}px ${Math.round(width * 0.11)}px ${rgba('#000000', 0.45)}, inset 0 1px 0 rgba(255,255,255,0.05)`,
          borderRadius: p.radius, overflow: 'hidden',
          fontFamily: ff, color: p.ink,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: pad, boxSizing: 'border-box',
          opacity: interpolate(inRamp, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
          transform: pose,
          transformOrigin: '50% 40%',
        }}
      >
        {/* Record + artwork */}
        <div
          style={{
            width: discR * 2, height: discR * 2, marginTop: height * 0.03,
            borderRadius: '50%', background: p.disc,
            boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.07), 0 0 ${Math.round(discR * 0.22)}px ${rgba('#000000', 0.4)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `translate(${parArt.x.toFixed(2)}px, ${parArt.y.toFixed(2)}px) rotate(${spin.toFixed(3)}deg) scale(${interpolate(inRamp, [0, 1], [0.9, 1]).toFixed(4)})`,
            flexShrink: 0,
            ...el('art'),
          }}
        >
          <div style={{ width: artR * 2, height: artR * 2, borderRadius: '50%', overflow: 'hidden', background: '#33363D', position: 'relative' }}>
            {p.art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.art} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 35% 30%, #E9DFC8 0%, #E9DFC8 26%, #97907F 27%, #97907F 55%, #33363D 56%)' }} />
            )}
            {/* spindle hole */}
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: artR * 0.17, height: artR * 0.17, marginLeft: -artR * 0.085, marginTop: -artR * 0.085, borderRadius: '50%', background: p.bg }} />
          </div>
        </div>

        {/* Marquee title */}
        <div style={{ width: '100%', overflow: 'hidden', marginTop: height * 0.05, ...el('title') }}>
          <div style={{ display: 'inline-flex', whiteSpace: 'nowrap', transform: `translateX(${(-scroll * 50).toFixed(3)}%)` }}>
            <span style={{ fontSize: fsTitle, fontWeight: 700, paddingRight: width * 0.12 }}>{p.title}</span>
            <span style={{ fontSize: fsTitle, fontWeight: 700, paddingRight: width * 0.12 }}>{p.title}</span>
          </div>
        </div>

        <span style={{ alignSelf: 'flex-start', fontSize: fsArtist, color: rgba(p.ink, 0.55), marginTop: height * 0.012, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', ...el('artist') }}>
          {p.artist}
        </span>

        {/* Progress */}
        <div style={{ width: '100%', marginTop: height * 0.035, position: 'relative', transform: `translate(${parProg.x.toFixed(2)}px, ${parProg.y.toFixed(2)}px)`, ...el('progress') }}>
          <div style={{ width: '100%', height: Math.max(2, width * 0.007), borderRadius: 99, background: rgba(p.ink, 0.22) }} />
          <div style={{ position: 'absolute', left: 0, top: 0, width: `${pct}%`, height: Math.max(2, width * 0.007), borderRadius: 99, background: p.ink }} />
          <div style={{ position: 'absolute', left: `${pct}%`, top: '50%', width: width * 0.022, height: width * 0.022, marginLeft: -width * 0.011, marginTop: -width * 0.011, borderRadius: '50%', background: p.ink, boxShadow: `0 0 ${Math.round(width * 0.02)}px ${rgba(p.ink, 0.45)}` }} />
        </div>

        {/* Transport */}
        <div style={{ width: '100%', marginTop: height * 0.035, display: 'flex', alignItems: 'center', justifyContent: 'space-between', transform: `translate(${parCtrl.x.toFixed(2)}px, ${parCtrl.y.toFixed(2)}px)`, ...el('controls') }}>
          <svg width={ctrl} height={ctrl} viewBox="0 0 24 24" fill="none" stroke={p.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
          <svg width={ctrl} height={ctrl} viewBox="0 0 24 24" fill={p.ink} aria-hidden="true">
            <path d="M6 5h2v14H6zM20 5v14L9 12z" />
          </svg>
          <div style={{ width: ctrl * 1.9, height: ctrl * 1.9, borderRadius: '50%', background: p.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={ctrl * 0.85} height={ctrl * 0.85} viewBox="0 0 24 24" fill={p.bg} aria-hidden="true">
              <path d="M8 5h3v14H8zM13 5h3v14h-3z" />
            </svg>
          </div>
          <svg width={ctrl} height={ctrl} viewBox="0 0 24 24" fill={p.ink} aria-hidden="true">
            <path d="M18 5h-2v14h2zM4 5v14l11-7z" />
          </svg>
          <svg width={ctrl} height={ctrl} viewBox="0 0 24 24" fill="none" stroke={rgba(p.ink, 0.75)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </div>
      </div>
    );
  },
});
