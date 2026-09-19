// Motion for the property scenes — their cinematic helpers, read from the public planner their
// site ships and re-implemented here. Times in SECONDS (their unit), distances in em or their
// 1080-wide px (the scene scales them by width / 1080). Pure.

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
export const smooth = (x: number): number => { const t = clamp01(x); return t * t * (3 - 2 * t); };

export type MotionKind = 'fall' | 'rise' | 'settle';

export interface CinematicMotion { opacity: number; y: number; scale: number; blur: number }

/** A word's entrance: opacity up over the first 28% of the ramp, a drop (fall) or lift (rise) of
 *  62px easing to rest (16px for settle), a 7% grow, a 3px blur over the first third. */
export function cinematicMotion(t: number, dur = 0.42, kind: MotionKind = 'fall'): CinematicMotion {
  const p = clamp01(t / Math.max(0.08, dur));
  const o = p * p * (3 - 2 * p);
  return {
    opacity: t < 0 ? 0 : clamp01(p / 0.28),
    y: p >= 1 ? 0 : (kind === 'rise' ? 1 : -1) * (kind === 'settle' ? 16 : 62) * (1 - o),
    scale: 1 - 0.07 * (1 - o),
    blur: t >= 0 && p < 0.34 ? 3 * (1 - p / 0.34) : 0,
  };
}

/** A headline's shiver for the first .36s when its moment asks for jitter. */
export function cinematicJitter(t: number): { x: number; rotation: number } {
  if (t < 0 || t >= 0.36) return { x: 0, rotation: 0 };
  const p = t / 0.36, k = (1 - p) ** 2;
  return { x: 9 * Math.sin(p * Math.PI * 6) * k, rotation: 0.9 * Math.sin(p * Math.PI * 4) * k };
}

export const storyMotion = (t: number, dur = 0.42): CinematicMotion => cinematicMotion(t, dur);

/** A headline word falls in over 24-62% of its remaining time, 1.4x the usual drop. */
export function storyHeadlineWordMotion(word: { start: number }, t: number, end: number, entrance: MotionKind = 'fall'): CinematicMotion {
  const dur = Math.min(0.62, Math.max(0.24, (end - word.start) * 0.6));
  const m = cinematicMotion(t - word.start, dur, entrance);
  return { ...m, y: 1.4 * m.y };
}

export type SupportKind = 'slide' | 'fade' | 'type' | 'bounce';
export interface SupportMotion { opacity: number; x: number; y: number; clipPath?: string }

/** A supporting word's entrance: a slide from a direction (or from the lead/tail side), a fade,
 *  a type-on clip, or a bounce riding the rise. */
export function supportingWordMotion(
  word: { start: number; text: string }, t: number, end: number, kind: SupportKind, side: 'lead' | 'tail' = 'tail',
  opts?: { direction?: 'right' | 'left' | 'up' | 'down'; distanceEm?: number; duration?: number },
): SupportMotion {
  const span = Math.max(0.03, end - word.start);
  const dur = opts?.duration ? Math.max(0.08, opts.duration) : Math.min(0.46, Math.max(0.22, 0.65 * span));
  const d = clamp01((t - word.start) / dur);
  const u = d * d * (3 - 2 * d);
  const rise = cinematicMotion(t - word.start, dur, 'rise');
  const chars = Math.max(1, Array.from(word.text).length);
  const typed = Math.ceil(d * chars) / chars;
  const dist = (opts?.distanceEm ?? 0.72) * (1 - u);
  const dir = opts?.direction;
  return {
    opacity: t < word.start ? 0 : kind === 'type' ? 1 : kind === 'fade' ? u : clamp01(d / 0.45),
    x: kind === 'slide' ? (dir ? (dir === 'right' ? -dist : dir === 'left' ? dist : 0) : (side === 'lead' ? -1 : 1) * 0.1 * (1 - u)) : 0,
    y: kind === 'slide' ? (d >= 1 ? 0 : dir ? (dir === 'up' ? dist : dir === 'down' ? -dist : 0) : -0.72 * (1 - u)) : kind === 'bounce' ? rise.y / 180 : 0,
    clipPath: kind === 'type' && d < 1 ? `inset(-30% ${100 * (1 - typed)}% -40% -6%)` : undefined,
  };
}

export interface SlotFrame<W> { words: W[]; index: number; end: number; outgoing: boolean; opacity: number; yEm: number }

/** Which group is up at `t`, and the one on its way out: a group holds until the next begins,
 *  then leaves over 8-16% of the following gap, fading on a cube and dropping .62em. */
export function phraseSlotFrames<W extends { start: number }>(groups: W[][], t: number, end: number): SlotFrame<W>[] {
  return groups.flatMap((g, i) => {
    if (!g.length) return [];
    const start = g[0].start;
    const next = groups[i + 1]?.[0]?.start ?? end;
    const out = Math.min(0.16, Math.max(0.08, ((groups[i + 2]?.[0]?.start ?? end) - next) * 0.55));
    if (t < start || t >= Math.min(end, next + out)) return [];
    const outgoing = t >= next;
    const d = outgoing ? clamp01((t - next) / out) : 0;
    return [{ words: g, index: i, end: next, outgoing, opacity: (1 - d) ** 3, yEm: d * d * (3 - 2 * d) * 0.62 }];
  });
}

export interface StoryBeat<W> { words: W[]; start: number; end: number }

/** A 'replace' headline plays word by word: an opening "I / we / you" pairs with its next word,
 *  and a closing "my / your / our / their ... own" stays whole. */
export function storyReplacementBeats<W extends { start: number; text: string }>(words: W[], end: number): StoryBeat<W>[] {
  const norm = (s: string) => s.toLowerCase().replace(/^[^\p{L}\p{N}$₹£€]+|[^\p{L}\p{N}%]+$/gu, '');
  const beats: W[][] = [];
  for (let i = 0; i < words.length;) {
    const n = norm(words[i].text);
    const rest = words.slice(i);
    if (rest.length <= 3 && rest.some((w) => /^(my|your|our|their)$/.test(norm(w.text))) && norm(rest[rest.length - 1].text) === 'own') {
      beats.push([...rest]);
      break;
    }
    if (i === 0 && /^(i|we|you)$/.test(n) && words[i + 1]) { beats.push([words[i], words[i + 1]]); i += 2; }
    else { beats.push([words[i]]); i++; }
  }
  return beats.map((b, i) => ({ words: b, start: b[0].start, end: Math.min(end, beats[i + 1]?.[0]?.start ?? end) }));
}

export interface SlideFrame<W> extends StoryBeat<W> { outgoing: boolean; xEm: number; yEm: number; opacity: number; blur: number }

/** The beat on screen at `t`: sliding in from the left (.8em, blurred), then out to the right. */
export function storySlideFrames<W extends { start: number; text: string }>(beats: StoryBeat<W>[], t: number, end: number): SlideFrame<W>[] {
  return beats.flatMap((b, i) => {
    const inDur = Math.min(0.42, Math.max(0.18, (b.end - b.start) * 0.65));
    const outDur = Math.min(0.16, Math.max(0.08, ((beats[i + 1]?.end ?? end) - b.end) * 0.6));
    if (t < b.start || t >= Math.min(end, b.end + outDur)) return [];
    const outgoing = t >= b.end;
    const s = clamp01((t - (outgoing ? b.end : b.start)) / (outgoing ? outDur : inDur));
    const c = s * s * (3 - 2 * s);
    return [{ ...b, outgoing, xEm: outgoing ? 0.32 * c : -0.8 * (1 - c), yEm: 0, opacity: outgoing ? 1 - s : Math.min(1, 2.5 * s), blur: outgoing ? 1.5 * s : 2 * (1 - c) }];
  });
}

/** The lead words above a headline once it is up: an opening "if / when / unless / because" drops. */
export function storyHeadlineLeadAtTime<W extends { text: string }>(lead: W[], t: number, headlineStart: number): W[] {
  const norm = (s: string) => s.toLowerCase().replace(/^[^\p{L}\p{N}$₹£€]+|[^\p{L}\p{N}%]+$/gu, '');
  return lead.length > 1 && t >= headlineStart && /^(if|when|unless|because)$/.test(norm(lead[0].text)) ? lead.slice(1) : [...lead];
}
