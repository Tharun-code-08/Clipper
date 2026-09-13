// ─── Interlock — the negative-space caption engine ───────────────────────────
// ONE template, TWO states:
//   • no emphasised word  → the plain caption (centred uppercase rows, Iman-Gadzhi-style)
//   • an emphasised word  → that word is set large in an italic serif, and the rest of the line
//     is placed into the empty strips its own letterforms leave behind.
//
// The whole layout is derived from MEASURED INK, never from font metrics or hand-placed offsets,
// so it works on text it has never seen. Four steps:
//   1. render the hero once offscreen and scan it column by column → its real ascender,
//      x-height and descender lines;
//   2. two strips are structurally empty — above the x-height (only b d f h k l t reach up) and
//      below the baseline (only g j p q y hang down);
//   3. set the small words as ONE readable line and walk it left to right, stepping the pen past
//      any tall letter it would hit, so that letter rises through the gap BETWEEN two words;
//   4. slide that line through candidate positions and keep the best-scoring one.
//
// Everything here is pure apart from the offscreen canvas used for measurement, and results are
// cached per (words, emphasis, size) so a frame-driven renderer measures once, not once a frame.

export const IL_SERIF     = '"Playfair Display", Georgia, serif';
export const IL_CAPS      = '"MontserratSemiBold", Montserrat, sans-serif';
export const IL_INK       = '#F7F4EE';
export const IL_CAPS_LS   = 0.045;   // caps tracking, em
const CAP_RATIO           = 0.700;   // Montserrat cap-height as a fraction of em
const BAND_FILL           = 0.66;    // caps fill this much of the ascender band
// The caps RIDE THE ASCENDER LINE rather than sitting at the x-height. This is the single thing
// that makes it read like the reference: sitting high, only the TALLEST letters interrupt the
// line, so it opens one deliberate gap instead of shattering into five.
const RIDE                = 0.30;
const AIR                 = 0.17;

export interface ILStyle {
  heroFont:  string;   // face for the emphasised word
  capsFont:  string;   // face for the small words
  capsMul:   number;   // caps size dial
  tracking:  number;   // caps letter-spacing, em
  nest:      boolean;  // flow into the gaps, or keep the small words clear of the word
  uppercase: boolean;
}
export const IL_STYLE_DEFAULT: ILStyle = {
  heroFont: IL_SERIF, capsFont: IL_CAPS, capsMul: 1, tracking: IL_CAPS_LS, nest: true, uppercase: true,
};
export const heroFont = (px: number, s: ILStyle = IL_STYLE_DEFAULT) => `italic 500 ${px}px ${s.heroFont}`;
export const capsFont = (px: number, s: ILStyle = IL_STYLE_DEFAULT) => `600 ${px}px ${s.capsFont}`;

/**
 * How far below a span's top edge its text baseline falls, with `line-height: 1`.
 *
 * The engine works in baselines. A DOM span does NOT put its baseline on its bottom edge — it
 * sits `(px - (ascent + descent)) / 2 + ascent` down from the top, which for Playfair at 71px is
 * six pixels away from the box bottom and for the caps at 13px is under two. Placing both by
 * `translateY(-100%)` therefore lifted the hero further than the caps and silently ate the
 * clearance the engine had measured — the ascender of an italic "p" came up through the caps
 * line. Position every span by this instead.
 */
const _bl = new Map<string, number>();
export function baselineFromTop(px: number, hero: boolean, S: ILStyle = IL_STYLE_DEFAULT): number {
  const key = `${Math.round(px * 100)}|${hero}|${hero ? S.heroFont : S.capsFont}`;
  const hit = _bl.get(key);
  if (hit !== undefined) return hit;
  const m0 = mc();
  let out = px * 0.86;
  if (m0) {
    m0.font = hero ? heroFont(px, S) : capsFont(px, S);
    m0.letterSpacing = '0px';
    const m = m0.measureText('Hxg');
    const a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent;
    if (a && d) out = (px - (a + d)) / 2 + a;
  }
  if (_bl.size > 300) _bl.clear();
  _bl.set(key, out);
  return out;
}

export interface ILItem { kind: 'hero' | 'caps'; t: string; x: number; y: number; wi: number }
export interface ILBox  { x0: number; y0: number; x1: number; y1: number; w: number; h: number }
export interface ILLayout {
  items:   ILItem[];
  capsPx:  number;
  capH:    number;
  F:       number;
  plain:   boolean;
  heroIdx: number;
  bbox:    ILBox;
}

/* ── measurement ─────────────────────────────────────────────────────────── */
let _mc: CanvasRenderingContext2D | null = null;
function mc(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!_mc) _mc = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  return _mc;
}

interface Profile {
  W: number; H: number; ox: number; oy: number; px: Uint8ClampedArray;
  A: number; D: number; xH: number; inkL: number; inkR: number;
}

function inkProfile(text: string, F: number, S: ILStyle): Profile | null {
  const m0 = mc();
  if (!m0) return null;
  m0.font = heroFont(F, S);
  m0.letterSpacing = '0px';
  const m = m0.measureText(text);
  const L = m.actualBoundingBoxLeft, R = m.actualBoundingBoxRight;
  const A = m.actualBoundingBoxAscent, D = Math.max(m.actualBoundingBoxDescent, 1);
  const xH = m0.measureText('x').actualBoundingBoxAscent || A * 0.62;
  const PAD = Math.ceil(F * 1.5);
  const W = Math.ceil(L + R) + PAD * 2, H = Math.ceil(A + D) + PAD * 2;
  if (W <= 0 || H <= 0 || W > 8000 || H > 8000) return null;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.font = heroFont(F, S);
  ctx.fillStyle = '#fff';
  const ox = PAD + L, oy = PAD + A;
  ctx.fillText(text, ox, oy);
  return { W, H, ox, oy, px: ctx.getImageData(0, 0, W, H).data, A, D, xH, inkL: -L, inkR: R };
}

/** columns carrying ink anywhere inside a horizontal band (local y coords) */
function bandBusy(p: Profile, yTop: number, yBot: number): Uint8Array {
  const busy = new Uint8Array(p.W);
  const y0 = Math.max(0, Math.floor(p.oy + yTop)), y1 = Math.min(p.H - 1, Math.ceil(p.oy + yBot));
  for (let x = 0; x < p.W; x++)
    for (let y = y0; y <= y1; y++)
      if (p.px[(y * p.W + x) * 4 + 3] > 45) { busy[x] = 1; break; }
  return busy;
}

/** the INK clusters inside a band, each widened by `pad` so clearance is structural */
function runsOfInk(p: Profile, yTop: number, yBot: number, pad: number): Array<[number, number]> {
  const busy = bandBusy(p, yTop, yBot);
  const runs: Array<[number, number]> = [];
  let s = -1;
  for (let x = 0; x <= p.W; x++) {
    const on = x < p.W && !!busy[x];
    if (on && s < 0) s = x;
    if (!on && s >= 0) { runs.push([s - p.ox, x - 1 - p.ox]); s = -1; }
  }
  return runs.filter(([a, b]) => b - a >= 1).map(([a, b]) => [a - pad, b + pad] as [number, number]);
}

/** exact pixel test — the final word on whether a box touches the hero's ink */
function inkInBox(p: Profile, x0: number, x1: number, y0: number, y1: number): boolean {
  const a = Math.max(0, Math.floor(p.ox + x0)), b = Math.min(p.W - 1, Math.ceil(p.ox + x1));
  const c = Math.max(0, Math.floor(p.oy + y0)), d = Math.min(p.H - 1, Math.ceil(p.oy + y1));
  for (let x = a; x <= b; x++)
    for (let y = c; y <= d; y++)
      if (p.px[(y * p.W + x) * 4 + 3] > 40) return true;
  return false;
}

/**
 * Chromium only gained CanvasRenderingContext2D.letterSpacing in version 99. The After Effects / Premiere
 * 2023 panel runs Chromium 88 (CEP 11.5), where assigning it silently does nothing — so every small word
 * measured short by its own tracking and the caps were flowed up to ~26px (at 1080p) tighter than the
 * browser then drew them. Detected on the PROTOTYPE: assigning the property first plants an own expando
 * on the context, after which an `in` check on the context itself lies.
 */
const CANVAS_LETTER_SPACING = typeof CanvasRenderingContext2D !== 'undefined'
  && 'letterSpacing' in CanvasRenderingContext2D.prototype;

/** Advance width of `text` with `lsPx` of tracking between its characters (none after the last). */
export function trackedTextWidth(
  ctx: { measureText(t: string): { width: number }; letterSpacing?: string },
  text: string, lsPx: number, canvasSpacing: boolean = CANVAS_LETTER_SPACING,
): number {
  if (canvasSpacing) {
    ctx.letterSpacing = lsPx.toFixed(2) + 'px';
    const w = ctx.measureText(text).width - lsPx;
    ctx.letterSpacing = '0px';
    return w;
  }
  return ctx.measureText(text).width + lsPx * Math.max(0, Array.from(text).length - 1);
}

export function capsWidth(t: string, px: number, S: ILStyle = IL_STYLE_DEFAULT): number {
  const m0 = mc();
  if (!m0) return t.length * px * 0.62;
  m0.font = capsFont(px, S);
  return trackedTextWidth(m0, S.uppercase ? t.toUpperCase() : t, S.tracking * px);
}

/* ── placement ───────────────────────────────────────────────────────────── */
interface Placed { t: string; wi: number; x: number; w: number }
interface Line { placed: Placed[]; x0: number; x1: number; w: number; maxGap: number; coverage?: number; }

/** set the words as one line, stepping the pen past any tall letter it would hit */
function flowLine(list: Array<{ t: string; wi: number }>, capsPx: number,
                  clusters: Array<[number, number]>, X0: number, gap: number, S: ILStyle): Line {
  const placed: Placed[] = [];
  let pen = X0;
  for (const wd of list) {
    const w = capsWidth(wd.t, capsPx, S);
    for (let guard = 0; guard < 40; guard++) {
      const hit = clusters.find(([c0, c1]) => c1 > pen && c0 < pen + w);
      if (!hit) break;
      pen = hit[1];                                  // step past the letter, reopening the gap
    }
    placed.push({ t: wd.t, wi: wd.wi, x: pen, w });
    pen += w + gap;
  }
  const a = placed[0].x, b = placed[placed.length - 1].x + placed[placed.length - 1].w;
  let maxGap = 0;
  for (let i = 1; i < placed.length; i++)
    maxGap = Math.max(maxGap, placed[i].x - (placed[i - 1].x + placed[i - 1].w));
  return { placed, x0: a, x1: b, w: b - a, maxGap };
}

/** a line's WEIGHT against the hero decides its shape: light hugs a corner, heavy spans */
function lineWeight(natural: number, heroW: number) {
  return Math.max(0, Math.min(1, (natural / heroW - 0.34) / 0.52));
}

/** slide the line and score it: stay tight, stay true to its edge, and stay ACROSS the hero */
function bestLine(list: Array<{ t: string; wi: number }>, capsPx: number,
                  clusters: Array<[number, number]>, heroL: number, heroR: number,
                  gap: number, side: 'left' | 'right', natural: number, S: ILStyle): Line {
  const heroW = heroR - heroL, heroC = (heroL + heroR) / 2;
  const wgt = lineWeight(natural, heroW);
  const corner  = side === 'right' ? heroR + heroW * 0.03 : heroL - heroW * 0.03;
  const spanned = side === 'right' ? heroC + natural / 2  : heroC - natural / 2;
  const target = corner + (spanned - corner) * wgt;
  const lo = heroL - heroW * 0.55, hi = heroR + heroW * 0.10;
  let best: (Line & { cost: number }) | null = null;
  for (let i = 0; i <= 84; i++) {
    const r = flowLine(list, capsPx, clusters, lo + (hi - lo) * (i / 84), gap, S);
    const overlap = Math.min(r.x1, heroR) - Math.max(r.x0, heroL);
    const coverage = Math.max(0, overlap) / Math.max(1, Math.min(r.w, heroW));
    const anchor = side === 'right' ? Math.abs(r.x1 - target) : Math.abs(r.x0 - target);
    const cost = anchor + (r.w - natural) * 0.42 + r.maxGap * 0.55 + (1 - coverage) * heroW * 2.2;
    if (!best || cost < best.cost) best = Object.assign(r, { cost, coverage });
  }
  return best!;
}

/** nudge the whole line clear of the hero until the pixels agree nothing touches.
 *  null means it never cleared — the caller must NOT ship that line as a nesting. */
function settleLine(p: Profile, placed: Placed[], yBase: number, capH: number,
                    dir: number, step: number): number | null {
  let y = yBase;
  for (let i = 0; i < 22; i++) {
    const hit = placed.some(q => inkInBox(p, q.x - capH * 0.16, q.x + q.w + capH * 0.16,
                                          y - capH * 1.26, y + capH * 0.22));
    if (!hit) return y;
    y += dir * step;
  }
  return null;
}

interface PlacedLine { placed: Placed[]; x0: number; x1: number; y: number; nested: boolean }

/** nest the line in the band; if that reads as broken, set a clean line clear of the word */
function placeLine(list: Array<{ t: string; wi: number }>, capsPx: number, p: Profile,
                   capH: number, side: 'left' | 'right', gap: number, hasBand: boolean, S: ILStyle): PlacedLine {
  const heroL = p.inkL, heroR = p.inkR, heroW = heroR - heroL, heroC = (heroL + heroR) / 2;
  const pad = capsPx * 0.30;
  const natural = list.reduce((s, w, i) => s + capsWidth(w.t, capsPx, S) + (i ? gap : 0), 0);

  if (hasBand && S.nest) {
    const yBand = side === 'left' ? -p.A + capH * RIDE
                                  : Math.max(p.D + capH * (0.20 + AIR), capH * (1.35 + AIR));
    const clusters = runsOfInk(p, yBand - capH - capsPx * 0.10, yBand + capsPx * 0.10, pad);
    const line = bestLine(list, capsPx, clusters, heroL, heroR, gap, side, natural, S);
    // reject only what genuinely reads as broken: drifted off the hero, or one cavernous hole
    if ((line.coverage ?? 0) >= 0.60 && line.maxGap <= capsPx * 3.2) {
      const y = settleLine(p, line.placed, yBand, capH, side === 'left' ? -1 : 1, capsPx * 0.06);
      // a nesting the pixels never cleared is a collision — fall through and set a clean line
      if (y !== null) return { placed: line.placed, x0: line.x0, x1: line.x1, y, nested: true };
    }
  }
  const wgt = lineWeight(natural, heroW);
  const corner  = side === 'right' ? heroR + heroW * 0.03 : heroL - heroW * 0.03;
  const spanned = side === 'right' ? heroC + natural / 2  : heroC - natural / 2;
  const edge = corner + (spanned - corner) * wgt;
  let x = side === 'right' ? edge - natural : edge;
  const placed: Placed[] = [];
  for (const w of list) { const ww = capsWidth(w.t, capsPx, S); placed.push({ t: w.t, wi: w.wi, x, w: ww }); x += ww + gap; }
  // the trailing line must clear the descenders entirely: its top edge sits below them
  const y0 = side === 'left' ? -p.A - capH * 0.55 : Math.max(p.D, capH * 0.5) + capH * 1.55;
  const y = settleLine(p, placed, y0, capH, side === 'left' ? -1 : 1, capsPx * 0.10) ?? y0;
  return { placed, x0: placed[0].x, x1: x - gap, y, nested: false };
}

/* ── the plain state: no emphasis ────────────────────────────────────────── */
// Real caption lines run ~4 words, so they belong on ONE line. Only "2 Lines" splits them.
function layoutPlain(words: string[], F: number, S: ILStyle, lines: 'single' | 'double'): ILLayout {
  const capsPx = F * 0.34 * S.capsMul, capH = capsPx * CAP_RATIO, gap = capsPx * 0.62;
  const rows: string[][] = (lines === 'single' || words.length <= 3) ? [words] : (() => {
    let split = 1, diff = Infinity;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(' ').length, b = words.slice(k).join(' ').length;
      if (Math.abs(a - b) < diff) { diff = Math.abs(a - b); split = k; }
    }
    return [words.slice(0, split), words.slice(split)];
  })();
  const items: ILItem[] = [];
  let wi = 0, y = 0;
  const widths = rows.map(r => r.reduce((s, w, i) => s + capsWidth(w, capsPx, S) + (i ? gap : 0), 0));
  const W = Math.max(...widths);
  rows.forEach((r, ri) => {
    let x = -widths[ri] / 2;
    for (const w of r) { items.push({ kind: 'caps', t: w, x, y, wi: wi++ }); x += capsWidth(w, capsPx, S) + gap; }
    y += capH * 1.62;
  });
  const h = capH + capH * 1.62 * (rows.length - 1);
  return { items, capsPx, capH, F, plain: true, heroIdx: -1,
           bbox: { x0: -W / 2, y0: -capH, x1: W / 2, y1: h - capH, w: W, h } };
}

/* ── the whole layout ────────────────────────────────────────────────────── */
const _cache = new Map<string, ILLayout | null>();

/**
 * Drop every memo. Call this once the web fonts have loaded: the whole layout is measured from
 * the hero's rasterised glyphs, so anything computed while Playfair was still falling back to
 * Georgia describes a word that is no longer on screen — the small words then sit where the
 * FALLBACK's letters left room and collide with the real ones.
 */
export function ilClearCache() { _cache.clear(); _bl.clear(); }

/**
 * `boxW` is the caption box in the same units as `F`. The type size is DELIBERATELY NOT fitted
 * up to fill it — a caption that grew to fill every box would change size on every line, which
 * reads as jitter in a video. The hero renders at `F` and the engine only ever shrinks, and only
 * when the composition genuinely overflows.
 */
export function interlockLayout(
  words: string[], emphIdx: number, F: number,
  boxW = Infinity, lines: 'single' | 'double' = 'single', S: ILStyle = IL_STYLE_DEFAULT,
): ILLayout | null {
  if (!words.length) return null;
  const key = `${words.join('')}|${emphIdx}|${Math.round(F)}|${Math.round(boxW)}|${lines}|` +
    `${S.heroFont}|${S.capsFont}|${S.capsMul}|${S.tracking}|${S.nest}|${S.uppercase}`;
  const hit = _cache.get(key);
  if (hit !== undefined) return hit;

  let out = build(words, emphIdx, F, lines, S);
  // shrink-to-fit — never grow. Two passes are enough: width is near-linear in F.
  for (let i = 0; i < 2 && out && out.bbox.w > boxW; i++)
    out = build(words, emphIdx, out.F * (boxW / out.bbox.w) * 0.99, lines, S);

  if (_cache.size > 400) _cache.clear();
  _cache.set(key, out);
  return out;
}

function build(words: string[], emphIdx: number, F: number,
               lines: 'single' | 'double', S: ILStyle): ILLayout | null {
  if (emphIdx < 0 || emphIdx >= words.length) return layoutPlain(words, F, S, lines);
  const hero = words[emphIdx];
  const p = inkProfile(hero, F, S);
  if (!p) return layoutPlain(words, F, S, lines);   // no canvas (SSR): degrade to the plain state
  const heroW = p.inkR - p.inkL;
  const band = Math.max(0, p.A - p.xH);
  // A band only counts if a line can actually LIVE in it. The italic "p" of "process" clears the
  // x-height by a hair; nesting there forces microscopic caps that the flag still pierces. Below
  // this the lead line sets clean above the word — the same look the reference gives a hero with
  // no ascender at all.
  const hasBand = band > F * 0.16;
  const lead  = words.slice(0, emphIdx).map((t, i) => ({ t, wi: i }));
  const trail = words.slice(emphIdx + 1).map((t, i) => ({ t, wi: emphIdx + 1 + i }));

  // Starting size comes from the band; the size that SHIPS is whatever lets the words fit between
  // the hero's tall letters. A line that refuses to nest means the caps are too big for the gaps
  // that word offers — so shrink and re-flow. Caps size is an output, not a constant.
  let capsPx = Math.max(F * 0.075, Math.min(F * 0.25,
      (hasBand ? band * BAND_FILL : F * 0.125) / CAP_RATIO)) * S.capsMul;
  let best: { items: ILItem[]; capH: number; capsPx: number; nestedAll: boolean; tidy: boolean } | null = null;

  for (let attempt = 0; attempt < 9; attempt++) {
    const capH = capsPx * CAP_RATIO;
    const gap = capsPx * 0.55;
    const items: ILItem[] = [{ kind: 'hero', t: hero, x: 0, y: 0, wi: emphIdx }];
    let widest = heroW, nestedAll = true, wantNest = false;

    if (lead.length) {
      const L = placeLine(lead, capsPx, p, capH, 'left', gap, hasBand, S);
      for (const q of L.placed) items.push({ kind: 'caps', t: q.t, x: q.x, y: L.y, wi: q.wi });
      widest = Math.max(widest, L.x1 - L.x0);
      if (hasBand && S.nest) { wantNest = true; if (!L.nested) nestedAll = false; }
    }
    if (trail.length) {
      const L = placeLine(trail, capsPx, p, capH, 'right', gap, true, S);
      for (const q of L.placed) items.push({ kind: 'caps', t: q.t, x: q.x, y: L.y, wi: q.wi });
      widest = Math.max(widest, L.x1 - L.x0);
    }

    const tidy = widest <= heroW * 1.62;
    if (!best || (nestedAll && !best.nestedAll) || (nestedAll === best.nestedAll && tidy && !best.tidy))
      best = { items, capH, capsPx, nestedAll, tidy };
    if (nestedAll && tidy) break;
    if (capsPx <= F * 0.055) break;
    capsPx *= (wantNest && !nestedAll) ? 0.86 : 0.92;
  }

  const { items, capH } = best!;
  const usedCaps = best!.capsPx;
  let x0 = p.inkL, x1 = p.inkR, y0 = -p.A, y1 = p.D;
  for (const it of items) {
    if (it.kind !== 'caps') continue;
    x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x + capsWidth(it.t, usedCaps, S));
    y0 = Math.min(y0, it.y - capH); y1 = Math.max(y1, it.y);
  }
  return { items, capsPx: usedCaps, capH, F, plain: false, heroIdx: emphIdx,
           bbox: { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } };
}

