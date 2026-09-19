// Bespoke graphics render layer — the SAME component draws the director's hand-made
// cards in the live preview (source clock) and both export compositions (output
// clock), so a card can never look different across surfaces.
//
// DESIGN SPACE: every card is authored against a 360-wide frame (height follows the
// video's aspect). The layer renders that space and uniformly scales it to the real
// frame — preview canvas or export resolution — so a 32px headline is the SAME
// proportion everywhere. Without this, the preview rendered cards at ~270px canvas
// pixels while exports rendered at 1080+ (the same HTML at wildly different sizes).

import { bespokePose, type BespokeGraphic } from '@/lib/bespokeGraphics';

const DESIGN_W = 360;

// NOTE ON COMBINING data-fx WITH data-live: the idle rules are scoped
// :not([data-fx]) because they are declared later at equal specificity and would
// otherwise win `animation-name` outright — an element carrying both silently lost
// its ENTRANCE and simply idled. To have both, nest them: an outer element with
// data-live wrapping an inner element with data-fx.
//
// The per-element animation vocabulary (data-fx + inline --d stagger). Every animation
// is PAUSED and seeked via a negative animation-delay computed from the card clock
// (--bt, set per frame on the card wrapper) — the state at any tMs is a pure function
// of time, so the live preview and both export compositions render identical frames.
// Motion grammar, not just keyframes: opacity resolves EARLY while transforms keep
// settling (decoupled fade), entrances overshoot their target and come back (spring
// settle), slides carry skew + directional blur (motion-blur read), exits get an
// anticipation frame then ACCELERATE away (an ease-out exit is the #1 amateur tell).
const FX_IN = ['rise', 'swing', 'slam', 'pop', 'blur', 'slide-l', 'slide-r', 'wipe', 'reveal', 'flicker', 'type'] as const;
const FX_OUT = ['whip-l', 'whip-r', 'blur-out', 'shrink', 'up-out'] as const;
const EXPO_OUT = 'cubic-bezier(0.19, 1, 0.22, 1)';
const POWER = 'cubic-bezier(0.83, 0, 0.17, 1)';
const EXIT_CURVE = 'cubic-bezier(0.5, 0, 0.75, 0.2)';
const IN_CURVE: Record<string, string> = { wipe: POWER, reveal: POWER, flicker: 'step-end', type: 'linear' };
const inDur = (fin: string) => (fin === 'flicker' ? '420ms' : fin === 'reveal' ? '460ms' : '620ms');
// Exported for the motion audit tooling — never import this into app code.
export const FX_CSS = `
@keyframes bgfx-rise { 0% { opacity: 0; transform: translateY(30px) scale(0.985); } 46% { opacity: 1; } 100% { opacity: 1; transform: none; } }
@keyframes bgfx-swing { 0% { opacity: 0; transform: translateY(0.8em) rotate(7deg) scale(0.9); } 38% { opacity: 1; } 64% { transform: translateY(-2px) rotate(-1.8deg); } 100% { opacity: 1; transform: none; } }
@keyframes bgfx-slam { 0% { opacity: 0; transform: scale(2.1); filter: blur(12px); } 38% { opacity: 1; transform: scale(0.955); filter: blur(0); } 56% { transform: scale(1.028) rotate(-0.5deg); } 74% { transform: scale(0.994) rotate(0.25deg); } 100% { opacity: 1; transform: scale(1) rotate(0deg); filter: blur(0); } }
@keyframes bgfx-pop { 0% { opacity: 0; transform: scale(0.25); filter: blur(6px); } 48% { opacity: 1; transform: scale(1.12); filter: blur(0); } 72% { transform: scale(0.982); } 100% { opacity: 1; transform: scale(1); filter: blur(0); } }
@keyframes bgfx-blur { 0% { opacity: 0; filter: blur(16px); transform: scale(1.05); } 55% { opacity: 1; } 100% { opacity: 1; filter: blur(0); transform: scale(1); } }
@keyframes bgfx-slide-l { 0% { opacity: 0; transform: translateX(-54px) skewX(5deg); filter: blur(4px); } 42% { opacity: 1; filter: blur(0); } 68% { transform: translateX(3px) skewX(-1.2deg); } 100% { opacity: 1; transform: none; filter: blur(0); } }
@keyframes bgfx-slide-r { 0% { opacity: 0; transform: translateX(54px) skewX(-5deg); filter: blur(4px); } 42% { opacity: 1; filter: blur(0); } 68% { transform: translateX(-3px) skewX(1.2deg); } 100% { opacity: 1; transform: none; filter: blur(0); } }
@keyframes bgfx-wipe { 0% { clip-path: inset(0 100% 0 0); transform: translateX(12px); } 100% { clip-path: inset(0 0 0 0); transform: none; } }
@keyframes bgfx-reveal { 0% { clip-path: inset(100% 0 0 0); transform: translateY(18px); } 100% { clip-path: inset(0 0 0 0); transform: none; } }
@keyframes bgfx-flicker { 0%, 19%, 41%, 60% { opacity: 0; } 20%, 40%, 61%, 100% { opacity: 1; } }
@keyframes bgfx-type { 0% { opacity: 0; } 1%, 100% { opacity: 1; } }
@keyframes bgfx-out-whip-l { 0% { opacity: 1; transform: none; filter: blur(0); } 22% { transform: translateX(12px) scale(1.03); } 100% { opacity: 0; transform: translateX(-92px) skewX(-6deg); filter: blur(8px); } }
@keyframes bgfx-out-whip-r { 0% { opacity: 1; transform: none; filter: blur(0); } 22% { transform: translateX(-12px) scale(1.03); } 100% { opacity: 0; transform: translateX(92px) skewX(6deg); filter: blur(8px); } }
@keyframes bgfx-out-blur-out { 0% { opacity: 1; filter: blur(0); transform: scale(1); } 100% { opacity: 0; filter: blur(14px); transform: scale(1.07); } }
@keyframes bgfx-out-shrink { 0% { opacity: 1; transform: scale(1); filter: blur(0); } 100% { opacity: 0; transform: scale(0.5) rotate(3deg); filter: blur(3px); } }
@keyframes bgfx-out-up-out { 0% { opacity: 1; transform: none; filter: blur(0); } 20% { transform: translateY(6px) scale(1.015); } 100% { opacity: 0; transform: translateY(-54px); filter: blur(5px); } }
@keyframes bgfx-mv-aside-up { to { transform: translateY(-58%) scale(0.55); } }
@keyframes bgfx-mv-aside-l { to { transform: translateX(-34%) scale(0.62); } }
@keyframes bgfx-mv-aside-r { to { transform: translateX(34%) scale(0.62); } }
@keyframes bgfx-mv-settle { to { transform: scale(0.85); opacity: 0.5; } }
@keyframes bgfx-mv-grow { to { transform: scale(1.16); } }
@keyframes bgfx-live-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -6px; } }
@keyframes bgfx-live-pulse { 0%, 100% { scale: 1; } 50% { scale: 1.035; } }
@keyframes bgfx-live-track { from { letter-spacing: 0.01em; } to { letter-spacing: 0.06em; } }
@keyframes bgfx-live-drift { from { scale: 1; } to { scale: 1.07; } }
@keyframes bgfx-live-boil { 0%, 100% { rotate: -0.7deg; translate: 0.4px -0.3px; } 33% { rotate: 0.5deg; translate: -0.4px 0.3px; } 66% { rotate: -0.2deg; translate: 0.2px 0.4px; } }
.bgfx [data-fx] { animation-duration: calc(620ms + var(--j, 0ms)); animation-fill-mode: both; animation-play-state: paused !important; animation-delay: calc(var(--d, 0ms) - var(--bt, 0ms)); animation-timing-function: ${EXPO_OUT}; }
${FX_IN.map((fin) =>
  `.bgfx [data-fx="${fin}"] { animation-name: bgfx-${fin};${inDur(fin) !== '620ms' ? ` animation-duration: calc(${inDur(fin)} + var(--j, 0ms));` : ''}${IN_CURVE[fin] ? ` animation-timing-function: ${IN_CURVE[fin]};` : ''} }`,
).join('\n')}
.bgfx [data-fx="swing"] { transform-origin: 12% 90%; }
${FX_IN.flatMap((fin) =>
  FX_OUT.map((fout) =>
    `.bgfx [data-fx="${fin}"][data-out="${fout}"] { animation-name: bgfx-${fin}, bgfx-out-${fout}; animation-duration: calc(${inDur(fin)} + var(--j, 0ms)), 340ms; animation-fill-mode: both, forwards; animation-timing-function: ${IN_CURVE[fin] ?? EXPO_OUT}, ${EXIT_CURVE}; animation-delay: calc(var(--d, 0ms) - var(--bt, 0ms)), calc(var(--d, 0ms) + var(--hd, 999999ms) - var(--bt, 0ms)); }`,
  )).join('\n')}
.bgfx [data-move] { animation-duration: 560ms; animation-fill-mode: forwards; animation-play-state: paused !important; animation-delay: calc(var(--md, 999999ms) - var(--bt, 0ms)); animation-timing-function: ${EXPO_OUT}; }
${['aside-up', 'aside-l', 'aside-r', 'settle', 'grow'].map((mv) =>
  `.bgfx [data-move="${mv}"] { animation-name: bgfx-mv-${mv}; }`).join('\n')}
.bgfx [data-live]:not([data-fx]) { animation-name: bgfx-live-float; animation-duration: 2600ms; animation-iteration-count: infinite; animation-timing-function: ease-in-out; animation-play-state: paused !important; animation-delay: calc(0ms - var(--bt, 0ms)); }
.bgfx [data-live="pulse"]:not([data-fx]) { animation-name: bgfx-live-pulse; }
.bgfx [data-live="track"]:not([data-fx]) { animation-name: bgfx-live-track; animation-duration: 2800ms; animation-iteration-count: 1; animation-fill-mode: forwards; }
.bgfx [data-live="drift"]:not([data-fx]) { animation-name: bgfx-live-drift; animation-duration: 7000ms; animation-iteration-count: 1; animation-timing-function: linear; animation-fill-mode: forwards; }
.bgfx [data-live="boil"]:not([data-fx]) { animation-name: bgfx-live-boil; animation-duration: 400ms; animation-timing-function: step-end; }
`;

/** Impact kicks: element staggers (--d) kick the whole card 2.8% for 150ms — slams
 *  land WITH weight, automatically synced to the entrances. Staggers within 200ms
 *  cluster into ONE kick (a per-letter cascade is one impact, not a machine gun). */
function kickScale(html: string, btMs: number): number {
  const ds = [...html.matchAll(/--d:\s*(\d+)\s*ms/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
  let k = 1;
  for (let i = 0; i < ds.length; i++) {
    // One impact per cascade RUN: a typed line (70ms/char) or letter cascade is one
    // gesture — kick only where a run starts (gap from the previous stagger > 260ms).
    if (i > 0 && ds[i] - ds[i - 1] < 260) continue;
    const rel = btMs - ds[i];
    if (rel >= 0 && rel < 150) k += 0.028 * (1 - rel / 150);
  }
  return Math.min(k, 1.06);
}

export function BespokeGraphicsLayer({
  graphics,
  currentTimeMs,
  frameWidthPx,
  frameHeightPx,
}: {
  graphics: readonly BespokeGraphic[];
  currentTimeMs: number;
  /** Real frame size this layer covers (preview canvas px or export px). */
  frameWidthPx: number;
  frameHeightPx: number;
}) {
  if (!graphics.length || !frameWidthPx || !frameHeightPx) return null;
  const scale = frameWidthPx / DESIGN_W;
  const designH = frameHeightPx / scale;
  return (
    <div className="bgfx" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <style>{FX_CSS}</style>
      <div
        style={{
          position: 'absolute', top: 0, left: 0,
          width: DESIGN_W, height: designH,
          transform: `scale(${scale})`, transformOrigin: 'top left',
        }}
      >
        {graphics.map((g) => {
          const pose = bespokePose(g.atMs, g.durMs, currentTimeMs);
          if (!pose.visible) return null;
          // Layout geometry: everything except 'full' leaves the SPEAKER on screen —
          // a graphic takes a band, a corner or a column, the footage keeps playing in
          // the rest of the frame (the split-screen/inset language of real edits).
          const LAYOUT_BOX: Record<string, React.CSSProperties> = {
            'split-top': { top: 0, left: 0, right: 0, height: '42%' },
            'split-bottom': { bottom: 0, left: 0, right: 0, height: '42%' },
            'side-l': { top: 0, bottom: 0, left: 0, width: '50%' },
            'side-r': { top: 0, bottom: 0, right: 0, width: '50%' },
            'inset-tl': { top: '5%', left: '5%', width: '42%', height: '26%' },
            'inset-tr': { top: '5%', right: '5%', width: '42%', height: '26%' },
            'inset-bl': { bottom: '16%', left: '5%', width: '42%', height: '26%' },
            'inset-br': { bottom: '16%', right: '5%', width: '42%', height: '26%' },
            banner: { left: 0, right: 0, top: '14%', height: '18%' },
          };
          const lay = g.layout && LAYOUT_BOX[g.layout] ? g.layout : null;
          // Content is authored in a 360-wide design space (= full frame). A narrow box
          // (inset/side column) must SCALE that space down or a full-frame-sized lockup
          // overflows and clips — which is exactly what the first inset render did.
          const boxW = lay === 'inset-tl' || lay === 'inset-tr' || lay === 'inset-bl' || lay === 'inset-br' ? 0.42
            : lay === 'side-l' || lay === 'side-r' ? 0.5 : 1;
          const boxH = lay?.startsWith('inset') ? 0.26 : lay === 'banner' ? 0.18
            : lay === 'split-top' || lay === 'split-bottom' ? 0.42 : 1;
          const boxStyle: React.CSSProperties = lay
            ? { position: 'absolute', ...LAYOUT_BOX[lay], display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }
            : g.fullscreen
            ? { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }
            : {
                position: 'absolute',
                top: `${g.box.yPercent}%`,
                left: `${g.box.xPercent}%`,
                width: `${g.box.widthPercent}%`,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                justifyContent: 'center',
              };
          // The card clock (--bt): ms since this card appeared — the per-element data-fx
          // animations seek against it (paused + negative delay = pure(time) state).
          const bt = Math.max(0, Math.round(currentTimeMs - g.atMs));
          const kick = kickScale(g.html, bt);
          return (
            <div key={g.id} style={boxStyle}>
              <div
                style={{
                  width: boxW < 1 ? `${100 / boxW}%` : '100%',
                  height: (g.fullscreen || lay) ? (boxH < 1 && boxW < 1 ? `${100 / boxH}%` : '100%') : undefined,
                  ...(boxW < 1 ? { transform: `scale(${boxW})`, transformOrigin: 'top left' } : {}),
                  opacity: pose.opacity,
                  transform: [
                    pose.dyPct !== 0 ? `translateY(${pose.dyPct.toFixed(2)}%)` : null,
                    kick * pose.scale !== 1 ? `scale(${(kick * pose.scale).toFixed(4)})` : null,
                  ].filter(Boolean).join(' ') || undefined,
                  ['--bt' as never]: `${bt}ms`,
                }}
                // Sanitized upstream (sanitizeBespokeHtml) — layout/type/color markup only.
                dangerouslySetInnerHTML={{ __html: g.html }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
