// The agent-story scene (their property "Agent Story", our Gable): one caption is one MOMENT —
// a headline huge behind the head in difference blend, an amount row pushed clear of the face,
// support words slotting in white above and around, sometimes an icon or a focus. Read from the
// public scenes chunk their site ships and re-implemented on our planner (plan.ts), geometry
// (geometry.ts) and motion (motion.ts). Times are SECONDS; px are the frame's, with their 1080-wide
// constants scaled by width / 1080.
import React from 'react';
import type { FaceBand } from '@/lib/looks/property/geometry';
import { clearFaceY, fitPropertyHeadline, propertyHeadlineWidth, propertyLeadAtTime, rearCaptionGeometry } from '@/lib/looks/property/geometry';
import {
  cinematicJitter, cinematicMotion, clamp01, phraseSlotFrames, smooth, storyHeadlineLeadAtTime, storyHeadlineWordMotion, storyMotion,
  storyReplacementBeats, storySlideFrames, supportingWordMotion, type SupportKind,
} from '@/lib/looks/property/motion';
import {
  phraseChoreography, phraseRoles, planAgentStory, readableAnchorGroups, readableGroups, type AgentStoryPlan, type StoryIcon, type StoryWord,
} from '@/lib/looks/property/plan';

// ── the icons: drawn on from the top over their progress ──────────────────────────────────
const ICON_PATHS: Record<StoryIcon, React.ReactNode> = {
  phone: <><rect x="20" y="8" width="66" height="96" rx="8" /><path d="M44 16h18M44 95h18M34 32h25M34 44h19" /><path d="m52 48 8 31h40l10-29H52M64 87h31" /><circle cx="66" cy="99" r="4" /><circle cx="95" cy="99" r="4" /></>,
  door: <><path d="M41 110V12h59v98M53 24h35M83 63h6" /><circle cx="27" cy="45" r="11" /><path d="M13 111V64h27l20-19 8 8-24 28H35v30M22 83v28M67 36l4-8M75 42l9-3" /></>,
  degree: <path d="m7 43 52-24 54 24-54 24L7 43ZM28 53v31q32 24 64 0V53M111 44v36" />,
  repair: <path d="M88 11c-16-3-31 9-29 27l-43 43a11 11 0 0 0 16 16l44-43c19 4 33-11 29-29L87 42 73 28l15-17ZM19 17l15-6 29 40M22 17l-8 14 32 29" />,
  money: <><ellipse cx="56" cy="27" rx="39" ry="14" /><path d="M17 27v49c0 18 78 18 78 0V27M17 43c0 18 78 18 78 0M17 60c0 18 78 18 78 0M33 82v17c0 16 76 16 76 0V55M101 70h8M98 87h11" /></>,
  calendar: <><rect x="14" y="21" width="92" height="86" rx="7" /><path d="M14 45h92M37 11v22M83 11v22M31 62h10M54 62h10M78 62h10M31 80h10M54 80h10M78 80h10M31 95h10M54 95h10" /></>,
};

export function StoryIconArt({ kind, progress }: { kind: StoryIcon; progress: number }) {
  const d = clamp01(progress);
  return (
    <svg aria-hidden viewBox="0 0 120 120" width="100%" height="100%" style={{ overflow: 'visible' }}>
      <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: d, clipPath: `inset(${(1 - d) * 100}% 0 0 0)` }}>
        {ICON_PATHS[kind]}
      </g>
    </svg>
  );
}

// ── a word that slides inside a clip that hides nothing of its neighbours ─────────────────
export function CaptionSlideWord({ children, style, ...rest }: React.HTMLAttributes<HTMLSpanElement> & { style?: React.CSSProperties }) {
  const { transform, opacity, clipPath, ...outer } = style ?? {};
  return (
    <span {...rest} style={{ ...outer, clipPath: 'inset(-2em -0.06em -2em -0.06em)', verticalAlign: 'baseline' }}>
      <span style={{ display: 'inline-block', transform, opacity, clipPath }}>{children}</span>
    </span>
  );
}

// ── the words around a headline: a lead above its left, a tail below its right ────────────
export interface SatellitesProps<W extends StoryWord> {
  lead: W[]; tail?: W[]; t: number; end: number; x: number; y: number; heroWidth: number; heroSize: number;
  width: number; height: number; font: string; color?: string; italic?: boolean;
  supportDirections?: { lead?: 'right' | 'left' | 'up' | 'down'; tail?: 'right' | 'left' | 'up' | 'down' };
  rotation?: number; leadAlign?: 'left' | 'right'; sizeScale?: number; aboveOnly?: boolean;
}

export function CinematicSatellites<W extends StoryWord>({
  lead, tail = [], t, end, x, y, heroWidth, heroSize, width, height, font, color = '#fff', italic = false,
  supportDirections, rotation = 0, leadAlign = 'left', sizeScale = 1, aboveOnly = false,
}: SatellitesProps<W>) {
  const z = width / 1080;
  const face = { family: font, weight: italic ? 700 : 400, italic, letterSpacingEm: -0.035 };
  const cap = 66 * z * sizeScale;
  const side = (ws: W[], role: 'lead' | 'tail') => {
    if (!ws.length) return null;
    const size = fitPropertyHeadline(ws, face, cap, 0.55 * width);
    const w = propertyHeadlineWidth(ws, face, size);
    const left = role === 'lead' && leadAlign === 'left' ? Math.max(0.055 * width - x, -(0.48 * heroWidth)) : Math.min(0.945 * width - x - w, 0.52 * heroWidth - w);
    return (
      <div data-headline-satellite={role} style={{
        position: 'absolute', left, top: role === 'lead' ? Math.max(0.025 * height - y, -(0.48 * heroSize) - 0.28 * size) : 0.27 * heroSize,
        fontSize: size, fontWeight: face.weight, fontStyle: italic ? 'italic' : 'normal',
      }}>
        {ws.map((w, i) => {
          const m = supportingWordMotion(w, t, end, 'slide', role, { direction: supportDirections?.[role] });
          return <CaptionSlideWord key={w.id} data-caption-word-id={w.id} style={{ display: 'inline-block', marginLeft: i ? '.17em' : 0, opacity: m.opacity, transform: `translate(${m.x}em,${m.y}em)` }}>{w.text}</CaptionSlideWord>;
        })}
      </div>
    );
  };
  return (
    <div data-cinematic-satellites="" style={{
      position: 'absolute', left: x, top: y, transform: rotation ? `rotate(${rotation}deg)` : undefined, color, fontFamily: font,
      lineHeight: 0.96, letterSpacing: '-.035em', whiteSpace: 'nowrap', textShadow: `0 ${z}px ${2 * z}px #0009`, opacity: Math.min(1, Math.max(0, (end - t) / 0.18)),
    }}>
      {side(aboveOnly ? [...lead, ...tail].sort((a, b) => a.start - b.start) : lead, 'lead')}
      {!aboveOnly && side(tail, 'tail')}
    </div>
  );
}

// ── the support phrase (their CinematicPhrase, as the agent scene uses it) ────────────────
export interface CinematicPhraseProps<W extends StoryWord> {
  words: W[]; roles?: AgentStoryPlan<W>; t: number; end: number; width: number; height: number; x: number; y: number;
  font: string; secondary: string; accent: string; color: string; size: number; faceBand?: FaceBand | null;
  supportDirections?: { lead?: 'right' | 'left' | 'up' | 'down'; tail?: 'right' | 'left' | 'up' | 'down' };
  tailDirections?: ('right' | 'left' | 'up' | 'down')[]; slotSizeRatio?: number; slotRightRatio?: number; autoAnchor?: boolean;
  anchorItalic?: boolean; preserveReplacementGroups?: boolean;
}

export function CinematicPhrase<W extends StoryWord>({
  words, roles, t, end, width, height, x, y, font, secondary, accent, color, size, faceBand, supportDirections, tailDirections,
  slotSizeRatio = 0.64, slotRightRatio, autoAnchor = true, anchorItalic = true, preserveReplacementGroups = false,
}: CinematicPhraseProps<W>) {
  const { anchor, lead, groups } = phraseRoles(words, roles, autoAnchor);
  const z = width / 1080;
  const list = preserveReplacementGroups && roles?.replacementGroups?.length ? groups : anchor.length ? readableAnchorGroups(groups, end) : readableGroups(groups, end);
  const replacing = list.length > 1;
  const choreo = phraseChoreography(words, roles?.entrance);
  const support: SupportKind = 'slide';
  const slots = phraseSlotFrames(list, t, end);
  const at = list.findIndex((g, i) => t >= g[0].start && t < (list[i + 1]?.[0]?.start ?? end));
  const current = list[at] ?? [];
  const leadNow = propertyLeadAtTime(lead, t);
  const leadSize = fitPropertyHeadline(leadNow, { family: secondary, weight: 400, italic: false, letterSpacingEm: -0.035 }, 0.43 * size, 0.48 * width);
  const anchorFace = { family: font, weight: 900, italic: anchorItalic, letterSpacingEm: -0.04 };
  const heroSize = Math.min(...(anchor.length ? [anchor] : list.length ? list : [[]]).map((g) => fitPropertyHeadline(g, anchorFace, size, 0.7 * width)));
  const slotSize = Math.min(size * slotSizeRatio, ...list.map((g) => fitPropertyHeadline(g, { family: font, weight: 700, italic: false, letterSpacingEm: -0.035 }, size * slotSizeRatio, 0.43 * width)));
  const anchorNatural = anchor.length ? fitPropertyHeadline(anchor, anchorFace, 1000, 1000) : 1000;
  const anchorWidth = anchor.length ? (1000 * heroSize) / anchorNatural : 0;
  const slotRight = slotRightRatio === undefined ? 0.56 * anchorWidth : Math.min(anchorWidth * slotRightRatio, Math.max(0, 0.945 * width - x));
  const draw = (ws: W[], weight: number, italic = false, role: 'anchor' | 'lead' | 'tail' = 'tail', until = end, hidden = false) => ws.map((w, i) => {
    const hero = cinematicMotion(t - w.start, Math.min(0.54, Math.max(0.08, (end - w.start) * 0.4)), choreo.hero);
    const m = supportingWordMotion(w, t, until, support, role === 'lead' ? 'lead' : 'tail',
      { direction: role === 'tail' && tailDirections?.length ? tailDirections[Math.min(i, tailDirections.length - 1)] : supportDirections?.[role === 'lead' ? 'lead' : 'tail'] });
    const style: React.CSSProperties = {
      display: 'inline-block', marginLeft: i ? '.17em' : 0, fontWeight: weight, fontStyle: italic ? 'italic' : 'normal',
      opacity: role === 'anchor' ? hero.opacity : m.opacity, clipPath: role === 'anchor' ? undefined : m.clipPath,
      transform: `translate(${role === 'anchor' ? 0 : m.x}em,${role === 'anchor' ? `${hero.y * z * 0.45}px` : `${m.y}em`})`,
    };
    return role === 'anchor'
      ? <span key={w.id} data-caption-word-id={hidden ? undefined : w.id} style={style}>{w.text}</span>
      : <CaptionSlideWord key={w.id} data-caption-word-id={hidden ? undefined : w.id} style={style}>{w.text}</CaptionSlideWord>;
  });
  const shift = (f: { yEm: number }) => {
    const d = supportDirections?.tail;
    return d ? (d === 'right' || d === 'left' ? `translateX(${f.yEm * (d === 'right' ? 1 : -1)}em)` : `translateY(${f.yEm * (d === 'down' ? 1 : -1)}em)`) : `translateY(${f.yEm}em)`;
  };
  if (!words.length || t < words[0].start || t >= end) return null;
  return (
    <div data-agent-story-support="" data-phrase-combination={`${choreo.hero}-slide`} data-cinematic-phrase="" data-reading-mode={replacing ? 'replace' : 'phrase-hold'}
      data-phrase-anchor={anchor.map((w) => w.text).join(' ')} style={{
        position: 'absolute', left: x,
        top: clearFaceY(y, anchor.length ? 0.85 * heroSize + 32 * z : 0.85 * heroSize + 66 * z, anchor.length ? 0.22 * heroSize + 1.2 * slotSize : 0.85 * heroSize, height, faceBand),
        fontFamily: font, color, whiteSpace: 'nowrap', lineHeight: 0.96, letterSpacing: '-.035em', textShadow: `0 ${z}px ${3 * z}px #000b`, opacity: Math.min(1, (end - t) / 0.14),
      }}>
      {anchor.length ? (
        <>
          <div data-phrase-role="anchor" style={{ position: 'absolute', left: 0, top: 0, fontSize: heroSize, color: accent, transform: 'translate(-50%,-50%)' }}>{draw(anchor, 900, anchorItalic, 'anchor')}</div>
          <div data-phrase-role="lead" style={{ position: 'absolute', left: -(0.5 * anchorWidth), top: -(0.48 * heroSize) - 0.28 * Math.min(leadSize, slotSize), fontSize: Math.min(leadSize, slotSize), fontFamily: secondary }}>{draw(leadNow, 400, false, 'lead')}</div>
          {slots.map((f) => (
            <div key={f.words[0].id} data-phrase-role="slot" data-phrase-slide={f.outgoing ? 'out' : 'in'} aria-hidden={f.outgoing || undefined}
              style={{ position: 'absolute', right: -slotRight, top: 0.27 * heroSize, fontSize: slotSize, opacity: f.opacity, transform: shift(f) }}>
              {draw(f.words, 700, false, 'tail', f.end, f.outgoing)}
            </div>
          ))}
        </>
      ) : current.length > 0 ? (
        <div data-phrase-role="mixed" style={{ position: 'absolute', transform: 'translate(-50%,-50%)', fontSize: heroSize }}>
          {current.length > 1 ? (
            <>
              <div style={{ fontFamily: secondary, fontSize: '.53em', marginLeft: '-.12em', marginBottom: '-.13em' }}>{draw(current.slice(0, 1), 400)}</div>
              <div style={{ marginLeft: '.17em' }}>{draw(current.slice(1), 800, true)}</div>
            </>
          ) : draw(current, 500)}
        </div>
      ) : null}
    </div>
  );
}

// ── the scene ───────────────────────────────────────────────────────────────────────────
export interface AgentStorySceneProps<W extends StoryWord> {
  words: W[];
  /** seconds */
  t: number;
  end: number;
  width: number;
  height: number;
  /** their caption config: base size (104 = their default), colours, faces, the box's x / y */
  caption: { fontSizePx?: number; emphasisColor?: string; color?: string; xPct?: number; positionYPct?: number; fontFamily: string; secondaryFamily: string };
  layer?: 'behind' | 'front';
  headYPct?: number;
  faceBand?: FaceBand | null;
  supportYPct?: number;
  plan?: AgentStoryPlan<W>;
}

export function AgentStoryScene<W extends StoryWord>({ words, t, end, width, height, caption, layer, headYPct, faceBand, supportYPct, plan: given }: AgentStorySceneProps<W>) {
  const plan = given ?? planAgentStory(words);
  const z = width / 1080;
  const C = (caption.fontSizePx ?? 104) / 104;
  const M = caption.emphasisColor || '#F1F66F';
  const front = !layer || layer === 'front';
  const behind = !layer || layer === 'behind';
  const sceneStart = words[0]?.start ?? 0;
  const tailT = clamp01((end - t) / 0.24);
  const P = tailT * tailT * (3 - 2 * tailT);
  const ax = ((caption.xPct ?? 0.5) - 0.5) * width;
  const ay = ((caption.positionYPct ?? 0.47) - 0.47) * height;
  const R = caption.fontFamily, H = caption.secondaryFamily;
  const replace = plan.headlineMode === 'replace';
  const beats = storyReplacementBeats(plan.headline, end);
  const slides = storySlideFrames(beats, t, end);
  const headText = plan.headline.map((w) => w.text).join(' ');
  const headFont = { family: R, weight: 900, italic: plan.italic, letterSpacingEm: -0.045 };
  const fitted = fitPropertyHeadline(plan.headline, headFont, Math.min(224, 960 / Math.max(1, 0.55 * headText.length)) * z * C, 0.88 * width);
  const headStart = plan.headline[0]?.start ?? sceneStart;
  const jitter = cinematicJitter(plan.accentMotion === 'jitter' ? t - headStart : -1);
  const headTop = Math.max(0.14, Math.min(0.36, headYPct ?? 0.27));
  const geo = rearCaptionGeometry(fitted, faceBand?.top ?? headTop, height);
  const q = geo.size, X = geo.y;
  const V = Math.max(0.4, Math.min(0.6, Math.max(headTop + 0.18, supportYPct ?? 0)));
  const K = Math.min(236, 940 / Math.max(1, plan.amount.reduce((s, w, i) => s + 0.58 * w.text.length * (i ? 0.48 : 1), 0))) * z * C;
  const Z = clearFaceY(V * height, 0.6 * K, 1.4 * K, height, faceBand);
  const Q = plan.amount.length ? Z / height : V;
  const hasHead = !!plan.headline[0];
  const pinned = new Set([...(plan.anchorIds ?? []), ...(plan.replacementGroups ?? []).flatMap((g) => g.wordIds)]);
  const leadNow = storyHeadlineLeadAtTime(plan.support.filter((w) => w.start < headStart && !pinned.has(w.id)), t, headStart);
  const after = plan.headline.length ? plan.support.filter((w) => w.start >= headStart || pinned.has(w.id)) : plan.support;
  const quiet = !phraseRoles(after, plan, false).anchor.length
    && (!!plan.icon || plan.focus || (!plan.headline.length && !plan.amount.length && (after[after.length - 1]?.end ?? sceneStart) - sceneStart >= 0.9));
  const headlineOnly = plan.headline.length > 0 && !plan.amount.length && !plan.icon && !plan.focus && !phraseRoles(after, plan, true).anchor.length;
  const iconWord = words.find((w) => /phone|call|door|degree|bachelor|repair|cost|timeline|closing/i.test(w.text));
  const iconStart = iconWord?.start ?? sceneStart;
  const iconMotion = storyMotion(t - iconStart, 0.48);
  const iconX = plan.icon === 'phone' ? 0.76 : plan.icon === 'door' ? 0.23 : 0.5;
  const iconY = plan.icon === 'phone' || plan.icon === 'door' ? 0.3 : plan.icon === 'degree' ? 0.225 : 0.27;
  const iconSize = (plan.icon === 'degree' ? 240 : 290) * z;
  const word = (w: W, style: React.CSSProperties = {}) => (
    <span key={w.id} data-caption-word-id={w.id} style={{ display: 'inline-block', ...style }}>{w.text}</span>
  );
  const amountMotion = storyMotion(t - (plan.amount[0]?.start ?? 0), 0.56);
  return (
    <div data-agent-story-scene={plan.focus ? 'focus' : plan.icon ? `icon-${plan.icon}` : plan.amount.length ? 'amount' : plan.headline.length ? 'headline' : 'spoken'}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFeatureSettings: '"kern"', fontVariantNumeric: 'lining-nums tabular-nums' }}>
      {front && plan.focus && (
        <>
          <div data-agent-story-focus-wash="" style={{
            position: 'absolute', inset: 0, backdropFilter: `blur(${8 * z}px)`, WebkitBackdropFilter: `blur(${8 * z}px)`,
            clipPath: 'polygon(evenodd,0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,34% 24%,34% 44%,66% 44%,66% 24%,34% 24%)', opacity: clamp01((t - sceneStart) / 0.2) * P,
          }} />
          <div data-agent-story-focus-brackets="" style={{
            position: 'absolute', left: 0.34 * width, top: 0.24 * height, width: 0.32 * width, height: 0.2 * height, opacity: clamp01((t - sceneStart) / 0.15) * P,
            background: 'linear-gradient(white,white) left top/24px 2px no-repeat,linear-gradient(white,white) left top/2px 24px no-repeat,linear-gradient(white,white) right top/24px 2px no-repeat,linear-gradient(white,white) right top/2px 24px no-repeat,linear-gradient(white,white) left bottom/24px 2px no-repeat,linear-gradient(white,white) left bottom/2px 24px no-repeat,linear-gradient(white,white) right bottom/24px 2px no-repeat,linear-gradient(white,white) right bottom/2px 24px no-repeat',
          }} />
        </>
      )}
      {behind && plan.icon && t >= iconStart && (
        <div aria-hidden data-agent-story-icon={plan.icon} style={{
          position: 'absolute', left: iconX * width + ax, top: iconY * height + ay, width: iconSize, height: iconSize, color: M, opacity: iconMotion.opacity * P,
          filter: `drop-shadow(0 0 ${7 * z}px ${M}) drop-shadow(0 0 ${18 * z}px ${M}99)`, transform: `translate(-50%,-50%) scale(${iconMotion.scale})`,
        }}><StoryIconArt kind={plan.icon} progress={(t - iconStart) / 0.48} /></div>
      )}
      {behind && hasHead && !replace && (
        <div data-agent-story-headline="" style={{
          position: 'absolute', left: 0.5 * width + ax, top: X + ay, width: 0.92 * width, textAlign: 'center', fontFamily: R, fontWeight: 900,
          fontStyle: plan.italic ? 'italic' : 'normal', fontSize: q, letterSpacing: '-0.045em', lineHeight: 1.02, color: M, mixBlendMode: 'difference', opacity: P,
          transform: `translate(-50%,-50%) translateX(${jitter.x * z}px) rotate(${jitter.rotation}deg)`,
        }}>
          {plan.headline.map((w, i) => {
            const m = storyHeadlineWordMotion(w, t, end, plan.entrance);
            return word(w, { opacity: m.opacity, transform: `translateY(${m.y * z}px) scale(${m.scale})`, marginLeft: i ? '.18em' : 0 });
          })}
        </div>
      )}
      {front && plan.amount.length > 0 && (
        <div data-agent-story-amount={plan.numberStyle} style={{
          position: 'absolute', left: 0.5 * width + ax, top: Z + ay, textAlign: 'center', whiteSpace: 'nowrap', fontFamily: R, fontWeight: 800, fontStyle: 'italic',
          fontSize: K, letterSpacing: '-.055em', lineHeight: 1, opacity: amountMotion.opacity * P,
          color: plan.numberStyle === 'outline' ? 'transparent' : M, WebkitTextFillColor: plan.numberStyle === 'outline' ? 'transparent' : M,
          WebkitTextStroke: plan.numberStyle === 'outline' ? `${5 * z}px ${M}` : undefined, mixBlendMode: plan.numberStyle === 'solid' ? 'difference' : undefined,
          transform: `translate(-50%,-50%) translateY(${amountMotion.y * z}px) scale(${amountMotion.scale})`,
        }}>
          {plan.amount.map((w, i) => {
            const m = supportingWordMotion(w, t, end, 'slide', 'tail', { direction: 'down', distanceEm: 0.6 });
            return word(w, { fontSize: i ? '.48em' : undefined, marginLeft: i ? '.08em' : 0, opacity: i ? m.opacity : t < w.start ? 0 : 1, transform: i ? `translateY(${m.y}em)` : undefined });
          })}
        </div>
      )}
      {front && hasHead && !replace && (
        <CinematicSatellites lead={leadNow} tail={headlineOnly ? after : []} t={t} end={end} x={0.5 * width + ax} y={X + ay}
          heroWidth={0.8 * propertyHeadlineWidth(plan.headline, headFont, q)} heroSize={q} width={width} height={height} font={H} color="#fff"
          supportDirections={{ lead: 'down', tail: 'down' }} />
      )}
      {behind && replace && (
        <div data-agent-story-headline="replace" style={{
          position: 'absolute', left: 0.5 * width + ax, top: X + ay, width: 0.94 * width, transform: 'translateX(-50%)', fontFamily: R, fontWeight: 900,
          fontStyle: plan.italic ? 'italic' : 'normal', color: M, mixBlendMode: 'difference', opacity: P,
        }}>
          {slides.map((f) => {
            const txt = f.words.map((w) => w.text).join(' ');
            const size = fitPropertyHeadline(f.words, headFont, Math.min(140, 950 / Math.max(1, 0.56 * txt.length)) * z * C, 0.86 * width);
            return (
              <div key={f.words[0].id} data-story-slide={f.outgoing ? 'out' : 'in'} style={{
                position: 'absolute', left: '50%', top: 0, whiteSpace: 'nowrap', fontSize: size, letterSpacing: '-.045em', lineHeight: 1.05, opacity: f.opacity,
                transform: `translate(-50%,-50%) translate(${f.xEm}em,${f.yEm}em)`, filter: f.blur ? `blur(${f.blur * z}px)` : undefined,
              }}>
                {f.words.map((w, i) => {
                  const m = supportingWordMotion(w, t, f.end, 'slide', 'tail', { direction: 'right', distanceEm: 0.45, duration: 0.28 });
                  return word(w, { marginLeft: i ? '.16em' : 0, opacity: m.opacity, transform: i ? `translateX(${m.x}em)` : undefined });
                })}
              </div>
            );
          })}
        </div>
      )}
      {front && !replace && !headlineOnly && quiet && (
        <div data-agent-story-support="" data-agent-story-quiet="" style={{
          position: 'absolute', left: (plan.icon === 'phone' ? 0.33 : plan.icon === 'door' ? 0.68 : 0.5) * width + ax, top: Q * height + ay, color: '#fff', fontFamily: H,
          fontSize: 58 * z * C, fontWeight: 400, letterSpacing: '-.035em', lineHeight: 1, whiteSpace: 'nowrap', opacity: P, textShadow: `0 ${z}px ${2 * z}px #0009`,
        }}>
          {phraseSlotFrames(after.map((w) => [w]), t, end).map((f) => {
            const w = f.words[0];
            const m = supportingWordMotion(w, t, f.end, 'slide', 'tail', { direction: 'down', distanceEm: 0.65 });
            return (
              <span key={w.id} aria-hidden={f.outgoing || undefined} data-caption-word-id={f.outgoing ? undefined : w.id} style={{
                position: 'absolute', left: 0, top: 0, display: 'inline-block', opacity: f.outgoing ? f.opacity : m.opacity,
                transform: `translate(-50%,-50%) translateY(${f.outgoing ? f.yEm : m.y}em)`,
              }}>{w.text}</span>
            );
          })}
        </div>
      )}
      {front && !replace && !headlineOnly && !quiet && (
        <CinematicPhrase words={after} roles={plan} t={t} end={end} width={width} height={height} x={(plan.icon === 'phone' ? 0.33 : plan.icon === 'door' ? 0.68 : 0.5) * width + ax}
          y={headlineOnly ? X + ay : (Q - 0.015) * height + ay} font={R} secondary={H} accent={plan.amount.length ? '#fff' : M} color="#fff"
          size={(plan.amount.length ? 76 : 90) * z * C} faceBand={faceBand} autoAnchor={false} anchorItalic={false} slotSizeRatio={0.78} slotRightRatio={0.88}
          preserveReplacementGroups tailDirections={['down', 'left']} supportDirections={{ lead: 'down', tail: 'down' }} />
      )}
    </div>
  );
}

export const storySmooth = smooth;
