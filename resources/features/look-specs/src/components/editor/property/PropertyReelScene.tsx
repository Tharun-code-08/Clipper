// The property reel scenes — their "Number Story" (reach-counter), "Gradient Estate"
// (magenta-estate) and "Dimension Story" (dimension-story), read from the public scenes chunk
// their site ships and re-implemented on our planner (reel.ts / plan.ts), geometry and motion.
// Times are SECONDS; px are the frame's, with their 1080-wide constants scaled by width / 1080.
import React, { useId } from 'react';
import type { FaceBand } from '@/lib/looks/property/geometry';
import { clearFaceY, fitPropertyHeadline, propertyHeadlineWidth, rearCaptionGeometry } from '@/lib/looks/property/geometry';
import { cinematicJitter, cinematicMotion, clamp01, phraseSlotFrames, supportingWordMotion } from '@/lib/looks/property/motion';
import { phraseChoreography, phraseRoles, readableAnchorGroups, readableGroups, replacementHasReadingRoom, type StoryWord } from '@/lib/looks/property/plan';
import {
  dimensionBeats, dimensionEntranceDuration, dimensionHeroMotion, dimensionTravel, formatReelNumber, parseReelNumber, planPropertyMoment, reelCountValue,
  type DimensionBeat, type ReelIcon, type ReelMoment, type ReelPreset,
} from '@/lib/looks/property/reel';
import { CaptionSlideWord, CinematicPhrase, CinematicSatellites } from './AgentStoryScene';

const REEL_ICONS: Record<ReelIcon, React.ReactNode> = {
  home: <path d="M12 51 60 12l48 39M25 44v62h70V44M47 106V71h26v35" />,
  eye: <><path d="M6 60q54-66 108 0Q60 126 6 60Z" /><circle cx="60" cy="60" r="20" /></>,
  cube: <path d="m12 33 48-24 48 24v54l-48 25-48-25V33l48 25 48-25M60 58v54M36 21l48 25" />,
  pin: <><path d="M60 113S23 75 23 44a37 37 0 0 1 74 0c0 31-37 69-37 69Z" /><circle cx="60" cy="43" r="13" /></>,
};
export function ReelIconArt({ kind }: { kind: ReelIcon }) {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">{REEL_ICONS[kind]}</svg>
  );
}

// ── the ink of a reel's big word or figure: outlined, an inception (a white difference twin
//    under a multiplied gradient), or a plain gradient ────────────────────────────────────────
let inkCtx: CanvasRenderingContext2D | null | undefined;
function inkWidth(text: string, box: React.CSSProperties, size: number, lsEm: number): number | null {
  if (inkCtx === undefined) inkCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!inkCtx) return null;
  inkCtx.font = `${box.fontStyle ?? 'normal'} ${box.fontWeight ?? 400} ${size}px ${box.fontFamily}`;
  const w = inkCtx.measureText(text).width;
  return Number.isFinite(w) && w > 0 ? w + lsEm * size * text.length : null;
}

export function ReelInk({ mode, box, children, decorativeChildren, accent, reach = false, dimensional = false, width, fontSize, wordId, numberValue }: {
  mode: 'outline' | 'inception' | 'gradient'; box: React.CSSProperties; children: React.ReactNode; decorativeChildren?: React.ReactNode;
  accent: string; reach?: boolean; dimensional?: boolean; width: number; fontSize: number; wordId?: string; numberValue?: number;
}) {
  const id = useId().replace(/:/g, '');
  const z = width / 1080;
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : null;
  const gradient = dimensional ? `linear-gradient(170deg,${accent},${accent} 55%,#29253B)` : reach ? `linear-gradient(180deg,#D457DF 0%,${accent} 48%,#792CA4 100%)` : 'linear-gradient(180deg,#C16EDB 0%,#B700E8 48%,#F047EE 100%)';
  const fill: React.CSSProperties = { backgroundImage: gradient, backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent', textShadow: 'none' };
  if (mode === 'outline') {
    const stroke = Math.max(7 * z, Math.min(14 * z, 0.0225 * fontSize));
    const measured = text ? inkWidth(text, box, fontSize, -0.035) ?? text.length * fontSize * 0.7 : 0.94 * width;
    const w = Math.min(0.94 * width, Math.max(0.72 * fontSize, measured + 4 * stroke));
    const h = 1.18 * fontSize + 2 * stroke;
    return (
      <svg data-reel-ink="outline-inception" data-reel-counter={numberValue} data-caption-word-id={wordId} width={w} height={h} viewBox={`0 0 ${w} ${h}`}
        style={{ ...box, width: w, height: h, overflow: 'visible', mixBlendMode: 'difference' }}>
        <defs>
          <linearGradient id={`reel-stroke-${id}`} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0" stopColor={reach ? '#A2F3F0' : '#9714C4'} /><stop offset=".55" stopColor={reach ? accent : '#752AC9'} /><stop offset="1" stopColor={reach ? '#125EA8' : '#BB00E9'} />
          </linearGradient>
        </defs>
        <text x={w / 2} y={h / 2} dominantBaseline="central" textAnchor="middle" fill="none" stroke={`url(#reel-stroke-${id})`} strokeWidth={stroke} strokeLinejoin="round"
          style={{ fontFamily: box.fontFamily, fontWeight: 800, fontSize, fontStyle: 'normal', letterSpacing: '-.035em' }}>{children}</text>
      </svg>
    );
  }
  const hasSpans = React.Children.toArray(children).some((c) => React.isValidElement(c) && c.type === 'span');
  if (mode === 'gradient' && text && !hasSpans) {
    const stroke = Math.max(1.2 * z, 0.006 * fontSize);
    const lsEm = (typeof box.letterSpacing === 'string' && Number.parseFloat(box.letterSpacing)) || -0.045;
    const measured = inkWidth(text, box, fontSize, lsEm) ?? text.length * fontSize * 0.7;
    const w = Math.min(0.94 * width, Math.max(0.72 * fontSize, measured + 5 * stroke));
    const h = 1.2 * fontSize + 2 * stroke;
    return (
      <svg data-reel-ink="gradient" data-reel-counter={numberValue} data-caption-word-id={wordId} width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ ...box, width: w, height: h, overflow: 'visible' }}>
        <defs>
          <linearGradient id={`reel-fill-${id}`} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0" stopColor="#C16EDB" /><stop offset=".48" stopColor="#B700E8" /><stop offset="1" stopColor="#F047EE" />
          </linearGradient>
        </defs>
        <text x={w / 2} y={h / 2} dominantBaseline="central" textAnchor="middle" fill={`url(#reel-fill-${id})`} stroke="#29132E" strokeWidth={stroke} strokeLinejoin="round" paintOrder="stroke fill"
          style={{ fontFamily: box.fontFamily, fontWeight: box.fontWeight, fontSize, fontStyle: box.fontStyle, letterSpacing: box.letterSpacing }}>{text}</text>
      </svg>
    );
  }
  const px = (v: string | number | undefined) => (typeof v === 'number' ? `${v}px` : v ?? '0px');
  const inked = hasSpans
    ? React.Children.map(children, (c) => {
      if (!React.isValidElement<{ style?: React.CSSProperties }>(c) || c.type !== 'span') return c;
      const st = c.props.style ?? {};
      return React.cloneElement(c, { style: { ...st, ...fill, padding: '.18em .2em', marginLeft: `calc(${px(st.marginLeft)} - .2em)`, marginRight: `calc(${px(st.marginRight)} - .2em)` } });
    })
    : children;
  const padded: React.CSSProperties = { ...box, padding: '.18em .2em' };
  return (
    <>
      {mode === 'inception'
        ? <div aria-hidden style={{ ...padded, color: '#FFFFFF', WebkitTextFillColor: '#FFFFFF', mixBlendMode: 'difference' }}>{decorativeChildren ?? children}</div>
        : <div aria-hidden style={{ ...padded, color: '#29132E', WebkitTextFillColor: '#29132E', WebkitTextStroke: `${1.2 * z}px #29132E`, transform: `${box.transform ?? ''} translate(${1.5 * z}px,${2.5 * z}px)`, mixBlendMode: undefined }}>{decorativeChildren ?? children}</div>}
      <div data-reel-ink={mode} data-reel-counter={numberValue} data-caption-word-id={wordId} style={{ ...padded, ...fill, backgroundImage: hasSpans ? undefined : gradient, mixBlendMode: mode === 'inception' ? 'multiply' : undefined }}>{inked}</div>
    </>
  );
}

// ── a number's setup and its sliding replacements (Number Story's captions) ───────────────
function NumberAttachedCaption<W extends StoryWord>({ words, groups, setupWords = [], placement, t, end, x, y, heroSize, width, height, font, faceBottomYPct }: {
  words: W[]; groups?: W[][]; setupWords?: W[]; placement: 'above' | 'below'; t: number; end: number; x: number; y: number; heroSize: number;
  width: number; height: number; font: string; faceBottomYPct?: number;
}) {
  const inGroups = new Set(groups?.flatMap((g) => g.map((w) => w.id)) ?? []);
  const raw = placement !== 'above' || groups?.length
    ? (groups?.length ? [...groups, ...words.filter((w) => !inGroups.has(w.id)).map((w) => [w])].sort((a, b) => a[0].start - b[0].start) : words.map((w) => [w]))
    : [words];
  const list = placement === 'above' ? readableAnchorGroups(raw, end) : raw;
  const at = list.findIndex((g, i) => g.length && t >= g[0].start && t < (list[i + 1]?.[0]?.start ?? end));
  if (at < 0 && !setupWords.length) return null;
  const cur = Math.max(0, at);
  if (!list[cur]) return null;
  const above = placement === 'above';
  const cap = above ? (66 * width) / 1080 : Math.min((150 * width) / 1080, 0.72 * heroSize);
  const face = { family: font, weight: 300, italic: false, letterSpacingEm: -0.065 };
  const size = Math.min(...list.filter((g) => g.length).map((g) => fitPropertyHeadline([...setupWords, ...g], face, cap, width * (above ? 0.72 : 0.8))));
  const widest = Math.max(...list.map((g) => propertyHeadlineWidth(g, face, size)));
  const start = list[cur][0].start;
  const next = list[cur + 1]?.[0]?.start ?? end;
  const below = Math.min(0.72 * height, Math.max(y + 0.6 * heroSize, faceBottomYPct == null ? -Infinity : faceBottomYPct * height + 0.62 * size));
  const enter = (w: W, kind: 'setup' | 'replacement') => {
    const dur = Math.min(0.42, Math.max(0.14, 0.65 * Math.max(0.08, next - w.start)));
    const o = t - w.start, r = clamp01(o / dur), l = 1 - r * r * (3 - 2 * r);
    return { opacity: o < 0 ? 0 : clamp01(r / 0.42), x: r === 1 ? 0 : -l * (kind === 'setup' ? 0.75 : 1.15), scaleX: 1 + l * (kind === 'replacement' ? 0.13 : 0.05) };
  };
  const leave = (o: number) => { const r = clamp01(o / 0.14); return { opacity: o < 0 || r >= 1 ? 0 : 1 - r, x: 0.95 * r * r, scaleX: 1 + 0.18 * r }; };
  const draw = (ws: W[], outgoing = false) => ws.map((w, i) => {
    const m = outgoing ? leave(t - start) : enter(w, above ? 'setup' : 'replacement');
    return <CaptionSlideWord key={w.id} data-caption-word-id={outgoing ? undefined : w.id} aria-hidden={outgoing || undefined}
      style={{ display: 'inline-block', marginLeft: i ? '.17em' : 0, opacity: m.opacity, transform: `translate(${m.x}em,0em) scaleX(${m.scaleX})`, transformOrigin: 'left center' }}>{w.text}</CaptionSlideWord>;
  });
  return (
    <div data-number-attached-caption={placement} data-headline-satellite={above ? 'lead' : 'tail'} style={{
      position: 'absolute', left: x, top: above ? Math.max(0.025 * height + 0.5 * size, y - 0.48 * heroSize + 0.22 * size) : below, transform: 'translate(-50%,-50%)',
      display: setupWords.length ? 'flex' : 'grid', alignItems: 'baseline', gap: setupWords.length ? '.24em' : undefined, textAlign: 'center', fontFamily: font, fontWeight: 300,
      fontStyle: 'normal', fontSize: size, lineHeight: 1, letterSpacing: '-.065em', color: '#fff', whiteSpace: 'nowrap', opacity: Math.min(1, Math.max(0, end - t) / 0.12),
      textShadow: `0 ${width / 1080}px ${(2 * width) / 1080}px #0007`,
    }}>
      {setupWords.length > 0 && <div data-number-fixed-setup="">{draw(setupWords)}</div>}
      <div style={{ display: 'grid', width: setupWords.length ? widest : undefined, textAlign: setupWords.length ? 'left' : 'center' }}>
        {cur > 0 && t - start < 0.14 && <div data-number-slot="out" aria-hidden style={{ gridArea: '1/1' }}>{draw(list[cur - 1], true)}</div>}
        <div data-number-slot="in" style={{ gridArea: '1/1' }}>{draw(list[cur])}</div>
      </div>
    </div>
  );
}

// ── quiet estate captions: the phrase on hold, or a word slot, with a script coda ─────────
const key = (w: { text: string }) => w.text.toLowerCase().replace(/[^a-z']/g, '');

function QuietEstate<W extends StoryWord>({ words, reach, t, end, width, height, x, y, font, secondary, color, size, faceBand }: {
  words: W[]; reach: boolean; t: number; end: number; width: number; height: number; x: number; y: number; font: string; secondary: string; color: string; size: number; faceBand?: FaceBand | null;
}) {
  if (reach) return <WordSlots words={words} t={t} end={end} width={width} height={height} x={x} y={y} font={font} secondary={secondary} size={size} faceBand={faceBand} />;
  const groups = readableGroups(words.map((w) => [w]), end);
  const at = groups.findIndex((g, i) => t >= g[0].start && t < (groups[i + 1]?.[0]?.start ?? end));
  const cur = groups[at];
  if (!cur) return null;
  const next = groups[at + 1]?.[0]?.start ?? end;
  const room = replacementHasReadingRoom(groups, end);
  const m = cinematicMotion(t - cur[0].start, Math.min(0.36, (next - cur[0].start) * 0.25), 'settle');
  const body = fitPropertyHeadline(cur, { family: secondary, weight: 500, italic: false, letterSpacingEm: -0.035 }, size * 0.67, 0.72 * width);
  const draw = (ws: W[]) => ws.map((w, i) => {
    const s = supportingWordMotion(w, t, next, 'slide');
    return <CaptionSlideWord key={w.id} data-caption-word-id={w.id} style={{ display: 'inline-block', marginLeft: i ? '.17em' : 0, opacity: s.opacity, transform: `translate(${s.x}em,${s.y}em)`, position: 'relative' }}>{w.text}</CaptionSlideWord>;
  });
  return (
    <div data-property-spoken="quiet-estate" data-reading-mode={room ? 'phrase-replace' : 'phrase-hold'} style={{
      position: 'absolute', left: x, top: clearFaceY(y, body * 0.6 + (25 * width) / 1080, body * 0.65, height, faceBand), transform: `translate(-50%,-50%) translateY(${(m.y * width) / 1080 * 0.4}px)`,
      opacity: m.opacity * Math.min(1, (next - t) / 0.1), color, fontSize: body, fontFamily: secondary, fontWeight: 500, fontStyle: 'normal', letterSpacing: '-.035em', lineHeight: 1.03,
      whiteSpace: 'nowrap', textShadow: `0 ${width / 1080}px ${(3 * width) / 1080}px #000b`,
    }}>
      <div>{draw(cur)}</div>
    </div>
  );
}

function WordSlots<W extends StoryWord>({ words, t, end, width, height, x, y, font, secondary, size, faceBand }: {
  words: W[]; t: number; end: number; width: number; height: number; x: number; y: number; font: string; secondary: string; size: number; faceBand?: FaceBand | null;
}) {
  const tight = words.every((w, i) => !i || w.start - words[i - 1].end < 0.55);
  const mixed = words.length >= 3 && words.length <= 6 && tight;
  const lead = /^(and a|i can't|i cant|it's a|its a|with a)$/.test(words.slice(0, 2).map(key).join(' ')) ? 2 : 1;
  const hasCoda = words.length >= 5 && /^(with|for|to|in|on|at|your|our|my)$/.test(key(words[words.length - 2]));
  const setup = mixed ? words.slice(0, lead) : [];
  const coda = mixed && hasCoda ? words.slice(-2) : [];
  const payoff = mixed ? words.slice(lead, coda.length ? -coda.length : undefined) : [...words];
  const at = words.findIndex((w, i) => t >= w.start && t < (words[i + 1]?.start ?? end));
  if (at < 0) return null;
  const script = 'AlexBrush, "Alex Brush", cursive';
  const body = mixed
    ? fitPropertyHeadline(payoff, { family: font, weight: 800, italic: true, letterSpacingEm: -0.035 }, 1.08 * size, 0.72 * width)
    : Math.min(...payoff.map((w) => fitPropertyHeadline([w], { family: secondary, weight: 400, italic: false, letterSpacingEm: -0.045 }, 0.67 * size, 0.72 * width)));
  const codaSize = fitPropertyHeadline(coda, { family: script, weight: 400, italic: false, letterSpacingEm: 0 }, 0.9 * body, 0.52 * width);
  const enter = (w: W, kind: 'setup' | 'payoff' | 'replacement' | 'coda', until: number) => {
    const dur = Math.min(kind === 'coda' ? 0.46 : 0.42, Math.max(0.14, 0.65 * Math.max(0.08, until - w.start)));
    const o = t - w.start, r = clamp01(o / dur), l = 1 - r * r * (3 - 2 * r);
    return { opacity: o < 0 ? 0 : clamp01(r / 0.42), x: r === 1 ? 0 : -l * (kind === 'setup' ? 0.75 : 1.15), scaleX: 1 + l * (kind === 'replacement' ? 0.13 : 0.05) };
  };
  const leave = (o: number) => { const r = clamp01(o / 0.14); return { opacity: o < 0 || r >= 1 ? 0 : 1 - r, x: 0.95 * r * r, scaleX: 1 + 0.18 * r }; };
  const draw = (ws: W[], kind: 'setup' | 'payoff' | 'replacement' | 'coda', outgoing = false) => ws.map((w, i) => {
    const m = outgoing ? leave(t - words[at].start) : enter(w, kind, mixed ? end : words[at + 1]?.start ?? end);
    return <CaptionSlideWord key={w.id} data-caption-word-id={outgoing ? undefined : w.id} aria-hidden={outgoing || undefined} data-number-motion={kind}
      style={{ display: 'inline-block', marginLeft: i ? '.17em' : 0, opacity: m.opacity, transform: `translate(${m.x}em,0em) scaleX(${m.scaleX})`, transformOrigin: 'left center', position: 'relative' }}>{w.text}</CaptionSlideWord>;
  });
  const dip = (o: number) => {
    for (const [a, b] of [[0.3, 0.35], [0.37, 0.42], [0.44, 0.49]]) if (o >= a && o < b) return 1 - 0.92 * Math.max(0, Math.min((o - a) / 0.01, (b - o) / 0.01, 1));
    return 1;
  };
  return (
    <div data-property-spoken={mixed ? 'mixed-script' : 'word-slot'} data-reading-mode={mixed ? 'phrase-hold' : 'word-replace'} style={{
      position: 'absolute', left: x, top: clearFaceY(y, body * (setup.length ? 1.12 : 0.6) + (25 * width) / 1080, body * (coda.length ? 1.15 : 0.65), height, faceBand),
      transform: 'translate(-50%,-50%)', opacity: Math.min(1, Math.max(0, end - t) / 0.12), color: '#fff', fontSize: body, fontFamily: mixed ? font : secondary,
      fontWeight: mixed ? 800 : 400, fontStyle: mixed ? 'italic' : 'normal', letterSpacing: '-.035em', lineHeight: 1.03, whiteSpace: 'nowrap', textShadow: `0 ${width / 1080}px ${(3 * width) / 1080}px #000b`,
    }}>
      {setup.length > 0 && <div style={{ fontFamily: secondary, fontSize: '.52em', fontWeight: 400, fontStyle: 'normal', marginLeft: '-.16em', marginBottom: '-.08em' }}>{draw(setup, 'setup')}</div>}
      {mixed
        ? <div style={{ opacity: dip(t - payoff[payoff.length - 1].start) }}>{draw(payoff, 'payoff')}</div>
        : (
          <div style={{ display: 'grid', textAlign: 'center' }}>
            {at > 0 && t - words[at].start < 0.14 && <div aria-hidden data-number-slot="out" style={{ gridArea: '1/1' }}>{draw([words[at - 1]], 'replacement', true)}</div>}
            <div data-number-slot="in" style={{ gridArea: '1/1' }}>{draw([words[at]], 'replacement')}</div>
          </div>
        )}
      {coda.length > 0 && (
        <div style={{ fontFamily: script, fontSize: codaSize, fontWeight: 400, fontStyle: 'normal', textAlign: 'right', marginRight: '-.12em', marginTop: '-.1em',
          clipPath: t - coda[0].start < 0.38 ? `inset(-30% ${100 * Math.max(0, 1 - (t - coda[0].start) / 0.38)}% -40% -10%)` : undefined }}>{draw(coda, 'coda')}</div>
      )}
    </div>
  );
}

// ── Dimension Story: beats behind and in front of the person ─────────────────────────────
export function DimensionScene<W extends StoryWord>({ words, t, end, width, height, caption, layer, headYPct, faceBand, moment }: {
  words: W[]; t: number; end: number; width: number; height: number; caption: ReelCaption; layer?: 'behind' | 'front'; headYPct?: number; faceBand?: FaceBand | null; moment?: ReelMoment;
}) {
  const beats = dimensionBeats(words, [...(moment?.headlineIds ?? []), ...(moment?.anchorIds ?? [])]);
  const byId = new Map(words.map((w) => [w.id, w]));
  const F = caption.fontFamily;
  const z = width / 1080;
  const C = (caption.fontSizePx ?? 104) / 104;
  const head = Math.max(0.1, Math.min(0.4, headYPct ?? 0.25));
  return (
    <div data-property-reel="dimension-story" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {beats.filter((b) => (!layer || b.plane === layer || layer === 'front') && t >= b.start && t < Math.min(end, b.end)).map((b) => {
        const ws = b.wordIds.map((id) => byId.get(id)).filter((w): w is W => !!w);
        const hero = byId.get(b.heroId);
        if (!hero) return null;
        const hi = ws.findIndex((w) => w.id === hero.id);
        const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((w): w is W => !!w);
        const lead = b.leadIds ? pick(b.leadIds) : ws.slice(0, hi);
        const tail = b.tailIds ? pick(b.tailIds) : ws.slice(hi + 1);
        const groups = (b.replacementGroups ?? []).map((g) => pick(g.wordIds));
        const stacked = b.plane === 'front' && !!b.leadStack;
        const choreo = phraseChoreography(ws);
        const travel = b.direction ?? dimensionTravel(b.plane, b.ordinal);
        const italic = b.heroItalic ?? b.ordinal % 3 !== 0;
        const heroFont = { family: F, weight: 900, italic, letterSpacingEm: -0.045 };
        const fit = fitPropertyHeadline([hero], heroFont, (b.plane === 'behind' ? 210 : 225) * z * C, 0.84 * width);
        const geo = rearCaptionGeometry(fit, head, height);   // as the reels above: the head estimate, not the band
        const H = b.plane === 'behind' ? geo.size : fit;
        const heroW = propertyHeadlineWidth([hero], heroFont, H);
        const cap = b.plane === 'behind' ? 76 * z * C : Math.min(96 * z * C, 0.5 * H);
        const plain = { family: F, weight: 400, italic: false, letterSpacingEm: -0.035 };
        const sizeOf = (g: W[]) => fitPropertyHeadline(g, plain, cap, 0.72 * width);
        const G = 0.5 * width;
        const leadLeft = Math.max(0.06 * width - G, Math.min(-(0.48 * heroW), 0.94 * width - G - propertyHeadlineWidth(lead, plain, sizeOf(lead))));
        const U = b.plane === 'behind' ? Math.max(head * height - 0.1 * H, 0.98 * H + 0.045 * height) : Math.min(0.64 * height, Math.max(0.49 * height, (head + 0.26) * height));
        const slots = phraseSlotFrames(groups, t, Math.min(end, b.end));
        const all = [...lead, ...tail];
        const q = 0.003 * height;
        const X = geo.y;
        const V = Math.min(cap, Math.max(24 * z, (X - 0.25 * H - q - 0.0125 * height) / 1.1), ...[[], ...groups].map((g) => fitPropertyHeadline([...all, ...g], { ...plain, weight: 700 }, cap, 0.84 * width)));
        const K = b.plane === 'front' ? clearFaceY(U, 1.05 * H + 66 * z, 0.9 * H, height, faceBand) : Math.max(X, 0.0125 * height + 1.1 * V + q + 0.25 * H);
        const Z = K - 0.25 * H - q - 1.1 * V;
        const motion = dimensionHeroMotion(t - hero.start, dimensionEntranceDuration(hero.start, b.end), travel, Math.min(end, b.end) - t);
        const age = t - hero.start;
        const blur = age >= 0 && age < 0.16 ? 0.055 * H * (1 - age / 0.16) : 0;
        const fade = Math.max(0, Math.min(1, (Math.min(end, b.end) - t) / 0.2));
        const shadow = `0 ${4 * z}px ${z}px #0009,0 ${9 * z}px ${10 * z}px #0006`;
        const heroSpan = (hidden: boolean) => <span data-caption-word-id={hidden ? undefined : hero.id} style={{ position: 'relative' }}>{hero.text}</span>;
        const draw = (g: W[], role: 'lead' | 'tail', hidden = false) => g.map((w, i) => {
          const m = supportingWordMotion(w, t, Math.min(end, b.end), 'slide', role, { direction: role === 'lead' ? 'right' : 'up', distanceEm: 0.8 });
          return <CaptionSlideWord key={w.id} data-caption-word-id={hidden ? undefined : w.id} style={{
            display: role === 'lead' && stacked ? 'block' : 'inline-block', marginLeft: i && !(role === 'lead' && stacked) ? '.18em' : 0,
            position: 'relative', opacity: m.opacity, clipPath: m.clipPath, transform: `translate(${m.x}em,${m.y}em)`,
          }}>{w.text}</CaptionSlideWord>;
        });
        const heroBox: React.CSSProperties = {
          position: 'absolute', left: G, top: K, fontFamily: F, fontWeight: 900, fontStyle: italic ? 'italic' : 'normal', fontSize: H, letterSpacing: '-.045em', lineHeight: 1.05,
          whiteSpace: 'nowrap', textShadow: 'none', opacity: motion.opacity, filter: blur >= 0.75 ? `blur(${blur}px)` : undefined,
          transform: `translate(-50%,-50%) translate(${motion.x * z}px,${motion.y * z}px) scale(${motion.scale}) scaleX(${motion.scaleX}) skewX(${motion.skewX}deg)`,
        };
        return (
          <React.Fragment key={b.heroId}>
            {b.plane === 'behind' && (!layer || layer === 'front') && (
              <div data-dimension-support="above-hero" data-dimension-hero={hero.text} style={{
                position: 'absolute', left: G, top: Z, transform: 'translateX(-50%)', fontFamily: F, fontSize: V, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-.035em',
                whiteSpace: 'nowrap', color: '#FFFFFF', textShadow: shadow, opacity: fade, zIndex: 1,
              }}>
                {draw(all, 'lead')}
                {slots.map((f) => <span key={f.index} aria-hidden={f.outgoing || undefined} data-dimension-replacement={f.index}
                  style={{ display: 'inline-block', marginLeft: all.length ? '.18em' : 0, position: f.outgoing ? 'absolute' : 'relative', right: f.outgoing ? 0 : undefined, opacity: f.opacity }}>{draw(f.words, 'lead', f.outgoing)}</span>)}
              </div>
            )}
            {b.plane === 'front' && (!layer || layer === 'front') && (
              <div data-phrase-combination={`${travel}-lead-right-tail-up`} data-dimension-phrase={b.ordinal} data-dimension-plane={b.plane} data-dimension-color={b.accent} data-dimension-hero={hero.text} style={{
                position: 'absolute', left: G, top: K, fontFamily: F, color: '#FFFFFF', fontSize: cap, zIndex: 1, lineHeight: 1, whiteSpace: 'nowrap', textShadow: shadow, opacity: fade,
              }}>
                {lead.length > 0 && <div data-dimension-support="lead" style={{
                  position: 'absolute', left: stacked ? leadLeft : -propertyHeadlineWidth(lead, plain, sizeOf(lead)) / 2,
                  top: stacked ? -(0.65 * H) - Math.max(0, lead.length - 1) * sizeOf(lead) : Math.max(0.025 * height - K, -(0.48 * H) - 0.28 * sizeOf(lead)), fontSize: sizeOf(lead), letterSpacing: '-.035em',
                }}>{draw(lead, 'lead')}</div>}
                {tail.length > 0 && <div data-dimension-support="tail" style={{ position: 'absolute', left: 0, transform: 'translateX(-50%)', top: 0.27 * H, fontSize: sizeOf(tail), fontWeight: 700, letterSpacing: '-.035em', fontStyle: b.ordinal % 2 ? 'italic' : 'normal' }}>{draw(tail, 'tail')}</div>}
                {slots.map((f) => <div key={f.index} aria-hidden={f.outgoing || undefined} data-dimension-replacement={f.index} style={{
                  position: 'absolute', right: -(0.42 * heroW), top: 0.27 * H, fontSize: sizeOf(f.words), fontWeight: 700, fontStyle: 'italic', letterSpacing: '-.035em', opacity: f.opacity, transform: `translateY(${f.yEm}em)`,
                }}>{draw(f.words, 'tail', f.outgoing)}</div>)}
              </div>
            )}
            {(!layer || layer === b.plane) && (
              <ReelInk mode="inception" accent={b.accent} dimensional width={width} fontSize={H} numberValue={/^\d+$/.test(hero.text) ? Number(hero.text) : undefined}
                box={heroBox} decorativeChildren={heroSpan(true)}>{heroSpan(false)}</ReelInk>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── the reel scene proper: Number Story and Gradient Estate ───────────────────────────────
export interface ReelCaption { fontSizePx?: number; emphasisColor?: string; color?: string; xPct?: number; positionYPct?: number; fontFamily: string; accentFamily?: string; secondaryFamily: string; wordSpacingEm?: number }

export function PropertyReelScene<W extends StoryWord>({ words, preset, t, end, width, height, caption, layer, headYPct, faceBand, moment: given }: {
  words: W[]; preset: ReelPreset; t: number; end: number; width: number; height: number; caption: ReelCaption; layer?: 'behind' | 'front'; headYPct?: number; faceBand?: FaceBand | null; moment?: ReelMoment;
}) {
  if (preset === 'dimension-story') return <DimensionScene words={words} t={t} end={end} width={width} height={height} caption={caption} layer={layer} headYPct={headYPct} faceBand={faceBand} moment={given} />;
  const O = given ?? planPropertyMoment(words, preset);
  const magenta = preset === 'magenta-estate';
  const reach = preset === 'reach-counter';
  const layout = { heroItalic: O.captionLayout?.heroItalic ?? (O.treatment === 'counter' || O.treatment === 'banner'), heroRotation: Math.max(-12, Math.min(12, O.captionLayout?.heroRotation ?? 0)), supportingItalic: O.treatment !== 'glow' };
  const z = width / 1080;
  const C = (caption.fontSizePx ?? 104) / 104;
  const behind = !layer || layer === 'behind';
  const front = !layer || layer === 'front';
  const byId = new Map(words.map((w) => [w.id, w]));
  const headline = O.headlineIds.map((id) => byId.get(id)).filter((w): w is W => !!w);
  const numbers = O.numberIds.map((id) => byId.get(id)).filter((w): w is W => !!w);
  const num = parseReelNumber(numbers, preset);
  const rest = words.filter((w) => !O.headlineIds.includes(w.id) && !O.numberIds.includes(w.id));
  const sceneStart = words[0]?.start ?? 0;
  const bigStart = numbers[0]?.start ?? headline[0]?.start ?? sceneStart;
  const outline = O.treatment === 'outline';
  const glow = O.treatment === 'glow';
  // Gradient Estate's own entrance: a settle / rise with a scale and a blur
  const estate = (() => {
    const dur = Math.min(outline ? 0.42 : glow ? 0.32 : 0.36, Math.max(0.18, 0.7 * (end - bigStart)));
    const r = clamp01((t - bigStart) / dur), l = 1 - r * r * (3 - 2 * r);
    const up = O.entrance === 'rise' || (glow && O.entrance !== 'fall');
    const travel = O.entrance === 'settle' ? 0.14 : outline ? 0.62 : glow ? 0.24 : 0.36;
    return { xEm: 0, yEm: r >= 1 ? 0 : (up ? 1 : -1) * travel * l, scale: 1 + (outline ? 0.14 : 0.035) * l, opacity: t - bigStart < 0 ? 0 : clamp01(r / (outline ? 0.62 : 0.52)), blurEm: t - bigStart >= 0 && r < 0.34 ? 0.016 * (1 - r / 0.34) : 0 };
  })();
  const counter = (() => { const o = t - bigStart, r = clamp01(o / 0.48); return { xEm: r >= 1 ? 0 : -0.48 * (1 - r * r * (3 - 2 * r)), yEm: 0, opacity: o < 0 ? 0 : clamp01(r / 0.35), scale: 1, blurEm: o >= 0 && o < 0.12 ? 0.025 * (1 - o / 0.12) : 0 }; })();
  const cine = cinematicMotion(t - bigStart, 0.46, O.entrance ?? 'fall');
  const fade = clamp01((end - t) / 0.14);
  const jitter = cinematicJitter(O.accentMotion === 'jitter' ? t - bigStart : -1);
  const accent = caption.emphasisColor || '#EC00B5';
  const head = Math.max(0.17, Math.min(0.49, headYPct ?? 0.26));
  const ax = ((caption.xPct ?? 0.5) - 0.5) * width;
  const ay = ((caption.positionYPct ?? 0.47) - 0.47) * height;
  const F = caption.fontFamily, A = caption.accentFamily ?? caption.fontFamily, S = caption.secondaryFamily;
  const shown = num ? reelCountValue(num, t - bigStart, reach ? 0.5 : 0.45) : 0;
  const countText = num ? formatReelNumber({ ...num, suffix: outline ? '' : num.suffix }, magenta ? num.value : shown) : '';
  const fullText = num ? formatReelNumber({ ...num, suffix: outline ? '' : num.suffix }) : '';
  const headText = headline.map((w) => w.text).join(' ');
  const cap = (num ? Math.min(outline ? 560 : reach ? 132 : 230, (outline || reach ? 960 : 840) / Math.max(1, fullText.length * (outline ? 0.58 : 0.59))) : Math.min(reach ? 174 : 245, 970 / Math.max(1, 0.54 * headText.length))) * z * C;
  const fitted = fitPropertyHeadline(num ? [{ ...numbers[0], text: fullText }] : headline,
    { family: num && reach ? A : F, weight: outline ? 800 : reach ? (num ? 700 : 600) : 900, italic: magenta ? layout.heroItalic : !reach && !outline, letterSpacingEm: outline ? -0.035 : num && reach ? -0.025 : -0.045 },
    cap, width * (reach && num ? 0.68 : magenta && num && !outline ? 0.74 : 0.9));
  // Their reel previews place the hero from the head estimate (floored at .17), not the face
  // band: Number Story's figure centres at .238H over a head top of .105 (band top would give
  // .117), Gradient Estate's "20" at .25 over .12. The band still keeps the support off the face.
  const geo = rearCaptionGeometry(fitted, head, height);
  const size = glow ? fitted : geo.size;
  const glowY = Math.min(0.65, Math.max(0.52, head + 0.17)) * height + ay;
  const glowSize = fitPropertyHeadline(headline, { family: F, weight: 900, italic: false, letterSpacingEm: -0.045 }, 132 * z * C, 0.84 * width);
  const Y = geo.y + ay;
  const m = magenta ? estate : reach ? counter : null;
  const box: React.CSSProperties = {
    position: 'absolute', left: 0.5 * width + ax + jitter.x * z, top: Y, textAlign: 'center', whiteSpace: 'nowrap', fontFamily: F, fontWeight: reach ? (num ? 700 : 600) : 900,
    fontStyle: magenta ? (layout.heroItalic ? 'italic' : 'normal') : reach || outline ? 'normal' : 'italic', fontSize: size, lineHeight: 1.05, letterSpacing: outline ? '-.055em' : '-.045em', color: accent,
    opacity: (m ? m.opacity : cine.opacity) * fade,
    transform: m
      ? `translate(-50%,-50%) translate(${m.xEm * size}px,${m.yEm * size}px) scale(${m.scale})${magenta ? ` rotate(${layout.heroRotation}deg)` : ''}`
      : `translate(-50%,-50%) translateY(${cine.y * z}px) scale(${cine.scale}) rotate(${jitter.rotation}deg)`,
    filter: m ? (m.blurEm * size >= 0.75 ? `blur(${m.blurEm * size}px)` : undefined) : cine.blur * z >= 0.75 ? `blur(${cine.blur * z}px)` : undefined,
  };
  const word = (w: W, i: number, hidden = false, typed = false) => {
    const s = typed && i > 0 ? supportingWordMotion(w, t, end, 'slide', 'lead', { direction: reach ? 'right' : 'down', duration: 0.36 }) : { opacity: 1, x: 0, y: 0 };
    return <span key={w.id} data-caption-word-id={hidden ? undefined : w.id} style={{ display: 'inline', visibility: typed && t < w.start ? 'hidden' : undefined, opacity: s.opacity, marginLeft: i ? '.24em' : 0, position: 'relative', left: s.x * size, top: s.y * size }}>{w.text}</span>;
  };
  const pinned = new Set([...O.headlineIds, ...O.numberIds]);
  const bigAt = words.find((w) => pinned.has(w.id))?.start ?? sceneStart;
  const others = words.filter((w) => !pinned.has(w.id));
  const L = O.captionLayout;
  const explicit = words.some((w) => pinned.has(w.id)) && !!L && (L.leadIds !== undefined || L.tailIds !== undefined);
  const leadSet = new Set((explicit ? others.filter((w) => L!.leadIds?.includes(w.id)) : others.filter((w) => w.start < bigAt)).map((w) => w.id));
  const tailList = explicit ? others.filter((w) => !leadSet.has(w.id) && L!.tailIds?.includes(w.id)) : [];
  const lead = magenta && explicit ? others.filter((w) => leadSet.has(w.id)) : num || headline.length ? rest.filter((w) => w.start < bigStart) : [];
  const tail = magenta && explicit ? tailList : [];
  const support = rest.filter((w) => !lead.includes(w) && !tail.includes(w));
  const anchored = phraseRoles(support, O, true).anchor.length > 0 && (headline.length > 0 || !!O.anchorIds?.length);
  const reachReplace = reach && headline.length > 0 && !O.anchorIds?.length && !!O.replacementGroups?.length;
  const reachNumbers = reach && (headline.length > 0 || !!num) && (reachReplace || !anchored);
  const satellitesOnly = !reach && !reachReplace && !explicit && headline.length > 0 && !num && !anchored && support.length <= 3;
  const supportY = Math.min(0.62, Math.max(0.52, head + 0.155)) * height + ay;
  const heroW = propertyHeadlineWidth(headline, { family: F, weight: 900, italic: magenta ? layout.heroItalic : !reach, letterSpacingEm: -0.045 }, size);
  const dirs = reach ? { lead: 'right' as const, tail: 'right' as const } : { lead: 'down' as const, tail: 'up' as const };
  return (
    <div data-property-reel={preset} data-property-treatment={O.treatment} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontVariantNumeric: 'tabular-nums lining-nums' }}>
      {behind && num && (
        <ReelInk mode={outline ? 'outline' : reach ? 'inception' : 'gradient'} box={{ ...box, fontFamily: reach ? A : F, fontWeight: reach ? 700 : 900, letterSpacing: reach ? '-.025em' : box.letterSpacing }}
          accent={accent} reach={reach} width={width} fontSize={size} wordId={numbers[0]?.id} numberValue={num.value}>{countText}</ReelInk>
      )}
      {front && num && outline && (
        <div style={{ position: 'absolute', left: 0.62 * width + ax, top: Y, fontFamily: S, fontSize: Math.min(70 * z * C, 0.2 * size), fontWeight: 400, color: caption.color ?? '#fff', transform: 'translate(-50%,-50%)', opacity: cine.opacity * fade }}>{num.suffix.trim()}</div>
      )}
      {behind && !num && headline.length > 0 && O.treatment !== 'banner' && O.treatment !== 'glow' && (
        <ReelInk mode="inception" box={box} accent={accent} reach={reach} width={width} fontSize={size} decorativeChildren={headline.map((w, i) => word(w, i, true, true))}>{headline.map((w, i) => word(w, i, false, true))}</ReelInk>
      )}
      {behind && O.treatment === 'banner' && (
        <>
          <div style={{ position: 'absolute', left: -(0.15 * width), top: Y - 0.06 * height, width: 1.3 * width, height: 0.13 * height, background: `linear-gradient(90deg,transparent,${accent} 15%,${accent} 85%,transparent)`, opacity: cine.opacity * fade, transform: `translateX(${(1 - clamp01((t - bigStart) / 0.48)) * width}px) rotate(-9deg)` }} />
          <div style={{ ...box, mixBlendMode: undefined, color: caption.color ?? '#fff', fontStyle: 'normal', fontSize: 0.86 * size }}>{headline.map((w, i) => word(w, i, false, true))}</div>
        </>
      )}
      {behind && O.icon && (
        <div style={{ position: 'absolute', left: 0.5 * width + ax, top: Y - 205 * z, width: 160 * z, height: 160 * z, color: caption.color ?? '#fff', opacity: cine.opacity * fade, transform: `translate(-50%,-50%) scale(${cine.scale})` }}><ReelIconArt kind={O.icon} /></div>
      )}
      {front && glow && (
        <div style={{ ...box, top: glowY, mixBlendMode: undefined, fontStyle: 'normal', fontSize: glowSize, color: caption.color ?? '#fff' }}>
          <div aria-hidden style={{ position: 'absolute', inset: '10% -8%', background: '#D500EE', filter: `blur(${19 * z}px)`, opacity: 0.85, zIndex: -1 }} />
          {headline.map((w, i) => word(w, i, false, true))}
        </div>
      )}
      {reach && front && (headline.length > 0 || num) && (
        <NumberAttachedCaption words={lead} placement="above" t={t} end={end} x={0.5 * width + ax} y={Y} heroSize={size} width={width} height={height} font={S} />
      )}
      {reach && front && reachNumbers && support.length > 0 && (
        <NumberAttachedCaption words={support} groups={O.replacementGroups?.map((g) => support.filter((w) => g.wordIds.includes(w.id))).filter((g) => g.length) ?? support.map((w) => [w])}
          placement="below" t={t} end={end} x={0.5 * width + ax} y={Y} heroSize={size} width={width} height={height} font={S} faceBottomYPct={faceBand?.bottom} />
      )}
      {!reach && front && (headline.length > 0 || num) && (
        <CinematicSatellites lead={lead} tail={tail.length ? tail : satellitesOnly ? support : []} t={t} end={end} x={0.5 * width + ax} y={glow ? glowY : Y} heroWidth={heroW || 2 * size}
          heroSize={glow ? Math.min(size, 132 * z * C) : size} width={width} height={height} font={S} color="#fff" italic={magenta ? layout.supportingItalic : !reach}
          supportDirections={dirs} rotation={magenta ? layout.heroRotation : 0} leadAlign={magenta && num && !outline ? 'right' : 'left'} sizeScale={magenta && num && !outline ? 0.8 : 1} />
      )}
      {front && !satellitesOnly && !reachNumbers && (anchored ? (
        <CinematicPhrase words={support} roles={O as never} preserveReplacementGroups t={t} end={end} width={width} height={height} x={0.5 * width + ax}
          y={glow ? glowY + (glowSize + 106 * z * C) * 0.5 : supportY} font={reach ? A : F} secondary={S} color="#fff" accent="#fff" size={(reach ? 104 : 106) * z * C}
          anchorItalic={!(magenta && num)} faceBand={faceBand} supportDirections={dirs} />
      ) : (
        <QuietEstate words={support} reach={reach} faceBand={faceBand} t={t} end={end} width={width} height={height} x={0.5 * width + ax} y={glow ? glowY + 0.65 * size : supportY}
          font={reach ? A : F} secondary={S} color="#fff" size={(reach ? 74 : 106) * z * C} />
      ))}
      {front && O.flash && t - sceneStart >= 0 && t - sceneStart < 0.2 && (
        <div data-reel-flash="" style={{ position: 'absolute', inset: 0, background: O.flash === 'white' ? '#fff' : accent, opacity: 0.72 * (1 - (t - sceneStart) / 0.2) }} />
      )}
    </div>
  );
}

export type { DimensionBeat };
