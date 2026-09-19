// A video-comment card that pops in and then LIKES ITSELF: the heart fills red with a ring
// pulse and the count rolls +1 in a masked digit slot. The tick moment is a param (likeMs) so
// the editor can land it on the exact beat the creator says "drop a comment" — and the roll
// animates old→new inside an overflow-hidden slot, so the layout never reflows on the +1.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { easeOutQuint } from '../luxe';
import { depthPose, parallax, smear, vel } from '../juice';

const HEART =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 '
  + '2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

function group(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const commentPop = defineGraphicsTemplate({
  id: 'comment_pop',
  name: 'Comment Card',
  category: 'social',
  tags: ['Comment', 'Card', 'Avatar', 'Heart', 'Like'],
  badge: 'New',
  design: { w: 900, h: 400 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 30, widthPercent: 58 },
  fonts: ['inter'],

  elements: [
    { key: 'card',   label: 'Card', hideable: false },
    { key: 'avatar', label: 'Avatar' },
    { key: 'text',   label: 'Comment text' },
    { key: 'heart',  label: 'Like row' },
  ],

  params: [
    { type: 'text',   key: 'username', label: 'Username', group: 'Content', default: 'priya.edits', maxLength: 24 },
    { type: 'image',  key: 'avatarImg', label: 'Avatar photo', group: 'Content', default: '', help: 'Optional — a coloured initial disc is drawn when empty.' },
    { type: 'text',   key: 'comment',  label: 'Comment',  group: 'Content', default: 'bro this actually works, tried it today', maxLength: 120, multiline: true },
    { type: 'number', key: 'likes',    label: 'Likes',    group: 'Content', default: 1284, min: 0, max: 9999999, step: 1 },
    { type: 'text',   key: 'time',     label: 'Time',     group: 'Content', default: '2h', maxLength: 8 },

    { type: 'boolean', key: 'dark',     label: 'Dark mode',     group: 'Style', default: false },
    { type: 'color',   key: 'avatarBg', label: 'Avatar colour', group: 'Style', default: '#F59E0B' },
    { type: 'color',   key: 'heartCol', label: 'Heart colour',  group: 'Style', default: '#E5484D' },
    { type: 'font',    key: 'font',     label: 'Font',          group: 'Style', default: 'inter' },

    { type: 'number', key: 'delay',  label: 'Delay',     group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
    { type: 'number', key: 'likeMs', label: '+1 moment', group: 'Motion', default: 1600, min: 300, max: 3600, step: 50, unit: 'ms' },
  ],

  // A soft pop as the card lands, a brighter one on the self-like beat — retiming likeMs
  // retimes the second cue with the heart.
  sfx: (p) => [
    { atMs: p.delay + 150, id: 'pop', gain: 0.4 },
    { atMs: p.delay + p.likeMs, id: 'pop', gain: 0.7 },
  ],

  render: ({ params: p, el, timeMs, height, width, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);

    // Card entrance: one friendly spring — a touch of overshoot, no wobble after.
    const popSpringAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 17, mass: 0.7, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(600))),
    });
    const pop = popSpringAt(t);
    const cardOp = interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

    // DEPTH: the card swings in top-hinged on its own spring and keeps a gentle ±1.5° sway
    // after (a comment card is friendly, not showy); its entrance velocity smears it for the
    // frames it is actually moving, and the header / like rows parallax over the body.
    const pose = depthPose(t, seed, { enter: pop, rx: -12, z: -70, swayDeg: 1.5 });
    const cardSmear = smear(0, vel(popSpringAt, t) * height * 0.22);
    const parHead = parallax(t, seed, 0.5, height * 0.012);
    const parLike = parallax(t, seed, 0.8, height * 0.012);

    // The +1 beat: heart fill + a soft sine bump (a full spring here would over-act the beat).
    const lt = t - p.likeMs;
    const bump = Math.sin(Math.PI * clamp01(lt / 420));
    const fillOp = clamp01(lt / 180);
    const ringU = clamp01(lt / 520);
    const roll = easeOutQuint(clamp01(lt / 380));

    const dark = p.dark;
    const cardBg = dark ? '#1c1c1e' : '#ffffff';
    const ink = dark ? '#f4f1e8' : '#161618';
    const dim = dark ? 'rgba(244,241,232,0.52)' : 'rgba(22,22,24,0.46)';

    const pad = Math.round(height * 0.1);
    const av = Math.round(height * 0.16);
    const fsUser = Math.round(height * 0.072);
    const fsBody = Math.round(height * 0.085);
    const fsCount = Math.round(height * 0.07);
    const heartSz = Math.round(height * 0.085);
    const slotH = Math.round(fsCount * 1.25);

    // The heart's +1 bump is the card's one fast mover — smear it with its own velocity so the
    // like POPS instead of inflating; zero the instant the bump rests.
    const heartSmear = smear(0, vel((ms: number) => 1 + 0.35 * Math.sin(Math.PI * clamp01((ms - p.likeMs) / 420)), t) * height * 0.3);

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: cardBg,
          borderRadius: Math.round(height * 0.08),
          border: `1px solid ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)'}`,
          boxShadow: '0 10px 24px rgba(0,0,0,0.10), 0 30px 60px rgba(0,0,0,0.08)',
          opacity: cardOp,
          filter: cardSmear.blurPx > 0.3 ? `blur(${cardSmear.blurPx.toFixed(2)}px)` : undefined,
          transform: `${pose} translateY(${((1 - pop) * height * 0.06).toFixed(2)}px) scale(${((0.88 + pop * 0.12) * cardSmear.sx).toFixed(4)}, ${((0.88 + pop * 0.12) * cardSmear.sy).toFixed(4)})`,
          transformOrigin: 'center center',
          fontFamily: ff,
          padding: pad,
          boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: Math.round(height * 0.05),
          ...el('card'),
        }}
      >
        {/* Avatar + username + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(height * 0.05), transform: `translate(${parHead.x.toFixed(2)}px, ${parHead.y.toFixed(2)}px)` }}>
          <div
            style={{
              width: av, height: av, borderRadius: '50%', flexShrink: 0,
              background: p.avatarImg ? undefined : p.avatarBg, color: '#ffffff',
              overflow: p.avatarImg ? 'hidden' : undefined,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: Math.round(av * 0.52), fontWeight: 700,
              boxShadow: `0 4px 14px ${rgba(p.avatarBg, 0.35)}`,
              ...el('avatar'),
            }}
          >
            {p.avatarImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatarImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              (p.username.trim().charAt(0) || 'C').toUpperCase()
            )}
          </div>
          <span style={{ fontSize: fsUser, fontWeight: 700, color: ink, whiteSpace: 'nowrap' }}>
            {p.username}
          </span>
          <span style={{ fontSize: fsUser * 0.9, fontWeight: 400, color: dim, whiteSpace: 'nowrap' }}>
            {p.time}
          </span>
        </div>

        {/* Comment body */}
        <span
          style={{
            fontSize: fsBody, fontWeight: 400, color: ink, lineHeight: 1.32,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            ...el('text'),
          }}
        >
          {p.comment}
        </span>

        {/* Heart + rolling count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(height * 0.04), transform: `translate(${parLike.x.toFixed(2)}px, ${parLike.y.toFixed(2)}px)`, ...el('heart') }}>
          <div style={{ position: 'relative', width: heartSz, height: heartSz, flexShrink: 0 }}>
            {ringU > 0 && ringU < 1 && (
              <div
                style={{
                  position: 'absolute', left: '50%', top: '50%',
                  width: heartSz, height: heartSz, borderRadius: '50%',
                  border: `3px solid ${p.heartCol}`,
                  transform: `translate(-50%, -50%) scale(${(1 + ringU * 1.1).toFixed(3)})`,
                  opacity: (1 - ringU) * 0.7,
                }}
              />
            )}
            <svg
              viewBox="0 0 24 24"
              width={heartSz} height={heartSz}
              style={{
                position: 'absolute', inset: 0,
                filter: heartSmear.blurPx > 0.3 ? `blur(${heartSmear.blurPx.toFixed(2)}px)` : undefined,
                transform: `scale(${((1 + bump * 0.35) * heartSmear.sx).toFixed(3)}, ${((1 + bump * 0.35) * heartSmear.sy).toFixed(3)})`,
                transformOrigin: 'center center',
              }}
            >
              <path d={HEART} fill="none" stroke={dim} strokeWidth={2} />
              <path d={HEART} fill={p.heartCol} opacity={fillOp} />
            </svg>
          </div>
          <div style={{ position: 'relative', height: slotH, overflow: 'hidden', minWidth: width * 0.1 }}>
            <span
              style={{
                display: 'block', fontSize: fsCount, fontWeight: 600, lineHeight: `${slotH}px`,
                color: dim, fontVariantNumeric: 'tabular-nums',
                transform: `translateY(${(-roll * slotH).toFixed(2)}px)`,
              }}
            >
              {group(Math.round(p.likes))}
            </span>
            <span
              style={{
                display: 'block', fontSize: fsCount, fontWeight: 600, lineHeight: `${slotH}px`,
                color: fillOp > 0.5 ? p.heartCol : dim, fontVariantNumeric: 'tabular-nums',
                transform: `translateY(${(-roll * slotH).toFixed(2)}px)`,
              }}
            >
              {group(Math.round(p.likes) + 1)}
            </span>
          </div>
        </div>
      </div>
    );
  },
});
