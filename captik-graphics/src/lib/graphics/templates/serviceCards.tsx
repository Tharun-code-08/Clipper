// Reference: graphics/create-a-futuristic-motion-graphics-sequence-showi.mp4
//   (window 0-5200ms, dashboard resolves ~3600ms)
// Service cards streaming past on parallel lanes, which then collapse into one dashboard panel.
//
// The two phases OVERLAP: the last cards are still travelling as the panel starts assembling. A
// hard cut between them reads as two clips, which is the thing the reference is careful not to do.

import { interpolate, spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr, rgba } from '../motion';
import { luxeGrain, luxeVignette } from '../luxe';
import { depthPose, parallax, smear, sway3d, swingIn, vel } from '../juice';

const MAX_CARDS = 10;
const MAX_TILES = 4;

export const serviceCards = defineGraphicsTemplate({
  id: 'service_cards',
  name: 'Service Cards',
  category: 'device',
  tags: ['Cards', 'Dashboard', 'Super App'],
  design: { w: 900, h: 1200 },
  // Paints its own container — the shared plate would only peek out as a border.
  backdrop: false,
  defaultDurationMs: 5200,
  defaultBox: { xPercent: 50, yPercent: 50, widthPercent: 96 },
  fonts: ['inter'],

  elements: [
    { key: 'scene', label: 'Scene', hideable: false },
    { key: 'stream', label: 'Card stream' },
    { key: 'panel', label: 'Dashboard' },
    ...Array.from({ length: MAX_TILES }, (_, i) => ({ key: `tile${i + 1}`, label: `Tile ${i + 1}` })),
  ],

  params: [
    { type: 'text', key: 'cards', label: 'Streaming cards', group: 'Content', multiline: true, maxLength: 240,
      default: 'Business Tools\nBill Payments\nStreaming\nMobile Data\nTime Recharge\nInsurance',
      help: 'One per line.' },
    { type: 'text', key: 'kicker', label: 'Card kicker', group: 'Content', default: 'Service', maxLength: 20 },
    { type: 'text', key: 'title',  label: 'Dashboard title', group: 'Content', default: 'Super App Dashboard', maxLength: 36 },
    { type: 'text', key: 'tiles',  label: 'Dashboard tiles', group: 'Content', multiline: true, maxLength: 240,
      default: 'Quick Actions|Recharge, Pay, Stream\nInsights|Usage and Billing\nBusiness Tools|Reports, Revenue, Teams\nRewards|Points and Offers',
      help: 'One per line: title | subtitle.' },

    { type: 'color',  key: 'bg',     label: 'Background', group: 'Style', default: '#0B0B0D' },
    { type: 'color',  key: 'card',   label: 'Cards',      group: 'Style', default: '#1A190F' },
    { type: 'color',  key: 'accent', label: 'Accent',     group: 'Style', default: '#F59E0B' },
    { type: 'color',  key: 'ink',    label: 'Text',       group: 'Style', default: '#F4F1E8' },
    { type: 'color',  key: 'dim',    label: 'Secondary',  group: 'Style', default: '#8F8B80' },
    { type: 'font',   key: 'font',   label: 'Font',       group: 'Style', default: 'inter' },
    { type: 'number', key: 'size',   label: 'Card size',  group: 'Style', default: 34, min: 8, max: 70, step: 1, unit: 'px' },
    { type: 'number', key: 'radius', label: 'Corner',     group: 'Style', default: 12, min: 0, max: 40, step: 2, unit: 'px' },
    { type: 'boolean', key: 'fill',  label: 'Paint the background', group: 'Style', default: true },

    { type: 'number', key: 'streamMs', label: 'Cards stream until', group: 'Motion', default: 2600, min: 300, max: 8000, step: 50, unit: 'ms' },
    { type: 'number', key: 'speed',    label: 'Stream speed', group: 'Motion', default: 480, min: 60, max: 2000, step: 20, unit: 'px/s' },
    { type: 'number', key: 'panelAt',  label: 'Dashboard at', group: 'Motion', default: 4400, min: 0, max: 8000, step: 50, unit: 'ms',
      help: 'Set this BEFORE the stream ends — the overlap is what stops it reading as two clips.' },
    { type: 'number', key: 'tileGap',  label: 'Tile stagger', group: 'Motion', default: 180, min: 0, max: 800, step: 10, unit: 'ms' },
  ],

  // Device language — no slams. The stream is already mid-flow at the window's start, so it opens
  // on a light pass; the dashboard assembling is the one real event; one dry transient as the
  // first tile seats. Cut to panelAt + the 260ms tile lead the motion uses.
  sfx: (p) => [
    { atMs: 0, id: 'swish', gain: 0.4 },
    { atMs: p.panelAt, id: 'pop', gain: 0.7 },
    { atMs: p.panelAt + 260, id: 'snap', gain: 0.4 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const ff = fontStack(p.font);
    const cards = p.cards.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, MAX_CARDS);
    const tiles = p.tiles.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_TILES)
      .map((l) => { const [t = '', s = ''] = l.split('|').map((x) => x.trim()); return { t, s }; });

    const panelSpring = (ms: number) => spring({
      frame: fr(ms - p.panelAt), fps: FPS,
      config: { damping: 24, mass: 0.85, stiffness: 145 },
      durationInFrames: Math.max(1, Math.round(fr(700))),
    });
    const panel = panelSpring(timeMs);
    const lanePitch = width * 1.5;

    // The cards TRAVEL — they never come to rest — so their smear is honest and constant, taken
    // straight from the lane speed rather than sampled (a sampled velocity would spike on the
    // modulo wrap). It is self-limiting: a slow stream stays sharp, a fast one streaks.
    const streamSm = smear(Math.abs(p.speed) / 1000, 0, 1);

    // The dashboard is the DEVICE: it swings in through space, then rests near-still — a screen
    // that wobbles reads as a sticker, not a UI. 0.7° is alive without being a card.
    const panelPose = depthPose(timeMs, seed, { enter: panel, rx: -10, ry: 8, z: -120, swayDeg: 0.7, periodMs: 5000 });
    const panelYAt = (ms: number) => (1 - panelSpring(ms)) * height * 0.03;
    const panelSm = smear(0, -vel(panelYAt, timeMs), 1.3);

    return (
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          background: p.fill ? p.bg : 'transparent',
          fontFamily: ff,
          ...el('scene'),
        }}
      >
        <div style={{ position: 'absolute', inset: 0, ...el('stream') }}>
          {cards.map((c, i) => {
            // Discrete lanes, not a scatter — the reference streams cards along parallel rows and
            // random y just reads as confetti.
            const laneCount = Math.max(2, Math.min(5, Math.ceil(cards.length / 2)));
            const laneIdx = i % laneCount;
            const lane = (laneIdx + 0.5) / laneCount;
            // The stream runs steady (the reference is already mid-flow at the window's start, so
            // it must be full-width early) but each card RETIRES on its own beat. Retiring them
            // together leaves a full stream and then nothing; retiring them one at a time is what
            // thins the flow down to the single travelling card the reference ends on.
            const exitAt = p.streamMs + i * 220;
            const gone = interpolate(timeMs, [exitAt, exitAt + 320], [1, 0], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            });
            if (gone <= 0.001) return null;
            const perLane = Math.ceil(cards.length / laneCount);
            const slot = Math.floor(i / laneCount);
            const offset = (laneIdx * lanePitch) / laneCount + (slot * lanePitch) / perLane;
            // Modulo travel — seamless and identical on any scrub.
            const x = width * 1.1 - (((timeMs / 1000) * p.speed + offset) % lanePitch);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: x, top: `${(10 + lane * 74).toFixed(2)}%`,
                  background: `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.28) 100%), ${p.card}`,
                  border: '1px solid rgba(255,255,255,0.11)',
                  borderRadius: p.radius,
                  padding: `${p.size * 0.5}px ${p.size * 0.8}px`,
                  boxShadow: `0 ${p.size * 0.2}px ${p.size * 0.5}px ${rgba('#000000', 0.35)}, 0 ${p.size * 0.6}px ${p.size * 1.4}px ${rgba('#000000', 0.3)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
                  whiteSpace: 'nowrap', opacity: gone,
                  // Z-STAGGER: every card hangs at its OWN angle on its OWN period, so the lanes
                  // read as objects tumbling through space rather than divs sliding on rails —
                  // and the travel smear stretches each one along the direction it is moving.
                  filter: streamSm.blurPx > 0.3 ? `blur(${streamSm.blurPx.toFixed(2)}px)` : undefined,
                  transform: `${sway3d(timeMs, `${seed}-sc${i}`, 3.2, 4200 + i * 260)} scale(${streamSm.sx.toFixed(4)}, ${streamSm.sy.toFixed(4)})`,
                }}
              >
                <div style={{ fontSize: p.size * 0.42, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: p.dim }}>{p.kicker}</div>
                <div style={{ fontSize: p.size, fontWeight: 700, color: p.ink }}>{c}</div>
                <div style={{ height: 3, width: '70%', background: p.accent, marginTop: p.size * 0.3, borderRadius: 99, boxShadow: `0 0 8px ${rgba(p.accent, 0.45)}` }} />
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: 'absolute', left: '27%', right: '27%', top: '50%',
            background: `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.3) 100%), ${p.card}`,
            border: '1px solid rgba(255,255,255,0.13)',
            borderRadius: p.radius * 1.4,
            padding: p.size * 1.1, boxSizing: 'border-box',
            boxShadow: `0 ${width * 0.025}px ${width * 0.07}px ${rgba('#000000', 0.5)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
            display: 'flex', flexDirection: 'column', gap: p.size * 0.7,
            opacity: clamp01(panel * 2),
            filter: panelSm.blurPx > 0.3 ? `blur(${panelSm.blurPx.toFixed(2)}px)` : undefined,
            transform: `${panelPose} translateY(-50%) translateY(${panelYAt(timeMs).toFixed(2)}px) scale(${(interpolate(panel, [0, 1], [0.94, 1]) * panelSm.sx).toFixed(4)}, ${(interpolate(panel, [0, 1], [0.94, 1]) * panelSm.sy).toFixed(4)})`,
            ...el('panel'),
          }}
        >
          <div style={{ fontSize: p.size * 0.86, fontWeight: 700, color: p.ink }}>{p.title}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: p.size * 0.5 }}>
            {tiles.map((tile, i) => {
              const s = spring({
                frame: fr(timeMs - p.panelAt - 260 - i * p.tileGap), fps: FPS,
                config: { damping: 24, mass: 0.6, stiffness: 185 },
                durationInFrames: Math.max(1, Math.round(fr(420))),
              });
              // Screen CONTENT, not the screen: the tiles seat one at a time off alternating
              // hinges and then parallax at 0.2 over the panel's near-still rest — enough life
              // that the dashboard is never a frozen screenshot, never enough to wobble the UI.
              const parTile = parallax(timeMs, seed, 0.2, p.size * 0.16, 5000);
              return (
                <div
                  key={i}
                  style={{
                    background: rgba(p.accent, 0.08), borderRadius: p.radius,
                    border: `1px solid ${rgba(p.accent, 0.18)}`,
                    padding: p.size * 0.5, boxSizing: 'border-box',
                    opacity: clamp01(s * 2),
                    transform: `${swingIn(s, { rx: -12, ry: i % 2 === 0 ? 14 : -14, z: -55 })} translate(${parTile.x.toFixed(2)}px, ${(parTile.y + (1 - s) * height * 0.012).toFixed(2)}px)`,
                    transformOrigin: i % 2 === 0 ? 'left center' : 'right center',
                    ...el(`tile${i + 1}`),
                  }}
                >
                  <div style={{ fontSize: p.size * 0.58, fontWeight: 700, color: p.ink }}>{tile.t}</div>
                  <div style={{ fontSize: p.size * 0.44, color: p.dim, marginTop: p.size * 0.12 }}>{tile.s}</div>
                </div>
              );
            })}
          </div>
        </div>

        {p.fill && <div style={luxeVignette(0.4)} />}
        {p.fill && <div style={luxeGrain(0.045)} />}
      </div>
    );
  },
});
