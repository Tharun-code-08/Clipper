/**
 * ONE ANIMATION PER MEANING — the other five kinds.
 *
 * "Same animation on all six is decoration. The difference between them is the product." That
 * line has been in the planning prompt from the start, and rendered on a real clip every kind
 * came back as the same board of labels fading up. `figure` was given an enforced treatment
 * first because it is the strongest signal; these are the rest of the table:
 *
 *   list        build it     — items arrive one at a time and earlier ones PERSIST
 *   concept     name it      — the term lands as an object, kicker above, held to be read twice
 *   comparison  place both   — two sides, one visibly preferred
 *   mechanism   represent it — parts in sequence; the structure IS the point, so it stays
 *   warning     mark it      — the claim lands INTACT, and only then is it struck
 *
 * Each one is a guarantee rather than a request, for the reason every other rule here is: the
 * model was asked in the prompt and did something else.
 *
 * These run AFTER the elements are read and before the device passes, so anything they add
 * (a strike, a side) is fitted and de-collided like everything else.
 */

import { textHeightPct, textWidthPct, type SceneDevice, type SceneElement } from './sceneSpec';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** How tall an item actually is, so a row of them can be spaced by what they occupy. */
const heightOf = (e: SceneElement) => (
  e.type === 'text' ? textHeightPct(e) : (e.h ?? 9) * (e.scale ?? 1)
);

/** Words set as TYPE. A bar carries a label but it is a graphic, not a line of copy. */
const linesOf = (els: SceneElement[]) => els.filter((e) => e.type === 'text' && e.text);

/** Measured: below this two items read as one arriving thing. */
const STEP_MS = 240;

/**
 * The things a viewer READS — whatever carries words, not just `type: "text"`.
 *
 * This was `type === 'text'` and it quietly gutted every treatment: real plans put their
 * labels in CHIPS, so a list of five chips looked like a list of zero items and the treatment
 * re-timed nothing. A chip with a word in it is content; a glow, a rule and a strike are not.
 */
const contentOf = (els: SceneElement[]) => els.filter(
  (e) => Boolean(e.text) && e.type !== 'rule' && e.type !== 'strike' && e.type !== 'glow',
);

/** Light and surfaces — what stays behind whatever the treatment keeps. */
const atmosphereOf = (els: SceneElement[]) => els.filter((e) => e.type === 'glow' && !e.text);

/**
 * BUILD IT. Items arrive one at a time and stay.
 *
 * The failure this fixes: every item arriving inside the first half-second, which reads as one
 * block appearing, and items whose exit fires early so the list has holes in it by the end.
 */
function buildList(els: SceneElement[], holdMs: number, rejected: string[]): void {
  const items = contentOf(els);
  if (items.length < 2) return;

  const last = Math.max(0, holdMs - 320);
  const step = Math.min(STEP_MS, Math.max(140, last / items.length));

  // A list ACCUMULATES DOWNWARD in one column — that shape is what tells a viewer more is
  // coming. Left-aligned at a common x, evenly spaced, so it reads as one growing thing
  // rather than four captions that happen to share a frame.
  const top = 24;
  let cursor = top;

  items.sort((a, b) => a.at - b.at).forEach((e, i) => {
    const h = heightOf(e);
    e.at = Math.min(Math.round(i * step), last);
    e.enter = 'rise';
    e.x = 50;
    // Walked down by each item's own height — a fixed step buries anything taller than a line.
    e.y = Math.min(cursor + h / 2, 74);
    cursor += h + 2.5;
    // A list that loses its earlier items is not a list — it is a sequence of replacements.
    e.exit = 'cut';
  });
  rejected.push(`a list was stacked and built one item at a time, ${Math.round(step)}ms apart`);
}

/**
 * NAME IT. The term is the object; the kicker labels it; it holds long enough to read twice.
 */
function nameConcept(els: SceneElement[], rejected: string[]): void {
  const items = contentOf(els);
  if (!items.length) return;

  /**
   * The term is TYPE — a concept is words.
   *
   * Rendered on a real clip, the model handed a "concept" moment a BAR labelled "ACCURACY"
   * and, because a bar carries text, the treatment promoted the bar as the term: a 7%-wide,
   * 30%-tall grey column standing where a word should be. A graphic can support a term; it
   * cannot be one.
   */
  const lines = linesOf(els);
  const pool = lines.length ? lines : items;
  const term = pool.slice().sort((a, b) => (b.text!.length - a.text!.length))[0];
  const kicker = pool.filter((e) => e !== term).sort((a, b) => a.at - b.at)[0];

  /**
   * THE TERM LANDS AS AN OBJECT.
   *
   * Rendered over a cutaway, a "lead"-sized term at y=71 was small red type down in the caption
   * zone, competing with the b-roll behind it — nothing about it said "this is the thing I am
   * naming". A naming card sets the term LARGE and centres the lockup, the same way the figure
   * moment promotes its number, and it sits on the light rather than below it.
   */
  const light = atmosphereOf(els)[0];
  term.size = pool.length <= 2 ? 'hero' : 'lead';
  term.at = kicker ? 120 : 0;
  term.enter = 'rise';
  term.exit = 'cut';
  term.x = 50;
  term.y = light ? light.y : 46;
  term.move = { ...term.move, scale: Math.max(term.move?.scale ?? 0, 0.04) };

  if (kicker) {
    kicker.size = 'kicker';
    kicker.at = 0;
    kicker.enter = 'fade';
    kicker.x = 50;
    // Above the term, which is where a naming lockup puts it.
    kicker.y = Math.max(6, term.y - heightOf(term) / 2 - 4);
  }

  /**
   * A CARD THAT NAMES IT — and nothing else on the card.
   *
   * Re-timing the term and its label while six other labels stayed put left a "concept" moment
   * that was a lockup buried in the board it was supposed to replace, and the strays kept their
   * own arrival times so the moment was still landing things 1.5s in. Naming a term means the
   * term is what is on screen.
   */
  const atmosphere = atmosphereOf(els);
  const dropped = els.length - atmosphere.length - (kicker ? 2 : 1);
  void light;
  if (dropped > 0) {
    const keep = new Set<SceneElement>([...atmosphere, term, ...(kicker ? [kicker] : [])]);
    els.length = 0;
    els.push(...keep);
    rejected.push(`a concept moment carried ${dropped} label(s) that were not the term — cleared them`);
  }

  rejected.push(`a new term was named — "${term.text}" lands as the object, its label above it`);
}

/**
 * A PANEL EXISTS TO HOLD SOMETHING — AND WHAT IT HOLDS IS THE FIGURE.
 *
 * Rendered from a real UI plan: a comparison came back as two 36x30 cards filled with the
 * support grey and NO text, with two labels floating above them, so the frame showed two large
 * empty rectangles captioned from outside. The treatment never touched the cards either,
 * because nothing without words counts as content, so they sat wherever the model dropped them.
 *
 * A panel, the number inside it and the word naming that number are ONE object. The figure
 * goes in big, its label sits under it, and both travel with the panel when the sides are
 * placed. A panel nobody had anything to put in is not a panel and goes.
 *
 * Returns true when it laid the comparison out, so the caller does not lay it out again.
 */
function dressPanels(els: SceneElement[], ar: number, rejected: string[]): boolean {
  const panels = els.filter((e) => (
    (e.type === 'card' || e.type === 'box') && !e.text && (e.w ?? 0) >= 18 && (e.h ?? 0) >= 12
  ));
  // Not `< 2`: a lone surface with nothing in it is still two-thirds of a grey rectangle, and
  // bailing early left exactly that on screen. Every empty panel is dropped first; only THEN
  // is there a question of whether what remains is a comparison.
  if (!panels.length) return false;

  const texts = els.filter((e) => e.type === 'text' && e.text);
  const hasDigits = (e: SceneElement) => /\d/.test(e.text ?? '');
  const gap = (a: SceneElement, b: SceneElement) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  const used = new Set<SceneElement>();
  const nearest = (pool: SceneElement[], p: SceneElement) => pool
    .filter((t) => !used.has(t))
    .sort((a, b) => gap(a, p) - gap(b, p))[0];

  // PASS 1 — every panel gets first refusal on a figure and a label, so a greedy panel cannot
  // take both of the other side's words.
  const held = new Map<SceneElement, SceneElement[]>();
  for (const p of panels) {
    const mine: SceneElement[] = [];
    const fig = nearest(texts.filter(hasDigits), p);
    if (fig) { used.add(fig); mine.push(fig); }
    const lab = nearest(texts.filter((t) => !hasDigits(t)), p);
    if (lab) { used.add(lab); mine.push(lab); }
    held.set(p, mine);
  }

  // A surface with nothing to hold goes, whether or not the rest makes a comparison.
  const empty = panels.filter((p) => !held.get(p)!.length);
  if (empty.length) {
    const keep = els.filter((e) => !empty.includes(e));
    els.length = 0;
    els.push(...keep);
    rejected.push(`${empty.length} panel(s) with nothing to hold were dropped`);
  }
  const live = panels.filter((p) => !empty.includes(p));
  if (live.length < 2) {
    // Not a panelled comparison after all. Every surface here was selected for having no words
    // of its own, so leaving one behind undressed leaves a grey rectangle on the frame — which
    // is what a real plan did with a single card and a stray "VS". The words it had claimed are
    // untouched and go on to be laid out as type.
    const keep = els.filter((e) => !panels.includes(e));
    if (keep.length !== els.length) {
      els.length = 0;
      els.push(...keep);
      rejected.push(`${panels.length} bare panel(s) could not make a comparison — dropped them and kept the words`);
    }
    return false;
  }

  /**
   * PASS 2 — LEFTOVERS BELONG TO THE PANEL THEY ARE STANDING ON.
   *
   * Rendered: a third label the model wrote inside the right panel's bounds was claimed by
   * nobody, so it stayed exactly where it was written and spilled out past the panel's edge.
   * A word sitting on a panel is part of that panel: it joins the stack, or — past a third
   * line, where a comparison has become a paragraph — it goes.
   */
  /**
   * A label belongs to the panel in whose COLUMN it stands — not to the panel whose box it
   * happens to be inside when this runs. By the time a treatment sees a scene the per-element
   * collision resolver has already moved things: measured, the stray label had been pushed from
   * y=54 to y=66.6, out of its panel's bounds, so a strict box test disowned exactly the label
   * it was written to adopt. The column still says which side it is on.
   */
  const belongsTo = (t: SceneElement, p: SceneElement) => (
    Math.abs(t.x - p.x) <= (p.w ?? 0) / 2 + 8 && Math.abs(t.y - p.y) <= 32
  );
  const homeless: SceneElement[] = [];
  for (const t of texts.filter((e) => !used.has(e))) {
    const host = live.find((p) => belongsTo(t, p));
    if (!host) continue;
    used.add(t);
    if (held.get(host)!.length < 3) held.get(host)!.push(t);
    else homeless.push(t);
  }
  if (homeless.length) {
    const keep = els.filter((e) => !homeless.includes(e));
    els.length = 0;
    els.push(...keep);
    rejected.push(`${homeless.length} line(s) past the third on a panel were dropped — that is a paragraph, not a comparison`);
  }

  // Wide frames set the sides beside each other; tall ones stack them.
  const sideBySide = ar > 1.2;
  live.forEach((p, i) => {
    p.w = clamp(p.w ?? 36, 24, 42);
    p.h = clamp(p.h ?? 28, 18, 34);
    p.x = sideBySide ? (i === 0 ? 28 : 72) : 50;
    p.y = sideBySide ? 45 : (i === 0 ? 32 : 68);
    p.at = i * 200;
    p.exit = 'cut';

    const mine = held.get(p)!;
    // Sized so the stack fits the panel, then centred in it. Nothing a panel holds may be
    // wider than the panel — that is what "inside" means.
    mine.forEach((e, n) => {
      e.size = n === 0 && hasDigits(e) ? 'lead' : mine.length === 1 ? 'lead' : 'kicker';
    });

    /**
     * THE STACK IS SIZED TO THE PANEL, UP AS WELL AS DOWN.
     *
     * Only ever shrinking to fit left two kicker-sized lines adrift in a 30x28 panel — legible,
     * and obviously an afterthought sitting in a mostly empty box. The panel was chosen at that
     * size for a reason, so the words grow into it until either its width or its height says
     * stop.
     */
    const roomW = p.w! - 5;
    const roomH = p.h! - 6;
    const widest = Math.max(...mine.map((e) => textWidthPct(e, ar)));
    const stackH = mine.reduce((a, e) => a + heightOf(e), 0) + 1.5 * (mine.length - 1);
    const fit = Math.min(widest > 0 ? roomW / widest : 1, stackH > 0 ? roomH / stackH : 1);
    const k = clamp(fit, 0.35, 2.6);
    for (const e of mine) e.scale = (e.scale ?? 1) * k;

    const heights = mine.map(heightOf);
    const total = heights.reduce((a, b) => a + b, 0) + 1.5 * (mine.length - 1);
    let cursor = p.y - total / 2;
    mine.forEach((e, n) => {
      e.x = p.x;
      e.y = cursor + heights[n] / 2;
      cursor += heights[n] + 1.5;
      e.z = (p.z ?? 0) + 2;
      e.at = p.at + 140 + n * 120;
      e.enter = n === 0 ? 'pop' : 'rise';
      e.exit = 'cut';
    });
  });

  // One side is preferred, and the accent is how a viewer is told which.
  for (const e of [...live, ...used]) e.color = 'ink';
  const winner = held.get(live[live.length - 1])!;
  (winner[0] ?? live[live.length - 1]).color = 'accent';

  const withFigures = live.filter((p) => held.get(p)!.some(hasDigits)).length;
  rejected.push(
    `a comparison was placed as ${live.length} panels`
    + (withFigures ? `, each holding its figure` : ', each holding its label')
    ,
  );
  return true;
}

/**
 * PLACE BOTH. Two sides, and one of them is visibly the answer.
 */
function placeComparison(els: SceneElement[], ar: number, rejected: string[]): void {
  // Panels first: when the model gave surfaces, the comparison IS those surfaces and what is
  // inside them, and laying the loose text out separately would pull it back off them.
  if (dressPanels(els, ar, rejected)) return;

  const items = contentOf(els);
  if (items.length < 2) return;

  const bars = items.filter((e) => e.type === 'bar');
  const lines = items.filter((e) => e.type !== 'bar');

  /**
   * WHEN THE SIDES ARE BARS, THE COMPARISON IS A CHART.
   *
   * Splitting the items down the middle and calling the halves "sides" only works when they
   * are lines of type. Given five bars and three lines it split BARS from LABELS — four
   * columns crammed into the left half at a 22% pitch, one stranded at the right edge, and the
   * copy pushed down into the caption band at y=89. Columns belong in one row, evenly spaced,
   * on a shared baseline; the copy sits underneath; and which side wins is said by the accent.
   */
  if (bars.length >= 2) {
    for (const e of bars) {
      e.w = Math.max(e.w ?? 7, 9);
      e.h = Math.max(e.h ?? 30, 24);
    }
    const tallest = Math.max(...bars.map(heightOf));
    const widest = Math.max(...bars.map((e) => (e.w ?? 9) * (e.scale ?? 1)));
    const labelled = Math.max(...bars.map((e) => (
      e.text ? textWidthPct({ ...e, type: 'text', size: 'body' }, ar) * 0.82 : 0
    )));

    // Spread across the frame, never wider than the room the labels need.
    const room = 78;
    const pitch = Math.min(room / Math.max(1, bars.length - 1), Math.max(widest + 3, labelled + 2));
    const baseline = 56;

    bars.forEach((e, i) => {
      e.x = 50 + (i - (bars.length - 1) / 2) * pitch;
      e.y = baseline - tallest / 2;
      e.at = i * 160;
      e.exit = 'cut';
    });

    // One side is preferred, and the accent is how a viewer is told which.
    for (const e of items) e.color = 'ink';
    bars[bars.length - 1].color = 'accent';

    // The copy goes under the labels — and only as much of it as there is room for. A
    // comparison explained in three sentences is not a comparison, it is a paragraph.
    let cursor = baseline + 9;
    const keep: SceneElement[] = [];
    for (const e of lines) {
      const h = heightOf(e);
      if (cursor + h > 72) break;
      e.x = 50;
      e.y = cursor + h / 2;
      e.at = (bars.length + keep.length) * 160;
      cursor += h + 2;
      keep.push(e);
    }
    for (const e of lines) {
      if (!keep.includes(e)) els.splice(els.indexOf(e), 1);
    }
    if (keep.length < lines.length) {
      rejected.push(`a comparison came with ${lines.length} lines of copy under its chart — kept ${keep.length}`);
    }
    rejected.push(`a comparison was drawn as ${bars.length} columns on one baseline, the last one preferred`);
    return;
  }

  // No bars: two sides of type. Wide frames put them beside each other, tall ones stack them —
  // two panels side by side on a 9:16 is what produces two columns of squeezed type.
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);
  if (!right.length) return;

  const sideBySide = ar > 1.2;
  const stack = (side: SceneElement[], x: number, top: number, from: number) => {
    let cursor = top;
    side.forEach((e, i) => {
      const h = heightOf(e);
      e.x = x;
      e.y = cursor + h / 2;
      e.at = from + i * 160;
      cursor += h + 3;
    });
    return cursor;
  };

  if (sideBySide) {
    stack(left, 27, 26, 0);
    stack(right, 73, 26, 420);
  } else {
    const end = stack(left, 50, 22, 0);
    stack(right, 50, Math.min(end + 4, 58), 420);
  }

  for (const e of items) e.color = 'ink';
  right[0].color = 'accent';
  rejected.push(`a comparison was placed as two sides${sideBySide ? ' side by side' : ', stacked'} — the second is the one preferred`);
}

/**
 * REPRESENT IT. Parts, in order. The structure is the point, so the device STAYS.
 */
function sequenceMechanism(els: SceneElement[], device: SceneDevice | undefined, rejected: string[]): void {
  const members = els.filter((e) => e.angle !== undefined);
  const parts = members.length >= 2 ? members : contentOf(els);
  if (parts.length < 2) return;

  const ordered = parts.sort((a, b) => (a.angle ?? a.at) - (b.angle ?? b.at));

  // A mechanism is a CHAIN, not a stack: parts run left to right in the order they happen, so
  // the sequence is legible as a sequence. On a device they already sit on its track and are
  // left where the structure put them — the structure IS the representation.
  const chain = !device && ordered.length > 1;
  const span = 76 / Math.max(1, ordered.length - 1);

  ordered.forEach((e, i) => {
    e.at = i * STEP_MS;
    e.enter = e.type === 'rule' || e.type === 'strike' ? 'draw' : 'pop';
    e.exit = 'cut';
    if (chain) {
      e.x = 12 + i * span;
      e.y = 46;
    }
  });
  rejected.push(
    device
      ? `a mechanism was played through its ${device.kind} in order, one part at a time`
      : 'a mechanism was played in order, one part at a time',
  );
}

/**
 * MARK IT. The claim lands INTACT and is only then struck.
 *
 * Striking it on arrival means the viewer never reads the thing being corrected, which is the
 * whole point of the beat. The strike is ADDED when the model forgot one — a myth moment with
 * no mark is just a sentence on screen.
 */
function markWarning(els: SceneElement[], holdMs: number, ar: number, rejected: string[]): void {
  const claim = contentOf(els).sort((a, b) => a.at - b.at)[0];
  if (!claim) return;

  claim.at = 0;
  claim.enter = claim.enter === 'none' ? 'rise' : claim.enter;

  // Long enough to be read before it is contradicted.
  const strikeAt = Math.min(Math.max(700, Math.round(holdMs * 0.42)), Math.max(0, holdMs - 500));

  const existing = els.find((e) => e.type === 'strike');
  const width = Math.min(88, Math.max(20, (claim.text?.length ?? 6) * 2.6 * (1.78 / Math.max(0.4, ar)) ));

  if (existing) {
    existing.at = strikeAt;
    existing.enter = 'draw';
    existing.x = claim.x;
    existing.y = claim.y;
  } else {
    els.push({
      type: 'strike', x: claim.x, y: claim.y, w: width, h: 1.4,
      color: 'accent', bg: 'none', border: 'none', rotate: 0, scale: 1,
      at: strikeAt, dur: 220, enter: 'draw', exit: 'cut', z: (claim.z ?? 0) + 1,
    });
    rejected.push(`a myth moment had nothing marking it — struck "${claim.text}" at ${strikeAt}ms`);
  }
  rejected.push(`the claim lands intact and is struck ${strikeAt}ms in, not on arrival`);
}

/** Apply the treatment this kind demands. `figure` is handled separately, before the device. */
export function applyKindTreatment(
  kind: string | undefined,
  els: SceneElement[],
  device: SceneDevice | undefined,
  holdMs: number,
  ar: number,
  rejected: string[],
): void {
  switch (kind) {
    case 'list': buildList(els, holdMs, rejected); break;
    case 'concept': nameConcept(els, rejected); break;
    case 'comparison': placeComparison(els, ar, rejected); break;
    case 'mechanism': sequenceMechanism(els, device, rejected); break;
    case 'warning': markWarning(els, holdMs, ar, rejected); break;
    default: break;
  }
}
