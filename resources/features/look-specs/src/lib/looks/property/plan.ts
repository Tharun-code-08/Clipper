// The property scenes' planners — their agent-story plan and phrase roles, read from the public
// planner their site ships and re-implemented here. Times in seconds. Pure.
//
// An agent-story caption is one MOMENT: a headline (the word that matters, huge behind the head),
// an amount (a figure with its unit), support (everything else, small and white), and sometimes
// an icon (phone, door, degree, repair, money, calendar) or a focus (the brackets and blur when an
// agent stops/counters/offers). A headline of everything ('replace') plays word by word.

export interface StoryWord { id: string; text: string; start: number; end: number; emphasisTier?: number; emphasis?: boolean }

export type StoryIcon = 'phone' | 'door' | 'degree' | 'repair' | 'money' | 'calendar';

export interface AgentStoryPlan<W extends StoryWord = StoryWord> {
  headline: W[];
  headlineMode: 'hold' | 'replace';
  amount: W[];
  support: W[];
  icon: StoryIcon | null;
  focus: boolean;
  italic: boolean;
  numberStyle: 'solid' | 'outline';
  entrance?: 'fall' | 'rise' | 'settle';
  accentMotion?: 'jitter';
  anchorIds?: string[];
  replacementGroups?: { wordIds: string[] }[];
}

export const normStory = (s: string): string => s.toLowerCase().replace(/^[^\p{L}\p{N}$₹£€]+|[^\p{L}\p{N}%]+$/gu, '');
const normTight = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const HEADLINE_WORDS = new Set(['buyer', 'buyers', 'seller', 'sellers', 'agent', 'agents', 'negotiation', 'negotiating', 'lying', 'dollar', 'dollars',
  'bachelor', 'bachelors', "bachelor's", 'deal', 'home', 'house', 'property', 'offer', 'investment']);
const ICONS: [RegExp, StoryIcon][] = [
  [/^(phone|calling|calls|telephone)$/, 'phone'], [/^(door-to-door|door|doors)$/, 'door'], [/^(bachelor'?s?|degree|college|university)$/, 'degree'],
  [/^(repair|repairs|renovation|maintenance)$/, 'repair'], [/^(cost|costs|commission)$/, 'money'], [/^(timeline|timelines|deadline|closing)$/, 'calendar'],
];
const UNIT = /^(k|m|million|millions|thousand|lakh|lakhs|crore|crores|dollars?|rupees?|percent|%)$/;
const FIGURE = /(?:[$₹£€]|\d[\d,.]*[km%]$)/i;

export function planAgentStory<W extends StoryWord>(words: W[]): AgentStoryPlan<W> {
  const t = words.filter((w) => w.text.trim());
  const r = t.map((w) => normStory(w.text));
  const focus = r.includes('agent') && r.some((x) => /^(stops?|counter|offer)$/.test(x)) && !r.includes('buyer');
  const icon = focus ? null : ICONS.find(([re]) => r.some((x) => re.test(x)))?.[1] ?? null;
  const ai = t.findIndex((w, i) => /\d/.test(w.text) && (FIGURE.test(w.text)
    || r.slice(Math.max(0, i - 2), i + 3).some((x) => /^(paid|price|equity|income|under|over|asking|cost|worth|percent)$/.test(x) || UNIT.test(x))));
  const amount: W[] = [];
  if (ai >= 0) { amount.push(t[ai]); if (r[ai + 1] && UNIT.test(r[ai + 1])) amount.push(t[ai + 1]); }
  let headline: W[] = [];
  const moved = r.findIndex((x, i) => /^(moved|move)$/.test(x) && r[i + 1] === 'in');
  const own = r.findIndex((x, i) => x === 'my' && r[i + 1] === 'own');
  if (!focus && (!icon || icon === 'degree')) {
    if (moved >= 0) headline = t.slice(moved, moved + 2);
    else if (own >= 0) headline = t.slice(Math.max(0, own - 1), own + 2);
    else {
      const marked = t.find((w) => w.emphasisTier === 2 && !/\d/.test(w.text) && normStory(w.text).length > 2);
      const pick = t.find((w) => HEADLINE_WORDS.has(normStory(w.text))) ?? marked;
      if (pick && !amount.some((w) => w.id === pick.id)) headline = [pick];
    }
  }
  const replace = !focus && !icon && !amount.length && ((own >= 0 && t.length <= 12) || (r.includes('lying') && t.length <= 6));
  if (replace) headline = [...t];
  const used = new Set([...headline, ...amount].map((w) => w.id));
  // Their scene takes its anchors from an authored plan (anchorIds), which their footage shows on
  // the content word just before the headline: "Imagine the | asking | price" sets "asking"
  // mid-frame with "is" sliding in beside it, while "Imagine the" stays the lead. With no author
  // here, that word is the anchor when at least one lead word precedes it.
  const support = t.filter((w) => !used.has(w.id));
  let anchorIds: string[] | undefined;
  if (headline.length && !replace) {
    const before = support.filter((w) => w.start < headline[0].start);
    const last = before[before.length - 1];
    if (before.length >= 2 && last && !/^(i|a|an|the|and|or|but|my|your|our|is|are|was|to|of|in|on|for|at|if|you|it|this|that|with|from|me|we|have|has|its)$/i.test(normStory(last.text))) anchorIds = [last.id];
  }
  return {
    headline, headlineMode: replace ? 'replace' : 'hold', amount, support, icon, focus, ...(anchorIds ? { anchorIds } : {}),
    italic: !r.includes('lying') && (headline.length > 1 || headline.some((w) => /negotiat|bachelor|deal/.test(normStory(w.text)))),
    numberStyle: r.some((x) => /^(equity|income|worth)$/.test(x)) ? 'solid' : 'outline',
  };
}

/** An agent-story run ends before a conjunction, before a word that names a different icon than
 *  the run's, or once the run has crossed 4.2s — never under three words. */
export function agentStoryBreakBefore<W extends StoryWord>(run: W[], next: W): boolean {
  if (run.length < 3) return false;
  const n = normStory(next.text);
  if (/^(and|but|if|when|because|unless)$/.test(n)) return true;
  const icon = ICONS.find(([re]) => re.test(n))?.[1];
  const plan = planAgentStory(run);
  return (!!icon && !!plan.icon && icon !== plan.icon) || next.start - run[0].start > 4.2;
}

// ── phrase roles: the anchor, its lead, and the tail in groups ──────────────────────────────
export interface PhraseRolesOpts { anchorIds?: string[]; replacementGroups?: { wordIds: string[] }[]; entrance?: string }
export interface PhraseRoles<W> { anchor: W[]; lead: W[]; groups: W[][] }

const PHRASE_STOP = /^(i|a|an|the|and|or|but|my|your|our|is|are|was|to|of|in|on|for|at|if|you|it|this|that|with|from|me|we|have|has|its|hai|ki|ka|ke|youre|youve|youll|theyre|thats|theres|im|ive|going|can|could|will|would|should|does|did|be|been)$/i;

export function phraseRoles<W extends StoryWord>(words: W[], roles?: PhraseRolesOpts, autoAnchor = true): PhraseRoles<W> {
  let anchor = words.filter((w) => roles?.anchorIds?.includes(w.id));
  if (!anchor.length) {
    const soft = words.findIndex((w, i) => normTight(w.text) === 'soft' && normTight(words[i + 1]?.text ?? '') === 'skill');
    const at = soft >= 0 ? soft : words.findIndex((w) => /^(paying|paid|deserves|qualified|build|bhot|wahi|units|project|projects|investment|income)$/.test(normTight(w.text)));
    if (at >= 0 && at < words.length - 1) anchor = words.slice(at, at + (soft >= 0 ? 2 : 1));
  }
  if (!anchor.length && autoAnchor && words.length >= 3) {
    const cand = words.slice(0, -1).filter((w) => !PHRASE_STOP.test(normTight(w.text)));
    const pick = cand.find((w) => w.emphasis || w.emphasisTier === 2) ?? cand[0];
    if (pick) anchor = [pick];
  }
  const lead = anchor.length ? words.filter((w) => w.start < anchor[0].start) : [];
  const rest = words.filter((w) => !anchor.some((a) => a.id === w.id) && !lead.some((l) => l.id === w.id) && (!anchor.length || w.start >= anchor[0].start));
  const groups: W[][] = [];
  if (roles?.replacementGroups?.length) {
    for (const g of roles.replacementGroups) {
      const ws = rest.filter((w) => g.wordIds.includes(w.id));
      if (ws.length) groups.push(ws);
    }
    const taken = new Set(groups.flat().map((w) => w.id));
    groups.push(...rest.filter((w) => !taken.has(w.id)).map((w) => [w]));
    groups.sort((a, b) => a[0].start - b[0].start);
  } else if (anchor.length) {
    for (let i = 0; i < rest.length; i++) {
      const w = rest[i], n = rest[i + 1];
      if (n && ((normTight(w.text) === 'full' && normTight(n.text) === 'price') || /^(for|with|my|your|our|in|on)$/.test(normTight(w.text)))) { groups.push([w, n]); i++; }
      else groups.push([w]);
    }
  } else {
    for (const w of rest) {
      const last = groups[groups.length - 1], lw = last?.[last.length - 1];
      if (!last || last.length >= 3 || (lw && (w.start - lw.end > 0.22 || /[.!?;,]$/.test(lw.text)))) groups.push([w]);
      else last.push(w);
    }
  }
  return { anchor, lead, groups };
}

export interface Choreography { hero: 'fall' | 'rise' | 'settle'; support: 'slide' | 'fade' | 'type' | 'bounce'; name: string }

export function phraseChoreography<W extends StoryWord>(words: W[], entrance?: string): Choreography {
  const loud = words.some((w) => w.emphasisTier === 2 || /!$/.test(w.text));
  const long = words.length >= 5;
  const hero = (entrance === 'fall' || entrance === 'rise' || entrance === 'settle') ? entrance : loud ? 'settle' : long ? 'fall' : 'rise';
  const support = loud ? 'bounce' : long ? 'slide' : words.length <= 2 ? 'fade' : 'type';
  return { hero, support, name: `${hero}-${support}` };
}

// ── reading room: how long a group needs on screen, and merging groups that cannot get it ──
export const CINEMATIC_READ_TAIL = 0.5;
export const readingTime = (words: { text: string }[]): number => Math.max(0.85, words.map((w) => w.text).join(' ').length / 20 + 0.2);

/** Where a caption's scene ends: its last word, plus up to half a second while nothing else speaks. */
export function cinematicReadingEnd<W extends StoryWord>(words: W[], all: W[]): number {
  if (!words.length) return 0;
  const last = words[words.length - 1].end;
  const ids = new Set(words.map((w) => w.id));
  const next = all.filter((w) => !ids.has(w.id) && w.start >= last).reduce((m, w) => Math.min(m, w.start), Infinity);
  return Math.max(last, Math.min(last + CINEMATIC_READ_TAIL, next - 0.06));
}

export function readableAnchorGroups<W extends StoryWord>(groups: W[][], end: number): W[][] {
  const out: W[][] = [];
  for (const g of groups) {
    if (!g.length) continue;
    const last = out[out.length - 1];
    if (last && last.length + g.length <= 4 && [...last, ...g].map((w) => w.text).join(' ').length <= 32
      && g[0].start - last[0].start < 0.42 && g[0].start - last[last.length - 1].end < 0.5 && !/[.!?]$/.test(last[last.length - 1].text)) last.push(...g);
    else out.push([...g]);
  }
  const n = out[out.length - 1], a = out[out.length - 2];
  if (n && a && end - n[0].start < 0.42 && a.length + n.length <= 4 && n[0].start - a[a.length - 1].end < 0.5 && !/[.!?]$/.test(a[a.length - 1].text)) { a.push(...n); out.pop(); }
  return out;
}

export function readableGroups<W extends StoryWord>(groups: W[][], end: number): W[][] {
  const out: W[][] = [];
  for (let i = 0; i < groups.length; i++) {
    const a = [...groups[i]];
    if (!a.length) continue;
    while (i + 1 < groups.length && groups[i + 1][0].start - a[0].start < readingTime(a)) {
      const n = groups[i + 1];
      if (/[.!?]$/.test(a[a.length - 1].text) || n[0].start - a[a.length - 1].end > 0.5 || a.length + n.length > 7
        || [...a, ...n].map((w) => w.text).join(' ').length > 44) break;
      a.push(...n); i++;
    }
    out.push(a);
  }
  if (out.length > 1) {
    const e = out[out.length - 1], a = out[out.length - 2];
    if (!/[.!?]$/.test(a[a.length - 1].text) && e[0].start - a[a.length - 1].end <= 0.5 && end - e[0].start < readingTime(e)
      && a.length + e.length <= 7 && [...a, ...e].map((w) => w.text).join(' ').length <= 44) { a.push(...e); out.pop(); }
  }
  return out;
}

export const replacementHasReadingRoom = <W extends StoryWord>(groups: W[][], end: number): boolean =>
  groups.length > 1 && groups.every((g, i) => (groups[i + 1]?.[0]?.start ?? end) - g[0].start >= readingTime(g));
