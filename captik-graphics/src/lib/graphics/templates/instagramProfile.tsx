// Reference: social/instagram-profile.mp4  (window 160-2960ms, settles ~1600ms)
// A profile header that assembles in four beats: avatar + handle, then the stat row (each number
// on its own slight offset), then the bio lines, then the action buttons. Nothing moves as a
// block — the whole point of the reference is that the card builds itself.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, fr, rgba } from '../motion';
import { parallax, sway3d, swingIn } from '../juice';

/** "178 posts, 143K followers, 275 following" -> [{value,label}] */
function parseStats(raw: string) {
  return raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4).map((chunk) => {
    const m = chunk.match(/^(\S+)\s+(.*)$/);
    return m ? { value: m[1], label: m[2] } : { value: chunk, label: '' };
  });
}

export const instagramProfile = defineGraphicsTemplate({
  id: 'instagram_profile',
  name: 'Profile Header',
  category: 'social',
  tags: ['Instagram', 'Profile', 'Follow'],
  design: { w: 760, h: 470 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 3000,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 74 },
  fonts: ['inter'],

  elements: [
    { key: 'avatar',  label: 'Avatar' },
    { key: 'handle',  label: 'Handle' },
    { key: 'stats',   label: 'Stats' },
    { key: 'bio',     label: 'Bio' },
    { key: 'buttons', label: 'Buttons' },
  ],

  params: [
    { type: 'text',  key: 'handle', label: 'Handle', group: 'Content', default: 'artzenmedia', maxLength: 30 },
    { type: 'text',  key: 'stats',  label: 'Stats',  group: 'Content', default: '178 posts, 143K followers, 275 following', maxLength: 120,
      help: 'Comma separated "value label" pairs.' },
    { type: 'text',  key: 'bio',    label: 'Bio',    group: 'Content', multiline: true, maxLength: 160,
      default: 'Helping you make better content\nEditing tips / tutorials and social media' },
    { type: 'text',  key: 'primary', label: 'Primary button', group: 'Content', default: 'Follow', maxLength: 16 },
    { type: 'text',  key: 'others',  label: 'Other buttons',  group: 'Content', default: 'Message, Email', maxLength: 60 },
    { type: 'image', key: 'avatar',  label: 'Avatar', group: 'Content', default: '' },

    { type: 'color',  key: 'accent', label: 'Primary', group: 'Style', default: '#1e88ff' },
    { type: 'color',  key: 'ink',    label: 'Text',    group: 'Style', default: '#15161a' },
    { type: 'color',  key: 'chip',   label: 'Buttons', group: 'Style', default: '#eceef1' },
    { type: 'font',   key: 'font',   label: 'Font',    group: 'Style', default: 'inter' },

    { type: 'number', key: 'stagger', label: 'Beat stagger', group: 'Motion', default: 300, min: 40, max: 600, step: 10, unit: 'ms' },
  ],

  // Device/UI language: a soft pop as the header starts assembling, a brighter one when the
  // Follow button (beat 3.2) lands — retiming the stagger retimes the second cue.
  sfx: (p) => [
    { atMs: 60, id: 'pop', gain: 0.4 },
    { atMs: p.stagger * 3.2 + 120, id: 'pop', gain: 0.55 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const stats = parseStats(p.stats);
    const others = p.others.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3);
    const bio = p.bio.split('\n').filter(Boolean).slice(0, 3);

    // Z-STAGGER: every beat arrives as an object swinging through space, each from a slightly
    // different angle (deterministic off the beat index), instead of divs fading up in place.
    const beat = (i: number) => {
      const s = spring({
        frame: fr(timeMs - i * p.stagger), fps: FPS,
        config: { damping: 26, mass: 0.6, stiffness: 175 },
        durationInFrames: Math.max(1, Math.round(fr(340))),
      });
      return {
        opacity: interpolate(s, [0, 0.55], [0, 1], { extrapolateRight: 'clamp' }),
        transform: `${swingIn(s, { rx: -12, ry: Math.sin(i * 2.4) * 8, z: -60 })} translateY(${((1 - s) * height * 0.05).toFixed(3)}px)`,
      };
    };

    // The header is a UI card: it rests with only a whisper of sway, and the stat row / button
    // row sit at shallow parallax depths so the sway shears the layers over each other.
    const headerPose = sway3d(timeMs, seed, 1.1, 4200);
    const parStats = parallax(timeMs, seed, 0.3, width * 0.008, 4200);
    const parBtns = parallax(timeMs, seed, 0.4, width * 0.008, 4200);

    // Everything is sized off the card's own width so the header keeps its proportions at any box
    // size — and it is scaled to fill the card rather than sit in a band across the top of it.
    const av = width * 0.217;
    const fsHandle = Math.round(width * 0.052);
    const fsStat = Math.round(width * 0.05);
    const fsSmall = Math.round(width * 0.03);
    const fsBio = Math.round(width * 0.048);
    const btnH = Math.round(width * 0.09);
    const rowGap = width * 0.086;

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff, color: p.ink, display: 'flex', flexDirection: 'column', gap: rowGap, transform: headerPose, transformOrigin: '50% 40%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: width * 0.04 }}>
          <div
            style={{
              width: av, height: av, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              background: '#0b1a2b', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              boxShadow: `0 0 0 1px ${rgba(p.ink, 0.08)}, 0 ${(width * 0.008).toFixed(1)}px ${(width * 0.03).toFixed(1)}px ${rgba(p.ink, 0.1)}`,
              ...beat(0), ...el('avatar'),
            }}
          >
            {p.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <svg width={av * 0.72} height={av * 0.72} viewBox="0 0 24 24" fill="#2f7cf6" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8z" />
              </svg>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: width * 0.018 }}>
            <span style={{ fontSize: fsHandle, fontWeight: 700, ...beat(0.5), ...el('handle') }}>{p.handle}</span>
            <div style={{ display: 'flex', gap: width * 0.105, transform: `translate(${parStats.x.toFixed(2)}px, ${parStats.y.toFixed(2)}px)`, ...el('stats') }}>
              {stats.map((s, i) => (
                <div key={s.label + i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', ...beat(0.7 + i * 0.3) }}>
                  <span style={{ fontSize: fsStat, fontWeight: 700, lineHeight: 1.1 }}>{s.value}</span>
                  <span style={{ fontSize: fsSmall, color: rgba(p.ink, 0.55), lineHeight: 1.1 }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: width * 0.012, ...el('bio') }}>
          {bio.map((line, i) => (
            <span key={i} style={{ fontSize: fsBio, color: rgba(p.ink, 0.82), lineHeight: 1.3, ...beat(2.2 + i * 0.3) }}>{line}</span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: width * 0.018, transform: `translate(${parBtns.x.toFixed(2)}px, ${parBtns.y.toFixed(2)}px)`, ...el('buttons') }}>
          <div style={{ flex: 1.1, height: btnH, borderRadius: btnH * 0.22, background: p.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fsBio, fontWeight: 700, boxShadow: `0 ${(width * 0.01).toFixed(1)}px ${(width * 0.03).toFixed(1)}px ${rgba(p.accent, 0.28)}`, ...beat(3.2) }}>
            {p.primary}
          </div>
          {others.map((label, i) => (
            <div key={label + i} style={{ flex: 1, height: btnH, borderRadius: btnH * 0.22, background: p.chip, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fsBio, fontWeight: 600, boxShadow: `inset 0 0 0 1px ${rgba(p.ink, 0.05)}`, ...beat(3.5 + i * 0.3) }}>
              {label}
            </div>
          ))}
        </div>
      </div>
    );
  },
});
