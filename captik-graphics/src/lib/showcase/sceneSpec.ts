/**
 * THE ANIMATION LANGUAGE.
 *
 * Choosing "figure" out of six kinds is not authoring an animation — it is picking from a
 * menu, and every figure in every video then looks identical. This is the language the model
 * writes the actual animation in: elements, where they sit, what colour role they take, when
 * each one arrives and how.
 *
 * WHY A DSL AND NOT CODE. Three reasons, all of them load-bearing:
 *   · It goes into Remotion's inputProps as JSON, so Lambda renders the identical scene. Code
 *     would have to exist at bundle time; a spec travels with the render.
 *   · Nothing is evaluated. A model writing JSX would be arbitrary code execution in the
 *     render worker, and the failure mode of a malformed brace is a crashed render.
 *   · Every value is clamped and every enum is whitelisted here, so a bad scene degrades to a
 *     legible one instead of a broken frame. The brand cannot be escaped: colours are ROLES,
 *     not hex, so the palette the references produced is the only palette available.
 *
 * Time is local to the moment: 0 is when the moment starts.
 */

/**
 * WHAT THE LANGUAGE CAN DRAW IS WHAT THE REFERENCE CAN BECOME.
 *
 * The first six of these are type and lines, and for a while that was the whole vocabulary —
 * so a reference brief reading "bar columns labelled by day" and "one glowing element floating
 * in a near-black void" came back as five small chips and two lines of text on a black frame.
 * The model was not underperforming; it had nothing to draw with, and a moment that takes the
 * whole picture from the speaker has to be worth the picture.
 *
 * The five added here are the primitives those references keep asking for: a magnitude you can
 * see (bar), a proportion (ring), a surface to sit things on (card), light (glow), and a mark
 * (dot). Each of them also carries its own motion — a bar grows, a ring sweeps, a glow
 * breathes — so a hold is never a still image.
 */
import { applyKindTreatment } from './kindTreatment';

export const ELEMENT_TYPES = [
  'text', 'box', 'arrow', 'strike', 'rule', 'chip',
  'bar', 'ring', 'card', 'glow', 'dot',
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

/** Colour is a ROLE. The model never names a hex value, so the brand always holds. */
export const COLOR_ROLES = ['accent', 'ink', 'ground', 'support', 'none'] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

/** Type scale. Hero is the "promote it" size; kicker is the small caps label above. */
export const TEXT_SIZES = ['hero', 'lead', 'body', 'kicker'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const ENTER_KINDS = ['pop', 'rise', 'fall', 'wipe', 'draw', 'fade', 'none'] as const;
export type EnterKind = (typeof ENTER_KINDS)[number];

export const EXIT_KINDS = ['cut', 'fade', 'fall'] as const;
export type ExitKind = (typeof EXIT_KINDS)[number];

export interface SceneElement {
  type: ElementType;
  /** Text content. Latin only — the on-screen language rule applies here too. */
  text?: string;
  size?: TextSize;
  /** Centre position, % of frame. */
  x: number;
  y: number;
  /** Width/height, % of frame. Optional for text (it sizes to its content). */
  w?: number;
  h?: number;
  /** Fine size control on top of the four steps — 1 is the step size. "Make it bigger" has
   *  to have somewhere to go, or a revision can only ever move things. */
  scale?: number;
  color?: ColorRole;
  bg?: ColorRole;
  border?: ColorRole;
  rotate?: number;
  /** ms from the START of the moment. */
  at: number;
  /** Duration of the entrance, ms. */
  dur?: number;
  enter?: EnterKind;
  exit?: ExitKind;
  /**
   * SUSTAINED MOTION over the rest of the hold, as deltas reached by the end.
   * dx/dy in % of frame, scale as a multiplier delta (0.05 = 5% larger by the end).
   *
   * Without this an element finishes its 260ms entrance and then does not move again —
   * measured at 74% of a 2.6s hold completely frozen, which is what "no animation" looks
   * like. Omitted means a small default drift, never nothing.
   */
  move?: { dx?: number; dy?: number; scale?: number };
  /**
   * Angle on the scene's device circle, degrees. When present the element RIDES the device:
   * its x/y are computed from the circle and it rotates with everything else on it.
   * The element nearest 0 after the spin is the ACTIVE one.
   */
  angle?: number;
  /**
   * Offset from the device node this element rides on, % of frame.
   *
   * This is what binds a LABEL to its number. The reference puts "Ambient" and its line of
   * copy immediately right of the active numeral, and both travel with it as the wheel turns —
   * a label placed at fixed x/y stays behind while its number moves away, which reads as two
   * unrelated things rather than one item on a structure. Same angle + an offset = they ride
   * together.
   */
  ox?: number;
  oy?: number;
  /**
   * How full a bar or a ring is, 0..1 — the only number in the language that carries meaning
   * rather than geometry. It is what makes a magnitude READ: four bars at .3 .55 .8 1 are a
   * trend, and four bars without it are a fence.
   */
  value?: number;
  /** Draw order. Higher sits on top. */
  z?: number;
}

/** What a shape occupies when the model gives no size — per type, because a glow and a dot
 *  have nothing in common. */
export const SHAPE_SIZE: Record<string, { w: number; h: number }> = {
  bar: { w: 7, h: 30 },
  ring: { w: 22, h: 22 },
  card: { w: 38, h: 28 },
  glow: { w: 55, h: 55 },
  dot: { w: 2.5, h: 2.5 },
  chip: { w: 22, h: 8 },
  box: { w: 30, h: 9 },
};

/**
 * A DEVICE — the recurring animated structure a reference is built around.
 *
 * The Wove reference is not a lockup, it is a WHEEL: numbered nodes on a vertical arc, one of
 * them active and huge, the rest ghosted along the curve, and advancing ROTATES the arc so
 * the next node takes the active position. Coordinates cannot express that; the whole point
 * is that the items share one structure and move together.
 *
 * A device positions its members by ANGLE on a shared circle and spins them as one. Elements
 * that opt in (by carrying an `angle`) get their x/y computed from it; everything else is
 * placed normally, so a device and free elements coexist in one scene.
 */
/**
 * The shapes a mechanism can take.
 *
 * A wheel was the first one built, but most references are not wheels — they are stacks that
 * scroll, strips that slide, boards that light one cell at a time. They are all the same idea
 * underneath: members sit at positions on a track, the track ADVANCES, and whatever lands on
 * the active point is the one being talked about. One geometry function covers all of them,
 * which is what stops "matches the reference" from meaning "matches one reference".
 */
export const DEVICE_KINDS = ['arc', 'line', 'stack', 'grid'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

/**
 * The vision model's own words for a structure, mapped onto a track.
 *
 * Exported so the reference check can ask "did the plan build the mechanism the reference
 * has?" using the SAME mapping the builder used — otherwise the check and the builder can
 * disagree about what "carousel" means and the answer is meaningless either way.
 * Returns undefined when the words describe no mechanism at all.
 */
export function deviceKindFor(raw: string): DeviceKind | undefined {
  const s = raw.trim().toLowerCase();
  if (!s || s === 'none') return undefined;
  return /arc|wheel|dial|circle|orbit|radial/.test(s) ? 'arc'
    : /grid|matrix|tile|board/.test(s) ? 'grid'
    : /stack|list|column|ladder|index/.test(s) ? 'stack'
    : /carousel|timeline|strip|row|reel|track|line|slider/.test(s) ? 'line'
    : 'stack';
}

export interface SceneDevice {
  kind: DeviceKind;
  /**
   * arc  — centre of the circle, % of frame, usually off-frame so only a curve shows.
   * line/stack/grid — the ACTIVE point: where the member being talked about sits.
   */
  cx: number;
  cy: number;
  /** arc: radius, % of frame height. line/stack/grid: the spacing between slots. */
  radius: number;
  /** arc only: draw the guide curve between these angles (degrees, 0 = right, 90 = down). */
  from: number;
  to: number;
  /**
   * How far the whole structure ADVANCES over the moment. This IS the animation.
   * Degrees on an arc; slots on a line, stack or grid.
   */
  spinDeg: number;
  /** The visible guide line's colour role. 'none' hides it. */
  stroke?: ColorRole;
  /** grid only: how many columns before wrapping to the next row. */
  cols?: number;
  /**
   * grid only: the gap between ROWS, % of frame height, and how many rows there are.
   *
   * A grid has two pitches, not one. Deriving the row gap from the column pitch times the
   * aspect made rows on a 16:9 take 43% of the frame apart — two lines of chips pinned to the
   * top and bottom edges with the design's own light in the hole between them. The row gap
   * belongs to the members' HEIGHT; only the column gap belongs to their width. Both are
   * computed during validation, so a scene that never fitted still renders centred.
   */
  rowGap?: number;
  rows?: number;
}

export interface Scene {
  elements: SceneElement[];
  /** Optional full-bleed plate behind the scene, as a brand role. */
  plate?: ColorRole;
  /** The animated structure this scene is built around, when it has one. */
  device?: SceneDevice;
  /**
   * Where the FOOTAGE sits when the scene has a page behind it, % of frame.
   *
   * A page-style reference — a near-white sheet with type on it — has a background that IS
   * the design. Covering it with full-bleed footage throws that away and leaves only the
   * type, which is why a page reference kept coming out looking nothing like itself. With a
   * plate and a videoRect the page survives and the speaker sits in a window ON it, which is
   * what an editor actually does with this kind of reference.
   *
   * Only meaningful when `plate` is set. Omitted = footage full bleed, as before.
   */
  videoRect?: { x: number; y: number; w: number; h: number };
  /**
   * Whether the speaker is ON SCREEN for this moment.
   *
   * 'none' takes them off it entirely: the reference is a full-screen design with no card and
   * no picture window, so the honest build is the graphic alone on its page while the speaker
   * carries on in audio. Putting them in anyway means cutting a hole in a design that never
   * had one. Only legal against a plate — hiding the footage over nothing leaves a dead frame.
   */
  footage?: 'window' | 'none';
}

// ── limits ──────────────────────────────────────────────────────────────────
/** More than this on screen at once is not a design, it is a pile. */
export const MAX_ELEMENTS = 8;
export const MIN_ENTER_MS = 80;
export const MAX_ENTER_MS = 900;

/** The composition is authored at 1080x1920; text width is estimated against that. */
const FRAME_W = 1080;
const FRAME_H = 1920;
/** Must match the type scale in MomentScene. */
const SIZE_FRAC: Record<string, number> = { hero: 0.115, lead: 0.052, body: 0.030, kicker: 0.017 };
/**
 * Advance width per character, as a fraction of the font size — MEASURED off real renders,
 * per face, because the two faces in this design are nothing like each other.
 *
 * One constant of 0.6 served both, and it was wrong in both directions: hero and lead are set
 * in Anton, a CONDENSED face that came out at 0.41, while body and kicker are Montserrat 800,
 * which came out at 0.73. So every width check was a fifth too generous on the wide face —
 * measured, a line the clamp believed was 21.8% of the frame rendered at 26.8% and hung off
 * the left edge — and a third too mean on the narrow one, shrinking headlines that fitted.
 *
 * Calibration: "COMMUNITY" and "AND GROWING" at body/2.4x, and "1.5 LAKH" at hero, measured
 * against 672px-wide renders of a 16:9 frame.
 */
const CHAR_W: Record<string, number> = { hero: 0.41, lead: 0.41, body: 0.73, kicker: 0.73 };

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const pick = <T extends readonly string[]>(v: unknown, allowed: T, fallback: T[number]): T[number] =>
  (typeof v === 'string' && (allowed as readonly string[]).includes(v)) ? (v as T[number]) : fallback;

const LATIN_ONLY = /^[\x20-\x7E'’—–]+$/;

/**
 * ON-SCREEN TEXT IS ENGLISH — not Devanagari, and not Hindi spelled in Latin letters either.
 *
 * Latin script alone was not the rule anyone meant. A rendered kicker reading "PROVIDE KARNA"
 * passes a script check and still reads as speech transcribed onto the screen rather than as a
 * designed label. The words on a graphic are WRITTEN, not spoken: the model translates the
 * idea into English, and this list is only the backstop for when it transliterates anyway.
 *
 * Deliberately limited to tokens that are not also English words — "the", "is", "to", "hi",
 * "me", "par", "log" and "so" all mean something in Hindi AND in English, and stripping them
 * would mangle real English labels, which is a worse failure than letting one through.
 */
const NOT_ENGLISH = new Set([
  'karna', 'karne', 'karta', 'karti', 'karo', 'karke', 'kiya', 'kiye', 'karenge', 'karega',
  'hai', 'hain', 'hoga', 'hogi', 'hota', 'hoti', 'hone', 'hua', 'hui', 'tha', 'thi', 'thay',
  'nahi', 'nahin', 'kyunki', 'kyun', 'kyu', 'kaise', 'kaisa', 'jaise', 'matlab',
  'mein', 'aap', 'aapko', 'aapke', 'aapki', 'tum', 'tumhe', 'tumhara', 'hum', 'humein',
  'hamara', 'hamare', 'mera', 'meri', 'tera', 'teri', 'apna', 'apne', 'apni',
  'logon', 'logo', 'aadmi', 'admi', 'cheez', 'cheezein', 'baat', 'baatein', 'kaam',
  'paisa', 'paise', 'rupaye', 'rupay', 'kitna', 'kitne', 'kitni', 'itna', 'itne',
  'bahut', 'thoda', 'zyada', 'jyada', 'sirf', 'sabse', 'accha', 'achha', 'acha',
  'naya', 'nayi', 'purana', 'banao', 'banaya', 'banate', 'dekho', 'dekha', 'dekhne',
  'suno', 'sunte', 'chalo', 'milta', 'milega', 'milte', 'jayega', 'jaata', 'jaate',
  'raha', 'rahe', 'rahi', 'gaya', 'gayi', 'diya', 'liya', 'wala', 'wale', 'wali',
  'yeh', 'woh', 'wahan', 'yahan', 'abhi', 'phir', 'lekin', 'agar', 'magar',
  'kuch', 'kuchh', 'bhi', 'aur', 'toh', 'ka', 'ki', 'ke', 'ko', 'se', 'badhe', 'badha',
  'badhne', 'badhta', 'chahiye', 'sakta', 'sakte', 'sakti', 'wala', 'bina', 'saath',
  'pehle', 'pehla', 'pehli', 'baad', 'doosra', 'doosri', 'teesra', 'saal', 'mahina',
  'mahine', 'roz', 'subah', 'raat', 'ghar', 'dost', 'dosto', 'bhai', 'yaar', 'arre', 'arrey',
  'dekh', 'bolo', 'bolna', 'samajh', 'samjho', 'seekh', 'seekho', 'sikhaya', 'banane',
  'chahta', 'chahte', 'koshish', 'mehnat', 'safal', 'safalta', 'kamyabi', 'kamai', 'kamana',
  'bechna', 'becho', 'khareed', 'khareedna', 'grahak', 'vyapar', 'dhanda', 'dukaan',
  'bazaar', 'mauka', 'faayda', 'fayda', 'nuksan', 'mushkil', 'aasan', 'jaldi', 'dheere',
  'zaroor', 'zaroori', 'bilkul', 'shayad', 'waqt', 'samay', 'tarika', 'tareeka',
  'dena', 'lena', 'jitna', 'utna', 'har', 'sab', 'sabko', 'kisi', 'koi', 'kaun', 'kahan',
  'bheja', 'bheje', 'bheji', 'bhejo', 'bhejna', 'bhejta', 'likha', 'likho', 'padha', 'padho', 'sikha',
  'rakho', 'rakha', 'laga', 'lagta', 'lagega', 'jaana', 'aana', 'aaya', 'aayi', 'gye', 'gaye',
]);

/**
 * Keep only the English words in a label.
 *
 * Stripping rather than dropping: "PROVIDE KARNA" still has a usable English label inside it,
 * and losing the whole kicker would leave a hole in a composition the model balanced.
 * Returns '' when nothing English survives, which the caller treats as a dropped element.
 */
export function englishOnly(text: string): string {
  const kept = text.split(/\s+/).filter((w) => {
    const bare = w.replace(/[^A-Za-z]/g, '').toLowerCase();
    return !bare || !NOT_ENGLISH.has(bare);
  });
  return kept.join(' ').trim();
}

/** The footage window on a page, clamped inside the frame so it cannot hang off an edge. */
function readRect(v: unknown): { x: number; y: number; w: number; h: number } | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const w = clamp(num(r.w, 46), 12, 100);
  const h = clamp(num(r.h, 34), 10, 100);
  return {
    w, h,
    x: clamp(num(r.x, 50), w / 2, 100 - w / 2),
    y: clamp(num(r.y, 50), h / 2, 100 - h / 2),
  };
}

/** The device, clamped. A radius of 400 or a 3000-degree spin is a mistake, not a design. */
function readDevice(v: unknown): SceneDevice | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const d = v as Record<string, unknown>;

  // The kind arrives as the vision model's own words — "arc-wheel", "carousel", "timeline".
  // Rejecting anything that is not literally "arc" threw away the structure of every
  // reference that was not a wheel, which is most of them: they fell back to loose elements
  // and stopped resembling their reference at all. So the words are MAPPED to a track.
  const raw = (typeof d.kind === 'string' ? d.kind : '').trim().toLowerCase();
  if (!raw || raw === 'none') return undefined;
  const kind = deviceKindFor(raw);
  if (!kind) return undefined;

  return {
    kind,
    cx: clamp(num(d.cx, kind === 'arc' ? -10 : 50), -120, 220),
    cy: clamp(num(d.cy, 50), -120, 220),
    // On an arc this is the circle's radius; on a track it is the SPACING between slots, so
    // its sensible range is much smaller and a wheel-sized default would fling members off.
    radius: kind === 'arc'
      ? clamp(num(d.radius, 45), 8, 160)
      : clamp(num(d.radius, 14), 4, 45),
    from: clamp(num(d.from, -70), -180, 180),
    to: clamp(num(d.to, 70), -180, 180),
    // A full turn per moment is a blur; the reference advances by ONE node. On a track that
    // is one slot, not a hundred degrees.
    spinDeg: kind === 'arc'
      ? clamp(num(d.spinDeg, 0), -120, 120)
      // Up to 8 slots, not 4: a light that crosses one cell of an eight-cell board over a 2.6s
      // hold leaves six cells frozen, and a sweep has to be representable to be enforceable.
      : clamp(num(d.spinDeg, 0), -8, 8),
    stroke: pick(d.stroke, COLOR_ROLES, 'support'),
    ...(kind === 'grid' ? { cols: Math.round(clamp(num(d.cols, 3), 2, 6)) } : {}),
  };
}

/** Sustained motion, clamped. Large values read as the graphic sliding away, not living. */
function readMove(v: unknown): { dx: number; dy: number; scale: number } | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const m = v as Record<string, unknown>;
  return {
    dx: clamp(num(m.dx, 0), -12, 12),
    dy: clamp(num(m.dy, 0), -12, 12),
    scale: clamp(num(m.scale, 0), -0.4, 0.6),
  };
}

export interface SceneValidation {
  scene: Scene | null;
  rejected: string[];
}

/**
 * Take whatever the model wrote and return something that will definitely render.
 *
 * Nothing here throws and nothing is trusted: out-of-frame positions are pulled back,
 * unknown enums fall back, non-Latin text is dropped outright (that rule is not negotiable),
 * and a scene with no surviving elements returns null so the caller can use the built-in
 * visual for that kind rather than render an empty frame.
 */
/**
 * WHAT THE EDITOR DECIDED, WHICH IS NOT NEGOTIABLE.
 *
 * Both of these are already stated in the prompt, and both were ignored by a real model on a
 * real clip: with "put me in these moments" ticked, two of four moments still took the speaker
 * off screen; with the background dropped, two of four still painted a plate. This file exists
 * because a prompt is a request — a choice the editor made in the UI has to be a guarantee.
 */
export interface EditorChoices {
  /** false = the reference's background was dropped, so nothing may paint one. */
  keepBackground?: boolean;
  /** true = the speaker stays on screen; false = they are left out wherever there is a page. */
  keepSubject?: boolean;
  /**
   * THE CLIP'S SHAPE, when it is not the 9:16 this file was written against.
   *
   * Every position here is a percentage, so the frame's SIZE never mattered — but its aspect
   * does. Type is sized as a fraction of the frame's HEIGHT and then measured as a percentage
   * of its WIDTH, so on a 16:9 take every width came out nearly three times too small and the
   * fitting, the collision resolution and the arcs were all computed for a frame that was not
   * there. Only the ratio is needed; the pixels cancel.
   */
  frame?: { w: number; h: number };
  /**
   * WHAT KIND OF MOMENT THIS IS, and the words it exists to say.
   *
   * The six kinds each demand a different animation — a figure is promoted, a list is built,
   * a comparison places both sides — and using one animation for all six is decoration rather
   * than an edit. The prompt has carried that table for a while and a real model still
   * answered a "figure" about "1.5 lakh users" with a five-cell board of invented feature
   * words, none of which were the spoken number. Requested, not enforced; so now it is
   * enforced here.
   */
  kind?: string;
  anchor?: string;
  /**
   * THE TREATMENT READ OFF A REFERENCE VIDEO for this moment's role.
   *
   * A reference IMAGE can only teach look. A reference VIDEO teaches motion — how a graphic
   * arrives, how long it holds, whether a list builds or lands whole, how it leaves. When the
   * editor has uploaded one for this role, its treatment is applied here rather than left as a
   * description the model may or may not follow.
   */
  motion?: RoleMotionSpec;
}

/** Structural mirror of RoleMotion — kept local so sceneSpec imports nothing from roleMotion. */
export interface RoleMotionSpec {
  enter: EnterKind;
  enterMs: number;
  holdMs: number;
  exit: ExitKind;
  build: 'together' | 'one-at-a-time';
  staggerMs: number;
  sustain: 'drift' | 'grow' | 'push';
}

export function validateScene(
  raw: unknown,
  holdMs: number,
  choices: EditorChoices = {},
): SceneValidation {
  const rejected: string[] = [];
  if (!raw || typeof raw !== 'object') return { scene: null, rejected: ['scene was not an object'] };

  const r = raw as Record<string, unknown>;
  const list = Array.isArray(r.elements) ? r.elements : [];
  if (!list.length) return { scene: null, rejected: ['scene had no elements'] };

  // The clip's aspect. Positions are percentages, so this is the only thing about the frame
  // any of the geometry below needs — and getting it wrong on a landscape take made every
  // width estimate a third of the truth.
  const ar = choices.frame && choices.frame.h > 0
    ? choices.frame.w / choices.frame.h
    : DEFAULT_AR;

  /**
   * A DESIGN THAT REPLACES THE SHOT HAS TO FILL THE FRAME IT TOOK.
   *
   * When the reference is a full-bleed graphic the speaker is hidden for the whole moment and
   * whatever is drawn instead is the entire picture. Measured on a real 16:9 render against a
   * "one glowing element in a near-black void" reference: the model hid the speaker for 2.6s
   * at a time behind items covering 8% of the frame, and four moments in a row played as
   * near-empty black.
   *
   * It is decided HERE, before a single element is placed, because everything that positions
   * things — the collision resolver, the caption band, the frame fit — runs as each element is
   * read. Scaling afterwards silently undid all three: measured, a line grew 3.5x, ran off both
   * edges and landed on top of the headline the resolver had just moved it clear of.
   */
  const blacksOut = pick(r.plate, COLOR_ROLES, 'none') !== 'none' && r.footage === 'none';
  let fill = 1;
  if (blacksOut && choices.keepSubject !== true) {
    const area = (item: unknown): number => {
      if (!item || typeof item !== 'object') return 0;
      const e = item as Record<string, unknown>;
      const type = pick(e.type, ELEMENT_TYPES, 'text');
      const scale = clamp(num(e.scale, 1), 0.5, 2.2);
      if (type === 'text') {
        const text = typeof e.text === 'string' ? e.text : '';
        const probe: SceneElement = {
          type: 'text', text, size: pick(e.size, TEXT_SIZES, 'body'), x: 50, y: 50, at: 0, scale,
        };
        return (Math.min(textWidthPct(probe, ar), 100) * Math.min(textHeightPct(probe), 100)) / 100;
      }
      const w = Math.min((num(e.w, SHAPE_SIZE[type]?.w ?? 30)) * scale, 100);
      const h = Math.min((num(e.h, SHAPE_SIZE[type]?.h ?? 9)) * scale, 100);
      return (w * h) / 100;
    };
    const covered = list.reduce((sum, item) => sum + area(item), 0);
    if (covered > 0.01 && covered < 26) {
      // Area grows with the square of a linear blow-up; the cap stops a two-word moment
      // becoming a wall of type.
      fill = Math.min(2.4, Math.sqrt(26 / covered));
      rejected.push(
        `the shot was replaced by a design covering ${covered.toFixed(0)}% of the frame — scaled it up ${fill.toFixed(1)}x to fill what it took`,
      );
    }
  }

  const out: SceneElement[] = [];
  for (const item of list) {
    if (out.length >= MAX_ELEMENTS) { rejected.push(`dropped extra element — cap is ${MAX_ELEMENTS}`); continue; }
    if (!item || typeof item !== 'object') { rejected.push('element was not an object'); continue; }
    const e = item as Record<string, unknown>;

    const type = pick(e.type, ELEMENT_TYPES, 'text');
    const raw = typeof e.text === 'string' ? e.text.trim().slice(0, 60) : '';
    // English words, not speech spelled out in Latin letters.
    const text = raw && LATIN_ONLY.test(raw) ? englishOnly(raw) : raw;
    if (raw && text !== raw) {
      rejected.push(text
        ? `"${raw}" was transliterated speech — kept the English in it ("${text}")`
        : `"${raw}" was transliterated speech, not an English label — dropped`);
    }
    if (type === 'text' && raw && !text) continue;

    // A text element with nothing to say is a blank box on screen.
    if (type === 'text' && !text) { rejected.push('text element had no text'); continue; }

    // THE SAME WORDS TWICE IN ONE FRAME ARE A MISTAKE, NOT A DESIGN. A scene came back with
    // "23000" as both its figure and its label; the eye reads it twice and neither lands.
    if (type === 'text' && out.some((o) => o.type === 'text' && o.text?.toLowerCase() === text.toLowerCase())) {
      rejected.push(`"${text}" was already on screen in this moment — dropped the repeat`);
      continue;
    }
    if (text && !LATIN_ONLY.test(text)) {
      rejected.push(`"${text}" is not Latin — on-screen text is English only`);
      continue;
    }

    // Positions are clamped INSIDE the frame with a margin: an element centred at 0 or 100
    // is half off-screen, which reads as a bug rather than as a design choice.
    const el: SceneElement = {
      type,
      ...(text ? { text } : {}),
      size: pick(e.size, TEXT_SIZES, 'body'),
      x: clamp(num(e.x, 50), 6, 94),
      y: clamp(num(e.y, 40), 5, 92),
      color: pick(e.color, COLOR_ROLES, 'ink'),
      bg: pick(e.bg, COLOR_ROLES, 'none'),
      border: pick(e.border, COLOR_ROLES, 'none'),
      rotate: clamp(num(e.rotate, 0), -20, 20),
      // `fill` is the whole-scene blow-up decided above; the per-element clamp is on what
      // the MODEL asked for, not on the correction applied to all of them.
      scale: clamp(num(e.scale, 1), 0.5, 2.2) * fill,
      // An element that arrives after the moment has ended never appears.
      at: clamp(num(e.at, 0), 0, Math.max(0, holdMs - 120)),
      dur: clamp(num(e.dur, 260), MIN_ENTER_MS, MAX_ENTER_MS),
      enter: pick(e.enter, ENTER_KINDS, 'pop'),
      exit: pick(e.exit, EXIT_KINDS, 'cut'),
      z: clamp(num(e.z, 0), 0, 20),
      ...(e.angle !== undefined ? {
        angle: clamp(num(e.angle, 0), -180, 180),
        ...(e.ox !== undefined ? { ox: clamp(num(e.ox, 0), -40, 40) } : {}),
        ...(e.oy !== undefined ? { oy: clamp(num(e.oy, 0), -40, 40) } : {}),
      } : {}),
      move: readMove(e.move),
    };
    if (e.w !== undefined) el.w = clamp(num(e.w, 30), 2, 92);
    if (e.h !== undefined) el.h = clamp(num(e.h, 10), 1, 80);

    // TYPE IS COLOURED, IT DOES NOT SIT ON A SLAB.
    //
    // Compared frame by frame against the reference reels: every on-screen word there is
    // coloured type over the footage — "brands" in red, "Sabse" in red, "23000" in red — and
    // not one of them sits on a filled block. A model given the option reaches for it anyway,
    // and a red slab behind a word is the loudest way the output stopped looking like its
    // reference. Blocks remain available as an explicit `chip` or `box` element.
    if (type === 'text' && el.bg !== 'none') {
      rejected.push(`"${text}" was on a filled block — the reference colours the type instead`);
      el.bg = 'none';
    }

    // A FILLED ELEMENT THE SIZE OF THE FRAME IS A PLATE, AND PLATES HAVE THEIR OWN FIELD.
    // One rendered as a box swallowed half the frame in solid accent and buried the scene
    // under it. Anything that large loses its fill and keeps only its outline.
    // A glow is exempt: it is light with no edge, so a large one is the composition rather
    // than a slab over it — that is the whole of "a glowing element floating in a void".
    if (type !== 'glow' && el.bg !== 'none' && (el.w ?? 0) > 70 && (el.h ?? 0) > 55) {
      rejected.push(`"${text || el.type}" was a full-frame fill — use plate, not an element`);
      el.bg = 'none';
      if (el.border === 'none') el.border = 'support';
    }

    // TEXT MUST FIT. Clamping the CENTRE keeps a long line half off-frame: the anchor is the
    // middle, so a wide string still runs past both edges. Estimate the width and pull the
    // centre in far enough that the whole line lands inside.
    if (type === 'text' && text) {
      // A plated element is wider than its glyphs by its own padding — MomentScene pads by
      // 0.3em each side, and leaving that out let "REALLY GOOD DEAL" on a cream plate run
      // off the right edge even though the estimate said it fitted.
      const emPct = ((SIZE_FRAC[el.size ?? 'body'] ?? SIZE_FRAC.body) * (el.scale ?? 1) * 100) / ar;
      const padPct = el.bg && el.bg !== 'none' ? emPct * 0.6 : 0;
      const rawPct = textWidthPct(el, ar) + padPct;

      // Centring cannot save a line that is simply wider than the frame — it will overhang
      // both edges. Too wide means too big, so it shrinks until it fits.
      const MAX_PCT = 94;
      if (rawPct > MAX_PCT) {
        el.scale = Math.max(0.35, (el.scale ?? 1) * (MAX_PCT / rawPct));
        rejected.push(`"${text}" was wider than the frame — scaled to fit`);
      }

      const finalPct = Math.min(MAX_PCT, rawPct > MAX_PCT ? MAX_PCT : rawPct);
      const halfW = finalPct / 2;
      el.x = clamp(el.x, Math.min(50, halfW + 2), Math.max(50, 98 - halfW));
    }

    // Shapes need a size; text does not, but a box with no width is invisible.
    if (type !== 'text' && el.w === undefined) {
      el.w = type === 'rule' || type === 'strike' ? 40 : (SHAPE_SIZE[type]?.w ?? 30);
    }
    if (type !== 'text' && el.h === undefined) {
      el.h = type === 'rule' || type === 'strike' ? 1.2 : (SHAPE_SIZE[type]?.h ?? 9);
    }

    /**
     * A SHAPE HAS TO BE INSIDE THE FRAME TOO.
     *
     * The fit above is guarded by `type === 'text'`, so nothing ever checked a box, a rule or a
     * glow: measured on a real review, a 96%-wide rule was centred at x=6 and hung 42% of the
     * frame off the left edge, cutting through the type it was meant to underline. Its size is
     * the model's; where it can sit is not.
     */
    if (type !== 'text') {
      const halfW = ((el.w ?? 0) * (el.scale ?? 1)) / 2;
      const halfH = ((el.h ?? 0) * (el.scale ?? 1)) / 2;
      el.x = clamp(el.x, Math.min(50, halfW + 2), Math.max(50, 98 - halfW));
      el.y = clamp(el.y, Math.min(50, halfH + 2), Math.max(50, 98 - halfH));
    }

    // A bar or a ring with no reading is a fence post. Half-full is the honest default: it
    // shows the shape is a measure without inventing a figure the transcript never said.
    if (type === 'bar' || type === 'ring') el.value = clamp01(num(e.value, 0.5));

    out.push(el);
  }

  if (!out.length) return { scene: null, rejected: [...rejected, 'nothing in the scene survived'] };

  // NOTHING LANDS ON TOP OF ANYTHING ELSE.
  //
  // A model placing elements by eye puts two of them at almost the same y — rendered, "so
  // many" sat across "OPTIONS" and both became unreadable. It cannot see the result, so the
  // separation has to be guaranteed here. Each element is given its estimated box and any
  // later one that intersects an earlier one is nudged down until it clears.
  const boxes: Array<{ top: number; bottom: number; left: number; right: number }> = [];
  for (const el of out) {
    // An element that rides a device is placed by the device, so its x/y here are not where it
    // ends up: resolving it against them shuffles it around coordinates nobody will see, and
    // — worse — leaves it in the box list at a fictional position that pushes real elements
    // out of the way. The device's own passes keep those clear of each other.
    if (el.angle !== undefined) continue;

    const hPct = el.type === 'text' ? textHeightPct(el) : (el.h ?? 9);
    // One width estimate for the whole file. This pass had its own, without the 0.28em
    // tracking a kicker carries, so it measured small-caps labels a third narrower than they
    // draw and left them overlapping after reporting the collision resolved.
    const wPct = el.type === 'text'
      ? Math.min(96, textWidthPct(el))
      : (el.w ?? 30);

    let top = el.y - hPct / 2;
    let cx = el.x;

    // RESOLVE IN THE DIRECTION THAT MOVES IT LEAST.
    //
    // A down-only rule wrecks a side-by-side lockup. The Wove reference sets a small label
    // immediately to the RIGHT of a huge numeral at the same vertical centre; because the
    // numeral's box is wide, "beside it" reads as a collision, and the label was shoved
    // underneath — turning the reference's composition into a different one. Sliding it
    // clear sideways preserves what was intended whenever that is the shorter move.
    for (let guard = 0; guard < 12; guard++) {
      const left = cx - wPct / 2, right = cx + wPct / 2;
      const hit = boxes.find((b) =>
        top < b.bottom && top + hPct > b.top && left < b.right && right > b.left);
      if (!hit) break;

      // INTENT, NOT DISTANCE. Shortest-move picks "down" here (9.8 vs 20.2) and destroys the
      // lockup anyway. What matters is where the model PUT it: an element already sitting to
      // the right of what it hit was meant to be beside it, so it slides further right.
      // Anything else — stacked, or with no room — drops below.
      const hitCentreX = (hit.left + hit.right) / 2;
      const meantToBeBeside = cx > hitCentreX;
      const moveRight = hit.right + 1.5 + wPct / 2 - cx;
      const roomToTheRight = cx + moveRight + wPct / 2 <= 97;

      if (meantToBeBeside && roomToTheRight) cx += moveRight;
      else top = hit.bottom + 1.2;
    }

    /**
     * THE CAPTION BAND IS SPOKEN FOR.
     *
     * Whenever a scene is on screen the caption drops to y=76 to stay out of its way — so a
     * graphic that reaches down there lands on the words instead. The prompt asks for nothing
     * below 74 and a real plan put "THEN PDF" at 79.5. Text is held above the line; shapes are
     * left alone, since a rule or a slab under a caption is a legitimate backing for it.
     */
    // `top` is the top edge, so the whole height comes off the limit — subtracting half of it
    // left the element's BOTTOM at 75.7, still inside the band it was being lifted out of.
    const floor = el.type === 'text' ? 74 - hPct : 92 - hPct / 2;
    const clampedTop = Math.min(top, floor);
    if (el.type === 'text' && top > floor) {
      rejected.push(`"${el.text}" reached into the caption band — lifted clear of it`);
    }
    const movedY = Math.abs(clampedTop + hPct / 2 - el.y) > 0.5;
    const movedX = Math.abs(cx - el.x) > 0.5;
    if (movedY || movedX) {
      rejected.push(`"${el.text || el.type}" overlapped another element — moved ${movedX ? 'aside' : 'down'}`);
      el.y = clampedTop + hPct / 2;
      el.x = clamp(cx, 6, 94);
    }
    boxes.push({
      top: clampedTop, bottom: clampedTop + hPct,
      left: el.x - wPct / 2, right: el.x + wPct / 2,
    });
  }

  // ONE ACCENT. The accent means "look here"; when two things shout, neither is heard. The
  // prompt asks for this, which is not the same as it holding — so it is enforced. The first
  // accent survives (the model puts the important thing first), the rest demote to ink.
  let accents = 0;
  for (const el of out) {
    const uses = el.color === 'accent' || el.bg === 'accent';
    if (!uses) continue;
    accents++;
    if (accents <= 1) continue;
    rejected.push(`"${el.text || el.type}" was a second accent — demoted to ink`);
    if (el.color === 'accent') el.color = 'ink';
    if (el.bg === 'accent') el.bg = 'support';
  }

  // THE WHEEL CARRIES THE WORDS, OR IT IS JUST A DECORATION.
  //
  // A device that turns while the moment's actual copy sits parked at fixed coordinates is
  // two unrelated animations sharing a frame: the numbers travel and the words that name
  // them do not. The reference has one item — a numeral with its label beside it — and the
  // structure moves that item. So when the model gives a device and its nodes but leaves the
  // copy loose, the copy is attached to the ACTIVE node here.
  /**
   * A MOMENT MUST OPEN WITH SOMETHING ON IT.
   *
   * The page is painted the instant the moment starts, but the elements arrive on their own
   * schedule — and a model that opens with a hairline rule at 0ms and its first words at 150ms
   * leaves the frame holding nothing but a plate. Measured on a real render against a near-black
   * reference with the speaker hidden: 363ms of empty dark frame, which reads as the video
   * dropping out. The stagger after the first line is the design; the gap before it is not.
   */
  // A figure is promoted BEFORE the device is read, because "everything clears" includes the
  // structure: a wheel or a board carrying five invented labels is exactly the everything.
  if (choices.kind === 'figure') {
    promoteTheFigure(out, choices.anchor ?? '', rejected, ar);
    if (r.device) rejected.push('a figure needs no mechanism — the number is the moment');
  }

  let device = choices.kind === 'figure' ? undefined : readDevice(r.device);

  // The other five kinds: build a list, name a concept, place both sides of a comparison, play
  // a mechanism through in order, let a myth land before it is struck. Run before the device
  // passes so anything added here is fitted and de-collided like everything else.
  // A list stacks, a concept is a lockup, a comparison is two sides — each is its own
  // structure, so a wheel or a board underneath is a second mechanism fighting the first. A
  // MECHANISM is the exception: its structure is the representation, so its device stays.
  if (device && (choices.kind === 'list' || choices.kind === 'concept' || choices.kind === 'comparison')) {
    rejected.push(`a ${choices.kind} builds its own structure — dropped the ${device.kind} under it`);
    device = undefined;
    for (const e of out) { delete e.angle; delete e.ox; delete e.oy; }
  }

  if (choices.kind && choices.kind !== 'figure') {
    applyKindTreatment(choices.kind, out, device, holdMs, ar, rejected);

    /**
     * A TREATMENT MOVES THINGS, SO THE FRAME IS CHECKED AGAIN.
     *
     * Every placement rule above runs as each element is READ, which is before any treatment
     * has had its say. Measured: a comparison stacked four bars by their own height and put
     * the last two at y=105 and y=138 — off the bottom of the picture, with nothing left to
     * catch them. Whatever a treatment decides, it decides it inside the frame.
     */
    for (const e of out) {
      const halfW = (e.type === 'text' ? textWidthPct(e, ar) : (e.w ?? 0) * (e.scale ?? 1)) / 2;
      const halfH = (e.type === 'text' ? textHeightPct(e) : (e.h ?? 0) * (e.scale ?? 1)) / 2;
      const x = clamp(e.x, Math.min(50, halfW + 2), Math.max(50, 98 - halfW));
      const y = clamp(e.y, Math.min(50, halfH + 2), Math.max(50, 96 - halfH));
      if (Math.abs(x - e.x) > 0.5 || Math.abs(y - e.y) > 0.5) {
        rejected.push(`"${e.text ?? e.type}" was placed off the frame by the ${choices.kind} treatment — pulled back in`);
      }
      e.x = x;
      e.y = y;
    }
  }
  if (device && out.filter((e) => e.angle !== undefined).length < 2) {
    // One member is not a mechanism — it draws a track with a single dot on it and advances
    // through nothing. The elements stay; the structure goes.
    rejected.push('the device had fewer than two members — dropped it and kept the elements');
    device = undefined;
    for (const e of out) { delete e.angle; delete e.ox; delete e.oy; }
  }
  if (device) {
    ensureItAdvances(out, device, rejected);
    ensureMembersFit(out, device, rejected, ar);
    // After the pitch is wide enough to clear, and before anything is bound to it: the copy and
    // the riders have to be placed against a structure that is already inside the picture.
    keepDeviceInFrame(out, device, rejected, ar);
    bindContentToDevice(out, device, rejected, ar);
    keepRidersInFrame(out, device, rejected, ar);
    keepFreeClearOfDevice(out, device, rejected, ar);
  }

  // A full-bleed ACCENT plate makes every element on top of it unreadable, and there is no
  // composition where that is the intent. Grounds and supports are what a plate is for.
  /**
   * A MOMENT MUST OPEN WITH SOMETHING YOU CAN SEE.
   *
   * The page is painted the instant the moment starts, but the elements arrive on their own
   * schedule, so an opening stagger leaves the frame holding nothing but a plate — 363ms of
   * empty dark frame on a real render, which reads as the video dropping out.
   *
   * It has to run AFTER the device passes, because "something you can see" excludes a bare
   * node: a numeral on a wheel is dimmed by how far it is from the active point, so a moment
   * whose first element was a node still opened on ghosts. The copy and the free elements are
   * the things drawn at full strength, so one of those goes first.
   */
  const isBareNode = (e: SceneElement) =>
    e.angle !== undefined && e.ox === undefined && e.oy === undefined;
  /**
   * THE REFERENCE VIDEO'S TREATMENT, APPLIED.
   *
   * Everything above decided WHAT is on screen; this decides how it moves, and it is the whole
   * point of letting an editor upload a reel rather than a screenshot. It runs before the
   * opener rule below, which still gets the last word on the first element — no reference is
   * worth a moment that opens on an empty page.
   */
  if (choices.motion) {
    const m = choices.motion;
    const ordered = out.slice().sort((a, b) => a.at - b.at);
    const lastAt = Math.max(0, holdMs - 120);
    ordered.forEach((e, i) => {
      e.enter = e.type === 'rule' || e.type === 'strike' ? 'draw' : m.enter;
      e.dur = m.enterMs;
      e.exit = m.exit;
      e.at = i === 0 ? 0
        : m.build === 'together' ? Math.min(120, lastAt)
        : Math.min(i * m.staggerMs, lastAt);
      if (m.sustain === 'grow') e.move = { ...e.move, scale: Math.max(e.move?.scale ?? 0, 0.07) };
      else if (m.sustain === 'push') e.move = { ...e.move, scale: Math.max(e.move?.scale ?? 0, 0.04), dy: e.move?.dy ?? -0.8 };
      else e.move = { ...e.move, dy: e.move?.dy ?? -1.6, scale: e.move?.scale ?? 0.03 };
    });
    rejected.push(
      `your reference reel's treatment was applied — ${m.build === 'together' ? 'everything lands together' : `built one at a time, ${m.staggerMs}ms apart`}, entering "${m.enter}", leaving on a ${m.exit}`,
    );
  }

  const texts = out.filter((e) => e.type === 'text' && e.text);
  const pool = texts.filter((e) => !isBareNode(e));
  const opener = (pool.length ? pool : texts)
    .reduce<SceneElement | null>((best, e) => (!best || e.at < best.at ? e : best), null);
  if (opener && (opener.at > 0 || (opener.dur ?? 260) > 220)) {
    rejected.push(`"${opener.text}" was the first thing on screen but arrived ${opener.at}ms in — moved to the top of the moment`);
    opener.at = 0;
    opener.dur = Math.min(opener.dur ?? 260, 220);
  }

  /**
   * The model schedules every arrival in the first second and then the moment sits there. On a
   * 2.6s hold that measured as 92% of frames unchanged — the graphic reads as a still image
   * pasted over the video, which is exactly the complaint.
   *
   * So the arrivals get spread across the front two-thirds of the hold: something new keeps
   * landing while the earlier pieces drift. The last third stays clear so the moment can settle
   * before it cuts, and the opener stays pinned at 0 by the rule above.
   */
  const last = out.reduce((m, e) => Math.max(m, e.at), 0);
  // Measured on a real plan: the model landed all 7 elements by 980ms of a 2600ms hold — 62% of
  // the moment with nothing arriving. 0.45 is what actually catches that.
  // EVERY kind now authors its own timing — a figure's label follows its number within a beat,
  // a list steps 240ms at a time, a mechanism plays through in order. Stretching any of those
  // undoes the treatment: measured, it pushed a figure's label to 1488ms of a 2600ms hold and
  // re-spaced a list that had just been built. The stretch is for scenes nobody choreographed.
  if (!choices.kind && out.length >= 3 && last > 0 && last < holdMs * 0.45) {
    // The rhythm is STRETCHED, not redistributed: the intervals the model wrote are its design
    // and the relative spacing survives untouched. Only the span they cover changes, and the
    // opener stays at 0 for free because scaling leaves zero at zero.
    const target = Math.max(0, holdMs - 120) * 0.6;
    const factor = target / last;
    for (const e of out) e.at = Math.round(e.at * factor);
    rejected.push(
      `everything had landed ${Math.round(last)}ms into a ${holdMs}ms moment and it then sat still — stretched the same stagger over ${Math.round(target)}ms`,
    );
  }

  const wantedPlate = pick(r.plate, COLOR_ROLES, 'none');
  let plate = wantedPlate === 'accent' || wantedPlate === 'ink' ? 'ground' : wantedPlate;
  if (plate !== wantedPlate) rejected.push(`plate "${wantedPlate}" would bury the scene — used ground`);

  // The editor dropped the background. Nothing gets to paint one back.
  if (choices.keepBackground === false && plate !== 'none') {
    rejected.push(`the background was dropped, so the "${plate}" plate was removed`);
    plate = 'none';
  }

  // "Put me in these moments" wins over any reference that would rather you were not there;
  // "leave me out" wins the other way, wherever there is a page to leave you out onto.
  /**
   * THE SPEAKER STAYS UNLESS THE EDITOR SAYS OTHERWISE.
   *
   * A reference may ASK to replace the shot; only the editor can grant it. This was the other
   * way round — a reference brief reading `footageSlot: "none"` was enough — and watched back
   * as a whole video the result was damning: the clip played talking-head, cut to a near-black
   * title card for 2.6s, back to talking-head, cut to another card. Four times. That is not an
   * edit of someone's video, it is their video interrupted by slides, and the stretches that
   * looked RIGHT in the same render were the ones where the type sat over the speaker with one
   * word picked out in the accent.
   *
   * Which is the rule the whole style rests on: the caption IS the design. The graphic belongs
   * on the footage, not instead of it. Leaving yourself out stays available — it is a switch
   * in the panel — but it is now a decision somebody makes, not one a reference makes for them.
   */
  let footage: Scene['footage'];
  if (choices.keepSubject === false && plate !== 'none') {
    rejected.push('you asked to be left out — the moment hides you');
    footage = 'none';
  } else if (r.footage === 'none') {
    rejected.push(
      'the reference replaces the shot with a full-screen graphic — kept you on screen instead, '
      + 'because a talking-head clip that cuts to title cards reads as the video dropping out. '
      + 'Turn off "Put me in these moments" to have it your way.',
    );
  }


  out.sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  return {
    scene: {
      elements: out,
      plate,
      device,
      // A footage window only means anything against a page, and none of it survives the
      // background being dropped.
      videoRect: plate !== 'none' && footage !== 'none' ? readRect(r.videoRect) : undefined,
      // Resolved above, where the editor's choices are applied. Hiding the speaker is only
      // legal against a page: without one there is nothing left to look at.
      footage,
    },
    rejected,
  };
}

/**
 * How an element looks right now. Pure(time), like every other evaluator here, so the
 * preview and the Lambda render replay identical motion.
 */
export interface ElementPose {
  visible: boolean;
  opacity: number;
  /** Extra offset in % of frame, added to the element's own x/y. */
  dx: number;
  dy: number;
  scale: number;
  /** 0..1 reveal for wipe/draw entrances, applied as a clip. */
  reveal: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 2.6);
/** Overshoot and settle — how an object lands. */
const back = (t: number) => {
  const k = clamp01(t);
  return k >= 1 ? 1 : 1 - Math.pow(1 - k, 3) * Math.cos(k * Math.PI * 1.1);
};

/**
 * Default sustained motion. Small enough to be subliminal, never zero — the reference styles
 * hold type on screen for seconds at a time and it is always creeping, which is what stops a
 * graphic reading as a still image pasted over video.
 */
/**
 * Measured on a real render: at -0.5% over a 2.6s hold this came to about 0.02% of frame per
 * frame — sub-pixel, and 92% of the frames inside a moment registered as unchanged. "Subliminal"
 * had become "absent". These are still slow — roughly 0.8% of frame per second — but they are
 * motion a viewer can see, which is the whole job of a graphic that stays up for seconds.
 */
export const DRIFT_DY = -1.8;      // % of frame, upward over the hold
export const DRIFT_SCALE = 0.05;   // 5% larger by the end

/**
 * Attach the moment's copy to the node the device is bringing forward.
 *
 * Vertical rhythm in % of frame: enough room for each size to sit under the next without the
 * hero's descenders touching the line below it.
 */
const RIDER_H: Record<string, number> = { hero: 13.5, lead: 7, body: 5, kicker: 4 };
/** The gap between the numeral and the left edge of the copy beside it, % of frame width. */
const RIDER_GAP = 10;

/** The frame this file was written against. Only its RATIO is ever used. */
const DEFAULT_AR = FRAME_W / FRAME_H;

/**
 * Width of a text element as a percentage of frame width — the same estimate the fit pass uses.
 *
 * Type is sized as a fraction of the frame's HEIGHT, so converting that to a percentage of its
 * WIDTH is where the aspect enters and the pixels cancel:
 *   width% = chars × sizeFraction × scale × charWidth × 100 ÷ (frameW / frameH)
 * On a 16:9 take the old constant made every line read as a third of its true width, so
 * nothing was ever pulled in or shrunk to fit.
 */
export function textWidthPct(el: SceneElement, ar = DEFAULT_AR): number {
  const size = el.size ?? 'body';
  const frac = (SIZE_FRAC[size] ?? SIZE_FRAC.body) * (el.scale ?? 1);
  const per = CHAR_W[size] ?? CHAR_W.body;
  // A kicker is tracked out by 0.28em on top of its own advance width.
  const track = size === 'kicker' ? (per + 0.28) / per : 1;
  return ((el.text?.length ?? 4) * frac * per * track * 100) / ar;
}

/** Height of a text element as a percentage of frame height. Independent of the aspect. */
export function textHeightPct(el: SceneElement, lineHeight = 1.15): number {
  return (SIZE_FRAC[el.size ?? 'body'] ?? SIZE_FRAC.body) * (el.scale ?? 1) * lineHeight * 100;
}

/**
 * NOTHING ON THE DEVICE MAY RUN OFF THE FRAME.
 *
 * The fit pass clamps an element's `x`, which is exactly the coordinate a device-placed
 * element ignores: its position is the node's, plus its offset. So the clamp never applied to
 * the elements most likely to need it. A model wrote its own hero onto a wheel at offset zero
 * — dead centre on a node sitting at x=11.9 — and rendered as "ALUE", clipped by the left
 * edge, while the fit pass reported everything in order.
 *
 * Judged at the END of the moment, because that is where the active member lands and the
 * active member is the one that has to be readable. Members still travelling are ghosts, and
 * a ghost leaving the frame is the mechanism working.
 */
function keepRidersInFrame(els: SceneElement[], device: SceneDevice, rejected: string[], ar: number): void {
  /**
   * A RIDER MUST CLEAR THE NODE IT RIDES.
   *
   * The offsets assume the node is a small index — a numeral. When the model makes the node
   * the HERO instead, that assumption fails: a label 9% to the right of a word 60% wide is
   * inside it, and "VALUE" rendered straight through "PROVIDE IN EVERY VIDEO". The clearance
   * has to come from the node's actual width, and when the node is too big to sit beside at
   * all, the label goes above it rather than being shoved off the frame.
   */
  const nodes = els.filter((n) => n.angle !== undefined && n.ox === undefined && n.oy === undefined);

  // Frame first, so a node that has to move to stay on screen has already moved before
  // anything is measured against it.
  pullInside(els, device, rejected, ar);

  for (const e of els) {
    if (e.angle === undefined || e.type !== 'text' || !e.text) continue;
    if (!nodes.every((n) => n !== e)) continue;               // this one IS a node

    const node = nodes.find((n) => n.angle === e.angle && n.text);
    if (!node) continue;

    // Only enough to stop them touching. RIDER_GAP is the gap this file uses when it composes
    // a block from scratch; using it as a MINIMUM instead pushed apart labels the model had
    // already spaced well, which is a worse outcome than the overlap it was guarding against.
    const MIN_CLEAR = 2;
    const need = textWidthPct(node, ar) / 2 + MIN_CLEAR + textWidthPct(e, ar) / 2;

    // Measured from where the NODE actually sits, not from the bare node position: the frame
    // clamp above may have moved the node itself, and clearing a position it no longer
    // occupies left ", link, video" sitting inside "VALUE" while both were reported fixed.
    const anchor = node.ox ?? 0;
    if (Math.abs((e.ox ?? 0) - anchor) >= need) continue;

    const nodeX = devicePose(device, e.angle, 1, ar).x + anchor;
    const side = (e.ox ?? 0) < anchor ? -1 : 1;
    const fits = nodeX + side * need + textWidthPct(e, ar) / 2 <= 96
      && nodeX + side * need - textWidthPct(e, ar) / 2 >= 4;

    // Sideways is only free on a wheel or a stack. On a strip or a board the space beside a
    // node belongs to the NEXT node, so copy goes above — the same rule the binder uses when
    // it composes the block. (This only surfaced once the width estimate was calibrated: with
    // the old, too-generous widths nothing ever "fitted" alongside, so the bug was invisible.)
    const beside = device.kind === 'arc' || device.kind === 'stack';
    if (fits && beside) {
      e.ox = clamp(anchor + side * need, -60, 60);
    } else {
      // No room alongside — stack it clear above instead.
      const gap = (RIDER_H[node.size ?? 'body'] ?? RIDER_H.body) / 2
        + (RIDER_H[e.size ?? 'body'] ?? RIDER_H.body) / 2;
      e.ox = 0;
      e.oy = clamp((e.oy ?? 0) < 0 ? -gap : -gap, -40, 40);
    }
    rejected.push(`"${e.text}" sat inside "${node.text}" on the device — moved clear of it`);
  }

  /**
   * TWO LABELS ON THE SAME NODE HAVE TO CLEAR EACH OTHER TOO.
   *
   * The binder stacks copy properly, but it stands down whenever the model has bound its own —
   * and the model routinely puts a kicker and a hero on the same angle at almost the same
   * offset. Nothing else looked at them: the collision pass skips device-placed elements, and
   * the pass above only compares a rider against its NODE. Measured on two references, where
   * "PROVIDE" and "VALUE" drew straight through each other.
   */
  settleRiders(els, device, rejected, ar);

  // ...and again, because clearing a node can push a label off the edge it was cleared towards.
  pullInside(els, device, rejected, ar);
}

/**
 * SETTLE EVERY LABEL ON THE DEVICE UNTIL NOTHING SITS ON ANYTHING.
 *
 * Replaces a set of one-case rules — rider against its own node, rider against its neighbour —
 * each of which fixed the collision it was written for and missed the next one. A rider can
 * just as easily land on a node three slots away, which is what the audit kept finding.
 *
 * Nodes are the structure and never move; labels are what can be nudged. Each one is pushed to
 * the nearest clear position, preferring whichever direction keeps it on screen.
 */
function settleRiders(els: SceneElement[], device: SceneDevice, rejected: string[], ar: number): void {
  const boxOf = (e: SceneElement) => {
    const p = devicePose(device, e.angle ?? 0, 1, ar);
    const w = e.type === 'text' ? textWidthPct(e, ar) : (e.w ?? 30) * (e.scale ?? 1);
    const h = e.type === 'text'
      ? (SIZE_FRAC[e.size ?? 'body'] ?? SIZE_FRAC.body) * (e.scale ?? 1) * 115
      : (e.h ?? 9) * (e.scale ?? 1);
    const x = p.x + (e.ox ?? 0), y = p.y + (e.oy ?? 0);
    return { left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2, y, h };
  };
  const hits = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
    a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

  const isRider = (e: SceneElement) =>
    e.angle !== undefined && (e.ox !== undefined || e.oy !== undefined) && e.type === 'text' && e.text;

  const settled = els.filter((e) => e.angle !== undefined && !isRider(e)).map(boxOf);

  for (const e of els) {
    if (!isRider(e)) continue;
    let b = boxOf(e);
    if (!settled.some((s) => hits(b, s))) { settled.push(b); continue; }

    /**
     * Pushing an element off whatever it hit does not converge: a label trapped between two
     * boxes bounces between them until the loop gives up and leaves it overlapping. Measured —
     * a hero 13.2 tall between blockers 10.8 apart, oscillating for every one of ten passes.
     * So the free gaps are enumerated instead, and it goes to the nearest one it fits.
     */
    const spot = nearestGap(b, settled, 3, 93);
    if (spot.y !== null) e.oy = clamp((e.oy ?? 0) + (spot.y - b.y), -60, 60);
    if (spot.shrink) {
      e.scale = Math.max(0.35, (e.scale ?? 1) * spot.shrink);
      rejected.push();
    } else {
      rejected.push();
    }
    b = boxOf(e);
    settled.push(b);
  }
}

/**
 * FREE ELEMENTS GET OUT OF THE DEVICE'S WAY.
 *
 * The collision pass runs before the device is resolved and skips its members, because their
 * x/y are not where they end up. That leaves one gap: an element the model placed by hand can
 * still land on top of a member. Measured on a real plan — a "1 VIDEO" label at y=9 and a
 * hero the stack put at y=4. The device wins the argument: its members are a structure, and
 * the loose element is the one that can move.
 */
function keepFreeClearOfDevice(els: SceneElement[], device: SceneDevice, rejected: string[], ar: number): void {
  const boxOf = (e: SceneElement, onDevice: boolean) => {
    const w = e.type === 'text' ? textWidthPct(e, ar) : (e.w ?? 30) * (e.scale ?? 1);
    const h = e.type === 'text'
      ? (SIZE_FRAC[e.size ?? 'body'] ?? SIZE_FRAC.body) * (e.scale ?? 1) * 115
      : (e.h ?? 9) * (e.scale ?? 1);
    const p = onDevice ? devicePose(device, e.angle ?? 0, 1, ar) : { x: e.x, y: e.y };
    const x = p.x + (onDevice ? (e.ox ?? 0) : 0);
    const y = p.y + (onDevice ? (e.oy ?? 0) : 0);
    return { left: x - w / 2, right: x + w / 2, top: y - h / 2, bottom: y + h / 2, y, h };
  };

  const onDevice = els.filter((e) => e.angle !== undefined).map((e) => boxOf(e, true));
  if (!onDevice.length) return;

  for (const e of els) {
    if (e.angle !== undefined || e.type !== 'text' || !e.text) continue;
    const b = boxOf(e, false);

    // The device's members AND the other loose elements. Moving something off the device
    // without looking at its neighbours just drops it on one of them — measured, a "PDF"
    // label pushed clear of a strip landed on the "23000" underneath it.
    const blockers = [
      ...onDevice,
      ...els.filter((o) => o !== e && o.angle === undefined && o.type === 'text' && o.text)
        .map((o) => boxOf(o, false)),
    ];
    if (!blockers.some((t) => hitsBox(b, t))) continue;

    const spot = nearestGap(b, blockers, 4, 92);
    if (spot.y !== null) e.y = spot.y;
    if (spot.shrink) e.scale = Math.max(0.35, (e.scale ?? 1) * spot.shrink);
    rejected.push(`"${e.text}" sat on the device — moved clear of it`);
  }
}

const hitsBox = (
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/**
 * The nearest vertical gap a box fits in, given what is already occupied.
 *
 * Shared by both de-collision passes because both learned the same lesson the hard way:
 * shoving an element off whatever it hit does not converge when something else is waiting on
 * the other side. Enumerating the free space and choosing terminates, always.
 */
function nearestGap(
  b: { left: number; right: number; top: number; bottom: number; y: number; h: number },
  blockers: Array<{ left: number; right: number; top: number; bottom: number }>,
  lo: number,
  hi: number,
): { y: number | null; shrink?: number } {
  const inColumn = blockers
    .filter((s) => b.left < s.right - 0.5 && s.left < b.right - 0.5)
    .sort((p, q) => p.top - q.top);

  const gaps: Array<{ from: number; to: number }> = [];
  let cursor = lo;
  for (const s of inColumn) {
    if (s.top > cursor) gaps.push({ from: cursor, to: s.top });
    cursor = Math.max(cursor, s.bottom);
  }
  if (cursor < hi) gaps.push({ from: cursor, to: hi });

  const centreIn = (g: { from: number; to: number }) =>
    clamp(b.y, g.from + b.h / 2 + 0.5, g.to - b.h / 2 - 0.5);

  const roomy = gaps.filter((g) => g.to - g.from >= b.h + 1);
  if (roomy.length) {
    const best = roomy.reduce((w, g) => (Math.abs(centreIn(g) - b.y) < Math.abs(centreIn(w) - b.y) ? g : w));
    return { y: centreIn(best) };
  }
  if (!gaps.length) return { y: null };

  const big = gaps.reduce((w, g) => (g.to - g.from > w.to - w.from ? g : w));
  return { y: (big.from + big.to) / 2, shrink: Math.max(0.35, (big.to - big.from - 1) / b.h) };
}

/** Pull every device-placed line back inside the frame at the position it ends the moment in. */
function pullInside(els: SceneElement[], device: SceneDevice, rejected: string[], ar: number): void {
  for (const e of els) {
    if (e.angle === undefined || e.type !== 'text' || !e.text) continue;

    let halfW = textWidthPct(e, ar) / 2;
    // Wider than the frame is a size problem, not a position one.
    if (halfW * 2 > 92) {
      e.scale = Math.max(0.35, (e.scale ?? 1) * (92 / (halfW * 2)));
      rejected.push(`"${e.text}" was wider than the frame on the device — scaled to fit`);
      halfW = textWidthPct(e, ar) / 2;
    }

    const at = devicePose(device, e.angle, 1, ar);
    const x = at.x + (e.ox ?? 0);
    const lo = 4 + halfW, hi = 96 - halfW;
    const want = lo > hi ? 50 : clamp(x, lo, hi);
    if (Math.abs(want - x) > 0.01) {
      e.ox = clamp((e.ox ?? 0) + (want - x), -60, 60);
      rejected.push(`"${e.text}" hung off the frame on the device — pulled back inside`);
    }

    // ...and the same vertically. Clamping only x left a hero stacked above a node at y=4
    // hanging off the TOP of the frame — the read-time clamp bounds the element's own y, which
    // a device-placed element never uses.
    const halfH = ((SIZE_FRAC[e.size ?? 'body'] ?? SIZE_FRAC.body) * (e.scale ?? 1) * 100) / 2;
    const y = at.y + (e.oy ?? 0);
    const yLo = 3 + halfH, yHi = 93 - halfH;
    const wantY = yLo > yHi ? 50 : clamp(y, yLo, yHi);
    if (Math.abs(wantY - y) > 0.01) {
      e.oy = clamp((e.oy ?? 0) + (wantY - y), -60, 60);
      rejected.push(`"${e.text}" hung off the top or bottom on the device — pulled back inside`);
    }
  }
}

/**
 * THE SLOTS HAVE TO BE BIGGER THAN THE THINGS IN THEM.
 *
 * Spacing and member size are chosen independently — the model picks a step for the structure
 * and a size for each label, and nothing has ever compared them. A strip with 14% steps
 * holding numbers 22-28% wide puts every member on top of its neighbours, which reads as one
 * illegible smear rather than as a row. Widening the step is the fix that keeps every member
 * at the size it was designed at.
 */
/**
 * The pitch at which members of this kind of track stop touching each other.
 *
 * A grid's pitch is one number serving two axes: it is the gap ACROSS in % of width, and the
 * same pixel gap DOWN is that times the aspect. Taking the larger of width and height for both
 * made a row of five bars — 6% wide and 26% tall — demand a 28% horizontal pitch, which no
 * frame can hold, so three of the five were thrown away to make the row fit. Height only
 * separates ROWS, so it only counts when there is more than one.
 */
function pitchNeeded(members: SceneElement[], kind: DeviceKind, ar: number, cols = 3): number {
  const widest = Math.max(...members.map((m) => (
    m.type === 'text' ? textWidthPct(m, ar) : (m.w ?? 30) * (m.scale ?? 1)
  )));
  const tallest = Math.max(...members.map((m) => (
    m.type === 'text' ? textHeightPct(m) : (m.h ?? 9) * (m.scale ?? 1)
  )));
  if (kind === 'line') return widest + 2;
  if (kind === 'stack') return tallest + 2;
  // A grid separates its rows with its own row gap, so this pitch answers to the width alone.
  void tallest; void cols;
  return widest + 2;
}

function ensureMembersFit(els: SceneElement[], device: SceneDevice, rejected: string[], ar: number): void {
  if (device.kind === 'arc') return;   // an arc's members are spread by angle, not by spacing
  const members = els.filter((e) => e.angle !== undefined && e.ox === undefined && e.oy === undefined);
  if (members.length < 2) return;

  const widest = Math.max(...members.map((m) => (
    m.type === 'text' ? textWidthPct(m, ar) : (m.w ?? 30) * (m.scale ?? 1)
  )));

  // The row pitch is the members' own height plus a gap — never the column pitch borrowed and
  // stretched by the aspect, which drove two rows of chips to opposite edges of the frame.
  if (device.kind === 'grid') {
    const tallest = Math.max(...members.map((m) => (
      m.type === 'text' ? textHeightPct(m) : (m.h ?? 9) * (m.scale ?? 1)
    )));
    device.rows = Math.ceil(members.length / Math.max(1, device.cols ?? 3));
    device.rowGap = Math.min(38, tallest + 4);
  }

  /**
   * A ROW HAS ONLY SO MUCH ROOM, AND THE ANSWER IS SMALLER UNITS — NOT FEWER.
   *
   * Five 30%-wide chips cannot sit across a frame at any pitch: widening them to clear each
   * other pushed the row off the picture, and the bounds pass then had to throw three of the
   * five away. A reference that shows "a row of like units" shows SMALL units. So when the
   * demand exceeds the width available, the members shrink to what the row can hold and the
   * design survives intact.
   */
  const across = device.kind === 'grid' ? (device.cols ?? 3) : members.length;
  if (device.kind !== 'stack' && across > 1) {
    const ROOM = 88;
    const fits = (ROOM - 2 * (across - 1)) / across;
    if (widest > fits) {
      const k = Math.max(0.35, fits / widest);
      for (const m of members) m.scale = (m.scale ?? 1) * k;
      rejected.push(
        `${across} slots of ${widest.toFixed(0)}% cannot cross one frame — the members were taken to ${(widest * k).toFixed(0)}%`,
      );
    }
  }

  const need = pitchNeeded(members, device.kind, ar, device.cols ?? 3);

  if (device.radius >= need) return;
  rejected.push(`the ${device.kind}'s slots were ${device.radius.toFixed(0)} apart holding items ${need.toFixed(0)} across — widened them`);
  device.radius = Math.min(45, need);
}

/**
 * THE STRUCTURE HAS TO BE INSIDE THE PICTURE.
 *
 * Nothing above this bounds a device against the frame: `ensureMembersFit` only ever WIDENS
 * the pitch so members clear each other, and the poses then multiply that pitch by the frame's
 * aspect. On a 16:9 take a five-column grid at pitch 32 put its first cell at x = -64% — two
 * thirds of a screen off the left edge — so a moment that had built seven items showed two,
 * scattered over a black field. That is what "the animation isn't great" looked like.
 *
 * Every pose is linear in `radius`, so the shrink is solved rather than iterated: sample where
 * the members actually land, take the worst overshoot, and scale the pitch by exactly enough.
 */
function keepDeviceInFrame(
  els: SceneElement[], device: SceneDevice, rejected: string[], ar: number, depth = 0,
): void {
  const members = els.filter((e) => e.angle !== undefined && e.ox === undefined && e.oy === undefined);
  if (members.length < 2) return;

  const MARGIN = 6;
  let worst = 1;

  for (const m of members) {
    const halfW = (m.type === 'text' ? textWidthPct(m, ar) : (m.w ?? 30) * (m.scale ?? 1)) / 2;
    const halfH = (m.type === 'text' ? textHeightPct(m) : (m.h ?? 9) * (m.scale ?? 1)) / 2;

    // The structure travels, so a cell that fits at rest can still leave at the end of the hold.
    for (const progress of [0, 0.5, 1]) {
      const p = devicePose(device, m.angle!, progress, ar);
      const room = (offset: number, centre: number, half: number, span: number) => {
        if (Math.abs(offset) < 0.01) return 1;
        const edge = offset > 0 ? span - MARGIN - half - centre : centre - MARGIN - half;
        return edge <= 0 ? 0.05 : Math.min(1, edge / Math.abs(offset));
      };
      worst = Math.min(
        worst,
        room(p.x - device.cx, device.cx, halfW, 100),
        room(p.y - device.cy, device.cy, halfH, 100),
      );
    }
  }

  if (worst >= 0.995) return;
  const was = device.radius;
  device.radius = Math.max(3, device.radius * worst);
  rejected.push(
    `the ${device.kind}'s members ran off the frame at a pitch of ${was.toFixed(0)} — tightened it to ${device.radius.toFixed(0)}`,
  );

  // Tightening the pitch can only go so far: below the width of the members themselves they
  // stop being a track and become a pile. If the frame cannot hold this many, it carries
  // fewer — the ones nearest the point the device is travelling towards.
  const need = pitchNeeded(members, device.kind, ar, device.cols ?? 3);
  if (device.radius >= need) return;

  const keep = Math.max(2, Math.floor((device.radius * members.length) / need));
  if (keep >= members.length) return;

  const target = -device.spinDeg;   // where the structure comes to rest
  const doomed = members
    .slice()
    .sort((a, b) => Math.abs((a.angle ?? 0) - target) - Math.abs((b.angle ?? 0) - target))
    .slice(keep);

  for (const d of doomed) {
    const i = els.indexOf(d);
    if (i >= 0) els.splice(i, 1);
  }
  rejected.push(
    `a ${members.length}-slot ${device.kind} could not fit this frame — carried ${keep} of them`,
  );

  // Dropping cells out of the middle of a track leaves holes in it. The survivors are re-seated
  // into consecutive slots so the structure still reads as one thing, and the travel is clamped
  // to the slots that are actually left.
  if (device.kind !== 'arc') {
    const left = els.filter((e) => e.angle !== undefined && e.ox === undefined && e.oy === undefined)
      .sort((a, b) => (a.angle ?? 0) - (b.angle ?? 0));
    left.forEach((e, i) => { e.angle = i; });
    device.radius = need;
    if (device.kind === 'grid') device.rows = Math.ceil(left.length / Math.max(1, device.cols ?? 3));
    device.spinDeg = Math.sign(device.spinDeg || -1) * Math.min(Math.abs(device.spinDeg), left.length - 1);
  }

  if (depth < 2) keepDeviceInFrame(els, device, rejected, ar, depth + 1);
}

/**
 * A DEVICE THAT DOES NOT ADVANCE IS NOT A DEVICE.
 *
 * The whole reason a mechanism beats a layout is that it MOVES to bring the next item
 * forward; with spinDeg 0 the members sit exactly where they were placed for the length of the
 * hold and the moment is a static arrangement wearing a device's clothes. A real plan came
 * back with a seven-slot timeline and spinDeg 0 on its first moment. The step is read from the
 * members' own spacing so the structure advances by exactly one of whatever it is made of.
 */
function ensureItAdvances(els: SceneElement[], device: SceneDevice, rejected: string[]): void {
  const angles = els.map((e) => e.angle).filter((a): a is number => a !== undefined)
    .sort((a, b) => a - b);
  if (angles.length < 2) return;

  const gaps = angles.slice(1).map((a, i) => a - angles[i]).filter((g) => g > 0.01);
  const step = gaps.length
    ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
    : (device.kind === 'arc' ? 26 : 1);

  // One slot of travel is enough to say the thing moved, and not enough for anyone to SEE it
  // move: on an eight-cell grid it lights one new cell and leaves the other six as still
  // pixels for the whole hold. The light has to cross a real share of the structure — half of
  // it, at least — so the moment is still resolving when it cuts.
  const reach = Math.max(1, Math.round((angles.length - 1) * 0.5));
  const wanted = step * reach;
  const limit = device.kind === 'arc' ? 120 : 8;
  const target = -Math.min(wanted, limit);

  if (device.spinDeg === 0) {
    device.spinDeg = target;
    rejected.push(`the device was told to advance by 0 — swept it across ${reach} slot(s) (${target})`);
    return;
  }

  // The model chose a direction; keep it and only extend how far it goes.
  if (Math.abs(device.spinDeg) < Math.abs(target)) {
    const extended = Math.sign(device.spinDeg) * Math.abs(target);
    rejected.push(
      `the device crossed ${Math.abs(device.spinDeg / step).toFixed(1)} of ${angles.length} slots and the rest sat still — swept it to ${reach}`,
    );
    device.spinDeg = extended;
  }
}

function bindContentToDevice(els: SceneElement[], device: SceneDevice, rejected: string[], ar: number): void {
  const nodes = els.filter((e) => e.angle !== undefined);
  if (!nodes.length) return;

  // A model that already bound its copy knows what it wants; leave it alone.
  if (els.some((e) => e.angle !== undefined && (e.ox !== undefined || e.oy !== undefined))) return;

  // Copy is the text that is NOT a node. Shapes stay where they were put: a rule or a chip is
  // part of the page, not part of the item riding the wheel.
  const copy = els.filter((e) => e.angle === undefined && e.type === 'text' && e.text);
  if (!copy.length) return;

  // The active node is whichever one lands nearest 0° once the structure has finished turning.
  const landed = (e: SceneElement) => Math.abs((e.angle ?? 0) + device.spinDeg);
  const active = nodes.reduce((best, n) => (landed(n) < landed(best) ? n : best));

  // Stack the copy beside that node in the order the model wrote it — that order is its
  // reading order, and re-sorting it would invent a hierarchy the model did not ask for.
  //
  // Every element is drawn from its CENTRE, so a shared offset does not left-align a block —
  // it centres each line on the same point and slides the widest one back over the numeral.
  // A hero "8000" is nearly half the frame wide and did exactly that. Offsetting each line by
  // the gap PLUS its own half-width puts every left edge on one line, clear of the node.
  // Where that node ends up: the copy has the frame from there to the right edge, not the
  // whole width the fit pass measured against. A line sized for the full frame overhangs.
  /**
   * WHICH WAY THE COPY SITS depends on the track.
   *
   * Beside the node is right for a wheel or a list: the node sits at one edge and the frame
   * opens to its side. It is wrong for a strip or a board, whose active slot is in the
   * MIDDLE — pushing the copy right pinned a hero headline against the right edge and
   * squeezed it to a third of its size to fit. Those stack their copy ABOVE the slot, which
   * is where a chart's label lives anyway.
   */
  const beside = device.kind === 'arc' || device.kind === 'stack';

  // Where the node actually ends up, whatever kind of track it rides. Beside it, the copy has
  // only the frame from there to the right edge — not the whole width the fit pass measured.
  const nodeX = devicePose(device, active.angle ?? 0, 1, ar).x;
  const room = beside ? Math.max(20, 94 - (nodeX + RIDER_GAP)) : 84;

  const total = copy.reduce((s, e) => s + (RIDER_H[e.size ?? 'body'] ?? RIDER_H.body), 0);
  // Beside: centred on the node. Above: the whole block sits clear above it.
  let cursor = beside ? -total / 2 : -total - RIDER_GAP;
  for (const e of copy) {
    const h = RIDER_H[e.size ?? 'body'] ?? RIDER_H.body;
    e.angle = active.angle;
    const w = textWidthPct(e, ar);
    if (w > room) {
      e.scale = Math.max(0.35, (e.scale ?? 1) * (room / w));
      rejected.push(`"${e.text}" did not fit ${beside ? 'beside' : 'above'} the node — scaled to the room it has`);
    }
    e.ox = beside ? clamp(RIDER_GAP + textWidthPct(e, ar) / 2, -40, 40) : 0;
    e.oy = clamp(cursor + h / 2, -40, 40);
    cursor += h;
  }
  rejected.push(`copy was parked off the device — bound to node "${active.text ?? ''}" so it travels with it`);
}

/** Where a device member sits, and how strongly it is the ACTIVE one. */
export interface OrbitPose {
  x: number;
  y: number;
  /** 1 at the active angle, falling to 0 away from it. Drives size and opacity. */
  focus: number;
}

/**
 * Resolve an element's place on the device at time t.
 *
 * The structure moves as ONE — that is the animation. A member's live position is its own
 * position plus however far the structure has advanced so far, and whichever member ends up
 * nearest the active point (0) is the live one. That is why the numbers in the reference can
 * be ghosted on the curve and huge at the centre without being different objects: they are
 * the same object at different positions.
 *
 * Every kind shares that rule and differs only in where a position lands on screen, so a
 * carousel and a wheel are the same animation drawn on a different track.
 *
 * `progress` is 0..1 across the moment, eased by the caller.
 */
export function devicePose(
  device: SceneDevice,
  /** Degrees on an arc; slot index on a line, stack or grid. */
  pos: number,
  progress: number,
  /** The clip's width ÷ height. Defaults to the 9:16 this was written against. */
  aspect = DEFAULT_AR,
): OrbitPose {
  const live = pos + device.spinDeg * clamp01(progress);

  // A distance given in "% of frame height" covers a different share of the WIDTH, so the
  // circle needs the frame's real ratio or it reads as an ellipse squashed the wrong way —
  // and on a landscape clip it was squashed against a 9:16 that was not there.
  const ASPECT = aspect;

  if (device.kind === 'arc') {
    const rad = (live * Math.PI) / 180;
    return {
      x: device.cx + Math.cos(rad) * device.radius * ASPECT,
      y: device.cy + Math.sin(rad) * device.radius,
      // Focus falls off over ~40°: at the active node it is 1, one node away it is near 0.
      focus: clamp01(1 - Math.abs(live) / 40),
    };
  }

  if (device.kind === 'grid') {
    // A board does not travel — the LIGHT does. Members hold their cells and focus moves
    // from one to the next, which is what a grid reference actually does.
    const cols = device.cols ?? 3;
    const cell = Math.round(pos);
    const col = ((cell % cols) + cols) % cols;
    const row = Math.floor(cell / cols);
    // A COLUMN STEP IS A SHARE OF THE WIDTH; a row step is the same PIXEL distance expressed
    // against the height, which is that share times the aspect. It was the other way round,
    // and on a 16:9 take a five-column grid at pitch 32 put its first cell at x = -64%.
    const rows = device.rows ?? 2;
    return {
      x: device.cx + (col - (cols - 1) / 2) * device.radius,
      // Centred on however many rows there ARE — (row - 0.5) assumed two of them, so a single
      // row of cells sat half a pitch above where the design put it.
      y: device.cy + (row - (rows - 1) / 2) * (device.rowGap ?? device.radius * ASPECT),
      // Wide enough that the handoff between cells reads as the light TRAVELLING rather than
      // snapping — at 1.05 a cell was lit or it was not, and the board never appeared to move.
      focus: clamp01(1 - Math.abs(live) / 1.45),
    };
  }

  // line | stack — members slide along one axis through the active point.
  //
  // A track's spacing is in the units of the axis it runs along: % of frame WIDTH for a strip,
  // % of frame HEIGHT for a stack. Squashing a strip's spacing by the frame aspect (which is
  // right for an arc, where it keeps a circle from reading as the wrong ellipse) made every
  // horizontal step three times tighter than asked for — a strip whose members were 22-28%
  // wide got 7.9% between them, so they could not help but overlap.
  const along = live * device.radius;
  return {
    x: device.kind === 'line' ? device.cx + along : device.cx,
    y: device.kind === 'line' ? device.cy : device.cy + along,
    // Focus falls off over ~1.6 slots: the neighbours are present but clearly secondary.
    focus: clamp01(1 - Math.abs(live) / 1.6),
  };
}

export function elementPose(el: SceneElement, tMs: number, holdMs: number): ElementPose {
  const local = tMs - el.at;
  if (local < 0) return { visible: false, opacity: 0, dx: 0, dy: 0, scale: 1, reveal: 0 };

  const k = clamp01(local / Math.max(1, el.dur ?? 260));
  const eased = easeOut(k);
  const popped = back(k);

  let opacity = 1, dx = 0, dy = 0, scale = 1, reveal = 1;
  switch (el.enter) {
    case 'pop':  scale = 0.82 + 0.18 * popped; opacity = clamp01(local / 90); break;
    case 'rise': dy = (1 - eased) * 5; opacity = eased; break;
    case 'fall': dy = (1 - eased) * -5; opacity = eased; break;
    case 'wipe': reveal = eased; break;
    case 'draw': reveal = eased; break;
    case 'fade': opacity = eased; break;
    case 'none': break;
  }

  // ── THE HOLD IS NOT A FREEZE ────────────────────────────────────────────
  // Once the entrance is done the element keeps moving for the rest of its life. This is the
  // difference between an animation and a PNG that appeared: measured before this existed,
  // 74% of a 2.6s hold had a pose identical to the frame before it.
  const entered = el.at + (el.dur ?? 260);
  if (tMs > entered) {
    const span = Math.max(1, holdMs - entered);
    const hp = clamp01((tMs - entered) / span);
    const m = el.move;
    dx += (m?.dx ?? 0) * hp;
    dy += (m?.dy ?? DRIFT_DY) * hp;
    scale *= 1 + (m?.scale ?? DRIFT_SCALE) * hp;
  }

  // The exit runs in the last 220ms of the hold. A cut simply stops — the measured styles
  // never fade a graphic out, they remove it.
  const EXIT_MS = 220;
  const toEnd = holdMs - tMs;
  if (toEnd < EXIT_MS && el.exit !== 'cut') {
    const q = clamp01(toEnd / EXIT_MS);
    if (el.exit === 'fade') opacity *= q;
    if (el.exit === 'fall') { opacity *= q; dy += (1 - q) * 4; }
  }

  return { visible: true, opacity: clamp01(opacity), dx, dy, scale, reveal: clamp01(reveal) };
}

/**
 * MATCH THE ANIMATION TO THE MEANING.
 *
 * "figure — a number or result -> promote it: the figure alone, hero scale" has been in the
 * planning prompt from the start. Rendered, a real model answered a figure moment about
 * "1.5 lakh users" with a five-cell board reading USERS / LANGUAGES / TYPOGRAPHY / TEMPLATES /
 * 1 CLICK — none of them the spoken number, the number itself set small in a corner, and the
 * whole thing arriving as ghosts that fade up and stop. Watched back, that is what "there are
 * no good animations" looks like: the same board whatever the sentence meant.
 *
 * So the promotion is done here rather than asked for:
 *   · whatever carries the figure becomes the hero, at hero size, and it POPS in;
 *   · the supporting label stays, small, and nothing else does;
 *   · the structure goes — "everything clears" is the whole instruction.
 *
 * Returns the device to keep, which for a figure is none.
 */
export function promoteTheFigure(
  els: SceneElement[],
  anchor: string,
  rejected: string[],
  ar = DEFAULT_AR,
): void {
  const texts = els.filter((e) => e.type === 'text' && e.text);
  if (texts.length < 1) return;

  // The figure is the digits the moment is anchored on; failing that, the shortest line, which
  // is what a number looks like next to its label.
  const digits = (s: string) => (s.match(/[\d][\d.,]*/g) ?? []).join('');
  const wanted = digits(anchor);
  const carries = (e: SceneElement) => (wanted ? digits(e.text!).includes(wanted.slice(0, 3)) : false);

  const hero = texts.find(carries)
    ?? texts.slice().sort((a, b) => (a.text!.length - b.text!.length))[0];
  if (!hero) return;

  // Its own label: the line the model wrote nearest it that is not the figure.
  const label = texts.filter((e) => e !== hero)
    .sort((a, b) => Math.abs(a.at - hero.at) - Math.abs(b.at - hero.at))[0];

  // Light is not competition. A glow is the stage the figure stands on — clearing it along
  // with the board left the number alone on a flat black rectangle, which is emptier than the
  // thing it was fixing.
  const atmosphere = els.filter((e) => e.type === 'glow');
  const keep = new Set<SceneElement>([...atmosphere, hero, ...(label ? [label] : [])]);
  const dropped = els.length - keep.size;

  els.length = 0;
  els.push(...keep);

  hero.size = 'hero';
  /**
   * WITH EVERYTHING CLEARED, THE FIGURE TAKES THE ROOM.
   *
   * "Hero scale" at 1x is 11.5% of frame height, which is right when a figure shares the frame
   * and timid when it IS the frame — rendered, a promoted number on an otherwise empty 16:9
   * frame read as a caption. It goes to about a fifth of the frame's height, then straight
   * back down if that makes it wider than the picture.
   */
  const TARGET_H = 21;
  hero.scale = Math.max(hero.scale ?? 1, TARGET_H / (SIZE_FRAC.hero * 100));
  const wide = textWidthPct(hero, ar);
  if (wide > 90) hero.scale *= 90 / wide;
  hero.enter = 'pop';
  hero.dur = clamp(hero.dur ?? 220, 120, 260);
  hero.at = 0;
  hero.angle = undefined;
  hero.ox = undefined;
  hero.oy = undefined;
  // A promoted figure that lands and stops is a still. It keeps growing, gently, for the hold.
  hero.move = { dx: 0, dy: hero.move?.dy ?? -1.2, scale: Math.max(hero.move?.scale ?? 0, 0.06) };

  // Composed as ONE lockup, on the light rather than under it: rendered, the number sat at
  // y=67 while the glow it was meant to stand in was at y=46, so the frame read as two
  // unrelated things. With everything else cleared there is no reason not to centre it.
  const light = atmosphere[0];
  hero.x = 50;
  hero.y = light ? light.y : 48;
  hero.rotate = 0;

  if (label) {
    label.size = 'kicker';
    label.x = 50;
    label.y = hero.y + textHeightPct(hero) / 2 + 3.5;
    label.enter = label.enter === 'pop' ? 'rise' : label.enter ?? 'rise';
    label.at = Math.max(140, Math.min(label.at, 420));
    label.angle = undefined;
    label.ox = undefined;
    label.oy = undefined;
  }

  if (dropped > 0) {
    rejected.push(
      `a figure moment was built as ${dropped + keep.size} things — promoted "${hero.text}" and cleared the rest`,
    );
  }
}
