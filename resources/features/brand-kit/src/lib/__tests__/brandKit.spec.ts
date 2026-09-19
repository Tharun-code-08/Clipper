/**
 * Brand Kit core — the colour-role mapping, the ownership ledger that applies / re-maps / removes a
 * kit, and the logo + record helpers.
 *
 * The mapping tests pin two promises: EVERY template id has a mapping whose targets are colour inputs
 * that template really reads (a kit colour aimed at an input nobody reads silently does nothing), and a
 * font-locked template never receives the kit font. The ledger tests pin "Remove kit restores the
 * previous look" — including after template switches and after the creator edits a colour themselves.
 */
import { describe, it, expect } from 'vitest';
import { CAPTION_STYLES } from '@/lib/captionStyles';
import { FONT_LOCKED_STYLES, type CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import { isHeroTemplate, isStyleLocked } from '@/lib/styleResolve';
import {
  resolveIllusionSlots, resolveEditorMasalaSlots, resolveAuraSlots, resolveSwissSlots,
  resolveScribbleSlots, resolveArchivesSlots, resolveBlockbusterSlots, resolveInterlockSlots, resolveJournalSlots,
} from '@/lib/kineticSlots';
import type {
  ArchivesSlots, AuraSlots, BlockbusterSlots, EditorMasalaSlots, IllusionSlots, InterlockSlots,
  JournalSlots, ScribbleSlots, TemplateSlotOverrides,
} from '@/types/transcript';
import {
  BRAND_COLOR_ROLES, SLOT_COLOR_FIELDS, TEMPLATE_COLOR_RULES, TEMPLATE_FIXED_COLOUR_NOTES, TEMPLATE_SLOT_KEY,
  applyBrandPatch, brandLogoFromKit, brandMapKey, contrastRatio, createBrandKit, emptyBrandLedger,
  explicitGlobalColor, fromBrandKitRecord, isBrandKitRecord, mapBrandColors, mapBrandKit,
  normalizeAppliedBrandKit, normalizeBrandKit, normalizeHex, remapBrandKit, removeBrandKitFromLook,
  rolesUsedByTemplate, svgIntrinsicSize, toBrandKitRecord, validateBrandLogoFile, brandLogoMime,
  withoutBrandColors, MIN_BRAND_CONTRAST,
  type BrandKit, type BrandLook, type BrandKitColors,
} from '@/lib/brandKit';
import { brandLogoBox, sanitizeBrandLogo, BRAND_LOGO_MARGIN_FRAC } from '@/lib/brandLogo';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

const ALL_IDS = CAPTION_STYLES.map(s => s.id);
const FULL_KIT: BrandKitColors = { text: '#f4f1ea', highlight: '#ff5a1f', secondary: '#7c3aed', box: '#14213d' };

const baseLook = (over: Partial<BrandLook> = {}): BrandLook => ({
  captionTextColor: '#ffffff',
  accentColor: '#06b6d4',
  emphasisStyle: {},
  templateSlots: {},
  textOverrides: {},
  font: { name: null, data: null, isCustom: false },
  ...over,
});

const kitWith = (over: Partial<BrandKit> = {}): BrandKit => ({ ...createBrandKit({ name: 'Acme', colors: FULL_KIT }, 1), ...over });

/** Slot resolvers — the functions the render branches read their colours through. */
const SLOT_RESOLVERS: Record<keyof TemplateSlotOverrides, (g: Record<string, string>) => Record<string, unknown>> = {
  illusion: g => ({ ...resolveIllusionSlots(g as IllusionSlots) }),
  editor_masala: g => ({ ...resolveEditorMasalaSlots(g as EditorMasalaSlots) }),
  aura: g => ({ ...resolveAuraSlots(g as AuraSlots) }),
  aura_helvetica: g => ({ ...resolveSwissSlots(g as AuraSlots) }),
  scribble: g => ({ ...resolveScribbleSlots(g as ScribbleSlots) }),
  archives: g => ({ ...resolveArchivesSlots(g as ArchivesSlots) }),
  blockbuster: g => ({ ...resolveBlockbusterSlots(g as BlockbusterSlots) }),
  interlock: g => ({ ...resolveInterlockSlots(g as InterlockSlots) }),
  journal: g => ({ ...resolveJournalSlots(g as JournalSlots) }),
};

describe('TEMPLATE_COLOR_RULES — every template gets a valid mapping', () => {
  it('covers every template in CAPTION_STYLES (and nothing unknown)', () => {
    for (const id of ALL_IDS) expect(TEMPLATE_COLOR_RULES[id], id).toBeDefined();
  });

  it.each(ALL_IDS)('%s: rules target inputs the template really reads', (id) => {
    const rules = TEMPLATE_COLOR_RULES[id];
    if (rules.length === 0) expect(TEMPLATE_FIXED_COLOUR_NOTES[id], `${id} maps nothing, so it must explain why`).toBeTruthy();
    const seen = new Set<string>();
    for (const rule of rules) {
      expect(seen.has(rule.id), `${id}: duplicate rule id ${rule.id}`).toBe(false);
      expect(rule.roles.length).toBeGreaterThan(0);
      for (const role of rule.roles) expect(BRAND_COLOR_ROLES).toContain(role);
      if (rule.on && 'rule' in rule.on) expect(seen.has(rule.on.rule), `${id}: ${rule.id} must come after ${rule.on.rule}`).toBe(true);
      seen.add(rule.id);

      switch (rule.target.kind) {
        case 'slot': {
          const key = TEMPLATE_SLOT_KEY[id];
          expect(key, `${id} has no slot store`).toBeDefined();
          expect(SLOT_COLOR_FIELDS[key!]).toContain(rule.target.field);
          break;
        }
        case 'emphasisHex':
          // only the hero family paints emphasisStyle.hex inline
          expect(isHeroTemplate(id)).toBe(true);
          break;
        default:
          // global colour / Text-tab background: locked templates never read the Text-tab overrides
          expect(isStyleLocked(id), `${id} is style-locked; map its slots instead`).toBe(false);
      }
    }
    // A template with its own slot store is driven through the slots only.
    if (TEMPLATE_SLOT_KEY[id]) for (const r of rules) expect(r.target.kind).toBe('slot');
  });

  it.each(Object.entries(SLOT_COLOR_FIELDS))('slot store %s: every mapped field is read by its resolver', (key, fields) => {
    const resolve = SLOT_RESOLVERS[key as keyof TemplateSlotOverrides];
    for (const field of fields) {
      expect(resolve({ [field]: '#123456' })[field], `${key}.${field}`).toBe('#123456');
    }
  });

  it.each(ALL_IDS)('%s: a full kit maps to well-formed values only', (id) => {
    const { patch } = mapBrandKit(id, { colors: FULL_KIT, font: null });
    for (const [path, value] of Object.entries(patch)) {
      if (path === 'background') {
        expect(normalizeHex((value as { hex: string }).hex)).toBe((value as { hex: string }).hex);
      } else {
        expect(typeof value, path).toBe('string');
        expect(normalizeHex(value), `${id} ${path}=${String(value)}`).toBe(value);
      }
      if (path.startsWith('slot:')) expect(path.startsWith(`slot:${TEMPLATE_SLOT_KEY[id]}.`)).toBe(true);
    }
  });

  it('never adds a background pill to a template that has none', () => {
    for (const id of ALL_IDS) {
      if (id === 'ali_abdaal') continue;
      expect(mapBrandColors(id, FULL_KIT).patch.background, id).toBeUndefined();
    }
  });

  it('reports the roles each template reads', () => {
    expect(rolesUsedByTemplate('hormozi')).toEqual(['text']);
    expect(rolesUsedByTemplate('captik')).toEqual(['text', 'highlight']);
    expect(rolesUsedByTemplate('scribble')).toEqual(['text', 'highlight', 'secondary', 'box']);
    expect(rolesUsedByTemplate('black_punch')).toEqual([]);
  });
});

describe('mapBrandColors', () => {
  it('hero family: text → caption text, highlight → accent AND emphasis colour', () => {
    const { patch } = mapBrandColors('captik', FULL_KIT);
    expect(patch).toEqual({ captionTextColor: '#f4f1ea', accentColor: '#ff5a1f', emphasisHex: '#ff5a1f' });
  });

  it('shifts a colour equal to the editor default by 1/255 so templates treat it as chosen', () => {
    expect(explicitGlobalColor('#ffffff', 'captionTextColor')).toBe('#fffffe');
    expect(explicitGlobalColor('#06b6d4', 'accentColor')).toBe('#06b6d3');
    expect(explicitGlobalColor('#123456', 'captionTextColor')).toBe('#123456');
    expect(mapBrandColors('hormozi', { text: '#FFFFFF' }).patch.captionTextColor).toBe('#fffffe');
  });

  it('slot templates write their own slot store', () => {
    expect(mapBrandColors('aura_helvetica', FULL_KIT).patch).toEqual({
      'slot:aura_helvetica.baseColor': '#f4f1ea', 'slot:aura_helvetica.accentColor': '#ff5a1f',
    });
    expect(mapBrandColors('editor_masala', FULL_KIT).patch['slot:editor_masala.heroAColor']).toBe('#7c3aed');
  });

  it('ali_abdaal: recolours the pill and keeps the text readable on it', () => {
    expect(mapBrandColors('ali_abdaal', FULL_KIT).patch).toEqual({
      background: { hex: '#14213d', opacity: 100, radius: 14, padW: 36, padH: 16 },
      captionTextColor: '#f4f1ea',
    });
    // White text on a white pill: neither applies, and the panel is told why.
    const white = mapBrandColors('ali_abdaal', { text: '#ffffff', box: '#ffffff' });
    expect(white.patch).toEqual({});
    expect(white.notes).toContainEqual({ kind: 'legibility', label: 'Pill' });
    // A dark pill with no kit text: the template's black text would vanish → white instead.
    const dark = mapBrandColors('ali_abdaal', { box: '#101010' });
    expect(dark.patch.captionTextColor).toBe('#fffffe');
  });

  it('bubble: a bubble too dark for its black text falls back to the highlight colour', () => {
    const { patch } = mapBrandColors('bubble', { box: '#14213d', highlight: '#ffd400' });
    expect(patch.accentColor).toBe('#ffd400');
    expect(contrastRatio('#ffd400', '#000000')).toBeGreaterThanOrEqual(MIN_BRAND_CONTRAST);
  });

  it('scribble: a dark kit marker gets light ink on it', () => {
    const { patch } = mapBrandColors('scribble', { highlight: '#1d1d1f' });
    expect(patch['slot:scribble.markerColor']).toBe('#1d1d1f');
    expect(patch['slot:scribble.inkColor']).toBe('#ffffff');
    // The default yellow-ish marker keeps the template's dark ink.
    expect(mapBrandColors('scribble', { highlight: '#ffe600' }).patch['slot:scribble.inkColor']).toBeUndefined();
  });

  it('ignores missing and malformed colours', () => {
    expect(mapBrandColors('captik', {}).patch).toEqual({});
    expect(mapBrandColors('captik', { text: 'red', highlight: '#12' }).patch).toEqual({});
    expect(mapBrandColors('captik', { text: 'ABC' }).patch).toEqual({ captionTextColor: '#aabbcc' });
  });
});

describe('mapBrandKit — font', () => {
  const font = { name: 'Bebas Neue', isCustom: false, data: new Uint8Array([1, 2, 3]) };

  it.each(ALL_IDS)('%s: font applied unless the template is font-locked', (id) => {
    const m = mapBrandKit(id, { colors: {}, font });
    if ((FONT_LOCKED_STYLES as CaptionStyleId[]).includes(id)) {
      expect(m.patch.font).toBeUndefined();
      expect(m.notes).toContainEqual({ kind: 'font-locked' });
    } else {
      expect(m.patch.font).toEqual({ name: 'Bebas Neue', data: font.data, isCustom: false });
    }
  });

  it('maps slot colours of per-caption templates, global fields follow the project template', () => {
    const { patch } = mapBrandKit('hormozi', { colors: FULL_KIT }, ['aura', 'aura', 'bubble']);
    expect(patch.captionTextColor).toBe('#f4f1ea');
    expect(patch['slot:aura.accentColor']).toBe('#ff5a1f');
    expect(patch.accentColor).toBeUndefined();   // bubble's accent would fight hormozi's global fields
  });

  it('keys a mapping by the template set, order-insensitive', () => {
    expect(brandMapKey('aura', ['b', 'a', 'b'])).toBe(brandMapKey('aura', ['a', 'b']));
    expect(brandMapKey('aura')).not.toBe(brandMapKey('captik'));
  });
});

describe('ownership ledger — apply, re-map, remove', () => {
  const apply = (look: BrandLook, styleId: CaptionStyleId, kit = kitWith()) =>
    remapBrandKit(look, emptyBrandLedger(), mapBrandKit(styleId, kit).patch);

  it.each(['captik', 'ali_abdaal', 'aura', 'scribble', 'journal', 'black_punch'] as CaptionStyleId[])(
    '%s: remove restores exactly the look before the kit', (styleId) => {
      const before = baseLook({
        emphasisStyle: { size: 1.8 },
        templateSlots: { aura: { inAnimation: 'up' } },
        font: { name: 'Anton', data: new Uint8Array([9]), isCustom: false },
      });
      const kit = kitWith({ font: { name: 'Bebas Neue', isCustom: false } });
      const { look, ledger } = apply(before, styleId, kit);
      expect(look).not.toEqual(before);
      expect(removeBrandKitFromLook(look, ledger)).toEqual(before);
    });

  it('an edit made after applying survives Remove kit', () => {
    const { look, ledger } = apply(baseLook(), 'captik');
    const edited = { ...look, captionTextColor: '#00ff00' };
    const removed = removeBrandKitFromLook(edited, ledger);
    expect(removed.captionTextColor).toBe('#00ff00');
    expect(removed.accentColor).toBe('#06b6d4');
    expect(removed.emphasisStyle).toEqual({});
  });

  it('switching templates re-maps: stale global fields are handed back, new slots are owned', () => {
    const start = baseLook();
    const first = apply(start, 'ali_abdaal');
    expect(first.look.textOverrides.background?.hex).toBe('#14213d');

    // → aura: the pill background must not follow onto a template that never had a pill.
    const toAura = remapBrandKit(first.look, first.ledger, mapBrandKit('aura', kitWith()).patch);
    expect(toAura.look.textOverrides.background).toBeUndefined();
    expect(toAura.look.captionTextColor).toBe('#ffffff');
    expect(toAura.look.templateSlots.aura).toEqual({ baseColor: '#f4f1ea', accentColor: '#ff5a1f' });

    expect(removeBrandKitFromLook(toAura.look, toAura.ledger)).toEqual(start);
  });

  it('a font-locked template hands the font back; the next unlocked template takes it again', () => {
    const kit = kitWith({ font: { name: 'Bebas Neue', isCustom: false } });
    const a = apply(baseLook(), 'captik', kit);
    expect(a.look.font.name).toBe('Bebas Neue');
    const locked = remapBrandKit(a.look, a.ledger, mapBrandKit('journal', kit).patch);
    expect(locked.look.font.name).toBeNull();
    const back = remapBrandKit(locked.look, locked.ledger, mapBrandKit('hormozi', kit).patch);
    expect(back.look.font.name).toBe('Bebas Neue');
    expect(removeBrandKitFromLook(back.look, back.ledger).font.name).toBeNull();
  });

  it('a field reset by a template switch re-records its prior value, so removal returns to it', () => {
    const a = apply(baseLook({ captionTextColor: '#aaaaaa' }), 'captik');
    // The editor's template switch restores the new template's remembered colour…
    const switched = { ...a.look, captionTextColor: '#bbbbbb' };
    const b = remapBrandKit(switched, a.ledger, mapBrandKit('hormozi', kitWith()).patch);
    expect(b.look.captionTextColor).toBe('#f4f1ea');
    expect(removeBrandKitFromLook(b.look, b.ledger).captionTextColor).toBe('#bbbbbb');
  });

  it('applyBrandPatch records the prior value only the first time a field is taken', () => {
    const one = applyBrandPatch(baseLook(), { accentColor: '#111111' });
    const two = applyBrandPatch(one.look, { accentColor: '#222222' }, one.ledger);
    expect(two.ledger.before.accentColor).toBe('#06b6d4');
    expect(removeBrandKitFromLook(two.look, two.ledger).accentColor).toBe('#06b6d4');
  });

  it('per-template colour memory never keeps kit colours', () => {
    const { look, ledger } = apply(baseLook({ captionTextColor: '#aaaaaa' }), 'captik');
    expect(withoutBrandColors({ accentColor: look.accentColor, captionTextColor: look.captionTextColor }, ledger))
      .toEqual({ accentColor: '#06b6d4', captionTextColor: '#aaaaaa' });
    expect(withoutBrandColors({ accentColor: '#123123', captionTextColor: '#aaaaaa' }, ledger))
      .toEqual({ accentColor: '#123123', captionTextColor: '#aaaaaa' });
  });
});

describe('persisted shapes', () => {
  it('a kit record is tagged, carries preset-shaped fallbacks, and round-trips', () => {
    const kit = kitWith({ font: { name: 'Mine', isCustom: true, data: new Uint8Array([7, 7]) }, logo: {
      dataUrl: PNG_1PX, aspect: 2, position: 'bottom-left', sizePct: 20, opacity: 0.5,
    } });
    const rec = toBrandKitRecord(kit);
    expect(isBrandKitRecord(rec)).toBe(true);
    expect(isBrandKitRecord({ id: 'p_1', styleId: 'hormozi' })).toBe(false);
    // An older build lists this record as a preset — every field its apply handler reads exists.
    expect(rec).toMatchObject({ styleId: 'hormozi', accentColor: '#ff5a1f', captionTextColor: '#f4f1ea', captionFontScale: 1, captionLines: 'single' });
    expect(rec.captionBox.yPercent).toBe(85);
    expect(fromBrandKitRecord(rec)).toEqual(kit);
  });

  it('normalizeBrandKit drops what it cannot trust', () => {
    const k = normalizeBrandKit({
      id: 'bk_1', name: '  '.padEnd(80, 'x'), colors: { text: 'nope', box: '#ABC' },
      font: { name: '' }, logo: { dataUrl: 'https://evil.example/logo.png', aspect: 1 },
    });
    expect(k?.colors).toEqual({ box: '#aabbcc' });
    expect(k?.font).toBeNull();
    expect(k?.logo).toBeNull();
    expect(k!.name.length).toBeLessThanOrEqual(60);
    expect(normalizeBrandKit({ name: 'no id' })).toBeNull();
  });

  it('normalizeAppliedBrandKit restores a snapshot value and rejects garbage', () => {
    const kit = kitWith();
    const { ledger } = remapBrandKit(baseLook(), emptyBrandLedger(), mapBrandKit('captik', kit).patch);
    const applied = { kit, ledger, mappedFor: brandMapKey('captik'), notes: [], appliedAt: 5 };
    expect(normalizeAppliedBrandKit(JSON.parse(JSON.stringify(applied)))).toEqual(applied);
    expect(normalizeAppliedBrandKit(undefined)).toBeNull();
    expect(normalizeAppliedBrandKit({ kit: { name: 'x' } })).toBeNull();
  });
});

describe('logo helpers', () => {
  it('validates logo files: PNG/JPG/WebP/SVG, 1 MB max', () => {
    expect(validateBrandLogoFile({ name: 'a.png', type: 'image/png', size: 1000 })).toBeNull();
    expect(validateBrandLogoFile({ name: 'a.svg', type: '', size: 1000 })).toBeNull();
    expect(validateBrandLogoFile({ name: 'a.gif', type: 'image/gif', size: 1000 })).toMatch(/PNG, JPG, WebP or SVG/);
    expect(validateBrandLogoFile({ name: 'a.webp', type: 'image/webp', size: 1024 * 1024 + 1 })).toMatch(/1 MB/);
    expect(validateBrandLogoFile({ name: 'a.jpg', type: 'image/jpeg', size: 0 })).toMatch(/empty/);
    expect(brandLogoMime({ name: 'LOGO.JPG', type: '' })).toBe('image/jpeg');
  });

  it('reads an SVG size from width/height, else viewBox', () => {
    expect(svgIntrinsicSize('<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="40">')).toEqual({ w: 120, h: 40 });
    expect(svgIntrinsicSize('<svg viewBox="0 0 300 100"><rect/></svg>')).toEqual({ w: 300, h: 100 });
    expect(svgIntrinsicSize('<svg width="100%">')).toBeNull();
  });

  it('sanitizeBrandLogo only accepts inline image data URLs and clamps the rest', () => {
    expect(sanitizeBrandLogo({ src: 'https://example.com/a.png', aspect: 1, position: 'top-left', sizePct: 10, opacity: 1 })).toBeNull();
    expect(sanitizeBrandLogo({ src: 'data:text/html;base64,PGgxPg==', aspect: 1 })).toBeNull();
    expect(sanitizeBrandLogo(null)).toBeNull();
    expect(sanitizeBrandLogo({ src: PNG_1PX, aspect: 'x', position: 'middle', sizePct: 99, opacity: 0 }))
      .toEqual({ src: PNG_1PX, aspect: 1, position: 'top-right', sizePct: 40, opacity: 0.1 });
  });

  it('brandLogoBox: corners, proportional between preview and export, tall logos capped', () => {
    const logo = { aspect: 2, position: 'bottom-right' as const, sizePct: 20 };
    const exp = brandLogoBox(1080, 1920, logo);
    const pre = brandLogoBox(270, 480, logo);
    for (const k of ['x', 'y', 'width', 'height'] as const) expect(exp[k]).toBeCloseTo(pre[k] * 4, 6);
    expect(exp.width).toBeCloseTo(216);
    expect(exp.x + exp.width).toBeCloseTo(1080 - 1080 * BRAND_LOGO_MARGIN_FRAC);
    expect(exp.y + exp.height).toBeCloseTo(1920 - 1080 * BRAND_LOGO_MARGIN_FRAC);
    const tl = brandLogoBox(1080, 1920, { ...logo, position: 'top-left' });
    expect([tl.x, tl.y]).toEqual([1080 * BRAND_LOGO_MARGIN_FRAC, 1080 * BRAND_LOGO_MARGIN_FRAC]);
    const tall = brandLogoBox(1920, 1080, { aspect: 0.1, position: 'top-right', sizePct: 40 });
    expect(tall.height).toBeCloseTo(1080 * 0.4);
  });

  it('brandLogoFromKit builds the render prop, or nothing without a valid logo', () => {
    expect(brandLogoFromKit(kitWith())).toBeUndefined();
    expect(brandLogoFromKit(kitWith({ logo: { dataUrl: PNG_1PX, aspect: 1.5, position: 'top-left', sizePct: 12, opacity: 0.8 } })))
      .toEqual({ src: PNG_1PX, aspect: 1.5, position: 'top-left', sizePct: 12, opacity: 0.8 });
  });
});
