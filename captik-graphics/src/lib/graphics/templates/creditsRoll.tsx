// End-credits column: ROLE|Name pairs scroll upward at constant speed — position is strictly
// linear in timeMs, sized so the column fully traverses the window in exactly durationMs.
// Over transparent footage a gradient overlay cannot erase glyphs, so each row ALSO fades by
// its own y-position near the top/bottom 15%; the gradient scrims supply the soft dark edge,
// the per-row opacity does the actual vanishing.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { LUXE, luxeLabel } from '../luxe';
import { sway3d } from '../juice';

export const creditsRoll = defineGraphicsTemplate({
  id: 'credits_roll',
  name: 'Credits Roll',
  category: 'story',
  tags: ['Credits', 'Scroll', 'Names', 'Ending', 'Film'],
  badge: 'New',
  design: { w: 700, h: 900 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 8000,
  defaultBox: { xPercent: 50, yPercent: 45, widthPercent: 46 },
  fonts: ['montserrat'],

  elements: [
    { key: 'column',  label: 'Credits', hideable: false },
    { key: 'heading', label: 'Heading' },
    { key: 'fade',    label: 'Edge fades' },
  ],

  params: [
    { type: 'text', key: 'heading', label: 'Heading', group: 'Content', default: 'CREDITS', maxLength: 24 },
    { type: 'text', key: 'credits', label: 'Credits (ROLE|Name per line)', group: 'Content', multiline: true, maxLength: 400,
      default: 'DIRECTED BY|Arjun Mehta\nCINEMATOGRAPHY|Priya Nair\nEDITED BY|Rohan Iyer\nMUSIC|Kabir Rao\nSPECIAL THANKS|The Community' },

    { type: 'color', key: 'ink',    label: 'Names',  group: 'Style', default: '#F4F1E8' },
    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },

    { type: 'number', key: 'fadePct', label: 'Edge fade', group: 'Motion', default: 15, min: 8, max: 25, step: 1, unit: '%' },
    { type: 'number', key: 'delay',   label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // Documentary chrome whispers: a long airy crescendo as the roll starts, one luxe ping as
  // the heading clears its rise — both at low gain; credits never announce themselves.
  sfx: (p) => [
    { atMs: p.delay + 100, id: 'sweep', gain: 0.45 },
    { atMs: p.delay + 900, id: 'glass', gain: 0.3 },
  ],

  render: ({ params: p, el, timeMs, durationMs, height, seed }) => {
    const t = timeMs - p.delay;

    // Soft arrival for the whole window — the scroll itself starts moving from frame one.
    const introIn = spring({
      frame: fr(t), fps: FPS,
      config: { damping: 30, mass: 0.8, stiffness: 120 },
      durationInFrames: Math.max(1, Math.round(fr(500))),
    });

    const rows = p.credits.split('\n').map((line) => {
      const bar = line.indexOf('|');
      return bar >= 0
        ? { role: line.slice(0, bar).trim(), name: line.slice(bar + 1).trim() }
        : { role: '', name: line.trim() };
    });

    const fsName = Math.round(height * 0.05);
    const fsRole = Math.round(height * 0.026);
    const pitch = Math.round(height * 0.135);
    const headH = p.heading ? Math.round(height * 0.16) : 0;
    const contentH = headH + rows.length * pitch;

    // Constant speed: the column enters from the bottom edge and its tail clears the top
    // edge exactly at durationMs. Pure linear function of t.
    const travelMs = Math.max(1, durationMs - p.delay);
    const y = height - (t / travelMs) * (height + contentH);

    const fz = height * (p.fadePct / 100);
    const rowFade = (midY: number) => clamp01(midY / fz) * clamp01((height - midY) / fz);
    const shadow = '0 1px 3px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.4)';

    const headMid = y + headH / 2;

    // Documentary chrome: the column hangs in space with a sub-degree film-gate sway (the
    // scroll itself stays strictly linear) and racks into focus over the intro spring.
    const pose = sway3d(t, seed, 1, 5200);
    const rack = (1 - Math.min(1, introIn)) * 3;

    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: fontStack('montserrat'), opacity: introIn.toFixed(3) }}>
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: 0,
            textAlign: 'center',
            filter: rack > 0.3 ? `blur(${rack.toFixed(2)}px)` : undefined,
            transform: `${pose} translateY(${y.toFixed(2)}px)`,
            ...el('column'),
          }}
        >
          {p.heading && (
            <div style={{ height: headH, opacity: rowFade(headMid).toFixed(3), ...el('heading') }}>
              <div style={{ ...luxeLabel(Math.round(height * 0.036), p.accent), letterSpacing: '0.34em', paddingLeft: '0.34em', textShadow: shadow }}>
                {p.heading}
              </div>
              <div
                style={{
                  width: '26%', height: 2, margin: `${Math.round(height * 0.03)}px auto 0`,
                  background: p.accent, boxShadow: `0 0 10px ${p.accent}55`,
                }}
              />
            </div>
          )}

          {rows.map((r, i) => {
            const mid = y + headH + i * pitch + pitch / 2;
            if (!r.name || mid < -pitch || mid > height + pitch) {
              return <div key={i} style={{ height: pitch }} />;
            }
            return (
              <div key={i} style={{ height: pitch, opacity: rowFade(mid).toFixed(3) }}>
                {r.role && (
                  <div style={{ ...luxeLabel(fsRole, LUXE.inkDim), letterSpacing: '0.26em', paddingLeft: '0.26em', textShadow: shadow, marginBottom: Math.round(fsName * 0.3) }}>
                    {r.role}
                  </div>
                )}
                <div style={{ fontSize: fsName, fontWeight: 700, lineHeight: 1.2, color: p.ink, textShadow: shadow }}>
                  {r.name}
                </div>
              </div>
            );
          })}
        </div>

        {/* Soft dark scrims at the edges — over-footage stand-ins for a fade mask. */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...el('fade') }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: fz, background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 100%)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: fz, background: 'linear-gradient(0deg, rgba(0,0,0,0.3) 0%, transparent 100%)' }} />
        </div>
      </div>
    );
  },
});
