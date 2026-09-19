import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  TEMPLATE_VARIANTS, variantsFor, findVariant, variantBelongsTo,
  applyVariant, clearVariant, variantFieldSurface, totalVariantCount,
  type VariantLook,
} from './templateVariants';
import { CAPTION_STYLES } from './captionStyles';
import { isStyleLocked, isHeroTemplate, buildTextOverrideCSS } from './styleResolve';
import { DEFAULT_ACCENT, DEFAULT_CAPTION_TEXT } from './captionColors';
import {
  resolveIllusionSlots, resolveEditorMasalaSlots, resolveAuraSlots, resolveSwissSlots,
  resolveScribbleSlots, resolveArchivesSlots, resolveBlockbusterSlots,
  resolveInterlockSlots, resolveJournalSlots, SLOT_FONT_CHOICES,
} from './kineticSlots';
import type { TextOverrides, EmphasisStyle } from '@/types/transcript';

// These tests deliberately assert against the REAL renderer and the REAL resolvers rather than
// against a second hand-written list. A variant is only legal if the code that paints captions
// actually reads the field it sets — so if CaptionOverlay stops honouring something, the variant
// that relied on it fails here instead of silently becoming a no-op in the product.

const OVERLAY_SRC = readFileSync(
  fileURLToPath(new URL('../components/editor/CaptionOverlay.tsx', import.meta.url)), 'utf8');

const STYLE_IDS = CAPTION_STYLES.map(s => s.id);

/**
 * The slice of CaptionOverlay that paints ONE template.
 *
 * Split on the branch opener so each chunk runs from one `if (captionStyle === …)` to the next,
 * then match a chunk by the ids named in its CONDITION HEAD only. That way a bare mention of a
 * template id elsewhere in the file (e.g. blockbuster's `const bb = …` setup) can't be mistaken
 * for the branch, and a shared branch (`'aura' || captionStyle === 'aura_helvetica'`) correctly
 * resolves for both of its templates.
 */
const BRANCH_CHUNKS = OVERLAY_SRC.split('if (captionStyle === ').slice(1).map(chunk => {
  const head = chunk.slice(0, Math.max(0, chunk.indexOf('{')));
  return { ids: [...head.matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1]), chunk };
});

function branchFor(styleId: string): string {
  return BRANCH_CHUNKS.find(b => b.ids.includes(styleId))?.chunk ?? '';
}

/** A template's caption spans sit inside [data-cfont-lock], which every override selector excludes. */
const branchIsFontLocked = (styleId: string) => branchFor(styleId).includes('data-cfont-lock');

/** textOverrides only reach a template that is neither style-locked nor font-locked. */
const textOverridesReach = (styleId: string) =>
  !isStyleLocked(styleId) && !branchIsFontLocked(styleId);

const readsAccent = (styleId: string) =>
  /\baccentColor\b|\buserAccent\b/.test(branchFor(styleId));
const readsTextColor = (styleId: string) =>
  /\bcaptionTextColor\b|\buserText\b/.test(branchFor(styleId));

// ── Which override keys the CSS builder actually emits ────────────────────────────────────────
// Probe buildTextOverrideCSS one field at a time: a field that produces no CSS is inert in the
// preview AND in every live export (both render CaptionOverlay), so no variant may use it.
const sz = (n: number) => n;
const TEXT_PROBES: Record<string, TextOverrides> = {
  fontFace:      { fontFace: { weight: 900, italic: false } },
  casing:        { casing: 'upper' },
  underline:     { underline: true },
  letterSpacing: { letterSpacing: 2 },
  wordSpacing:   { wordSpacing: 6 },
  lineSpacing:   { lineSpacing: 1.5 },
  shadow:        { shadow: { hex: '#000000', opacity: 80, x: 0, y: 2, blur: 6 } },
  stroke:        { stroke: { hex: '#000000', opacity: 100, width: 2 } },
  background:    { background: { hex: '#000000', opacity: 60, radius: 8, padW: 10, padH: 6 } },
  align:         { align: 'left' },
  colorSolid:    { color: { mode: 'solid', hex: '#ff0000' } },
  colorGradient: { color: { mode: 'gradient', stops: [{ pos: 0, hex: '#fff' }, { pos: 1, hex: '#000' }], angle: 90, level: 'word' } },
  fontFamily:    { fontFamily: 'Anton' },
  fontSizePx:    { fontSizePx: 48 },
};
const emitsText = (probe: TextOverrides) => buildTextOverrideCSS(probe, undefined, sz).trim().length > 0;

const EMPH_PROBES: Record<string, EmphasisStyle> = {
  hex:        { hex: '#ff0000' },
  fontFamily: { fontFamily: 'Anton' },
  fontFace:   { fontFace: { weight: 900, italic: false } },
  casing:     { casing: 'upper' },
  underline:  { underline: true },
  size:       { size: 2 },
  mode:       { mode: 'spotlight' },
};
const emitsEmph = (probe: EmphasisStyle) => buildTextOverrideCSS({}, probe, sz).trim().length > 0;

/** Keys each slot resolver actually returns — the only slot fields a variant may write. */
const SLOT_RESOLVED_KEYS: Record<string, string[]> = {
  illusion:       Object.keys(resolveIllusionSlots()),
  editor_masala:  Object.keys(resolveEditorMasalaSlots()),
  aura:           Object.keys(resolveAuraSlots()),
  aura_helvetica: Object.keys(resolveSwissSlots()),
  scribble:       Object.keys(resolveScribbleSlots()),
  archives:       Object.keys(resolveArchivesSlots()),
  blockbuster:    Object.keys(resolveBlockbusterSlots()),
  interlock:      Object.keys(resolveInterlockSlots()),
  journal:        Object.keys(resolveJournalSlots()),
};

const STOCK: VariantLook = {
  accentColor: DEFAULT_ACCENT,
  captionTextColor: DEFAULT_CAPTION_TEXT,
  textOverrides: {},
  emphasisStyle: {},
  templateSlots: {},
};

const allEntries = Object.entries(TEMPLATE_VARIANTS) as [string, ReturnType<typeof variantsFor>][];

describe('the harness itself is measuring something', () => {
  it('finds a real CaptionOverlay branch for every template that has variants', () => {
    for (const [styleId] of allEntries) {
      expect(branchFor(styleId).length, `no CaptionOverlay branch found for ${styleId}`).toBeGreaterThan(80);
    }
  });

  it('the CSS probe distinguishes honoured fields from inert ones', () => {
    // If these ever flip, the legality rules below are measuring nothing.
    expect(emitsText(TEXT_PROBES.fontFace)).toBe(true);
    expect(emitsText(TEXT_PROBES.colorSolid)).toBe(false);   // no solid branch in buildTextOverrideCSS
    expect(emitsText(TEXT_PROBES.fontFamily)).toBe(false);   // fontCSS() is never called by CaptionOverlay
    expect(emitsText(TEXT_PROBES.fontSizePx)).toBe(false);   // sizeMultiplier() is never called either
  });
});

describe('template ids', () => {
  it('every variant is keyed to a template that exists in the picker', () => {
    for (const [styleId] of allEntries) expect(STYLE_IDS).toContain(styleId);
  });

  it('variant ids are unique across every template', () => {
    const seen = new Map<string, string>();
    for (const [styleId, list] of allEntries) {
      for (const v of list) {
        expect(seen.has(v.id), `duplicate variant id "${v.id}" (${seen.get(v.id)} and ${styleId})`).toBe(false);
        seen.set(v.id, styleId);
      }
    }
  });

  it('every variant has a non-empty label and at least one override', () => {
    for (const [, list] of allEntries) {
      for (const v of list) {
        expect(v.label.trim().length).toBeGreaterThan(0);
        expect(Object.keys(v.overrides).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('every overridden field is one the template actually reads', () => {
  it('accentColor only where the template branch reads accent', () => {
    for (const [styleId, list] of allEntries) {
      for (const v of list) {
        if (v.overrides.accentColor === undefined) continue;
        expect(readsAccent(styleId), `${v.id}: ${styleId} never reads accentColor`).toBe(true);
      }
    }
  });

  it('captionTextColor only where the template branch reads the caption text colour', () => {
    for (const [styleId, list] of allEntries) {
      for (const v of list) {
        if (v.overrides.captionTextColor === undefined) continue;
        expect(readsTextColor(styleId), `${v.id}: ${styleId} never reads captionTextColor`).toBe(true);
      }
    }
  });

  it('a colour override never equals the global default (userText/userAccent would read it as unset)', () => {
    for (const [, list] of allEntries) {
      for (const v of list) {
        expect(v.overrides.accentColor?.toLowerCase()).not.toBe(DEFAULT_ACCENT);
        expect(v.overrides.captionTextColor?.toLowerCase()).not.toBe(DEFAULT_CAPTION_TEXT);
      }
    }
  });

  it('textOverrides only on templates the override CSS can reach, and only keys it emits', () => {
    for (const [styleId, list] of allEntries) {
      for (const v of list) {
        const keys = Object.keys(v.overrides.textOverrides ?? {});
        if (!keys.length) continue;
        expect(textOverridesReach(styleId), `${v.id}: ${styleId} is style-/font-locked — textOverrides never apply`).toBe(true);
        for (const k of keys) {
          const probe = { [k]: (v.overrides.textOverrides as Record<string, unknown>)[k] } as TextOverrides;
          expect(emitsText(probe), `${v.id}: textOverrides.${k} produces no CSS — it is inert`).toBe(true);
        }
      }
    }
  });

  it('emphasisStyle only on the hero family, and only keys the renderer honours', () => {
    for (const [styleId, list] of allEntries) {
      for (const v of list) {
        const keys = Object.keys(v.overrides.emphasisStyle ?? {});
        if (!keys.length) continue;
        expect(isHeroTemplate(styleId), `${v.id}: only the hero family renders [data-emph]`).toBe(true);
        for (const k of keys) {
          // `size` is the one emphasis knob read INLINE (emphSizeMul) rather than through the CSS
          // builder, so it is honoured without emitting any rule.
          if (k === 'size') { expect(emitsEmph(EMPH_PROBES.size)).toBe(false); continue; }
          const probe = { [k]: (v.overrides.emphasisStyle as Record<string, unknown>)[k] } as EmphasisStyle;
          expect(emitsEmph(probe), `${v.id}: emphasisStyle.${k} produces no CSS`).toBe(true);
        }
      }
    }
  });

  it('templateSlots are written under the template\'s OWN key, with keys its resolver returns', () => {
    for (const [styleId, list] of allEntries) {
      for (const v of list) {
        const slots = v.overrides.templateSlots ?? {};
        for (const [tpl, fields] of Object.entries(slots)) {
          expect(tpl, `${v.id}: writes into another template's slot store`).toBe(styleId);
          const legal = SLOT_RESOLVED_KEYS[tpl];
          expect(legal, `${v.id}: ${tpl} has no slot resolver`).toBeTruthy();
          for (const k of Object.keys(fields ?? {})) {
            expect(legal, `${v.id}: ${tpl}.${k} is not a field the resolver reads`).toContain(k);
          }
        }
      }
    }
  });
});

describe('font-locked templates keep their typeface', () => {
  it('no variant on a font-locked template touches a font field', () => {
    for (const [styleId, list] of allEntries) {
      if (!branchIsFontLocked(styleId)) continue;
      for (const v of list) {
        expect(Object.keys(v.overrides.textOverrides ?? {}),
          `${v.id}: ${styleId} is font-locked`).toEqual([]);
        for (const fields of Object.values(v.overrides.templateSlots ?? {})) {
          for (const k of Object.keys(fields ?? {})) {
            expect(/font/i.test(k), `${v.id}: ${styleId} is font-locked but sets ${k}`).toBe(false);
          }
        }
      }
    }
  });

  it('any slot font that IS set comes from the bundled SLOT_FONT_CHOICES (preview == export)', () => {
    const allowed = new Set(SLOT_FONT_CHOICES.map(c => c.value).filter(Boolean));
    for (const [, list] of allEntries) {
      for (const v of list) {
        for (const fields of Object.values(v.overrides.templateSlots ?? {})) {
          for (const [k, val] of Object.entries(fields ?? {})) {
            if (!/font/i.test(k) || typeof val !== 'string') continue;
            expect(allowed, `${v.id}: ${k} is not a bundled family`).toContain(val);
          }
        }
      }
    }
  });
});

describe('apply then Original returns the exact stock values', () => {
  it('round-trips every variant back to stock', () => {
    for (const [styleId, list] of allEntries) {
      for (const v of list) {
        const applied = applyVariant(STOCK, v);
        expect(applied, `${v.id} changed nothing`).not.toEqual(STOCK);
        expect(clearVariant(applied, styleId), `${v.id} did not restore stock`).toEqual(STOCK);
      }
    }
  });

  it('applying every variant of a template in turn still clears back to stock', () => {
    for (const [styleId, list] of allEntries) {
      let look = STOCK;
      for (const v of list) look = applyVariant(look, v);
      expect(clearVariant(look, styleId)).toEqual(STOCK);
    }
  });

  it('apply is pure — it never mutates the look it was given', () => {
    const base: VariantLook = { ...STOCK, textOverrides: {}, emphasisStyle: {}, templateSlots: {} };
    const snapshot = JSON.parse(JSON.stringify(base));
    for (const [, list] of allEntries) for (const v of list) applyVariant(base, v);
    expect(base).toEqual(snapshot);
  });

  it('clearing removes an emptied slot store entirely so the resolver falls back to its default', () => {
    const jn = variantsFor('journal').find(v => v.id === 'jn-bold')!;
    const applied = applyVariant(STOCK, jn);
    expect(applied.templateSlots.journal).toEqual({ weight: 'bold' });
    expect(clearVariant(applied, 'journal').templateSlots.journal).toBeUndefined();
  });

  it('clearing leaves slot fields the variant never set (a user tweak survives Original)', () => {
    const base: VariantLook = { ...STOCK, templateSlots: { journal: { uppercase: true } } };
    const jn = variantsFor('journal').find(v => v.id === 'jn-bold')!;
    const cleared = clearVariant(applyVariant(base, jn), 'journal');
    expect(cleared.templateSlots.journal).toEqual({ uppercase: true });
  });
});

describe('switching template clears a variant that belongs to the old one', () => {
  it('variantBelongsTo is false for another template\'s id', () => {
    expect(variantBelongsTo('captik', 'captik-midnight')).toBe(true);
    expect(variantBelongsTo('hormozi', 'captik-midnight')).toBe(false);
    expect(variantBelongsTo('captik', null)).toBe(false);
  });

  it('findVariant scopes lookups to the template', () => {
    expect(findVariant('captik', 'captik-midnight')?.label).toBe('Midnight');
    expect(findVariant('hormozi', 'captik-midnight')).toBeUndefined();
  });
});

describe('coverage', () => {
  it('big_red is deliberately left without variants — the red IS the template', () => {
    expect(variantsFor('big_red')).toEqual([]);
  });

  it('the total is a curated set, not a padded one', () => {
    const total = totalVariantCount();
    expect(total).toBe(allEntries.reduce((n, [, l]) => n + l.length, 0));
    expect(total).toBeGreaterThanOrEqual(100);
    expect(total).toBeLessThanOrEqual(140);
  });

  it('variantFieldSurface reports every field the template\'s variants can touch', () => {
    const s = variantFieldSurface('captik');
    expect(s.accentColor).toBe(true);
    expect(s.captionTextColor).toBe(true);
    expect(s.emphKeys).toContain('size');
    expect(variantFieldSurface('big_red')).toEqual({
      accentColor: false, captionTextColor: false, textKeys: [], emphKeys: [], slotKeys: {},
    });
  });
});
