// Brand Kit — a creator's reusable identity (up to 4 colours, a font, a logo) applied to a project in
// one click. This module is the PURE core, unit-tested in __tests__/brandKit.spec.ts:
//
//   1. mapBrandKit — which kit colour lands on which colour input of each template
//      (TEMPLATE_COLOR_RULES), plus the font (skipped for font-locked templates).
//   2. The ownership ledger — applyBrandPatch / remapBrandKit / removeBrandKitFromLook. A kit is
//      WRITTEN INTO the editor's existing look state (so preview and every export pick it up exactly
//      like a manual edit — no new render path), re-mapped when the template changes, and removed
//      again. Removal restores a field only if it still holds the kit's value, so an edit the
//      creator made after applying the kit survives "Remove kit".
//   3. Storage-record, logo-file and validation helpers (brandKitStore.ts does the IndexedDB I/O).
//
// A kit only ever writes inputs the templates ALREADY honour: captionTextColor, accentColor,
// emphasisStyle.hex, the Text-tab background, per-template slot colours and the custom font.

import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import { FONT_LOCKED_STYLES } from '@/remotion/KineticCaptionComposition';
import type { BackgroundConfig, EmphasisStyle, TemplateSlotOverrides, TextOverrides } from '@/types/transcript';
import { DEFAULT_ACCENT, DEFAULT_CAPTION_TEXT } from '@/lib/captionColors';
import {
  BRAND_LOGO_OPACITY, BRAND_LOGO_POSITIONS, BRAND_LOGO_SIZE,
  isBrandLogoDataUrl, sanitizeBrandLogo,
  type BrandLogoPosition, type BrandLogoProps,
} from '@/lib/brandLogo';

// ── Kit model ─────────────────────────────────────────────────────────────────

export type BrandColorRole = 'text' | 'highlight' | 'secondary' | 'box';
export const BRAND_COLOR_ROLES: readonly BrandColorRole[] = ['text', 'highlight', 'secondary', 'box'];
export const BRAND_COLOR_ROLE_LABELS: Record<BrandColorRole, string> = {
  text: 'Text',
  highlight: 'Highlight',
  secondary: 'Secondary',
  box: 'Box',
};

/** Every role optional — a kit carries "up to 4" colours. Values are #rrggbb. */
export type BrandKitColors = Partial<Record<BrandColorRole, string>>;

export interface BrandKitFont {
  /** CSS family name — the same value the Fonts panel selects. */
  name: string;
  /** A user upload (as opposed to a built-in / Google font). */
  isCustom: boolean;
  /** The font bytes, so the kit applies on any project (and exports embed it) without re-downloading. */
  data?: Uint8Array;
}

export interface BrandKitLogo {
  dataUrl: string;
  /** Natural width ÷ height. */
  aspect: number;
  position: BrandLogoPosition;
  sizePct: number;
  opacity: number;
  fileName?: string;
}

export interface BrandKit {
  id: string;
  name: string;
  colors: BrandKitColors;
  font?: BrandKitFont | null;
  logo?: BrandKitLogo | null;
  createdAt: number;
  updatedAt: number;
}

export const BRAND_KIT_NAME_MAX = 60;

export function createBrandKit(init: Partial<Omit<BrandKit, 'id' | 'createdAt' | 'updatedAt'>> = {}, now = Date.now()): BrandKit {
  return {
    id: `bk_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: init.name ?? 'My brand kit',
    colors: init.colors ?? {},
    font: init.font ?? null,
    logo: init.logo ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Colour helpers ────────────────────────────────────────────────────────────

/** `#abc` / `abc` / `#AABBCC` → `#aabbcc`; anything else → null. */
export function normalizeHex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let h = v.trim().toLowerCase();
  if (!h.startsWith('#')) h = `#${h}`;
  if (/^#[0-9a-f]{3}$/.test(h)) h = `#${h.slice(1).split('').map(c => c + c).join('')}`;
  return /^#[0-9a-f]{6}$/.test(h) ? h : null;
}

function relativeLuminance(hex: string): number {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}

/** WCAG contrast ratio, 1 – 21. Inputs must be #rrggbb. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG AA for large text — captions are large text. */
export const MIN_BRAND_CONTRAST = 3;

/**
 * captionTextColor / accentColor sitting at EXACTLY the editor default read as "not customised"
 * (captionColors.resolveUserColors), and several templates then show their signature colour instead —
 * a kit whose text is pure white would silently not apply to Hormozi, Prism, Mr Beast 2 and friends.
 * Shift the blue channel by 1/255 (imperceptible) so a kit colour always counts as a choice.
 */
export function explicitGlobalColor(hex: string, field: 'captionTextColor' | 'accentColor'): string {
  const def = field === 'captionTextColor' ? DEFAULT_CAPTION_TEXT : DEFAULT_ACCENT;
  if (hex !== def.toLowerCase()) return hex;
  const b = parseInt(hex.slice(5, 7), 16);
  return hex.slice(0, 5) + (b > 0 ? b - 1 : 1).toString(16).padStart(2, '0');
}

// ── Template colour roles ─────────────────────────────────────────────────────

/** A colour input a template honours. */
export type BrandColorTarget =
  | { kind: 'captionTextColor' }                                     // global Text colour
  | { kind: 'accentColor' }                                          // global Primary / accent
  | { kind: 'emphasisHex' }                                          // emphasisStyle.hex (hero family)
  | { kind: 'background'; radius: number; padW: number; padH: number } // Text-tab background, row pill
  | { kind: 'slot'; field: string };                                  // templateSlots[template][field]

/** What a colour is drawn ON, for the legibility check. */
export type BrandSurface =
  | { rule: string; fallback: string }   // the colour an earlier rule resolved to, else the template's own
  | { role: BrandColorRole }             // the kit's colour for that role (no check when the kit has none)
  | { fixed: string };                   // a colour the template hardcodes

export interface BrandColorRule {
  id: string;
  label: string;
  target: BrandColorTarget;
  /** Kit roles to try, in order. The first present (and legible) one wins. */
  roles: readonly BrandColorRole[];
  /** Must reach MIN_BRAND_CONTRAST against this surface. */
  on?: BrandSurface;
  /** The template's own colour for this input (what shows when the kit leaves it alone). */
  templateDefault?: string;
  /**
   * When the KIT changed the surface and neither a kit colour nor templateDefault is legible on it,
   * use whichever of black / white reads — e.g. dark text on a kit's dark pill.
   */
  legibleFallback?: boolean;
}

/** Templates whose per-template slot store is keyed differently from nothing (all keys = template id). */
export const TEMPLATE_SLOT_KEY: Partial<Record<CaptionStyleId, keyof TemplateSlotOverrides>> = {
  illusion: 'illusion',
  editor_masala: 'editor_masala',
  aura: 'aura',
  aura_helvetica: 'aura_helvetica',
  scribble: 'scribble',
  archives: 'archives',
  blockbuster: 'blockbuster',
  interlock: 'interlock',
  journal: 'journal',
};

/** The colour fields of each slot store (see src/types/transcript.ts + kineticSlots defaults). */
export const SLOT_COLOR_FIELDS: Record<keyof TemplateSlotOverrides, readonly string[]> = {
  illusion: ['baseColor', 'emphColor'],
  editor_masala: ['contextColor', 'heroAColor', 'heroBColor'],
  aura: ['baseColor', 'accentColor'],
  aura_helvetica: ['baseColor', 'accentColor'],
  scribble: ['noteColor', 'markerColor', 'inkColor', 'penColor'],
  archives: ['inkColor', 'emphColor'],
  blockbuster: ['redColor', 'scriptColor'],
  interlock: ['heroColor', 'capsColor'],
  journal: ['color', 'exitColor'],
};

const TEXT: BrandColorRule = { id: 'text', label: 'Text', target: { kind: 'captionTextColor' }, roles: ['text'] };
const TEXT_ONLY: readonly BrandColorRule[] = [TEXT];
// captik / captik_glow / captik_shadow: small context rows take the text colour, the big emphasised
// word takes accentColor — and emphasisStyle.hex too, which OVERRIDES the accent on emphasised words,
// so a leftover emphasis colour from before the kit can't hide the kit's highlight.
const HERO_RULES: readonly BrandColorRule[] = [
  TEXT,
  { id: 'accent', label: 'Big word', target: { kind: 'accentColor' }, roles: ['highlight'] },
  { id: 'emphasis', label: 'Emphasis', target: { kind: 'emphasisHex' }, roles: ['highlight'] },
];
const slotRule = (
  id: string, label: string, field: string, roles: BrandColorRule['roles'],
  extra: Partial<BrandColorRule> = {},
): BrandColorRule => ({ id, label, target: { kind: 'slot', field }, roles, ...extra });

/**
 * Per template: which kit colour feeds which colour input. Read from the render branches in
 * CaptionOverlay.tsx — a rule exists only where the branch really reads that input, and a kit never
 * adds an element a template doesn't have (no pill appears behind Hormozi because the kit has a box
 * colour). Rules are resolved in order, so a surface rule comes before the rules drawn on it.
 */
export const TEMPLATE_COLOR_RULES: Record<CaptionStyleId, readonly BrandColorRule[]> = {
  captik: HERO_RULES,
  captik_glow: HERO_RULES,
  captik_shadow: HERO_RULES,

  // Spoken words sit on a white pill (the row) in black; the pill is recoloured through the Text-tab
  // background (the same radius/padding the branch hardcodes), and the text must stay readable on it.
  ali_abdaal: [
    { id: 'pill', label: 'Pill', target: { kind: 'background', radius: 14, padW: 36, padH: 16 }, roles: ['box'], on: { role: 'text' } },
    { ...TEXT, on: { rule: 'pill', fallback: '#ffffff' }, templateDefault: '#000000', legibleFallback: true },
  ],
  // The spoken word gets a coloured bubble (accentColor) with BLACK text the branch hardcodes.
  bubble: [
    { id: 'bubble', label: 'Word bubble', target: { kind: 'accentColor' }, roles: ['box', 'highlight'], on: { fixed: '#000000' } },
    TEXT,
  ],
  // The whole line sits in a coloured box (accentColor) in the text colour.
  boxed: [
    { id: 'box', label: 'Box', target: { kind: 'accentColor' }, roles: ['box', 'highlight'], on: { role: 'text' } },
    { ...TEXT, on: { rule: 'box', fallback: '#f48601' }, templateDefault: '#ffffff', legibleFallback: true },
  ],
  highlighted_word: [
    TEXT,
    { id: 'accent', label: 'Spoken word', target: { kind: 'accentColor' }, roles: ['highlight'] },
  ],

  clean_motion: TEXT_ONLY,
  hormozi: TEXT_ONLY,            // the gradient + shadow are rebuilt from the text colour
  mrbeast: TEXT_ONLY,
  mr_beast_2: TEXT_ONLY,
  iman_gadzhi: TEXT_ONLY,
  prism: TEXT_ONLY,
  devin_jatho: TEXT_ONLY,
  clean_glow: TEXT_ONLY,
  captik_clean: TEXT_ONLY,
  captik_word: TEXT_ONLY,
  pixelated: TEXT_ONLY,
  liquid_glass: TEXT_ONLY,       // the frosted glass pill IS the template — only the text recolours
  tabahi: TEXT_ONLY,
  deep_glow: TEXT_ONLY,          // text colour drives the glow
  seedha_saadha: TEXT_ONLY,
  thora_cinematic: TEXT_ONLY,
  delhi: TEXT_ONLY,
  big_reveal: TEXT_ONLY,         // the yellow title is hardcoded
  big_red: TEXT_ONLY,            // the red title gradient is hardcoded
  black_punch: [],               // black-in-white-outline by design, no colour inputs

  illusion: [
    slotRule('text', 'Words', 'baseColor', ['text']),
    slotRule('emph', 'Glitch word', 'emphColor', ['highlight']),
  ],
  editor_masala: [
    slotRule('text', 'Context words', 'contextColor', ['text']),
    slotRule('heroB', 'Punch word', 'heroBColor', ['highlight']),
    slotRule('heroA', 'Script word', 'heroAColor', ['secondary']),
  ],
  aura: [
    slotRule('text', 'Words', 'baseColor', ['text']),
    slotRule('accent', 'Accent', 'accentColor', ['highlight']),
  ],
  aura_helvetica: [
    slotRule('text', 'Words', 'baseColor', ['text']),
    slotRule('accent', 'Accent', 'accentColor', ['highlight']),
  ],
  // The highlighter marker is the highlight; the word ON it needs to read against it.
  scribble: [
    slotRule('note', 'Words', 'noteColor', ['text']),
    slotRule('marker', 'Marker', 'markerColor', ['highlight', 'box']),
    slotRule('ink', 'Ink on marker', 'inkColor', ['text'], { on: { rule: 'marker', fallback: '#ffe042' }, templateDefault: '#241c12', legibleFallback: true }),
    slotRule('pen', 'Pen circle', 'penColor', ['secondary']),
  ],
  archives: [
    slotRule('ink', 'Ink', 'inkColor', ['text']),
    slotRule('emph', 'Emphasis', 'emphColor', ['highlight']),
  ],
  blockbuster: [
    slotRule('red', 'Caps run', 'redColor', ['highlight']),
    slotRule('script', 'Script', 'scriptColor', ['text']),
  ],
  interlock: [
    slotRule('caps', 'Small words', 'capsColor', ['text']),
    slotRule('hero', 'Big word', 'heroColor', ['highlight']),
  ],
  journal: [
    slotRule('text', 'Words', 'color', ['text']),
    slotRule('exit', 'Turns to', 'exitColor', ['secondary', 'highlight']),
  ],
};

/** Templates where some colour is part of the design and a kit leaves it alone — shown as a note. */
export const TEMPLATE_FIXED_COLOUR_NOTES: Partial<Record<CaptionStyleId, string>> = {
  black_punch: 'Black Punch is black text in a white outline by design, so its colours stay as they are.',
  big_reveal: 'The big yellow title keeps its colour; the caption under it takes the kit text colour.',
  big_red: 'The red title keeps its colour; the caption across it takes the kit text colour.',
};

/** The kit roles a template reads (drives the "Uses" line in the panel). */
export function rolesUsedByTemplate(styleId: CaptionStyleId): BrandColorRole[] {
  const used = new Set<BrandColorRole>();
  for (const r of TEMPLATE_COLOR_RULES[styleId] ?? []) r.roles.forEach(role => used.add(role));
  return BRAND_COLOR_ROLES.filter(role => used.has(role));
}

export function isFontLockedTemplate(styleId: string): boolean {
  return (FONT_LOCKED_STYLES as readonly string[]).includes(styleId);
}

// ── Look state + patches ──────────────────────────────────────────────────────

export interface BrandFontState {
  name: string | null;
  data: Uint8Array | null;
  isCustom: boolean;
}

/** The slice of editor state a kit may write. */
export interface BrandLook {
  captionTextColor: string;
  accentColor: string;
  emphasisStyle: EmphasisStyle;
  templateSlots: TemplateSlotOverrides;
  textOverrides: TextOverrides;
  font: BrandFontState;
}

export type BrandPatchValue = string | BackgroundConfig | BrandFontState;

/**
 * Keyed by path: 'captionTextColor' | 'accentColor' | 'emphasisHex' | 'background' | 'font' |
 * `slot:<template>.<field>`. Slot paths are template-scoped; the rest are global.
 */
export type BrandLookPatch = Record<string, BrandPatchValue>;

export type BrandKitNote =
  | { kind: 'font-locked' }
  | { kind: 'fixed-colours'; text: string }
  | { kind: 'legibility'; label: string };

export interface BrandKitMapping {
  patch: BrandLookPatch;
  notes: BrandKitNote[];
}

const isSlotPath = (path: string) => path.startsWith('slot:');

function targetPath(styleId: CaptionStyleId, target: BrandColorTarget): string | null {
  if (target.kind !== 'slot') return target.kind;
  const key = TEMPLATE_SLOT_KEY[styleId];
  return key ? `slot:${key}.${target.field}` : null;
}

function targetValue(target: BrandColorTarget, hex: string): BrandPatchValue {
  switch (target.kind) {
    case 'captionTextColor': return explicitGlobalColor(hex, 'captionTextColor');
    case 'accentColor':      return explicitGlobalColor(hex, 'accentColor');
    case 'background':       return { hex, opacity: 100, radius: target.radius, padW: target.padW, padH: target.padH };
    default:                 return hex;
  }
}

/** Resolve one template's colour rules against a kit. */
export function mapBrandColors(styleId: CaptionStyleId, colors: BrandKitColors | undefined): BrandKitMapping {
  const kit: BrandKitColors = {};
  for (const role of BRAND_COLOR_ROLES) {
    const hex = normalizeHex(colors?.[role]);
    if (hex) kit[role] = hex;
  }
  const patch: BrandLookPatch = {};
  const notes: BrandKitNote[] = [];
  const resolved: Record<string, string> = {};

  for (const rule of TEMPLATE_COLOR_RULES[styleId] ?? []) {
    const path = targetPath(styleId, rule.target);
    if (!path) continue;

    let surface: string | null = null;
    let surfaceFromKit = false;
    if (rule.on && 'rule' in rule.on) {
      surfaceFromKit = rule.on.rule in resolved;
      surface = resolved[rule.on.rule] ?? normalizeHex(rule.on.fallback);
    } else if (rule.on && 'role' in rule.on) {
      surface = kit[rule.on.role] ?? null;
      surfaceFromKit = surface !== null;
    } else if (rule.on && 'fixed' in rule.on) {
      surface = normalizeHex(rule.on.fixed);
    }

    let chosen: string | null = null;
    let blocked = false;
    for (const role of rule.roles) {
      const hex = kit[role];
      if (!hex) continue;
      if (!surface || contrastRatio(hex, surface) >= MIN_BRAND_CONTRAST) { chosen = hex; break; }
      blocked = true;
    }
    if (!chosen && rule.legibleFallback && surface && surfaceFromKit) {
      const def = normalizeHex(rule.templateDefault);
      if (!def || contrastRatio(def, surface) < MIN_BRAND_CONTRAST) {
        chosen = contrastRatio('#000000', surface) >= contrastRatio('#ffffff', surface) ? '#000000' : '#ffffff';
      }
    }
    if (blocked) notes.push({ kind: 'legibility', label: rule.label });
    if (!chosen) continue;

    resolved[rule.id] = chosen;
    patch[path] = targetValue(rule.target, chosen);
  }
  return { patch, notes };
}

/** The font part of a kit for one template. Font-locked templates never take it. */
export function mapBrandFont(
  styleId: CaptionStyleId, font: BrandKitFont | null | undefined,
): { patch?: BrandFontState; note?: BrandKitNote } {
  if (!font?.name) return {};
  if (isFontLockedTemplate(styleId)) return { note: { kind: 'font-locked' } };
  return { patch: { name: font.name, data: font.data ?? null, isCustom: !!font.isCustom } };
}

/**
 * The full patch for applying `kit` while `styleId` is the project template. `lineStyleIds` are the
 * per-caption template overrides in use: their SLOT colours are mapped too (slot stores are per
 * template, so they never conflict), while the global fields follow the project template.
 */
export function mapBrandKit(
  styleId: CaptionStyleId, kit: Pick<BrandKit, 'colors' | 'font'>, lineStyleIds: readonly string[] = [],
): BrandKitMapping {
  const main = mapBrandColors(styleId, kit.colors);
  const patch: BrandLookPatch = { ...main.patch };
  for (const other of new Set(lineStyleIds)) {
    if (other === styleId || !(other in TEMPLATE_COLOR_RULES)) continue;
    const extra = mapBrandColors(other as CaptionStyleId, kit.colors);
    for (const [path, value] of Object.entries(extra.patch)) {
      if (isSlotPath(path) && !(path in patch)) patch[path] = value;
    }
  }
  const notes: BrandKitNote[] = [];
  const fixed = TEMPLATE_FIXED_COLOUR_NOTES[styleId];
  if (fixed) notes.push({ kind: 'fixed-colours', text: fixed });
  notes.push(...main.notes);
  const font = mapBrandFont(styleId, kit.font);
  if (font.patch) patch.font = font.patch;
  if (font.note) notes.push(font.note);
  return { patch, notes };
}

/** Identifies the template set a mapping was computed for; a change triggers a re-map. */
export function brandMapKey(styleId: string, lineStyleIds: readonly string[] = []): string {
  return `${styleId}|${[...new Set(lineStyleIds)].sort().join(',')}`;
}

// ── Ownership ledger ──────────────────────────────────────────────────────────

/**
 * Fields the applied kit currently owns: `written` is what the kit put there, `before` what was
 * there when the kit first took the field (null = absent). Plain data, persisted in the project
 * snapshot so "Remove kit" still works after a reload.
 */
export interface BrandLedger {
  before: Record<string, BrandPatchValue | null>;
  written: Record<string, BrandPatchValue>;
}

export const emptyBrandLedger = (): BrandLedger => ({ before: {}, written: {} });

const SLOT_PATH = /^slot:([a-z_]+)\.([A-Za-z]+)$/;

export function getBrandPath(look: BrandLook, path: string): BrandPatchValue | null {
  switch (path) {
    case 'captionTextColor': return look.captionTextColor;
    case 'accentColor':      return look.accentColor;
    case 'emphasisHex':      return look.emphasisStyle.hex ?? null;
    case 'background':       return look.textOverrides.background ?? null;
    case 'font':             return look.font.name ? look.font : null;
  }
  const m = SLOT_PATH.exec(path);
  if (!m) return null;
  const store = (look.templateSlots as Record<string, Record<string, unknown> | undefined>)[m[1]];
  const v = store?.[m[2]];
  return typeof v === 'string' ? v : null;
}

/** Immutable write; `null` removes the value (sparse overrides fall back to the template's own). */
export function setBrandPath(look: BrandLook, path: string, value: BrandPatchValue | null): BrandLook {
  switch (path) {
    case 'captionTextColor':
      return { ...look, captionTextColor: typeof value === 'string' ? value : DEFAULT_CAPTION_TEXT };
    case 'accentColor':
      return { ...look, accentColor: typeof value === 'string' ? value : DEFAULT_ACCENT };
    case 'emphasisHex': {
      const next = { ...look.emphasisStyle };
      if (typeof value === 'string') next.hex = value; else delete next.hex;
      return { ...look, emphasisStyle: next };
    }
    case 'background': {
      const next = { ...look.textOverrides };
      if (value && typeof value === 'object' && 'hex' in value) next.background = value; else delete next.background;
      return { ...look, textOverrides: next };
    }
    case 'font':
      return {
        ...look,
        font: value && typeof value === 'object' && 'name' in value && value.name
          ? { name: value.name, data: value.data ?? null, isCustom: !!value.isCustom }
          : { name: null, data: null, isCustom: false },
      };
  }
  const m = SLOT_PATH.exec(path);
  if (!m) return look;
  const slots = { ...(look.templateSlots as Record<string, Record<string, unknown> | undefined>) };
  const store = { ...(slots[m[1]] ?? {}) };
  if (typeof value === 'string') store[m[2]] = value; else delete store[m[2]];
  if (Object.keys(store).length) slots[m[1]] = store; else delete slots[m[1]];
  return { ...look, templateSlots: slots as TemplateSlotOverrides };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a as object).filter(k => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter(k => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Does the look still hold what the kit wrote? Colours compare case-insensitively, fonts by name. */
export function sameBrandValue(current: BrandPatchValue | null, written: BrandPatchValue | null): boolean {
  if (current === null || written === null) return current === written;
  if (typeof current === 'string' || typeof written === 'string') {
    return typeof current === 'string' && typeof written === 'string' && current.toLowerCase() === written.toLowerCase();
  }
  if ('name' in current || 'name' in written) {
    return 'name' in current && 'name' in written && current.name === written.name && !!current.isCustom === !!written.isCustom;
  }
  return deepEqual({ ...current, hex: current.hex.toLowerCase() }, { ...written, hex: written.hex.toLowerCase() });
}

/** Font bytes live in the kit already — the ledger's `written` stamp only needs the identity. */
const writtenStamp = (path: string, value: BrandPatchValue): BrandPatchValue =>
  path === 'font' && typeof value === 'object' && 'name' in value
    ? { name: value.name, data: null, isCustom: value.isCustom }
    : value;

/** Write a patch, taking ownership of each field (recording its prior value the first time). */
export function applyBrandPatch(
  look: BrandLook, patch: BrandLookPatch, ledger: BrandLedger = emptyBrandLedger(),
): { look: BrandLook; ledger: BrandLedger } {
  let next = look;
  const out: BrandLedger = { before: { ...ledger.before }, written: { ...ledger.written } };
  for (const [path, value] of Object.entries(patch)) {
    if (!Object.prototype.hasOwnProperty.call(out.written, path)) out.before[path] = getBrandPath(look, path);
    next = setBrandPath(next, path, value);
    out.written[path] = writtenStamp(path, value);
  }
  return { look: next, ledger: out };
}

/**
 * Re-map an applied kit onto a new template set (or apply it fresh, with an empty ledger):
 *   · a global field the new mapping no longer uses is handed back — restored if it still holds the
 *     kit's value (so a text colour meant for Ali Abdaal's pill, or a font a font-locked template
 *     won't take, doesn't linger), released as-is if something else changed it since;
 *   · a field the new mapping uses but that changed since the kit wrote it (a template switch
 *     reset it, a preset replaced it) re-records its prior value, so removal returns to THAT;
 *   · slot fields of templates no longer on screen stay owned — they're template-scoped and harmless,
 *     and removal can still restore them.
 */
export function remapBrandKit(
  look: BrandLook, ledger: BrandLedger, patch: BrandLookPatch,
): { look: BrandLook; ledger: BrandLedger } {
  let cur = look;
  const next: BrandLedger = { before: { ...ledger.before }, written: { ...ledger.written } };
  for (const path of Object.keys(next.written)) {
    const unchanged = sameBrandValue(getBrandPath(cur, path), next.written[path]);
    if (path in patch) {
      if (unchanged) continue;
    } else if (isSlotPath(path)) {
      continue;
    } else if (unchanged) {
      cur = setBrandPath(cur, path, next.before[path] ?? null);
    }
    delete next.written[path];
    delete next.before[path];
  }
  return applyBrandPatch(cur, patch, next);
}

/** "Remove kit": hand every owned field back, restoring those that still hold the kit's value. */
export function removeBrandKitFromLook(look: BrandLook, ledger: BrandLedger): BrandLook {
  let cur = look;
  for (const [path, written] of Object.entries(ledger.written)) {
    if (sameBrandValue(getBrandPath(cur, path), written)) cur = setBrandPath(cur, path, ledger.before[path] ?? null);
  }
  return cur;
}

/**
 * The editor remembers each template's Text/Primary colours across template switches. Those memories
 * must hold the creator's OWN colours, not the kit's, or removing the kit and switching back would
 * resurrect kit colours. Swap any kit-written value for what it replaced.
 */
export function withoutBrandColors<T extends { accentColor: string; captionTextColor: string }>(
  colors: T, ledger: BrandLedger | null | undefined,
): T {
  if (!ledger) return colors;
  const out = { ...colors };
  for (const field of ['accentColor', 'captionTextColor'] as const) {
    const written = ledger.written[field];
    if (written !== undefined && sameBrandValue(colors[field], written)) {
      const before = ledger.before[field];
      out[field] = typeof before === 'string' ? before : (field === 'accentColor' ? DEFAULT_ACCENT : DEFAULT_CAPTION_TEXT);
    }
  }
  return out;
}

// ── Applied state (persisted in the project snapshot) ─────────────────────────

export interface AppliedBrandKit {
  /** A full copy — the project keeps its kit (logo, font bytes) even if the library kit is deleted. */
  kit: BrandKit;
  ledger: BrandLedger;
  /** brandMapKey of the template set the ledger was last mapped for. */
  mappedFor: string;
  notes: BrandKitNote[];
  appliedAt: number;
}

// ── Validation / normalisation (persisted data is untyped at runtime) ─────────

const finiteOr = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function normalizeBrandKit(input: unknown): BrandKit | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;

  const colors: BrandKitColors = {};
  const rawColors = (o.colors && typeof o.colors === 'object') ? o.colors as Record<string, unknown> : {};
  for (const role of BRAND_COLOR_ROLES) {
    const hex = normalizeHex(rawColors[role]);
    if (hex) colors[role] = hex;
  }

  let font: BrandKitFont | null = null;
  if (o.font && typeof o.font === 'object') {
    const f = o.font as Record<string, unknown>;
    if (typeof f.name === 'string' && f.name.trim()) {
      font = { name: f.name.trim(), isCustom: !!f.isCustom };
      if (f.data instanceof Uint8Array && f.data.byteLength > 0) font.data = f.data;
    }
  }

  let logo: BrandKitLogo | null = null;
  if (o.logo && typeof o.logo === 'object') {
    const l = o.logo as Record<string, unknown>;
    if (isBrandLogoDataUrl(l.dataUrl)) {
      logo = {
        dataUrl: l.dataUrl,
        aspect: clamp(finiteOr(l.aspect, 1), 0.05, 20),
        position: BRAND_LOGO_POSITIONS.includes(l.position as BrandLogoPosition) ? l.position as BrandLogoPosition : 'top-right',
        sizePct: clamp(finiteOr(l.sizePct, BRAND_LOGO_SIZE.default), BRAND_LOGO_SIZE.min, BRAND_LOGO_SIZE.max),
        opacity: clamp(finiteOr(l.opacity, BRAND_LOGO_OPACITY.default), BRAND_LOGO_OPACITY.min, BRAND_LOGO_OPACITY.max),
      };
      if (typeof l.fileName === 'string') logo.fileName = l.fileName.slice(0, 200);
    }
  }

  const name = (typeof o.name === 'string' ? o.name.trim() : '').slice(0, BRAND_KIT_NAME_MAX) || 'My brand kit';
  const createdAt = finiteOr(o.createdAt, 0);
  return { id: o.id, name, colors, font, logo, createdAt, updatedAt: finiteOr(o.updatedAt, createdAt) };
}

export function normalizeAppliedBrandKit(input: unknown): AppliedBrandKit | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const kit = normalizeBrandKit(o.kit);
  if (!kit) return null;
  const l = (o.ledger && typeof o.ledger === 'object') ? o.ledger as Record<string, unknown> : {};
  const plain = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, never>) } : {});
  const notes = Array.isArray(o.notes)
    ? (o.notes as unknown[]).filter((n): n is BrandKitNote => !!n && typeof n === 'object' && typeof (n as { kind?: unknown }).kind === 'string')
    : [];
  return {
    kit,
    ledger: { before: plain(l.before), written: plain(l.written) },
    mappedFor: typeof o.mappedFor === 'string' ? o.mappedFor : '',
    notes,
    appliedAt: finiteOr(o.appliedAt, 0),
  };
}

/** The render prop for the preview + every exporter, or undefined when the kit has no (valid) logo. */
export function brandLogoFromKit(kit: BrandKit | null | undefined): BrandLogoProps | undefined {
  const l = kit?.logo;
  if (!l) return undefined;
  return sanitizeBrandLogo({ src: l.dataUrl, aspect: l.aspect, position: l.position, sizePct: l.sizePct, opacity: l.opacity }) ?? undefined;
}

// ── Logo files ────────────────────────────────────────────────────────────────

export const BRAND_LOGO_MAX_BYTES = 1024 * 1024;
const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/svg+xml': 'svg+xml',
};
const LOGO_EXTS: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml',
};

/** The image MIME type for an upload (browsers report '' for some files, e.g. SVG on Windows). */
export function brandLogoMime(file: { name?: string; type?: string }): string | null {
  if (file.type && LOGO_TYPES[file.type]) return file.type;
  if (file.type) return null;
  const ext = (file.name ?? '').split('.').pop()?.toLowerCase() ?? '';
  return LOGO_EXTS[ext] ?? null;
}

/** A user-facing error for an unusable logo file, or null. */
export function validateBrandLogoFile(file: { name?: string; type?: string; size: number }): string | null {
  if (!brandLogoMime(file)) return 'Logo must be a PNG, JPG, WebP or SVG image.';
  if (file.size <= 0) return 'That file is empty.';
  if (file.size > BRAND_LOGO_MAX_BYTES) return 'Logo must be 1 MB or smaller.';
  return null;
}

/** Intrinsic size of an SVG from its width/height attributes, else its viewBox. */
export function svgIntrinsicSize(svg: string): { w: number; h: number } | null {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0];
  if (!tag) return null;
  const attr = (name: string) => {
    const m = new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px)?\\s*["']`, 'i').exec(tag);
    return m ? parseFloat(m[1]) : NaN;
  };
  const w = attr('width');
  const h = attr('height');
  if (w > 0 && h > 0) return { w, h };
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
  if (vb) {
    const vw = parseFloat(vb[1]);
    const vh = parseFloat(vb[2]);
    if (vw > 0 && vh > 0) return { w: vw, h: vh };
  }
  return null;
}

// ── Storage records (the IndexedDB `presets` store) ───────────────────────────

export const BRAND_KIT_RECORD_KIND = 'brandKit';

/**
 * Kits share the `presets` object store with My Presets (no DB_VER bump — see openCaptikDB), told
 * apart by `kind`. listPresets filters them out. A tab still running the PREVIOUS build doesn't know
 * that filter and lists every record as a preset; so a kit record also carries the StylePreset
 * fields, and clicking it in such a tab applies a sensible look instead of crashing the editor on
 * an undefined captionBox / accentColor.
 */
export interface BrandKitRecord {
  id: string;
  kind: typeof BRAND_KIT_RECORD_KIND;
  name: string;
  savedAt: number;
  kit: BrandKit;
  styleId: 'hormozi';
  accentColor: string;
  captionTextColor: string;
  captionBox: { xPercent: number; yPercent: number; widthPercent: number };
  captionFontScale: number;
  captionLines: 'single';
}

export function toBrandKitRecord(kit: BrandKit): BrandKitRecord {
  return {
    id: kit.id,
    kind: BRAND_KIT_RECORD_KIND,
    name: kit.name,
    savedAt: kit.updatedAt,
    kit,
    styleId: 'hormozi',
    accentColor: kit.colors.highlight ?? DEFAULT_ACCENT,
    captionTextColor: kit.colors.text ?? DEFAULT_CAPTION_TEXT,
    captionBox: { xPercent: 50, yPercent: 85, widthPercent: 84 },
    captionFontScale: 1,
    captionLines: 'single',
  };
}

export function isBrandKitRecord(rec: unknown): rec is BrandKitRecord {
  return !!rec && typeof rec === 'object' && (rec as { kind?: unknown }).kind === BRAND_KIT_RECORD_KIND;
}

export function fromBrandKitRecord(rec: unknown): BrandKit | null {
  return isBrandKitRecord(rec) ? normalizeBrandKit(rec.kit) : null;
}
