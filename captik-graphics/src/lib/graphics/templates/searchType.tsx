// A search bar that types its query char-by-char — floor(elapsed/typeMs), never a CSS trick —
// with the caret as a timeMs square wave (solid while typing, blinking once idle). The
// suggestion dropdown then springs open under the pill with the first row tinted amber.
// Type speed is per-character, so a longer query naturally takes longer instead of rushing.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp, clamp01, fr, rgba } from '../motion';
import { depthPose, parallax, smear, swingIn, vel } from '../juice';

const LENS =
  'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 '
  + '5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z';

export const searchType = defineGraphicsTemplate({
  id: 'search_type',
  name: 'Search Bar',
  category: 'device',
  tags: ['Search', 'Typing', 'Dropdown', 'Magnifier', 'Pill'],
  badge: 'New',
  design: { w: 900, h: 300 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 4500,
  defaultBox: { xPercent: 50, yPercent: 28, widthPercent: 64 },
  fonts: ['inter'],

  elements: [
    { key: 'bar',      label: 'Search bar', hideable: false },
    { key: 'query',    label: 'Query text' },
    { key: 'dropdown', label: 'Suggestions' },
  ],

  params: [
    { type: 'text', key: 'query', label: 'Query', group: 'Content', default: 'how to grow on youtube', maxLength: 40 },
    { type: 'text', key: 'suggestions', label: 'Suggestions', group: 'Content',
      default: 'how to grow on youtube fast|how to grow on youtube in 2026|how to get more views', maxLength: 160,
      help: 'Up to 3, separated by |' },

    { type: 'boolean', key: 'dark',   label: 'Dark mode', group: 'Style', default: false },
    { type: 'color',   key: 'accent', label: 'Highlight', group: 'Style', default: '#F59E0B' },
    { type: 'font',    key: 'font',   label: 'Font',      group: 'Style', default: 'inter' },

    { type: 'number', key: 'typeMs', label: 'Type speed', group: 'Motion', default: 55, min: 20, max: 200, step: 5, unit: 'ms' },
    { type: 'number', key: 'delay',  label: 'Delay',      group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Device UI, quick and light: a fast air pass as the pill drops in, ONE soft key burst for the
  // whole typed query (never per character), a glossy pop when the dropdown opens. The 380ms
  // type-start constant matches `typeStart` in render — retiming params retimes the sound.
  sfx: (p) => [
    { atMs: p.delay, id: 'swish', gain: 0.45 },
    { atMs: p.delay + 380, id: 'type', gain: 0.5 },
    { atMs: p.delay + 380 + p.query.length * p.typeMs + 260, id: 'pop', gain: 0.5 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;
    const ff = fontStack(p.font);
    const q = p.query;
    const rows = p.suggestions.split('|').map((s) => s.trim()).filter(Boolean).slice(0, 3);

    // Bar entrance: one measured spring pop.
    const barAt = (ms: number) => spring({
      frame: fr(ms), fps: FPS,
      config: { damping: 20, mass: 0.7, stiffness: 180 },
      durationInFrames: Math.max(1, Math.round(fr(450))),
    });
    const barIn = barAt(t);
    const barOp = interpolate(barIn, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

    // DEPTH: the whole search block lives on one swaying plane (top-hinged swing in, ≤1.2° rest
    // sway — it is a UI mimic, not a floating card). The pill DROPS from above with a velocity
    // smear that dies on landing, and the query text / dropdown parallax at different depths so
    // the sway shears them against the glass.
    const pose = depthPose(t, seed, { enter: clamp01(barIn), rx: -18, z: -120, swayDeg: 1.2 });
    const descend = (1 - barIn) * -height * 0.16;
    const barSmear = smear(0, vel((ms: number) => (1 - barAt(ms)) * -height * 0.16, t));
    const parQ = parallax(t, seed, 0.3, width * 0.005);
    const parDrop = parallax(t, seed, 0.22, width * 0.005);

    // Typing: pure integer division of elapsed time.
    const typeStart = 380;
    const chars = clamp(Math.floor((t - typeStart) / Math.max(1, p.typeMs)), 0, q.length);
    const typed = q.slice(0, chars);
    const doneAt = typeStart + q.length * p.typeMs;
    const typing = t >= typeStart && t < doneAt;
    // Caret: solid while typing, 530ms square-wave blink once idle.
    const caretOn = typing || Math.floor(t / 530) % 2 === 0;

    // Dropdown springs open shortly after the last character.
    const tDrop = doneAt + 260;
    const drop = spring({
      frame: fr(t - tDrop), fps: FPS,
      config: { damping: 22, mass: 0.7, stiffness: 190 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });
    const hiIn = clamp01((t - tDrop - 300) / 350);

    const dark = p.dark;
    const bg = dark ? '#1c1c1e' : '#ffffff';
    const ink = dark ? '#f4f1e8' : '#161618';
    const dim = dark ? 'rgba(244,241,232,0.45)' : 'rgba(22,22,24,0.42)';
    const hairline = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';

    const barH = Math.round(height * 0.32);
    const fsQuery = Math.round(barH * 0.38);
    const fsRow = Math.round(barH * 0.32);
    const icon = Math.round(barH * 0.42);
    const rowH = Math.round(height * 0.19);

    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: ff, transform: `${pose} translateY(${descend.toFixed(2)}px)` }}>
        {/* The pill */}
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, height: barH,
            background: bg, borderRadius: 999,
            border: `1px solid ${hairline}`,
            boxShadow: '0 8px 20px rgba(0,0,0,0.10), 0 24px 48px rgba(0,0,0,0.08)',
            display: 'flex', alignItems: 'center',
            padding: `0 ${Math.round(barH * 0.42)}px`,
            boxSizing: 'border-box',
            opacity: barOp,
            filter: barSmear.blurPx > 0.3 ? `blur(${barSmear.blurPx.toFixed(2)}px)` : undefined,
            transform: `scale(${((0.94 + barIn * 0.06) * barSmear.sx).toFixed(4)}, ${((0.94 + barIn * 0.06) * barSmear.sy).toFixed(4)})`,
            transformOrigin: 'center center',
            zIndex: 2,
            ...el('bar'),
          }}
        >
          <svg viewBox="0 0 24 24" width={icon} height={icon} style={{ flexShrink: 0, marginRight: Math.round(barH * 0.28) }}>
            <path d={LENS} fill={dim} />
          </svg>
          <span style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', transform: `translate(${parQ.x.toFixed(2)}px, ${parQ.y.toFixed(2)}px)`, ...el('query') }}>
            <span style={{ fontSize: fsQuery, fontWeight: 500, color: ink, whiteSpace: 'pre' }}>
              {typed}
            </span>
            <span
              style={{
                width: 3, height: Math.round(fsQuery * 1.25), marginLeft: 3, flexShrink: 0,
                background: ink, opacity: caretOn ? 0.9 : 0, borderRadius: 1,
              }}
            />
          </span>
        </div>

        {/* Suggestions — clipped behind the pill so they slide out from under it */}
        {rows.length > 0 && (
          <div
            style={{
              position: 'absolute', left: Math.round(width * 0.02), right: Math.round(width * 0.02),
              top: barH + Math.round(height * 0.045),
              background: bg,
              borderRadius: Math.round(height * 0.075),
              border: `1px solid ${hairline}`,
              boxShadow: '0 12px 28px rgba(0,0,0,0.12), 0 32px 64px rgba(0,0,0,0.10)',
              padding: `${Math.round(height * 0.03)}px 0`,
              boxSizing: 'border-box',
              opacity: interpolate(drop, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }),
              // Its own top-hinged swing (nested perspective is a fresh 3D context) over the
              // existing slide-from-under-the-pill, plus a deeper parallax than the query text.
              transform: `${swingIn(drop, { rx: -16, z: -70 })} translate(${parDrop.x.toFixed(2)}px, ${(parDrop.y + (1 - drop) * -height * 0.12).toFixed(2)}px) scaleY(${(0.82 + drop * 0.18).toFixed(4)})`,
              transformOrigin: 'center top',
              zIndex: 1,
              ...el('dropdown'),
            }}
          >
            {rows.map((row, i) => {
              const hi = i === 0 ? hiIn : 0;
              // Rows land one after another instead of appearing as one block with the panel.
              const rowIn = clamp01((t - tDrop - 120 - i * 90) / 260);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', height: rowH,
                    padding: `0 ${Math.round(barH * 0.42)}px`, boxSizing: 'border-box',
                    background: hi > 0 ? rgba(p.accent, 0.14 * hi) : undefined,
                    borderLeft: `3px solid ${hi > 0 ? rgba(p.accent, hi) : 'rgba(0,0,0,0)'}`,
                    opacity: rowIn,
                    transform: `translateY(${((1 - rowIn) * height * 0.03).toFixed(2)}px)`,
                  }}
                >
                  <svg viewBox="0 0 24 24" width={Math.round(icon * 0.72)} height={Math.round(icon * 0.72)} style={{ flexShrink: 0, marginRight: Math.round(barH * 0.28), opacity: 0.7 }}>
                    <path d={LENS} fill={dim} />
                  </svg>
                  <span
                    style={{
                      fontSize: fsRow, fontWeight: hi > 0.5 ? 600 : 400,
                      color: hi > 0.5 ? (dark ? p.accent : ink) : dim,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {row}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  },
});
