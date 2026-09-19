// ─────────────────────────────────────────────────────────────────────────────
// Bespoke graphics — the director designs every graphic card ITSELF (no gallery
// templates): static HTML/CSS compositions in the Iman Gadzhi / Ali Abdaal visual
// language, authored per edit. The ENGINE owns safety and motion:
//  - sanitizeBespokeHtml: the model's markup is layout+type+color ONLY — no
//    scripts, no handlers, no external anything, no media tags.
//  - bespokePose: pure(time) entrance/exit so the preview and both export
//    compositions animate the card identically frame by frame (model HTML must
//    stay STATIC — CSS animations don't advance under Remotion's frame clock).
// ─────────────────────────────────────────────────────────────────────────────

export interface BespokeGraphic {
  id: string;
  /** SOURCE-clock ms (same clock as GraphicsInstance / SfxInstance). */
  atMs: number;
  durMs: number;
  /** Full-screen b-roll insert (opaque card covering the frame) vs floating overlay. */
  fullscreen: boolean;
  /** Frame layout. The SPEAKER STAYS ON SCREEN in every mode except 'full':
   *  split-* takes a band and leaves the rest live footage, inset-* is a corner
   *  card, side-* a half column, banner a strip. 'full' is the rare crescendo. */
  layout?: 'full' | 'split-top' | 'split-bottom' | 'side-l' | 'side-r'
    | 'inset-tl' | 'inset-tr' | 'inset-bl' | 'inset-br' | 'banner' | 'float';
  /** Overlay placement (center-anchored % box). Ignored when fullscreen. */
  box: { xPercent: number; yPercent: number; widthPercent: number };
  /** Sanitized static HTML. Inline styles only. */
  html: string;
}

/** Element whitelist — layout/typography only. Anything else is dropped whole. */
const ALLOWED_TAGS = new Set(['div', 'span', 'p', 'h1', 'h2', 'h3', 'strong', 'em', 'b', 'i', 'u', 'br', 'hr']);

/** Engine animation vocabulary the model may assign per element via data-fx.
 *  Rendered by BespokeGraphicsLayer as PAUSED keyframes seeked with a negative
 *  animation-delay — pure(time), frame-exact on the preview and both exports.
 *  Per-element stagger rides an inline `--d: <ms>` custom property. */
export const BESPOKE_FX = new Set(['rise', 'swing', 'slam', 'pop', 'blur', 'slide-l', 'slide-r', 'wipe', 'reveal', 'flicker', 'type']);
/** Exit animations (`data-out` + inline `--hd: <ms>` hold before leaving) —
 *  sequenced word-takeover hooks need words that LEAVE with intent. */
export const BESPOKE_FX_OUT = new Set(['whip-l', 'whip-r', 'blur-out', 'shrink', 'up-out']);
/** Infinite idle motion (`data-live`) — premium type never fully rests. */
export const BESPOKE_LIVE = new Set(['float', 'pulse', 'track', 'drift', 'boil']);
/** Mid-scene relocations (`data-move` on a WRAPPER div + inline `--md: <ms>`):
 *  after living its moment the element steps aside / settles / swells so the
 *  composition REARRANGES — cards unfold as scenes instead of accumulating. */
export const BESPOKE_MOVE = new Set(['aside-up', 'aside-l', 'aside-r', 'settle', 'grow']);
/** Cascade splitting (`data-split`): the engine explodes a plain-text element into
 *  per-letter/per-word spans, each inheriting the element's fx with an incremental
 *  stagger — the amateur/pro divider in kinetic type. */
export const BESPOKE_SPLIT = new Set(['letters', 'words', 'type', 'shuffle']);

/**
 * Reduce model markup to inert, self-contained layout HTML:
 *  - only whitelisted tags survive (others stripped with their content for
 *    script/style/iframe-class tags, unwrapped otherwise)
 *  - only `style` and `class` attributes survive; every on* handler dies
 *  - url(...), expression(...), @import, javascript: and position:fixed are
 *    scrubbed out of style values
 * Returns '' when nothing safe remains. Pure string-transform (no DOM), so the
 * server, the preview and the exports agree byte-for-byte.
 */
export function sanitizeBespokeHtml(raw: string, maxLen = 4000): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  let s = raw.slice(0, maxLen * 2);

  // Kill dangerous containers WITH their content first.
  s = s.replace(/<(script|style|iframe|object|embed|link|meta|svg|math|img|video|audio|source|form|input|button|a)\b[\s\S]*?(<\/\1>|\/?>(?![\s\S]*<\/\1>))/gi, '');

  // Tag-by-tag pass: keep whitelisted tags with scrubbed attributes, drop the rest.
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_m, tag: string, attrs: string) => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return '';
    if (_m.startsWith('</')) return `</${t}>`;
    // style only — scrub url()/expression()/import/fixed/behavior.
    const styleMatch = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
    let style = styleMatch ? (styleMatch[2] ?? styleMatch[3] ?? '') : '';
    style = style
      .replace(/url\s*\([^)]*\)/gi, 'none')
      .replace(/expression\s*\([^)]*\)/gi, '')
      .replace(/@import[^;]*/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/position\s*:\s*fixed/gi, 'position:absolute')
      .replace(/behavior\s*:[^;]*/gi, '');
    // Animation attributes survive ONLY with known engine names.
    const attrOf = (name: string, allowed: Set<string>) => {
      const m = new RegExp(`${name}\\s*=\\s*(?:"([a-zA-Z-]+)"|'([a-zA-Z-]+)')`, 'i').exec(attrs);
      const v = (m?.[1] ?? m?.[2] ?? '').toLowerCase();
      return allowed.has(v) ? ` ${name}="${v}"` : '';
    };
    const fx = attrOf('data-fx', BESPOKE_FX) + attrOf('data-out', BESPOKE_FX_OUT) + attrOf('data-live', BESPOKE_LIVE)
      + attrOf('data-split', BESPOKE_SPLIT) + attrOf('data-move', BESPOKE_MOVE);
    // Cascade cadence override (data-step, ms per unit) — numeric, clamped downstream.
    const stepM = /data-step\s*=\s*"(\d{2,3})"/i.exec(attrs);
    const stepAttr = stepM ? ` data-step="${stepM[1]}"` : '';
    const selfClose = t === 'br' || t === 'hr' ? ' /' : '';
    return style ? `<${t} style="${style.replace(/"/g, "'")}"${fx}${stepAttr}${selfClose}>` : `<${t}${fx}${stepAttr}${selfClose}>`;
  });

  // Cascade expansion: a plain-text element marked data-split explodes into per-unit
  // spans inheriting the element's fx from its base stagger. Modes: letters (40ms),
  // words (90ms), type (70ms typewriter — chars appear instantly, the documentary
  // voice), shuffle (55ms — letters land in scrambled order, the decode reveal).
  // data-step="<ms>" (30-400) overrides the cadence. Only leaf elements split.
  s = s.replace(/<(\w+)((?:[^>"']|"[^"]*")*data-split="(letters|words|type|shuffle)"(?:[^>"']|"[^"]*")*)>([^<]+)<\/\1>/gi,
    (_m, tag: string, attrs: string, mode: string, text: string) => {
      const fx = mode === 'type' ? 'type' : (/data-fx="([a-z-]+)"/i.exec(attrs)?.[1] ?? 'pop');
      const base = Number(/--d:\s*(\d+)/.exec(attrs)?.[1] ?? 0);
      const rawStep = Number(/data-step="(\d{2,3})"/i.exec(attrs)?.[1] ?? 0);
      const step = rawStep >= 30 && rawStep <= 400 ? rawStep
        : mode === 'words' ? 90 : mode === 'type' ? 70 : mode === 'shuffle' ? 55 : 40;
      // Deterministic pseudo-shuffle for the scramble reveal (pure — export-safe).
      const n = Array.from(text).filter((c) => c.trim()).length;
      const order = Array.from({ length: n }, (_v, idx) => idx)
        .sort((a, b) => ((a * 73 + 13) % 101) - ((b * 73 + 13) % 101) || a - b);
      const rank: number[] = [];
      order.forEach((idx, pos) => { rank[idx] = pos; });
      let i = 0;
      // Letters are grouped per WORD in a nowrap wrapper — without it a line break
      // can land mid-word ("EK CHEE / Z"), which no human editor would ever ship.
      const inner = text.split(/(\s+)/).map((word) => {
        if (!word.trim()) return word;
        // Order-safe humanization: jitter strictly under step/2 so units can never
        // land out of order; --j varies each unit's entrance length. Typewriter
        // stays mechanical (a typewriter's rhythm IS its character).
        const uj = (slot: number) => mode === 'type' ? '' : `; --j: ${((slot * 17) % 81) - 30}ms`;
        const dj = (slot: number) => mode === 'type' ? 0 : ((slot * 29) % (step >= 70 ? 41 : 13)) - (step >= 70 ? 20 : 6);
        if (mode === 'words') { const slot = i++; return `<span data-fx="${fx}" style="display:inline-block; --d: ${Math.max(0, base + slot * step + dj(slot))}ms${uj(slot)}">${word}</span>`; }
        const letters = Array.from(word).map((ch) => {
          const slot = mode === 'shuffle' ? rank[i++] : i++;
          return `<span data-fx="${fx}" style="display:inline-block; --d: ${Math.max(0, base + slot * step + dj(slot))}ms${uj(slot)}">${ch}</span>`;
        }).join('');
        return `<span style="display:inline-block; white-space:nowrap">${letters}</span>`;
      }).join('');
      const cleaned = attrs.replace(/\s*data-fx="[a-z-]+"/i, '').replace(/\s*data-split="[a-z]+"/i, '').replace(/\s*data-step="\d+"/i, '');
      return `<${tag}${cleaned}>${inner}</${tag}>`;
    });

  // THE HUMAN PASS: the model emits grid numbers (60/380/1150…, all entrances
  // 620ms) — a machine tell the eye reads instantly. Nudge every stagger by a
  // deterministic per-element hash (±24ms) and hand each element its own entrance
  // length via --j (-40..+60ms, consumed by the layer's duration calc) so nothing
  // lands exactly on the grid. Pure(index,delay) — preview and exports agree.
  // Typewriter chars are exempt: a typewriter IS mechanical.
  let ei = 0;
  s = s.replace(/<(\w+)([^>]*data-fx="(?!type")[a-z-]+"[^>]*)>/gi, (_m, tag: string, attrs: string) => {
    if (/--j:/.test(attrs)) return _m; // cascade spans carry their own order-safe jitter
    ei += 1;
    const dm = /--d:\s*(\d+)ms/.exec(attrs);
    const d = dm ? Number(dm[1]) : 0;
    const dj = ((d * 7 + ei * 13) % 49) - 24;
    const jj = ((d * 11 + ei * 7) % 101) - 40;
    let a = attrs;
    if (dm) a = a.replace(/--d:\s*\d+ms/, `--d: ${Math.max(0, d + dj)}ms`);
    a = /style="/.test(a) ? a.replace(/style="/, `style="--j: ${jj}ms; `) : `${a} style="--j: ${jj}ms"`;
    return `<${tag}${a}>`;
  });

  // No handler fragments may survive outside tags either.
  s = s.replace(/on\w+\s*=/gi, 'data-x=');
  s = s.trim();
  if (!s || !/[<>\w]/.test(s)) return '';
  return s.slice(0, maxLen);
}

const IN_MS = 320;   // rise+fade entrance
const OUT_MS = 260;  // fade exit

export interface BespokePose {
  opacity: number;
  /** translateY in % of the card's height. */
  dyPct: number;
  /** Uniform card scale (1 at rest) — the wrapper multiplies it into its transform. */
  scale: number;
  visible: boolean;
}

/** Pure(time) card motion — identical on the preview and every export frame.
 *  In: opacity resolves by ~55% while position/scale keep settling on an expo
 *  curve (decoupled fade). Out: accelerating fade with a small upward drift —
 *  cards LEAVE, they don't dissolve in place. */
export function bespokePose(atMs: number, durMs: number, tMs: number): BespokePose {
  const rel = tMs - atMs;
  if (rel < 0 || rel > durMs) return { opacity: 0, dyPct: 0, scale: 1, visible: false };
  if (rel < IN_MS) {
    const p = rel / IN_MS;
    const e = 1 - Math.pow(2, -10 * p);
    return { opacity: Math.min(1, p / 0.55), dyPct: (1 - e) * 3.4, scale: 0.972 + 0.028 * e, visible: true };
  }
  if (rel > durMs - OUT_MS) {
    const p = Math.max(0, (durMs - rel) / OUT_MS);
    return { opacity: p ** 1.35, dyPct: -(1 - p) * 1.6, scale: 1 + (1 - p) * 0.012, visible: true };
  }
  return { opacity: 1, dyPct: 0, scale: 1, visible: true };
}

let seq = 0;
export function newBespokeGraphic(
  atMs: number,
  durMs: number,
  fullscreen: boolean,
  box: { xPercent: number; yPercent: number; widthPercent: number },
  html: string,
  layout?: BespokeGraphic['layout'],
): BespokeGraphic {
  seq += 1;
  return { id: `bg_${seq.toString(36)}_${Math.round(atMs).toString(36)}`, atMs: Math.max(0, Math.round(atMs)), durMs: Math.max(600, Math.round(durMs)), fullscreen, box, html, ...(layout ? { layout } : {}) };
}
