// DM pop — the "someone actually sent me this" bubble. Typing dots pulse in sequence, then the
// dark iMessage-style bubble SNAPS in from its own tail (scale overshoot + chroma pop + shake +
// sparkles) and "Seen 2:14 AM" fades under. The craft: the message bubble is laid out in flow at
// full size the whole time and only its transform animates, so the lockup never reflows when the
// typing indicator hands over to the message.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { chromaPop, depthPose, idleFloat, parallax, pulse, shakeDecay, smear, sparkleField, SPARKLE_PATH, swingIn, vel } from '../juice';

export const dmPop = defineGraphicsTemplate({
  id: 'dm_pop',
  name: 'DM Pop',
  category: 'social',
  tags: ['DM', 'Bubble', 'Chat', 'Typing', 'Dark'],
  badge: 'Hot',
  design: { w: 900, h: 460 },
  // Floats straight over footage — the bubble is its own dark surface.
  backdrop: false,
  defaultDurationMs: 4000,
  defaultBox: { xPercent: 50, yPercent: 34, widthPercent: 64 },
  fonts: ['inter'],

  elements: [
    { key: 'avatar', label: 'Avatar' },
    { key: 'typing', label: 'Typing dots' },
    { key: 'bubble', label: 'Message bubble', hideable: false },
    { key: 'seen',   label: 'Seen receipt' },
  ],

  params: [
    { type: 'text', key: 'msg',  label: 'Message', group: 'Content', default: 'bro how did you edit this??', maxLength: 90 },
    { type: 'text', key: 'seen', label: 'Receipt', group: 'Content', default: 'Seen 2:14 AM', maxLength: 24 },
    { type: 'image', key: 'avatar', label: 'Avatar photo', group: 'Content', default: '',
      help: 'Optional — a drawn profile placeholder shows when empty.' },

    { type: 'color', key: 'bubbleCol', label: 'Bubble', group: 'Style', default: '#26262B' },
    { type: 'color', key: 'ink',       label: 'Text', group: 'Style', default: '#F2F2F7' },
    { type: 'color', key: 'accent',    label: 'Glow', group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'typingMs', label: 'Typing time', group: 'Motion', default: 900, min: 300, max: 2200, step: 50, unit: 'ms' },
    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Pop x2: a soft one as the typing indicator hands over, the real one as the bubble lands —
  // retiming typingMs retimes both.
  sfx: (p) => [
    { atMs: p.delay + p.typingMs, id: 'pop', gain: 0.45 },
    { atMs: p.delay + p.typingMs + 180, id: 'pop', gain: 0.8 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    if (t < 0) return null;

    const m = Math.min(height, width * (460 / 900));
    const popAt = p.typingMs;
    const landAt = popAt + 180;

    const avatarIn = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 16, mass: 0.7, stiffness: 220 },
      durationInFrames: Math.max(1, Math.round(fr(420))),
    });
    const typingIn = spring({
      frame: fr(t - 80), fps: FPS,
      config: { damping: 17, mass: 0.6, stiffness: 230 },
      durationInFrames: Math.max(1, Math.round(fr(380))),
    });
    const popSpringAt = (ms: number) => spring({
      frame: fr(ms - popAt), fps: FPS,
      config: { damping: 13, mass: 0.7, stiffness: 250 },
      durationInFrames: Math.max(1, Math.round(fr(450))),
    });
    const pop = popSpringAt(t);
    const typingOut = clamp01((t - popAt) / 140);
    const shake = shakeDecay(t, landAt, m * 0.012, { seed });
    const drift = idleFloat(t, seed, m * 0.01, 2800);
    const glowK = pulse(t, 1800, 0.45, 1);
    const sparks = sparkleField(seed, 6, t, landAt, { spreadMs: 300, lifeMs: 560 });
    const seenQ = clamp01((t - popAt - 500) / 350);

    // DEPTH: the whole lockup arrives through 3D on the avatar's spring and keeps a soft sway;
    // the bubble additionally swings off its own tail hinge and smears with its pop velocity,
    // while avatar / typing / receipt sit at different parallax depths.
    const pose = depthPose(t, seed, { enter: avatarIn, rx: -8, ry: 14, z: -80, swayDeg: 1.8, periodMs: 2800 });
    const bubSmear = smear(0, vel(popSpringAt, t) * m * 0.5);
    const parAvatar = parallax(t, seed, 0.5, m * 0.012, 2800);
    const parTyping = parallax(t, seed, 0.3, m * 0.012, 2800);
    const parSeen = parallax(t, seed, 0.8, m * 0.012, 2800);

    const avatarD = m * 0.17;
    // Generous: the bubble IS the graphic — a timid bubble reads as UI debris, not a beat.
    const fsMsg = m * 0.088;
    const fsSeen = m * 0.05;
    const tail = m * 0.052;

    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          gap: m * 0.03,
          fontFamily: fontStack('inter'),
          paddingBottom: m * 0.12,
          boxSizing: 'border-box',
          transform: `${pose} translate(${(shake.x + drift.x).toFixed(2)}px, ${(shake.y + drift.y).toFixed(2)}px) rotate(${drift.rot.toFixed(3)}deg)`,
          transformOrigin: '50% 70%',
        }}
      >
        {/* ── Avatar disc with breathing ring ── */}
        <div
          style={{
            width: avatarD, height: avatarD,
            borderRadius: '50%',
            overflow: 'hidden',
            flexShrink: 0,
            background: '#3A3A3F',
            border: '2px solid rgba(255,255,255,0.22)',
            boxShadow: `0 ${m * 0.01}px ${m * 0.03}px rgba(0,0,0,0.5), 0 0 ${(m * 0.035 * glowK).toFixed(1)}px ${rgba(p.accent, 0.3 * glowK)}`,
            opacity: Math.min(1, avatarIn * 1.6),
            transform: `translate(${parAvatar.x.toFixed(2)}px, ${parAvatar.y.toFixed(2)}px) scale(${(0.6 + avatarIn * 0.4).toFixed(4)})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...el('avatar'),
          }}
        >
          {p.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <svg width={avatarD * 0.62} height={avatarD * 0.62} viewBox="0 0 24 24" style={{ marginTop: avatarD * 0.08 }}>
              <circle cx="12" cy="8" r="4.4" fill="rgba(255,255,255,0.5)" />
              <path d="M 3 22 C 3 16.5 7 13.8 12 13.8 C 17 13.8 21 16.5 21 22 Z" fill="rgba(255,255,255,0.5)" />
            </svg>
          )}
        </div>

        {/* ── Bubble column: message in flow, typing dots overlaid ── */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
          <div
            style={{
              position: 'relative',
              maxWidth: width * 0.76,
              padding: `${m * 0.038}px ${m * 0.055}px`,
              borderRadius: m * 0.058,
              background: p.bubbleCol,
              color: p.ink,
              fontSize: fsMsg,
              lineHeight: 1.28,
              boxShadow: `0 ${m * 0.018}px ${m * 0.06}px rgba(0,0,0,0.5), 0 0 ${(m * 0.05 * glowK).toFixed(1)}px ${rgba(p.accent, 0.16 * glowK)}, inset 0 1px 0 rgba(255,255,255,0.09)`,
              opacity: Math.min(1, pop * 1.8),
              filter: bubSmear.blurPx > 0.3 ? `blur(${bubSmear.blurPx.toFixed(2)}px)` : undefined,
              transform: `${swingIn(pop, { rx: -10, ry: 24, z: -70 })} scale(${(pop * bubSmear.sx).toFixed(4)}, ${(pop * bubSmear.sy).toFixed(4)})`,
              transformOrigin: 'left bottom',
              textShadow: chromaPop(t, landAt, m * 0.009) || undefined,
              ...el('bubble'),
            }}
          >
            {p.msg}
            {/* drawn iMessage tail, anchored bottom-left */}
            <svg
              width={tail} height={tail} viewBox="0 0 16 16"
              style={{ position: 'absolute', left: -tail * 0.38, bottom: 0 }}
            >
              <path d="M 12 0 C 12 7 7 13 0 15.5 C 6.5 16 11.5 12.5 14 6.5 L 14 0 Z" fill={p.bubbleCol} />
            </svg>
          </div>

          {/* typing indicator — three dots pulsing in sequence, swallowed by the pop */}
          <div
            style={{
              position: 'absolute', left: 0, bottom: seenQ > 0 ? fsSeen * 1.6 : 0,
              display: 'flex', alignItems: 'center', gap: m * 0.018,
              padding: `${m * 0.032}px ${m * 0.045}px`,
              borderRadius: m * 0.055,
              background: p.bubbleCol,
              boxShadow: `0 ${m * 0.014}px ${m * 0.045}px rgba(0,0,0,0.45)`,
              opacity: Math.min(1, typingIn * 1.6) * (1 - typingOut),
              transform: `translate(${parTyping.x.toFixed(2)}px, ${parTyping.y.toFixed(2)}px) scale(${((0.5 + typingIn * 0.5) * (1 - typingOut * 0.5)).toFixed(4)})`,
              transformOrigin: 'left bottom',
              ...el('typing'),
            }}
          >
            {[0, 1, 2].map((i) => {
              const k = pulse(t, 1000, 0.3, 1, -i * 0.9);
              return (
                <div
                  key={i}
                  style={{
                    width: m * 0.03, height: m * 0.03,
                    borderRadius: '50%',
                    background: rgba(p.ink, 0.35 + 0.5 * k),
                    transform: `scale(${(0.75 + 0.25 * k).toFixed(3)})`,
                  }}
                />
              );
            })}
          </div>

          {/* seen receipt */}
          {p.seen && (
            <span
              style={{
                marginTop: m * 0.022,
                marginLeft: m * 0.02,
                fontSize: fsSeen,
                fontWeight: 500,
                color: rgba(p.ink, 0.48),
                opacity: seenQ,
                transform: `translate(${parSeen.x.toFixed(2)}px, ${(parSeen.y + (1 - seenQ) * m * 0.02).toFixed(2)}px)`,
                ...el('seen'),
              }}
            >
              {p.seen}
            </span>
          )}

          {sparks.map((s, i) => (
            <svg
              key={i}
              width={m * 0.045} height={m * 0.045} viewBox="0 0 24 24"
              style={{
                position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
                transform: `translate(-50%,-50%) scale(${s.s.toFixed(3)}) rotate(${s.rot.toFixed(1)}deg)`,
                opacity: s.o * 0.9,
              }}
            >
              <path d={SPARKLE_PATH} fill={p.accent} />
            </svg>
          ))}
        </div>
      </div>
    );
  },
});
