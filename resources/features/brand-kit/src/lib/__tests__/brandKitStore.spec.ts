/**
 * Brand Kit persistence. Kits share the EXISTING `presets` store (no DB_VER bump), so these pin:
 *   1. kits round-trip locally — colours, logo data URL and font bytes;
 *   2. kits and My Presets never leak into each other's lists, and deleting one can't delete the other;
 *   3. the applied kit rides along in the project snapshot and restores after a reload.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import { listBrandKits, saveBrandKit, deleteBrandKit } from '@/lib/brandKitStore';
import { listPresets, savePreset, type StylePreset } from '@/lib/presetStore';
import { getStoredProject, saveStoredProject, type ProjectSnapshot } from '@/lib/projectStore';
import {
  brandMapKey, createBrandKit, emptyBrandLedger, mapBrandKit, normalizeAppliedBrandKit, remapBrandKit,
  type AppliedBrandKit, type BrandKit,
} from '@/lib/brandKit';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

const kit = (name: string, now: number): BrandKit => ({
  ...createBrandKit({
    name,
    colors: { text: '#fafafa', highlight: '#ff3366' },
    font: { name: 'Acme Sans', isCustom: true, data: new Uint8Array([0, 1, 2, 3]) },
    logo: { dataUrl: PNG_1PX, aspect: 1, position: 'top-left', sizePct: 14, opacity: 0.75 },
  }, now),
});

const presetPayload: Omit<StylePreset, 'id' | 'savedAt'> = {
  name: 'Preset A', styleId: 'captik', accentColor: '#ff0000', captionTextColor: '#ffffff',
  captionBox: { xPercent: 50, yPercent: 80, widthPercent: 80 }, captionFontScale: 1, captionLines: 'single',
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('brandKitStore', () => {
  it('saves, lists (newest edit first) and deletes kits, bytes and logo intact', async () => {
    const a = await saveBrandKit(kit('A', 1), 100);
    const b = await saveBrandKit(kit('B', 2), 200);
    expect(a && b).toBeTruthy();

    const listed = await listBrandKits();
    expect(listed.map(k => k.name)).toEqual(['B', 'A']);
    expect(listed[1].font?.data).toEqual(new Uint8Array([0, 1, 2, 3]));
    expect(listed[1].logo?.dataUrl).toBe(PNG_1PX);
    expect(listed[1].colors).toEqual({ text: '#fafafa', highlight: '#ff3366' });

    // Editing re-saves under the same id and moves it to the top.
    await saveBrandKit({ ...listed[1], name: 'A2' }, 300);
    expect((await listBrandKits()).map(k => k.name)).toEqual(['A2', 'B']);

    await deleteBrandKit(a!.id);
    expect((await listBrandKits()).map(k => k.name)).toEqual(['B']);
  });

  it('kits and My Presets stay out of each other', async () => {
    const preset = await savePreset(presetPayload);
    await saveBrandKit(kit('Kit', 1));

    expect((await listPresets()).map(p => p.name)).toEqual(['Preset A']);
    expect((await listBrandKits()).map(k => k.name)).toEqual(['Kit']);

    // deleteBrandKit refuses to touch a non-kit record.
    await deleteBrandKit(preset!.id);
    expect(await listPresets()).toHaveLength(1);
  });

  it('the applied kit persists in the project snapshot and restores after reload', async () => {
    const k = kit('Studio', 1);
    const look = {
      captionTextColor: '#ffffff', accentColor: '#06b6d4', emphasisStyle: {}, templateSlots: {}, textOverrides: {},
      font: { name: null, data: null, isCustom: false },
    };
    const { look: applied, ledger } = remapBrandKit(look, emptyBrandLedger(), mapBrandKit('captik', k).patch);
    const brandKit: AppliedBrandKit = { kit: k, ledger, mappedFor: brandMapKey('captik'), notes: [], appliedAt: 42 };
    const snapshot = {
      words: [], transcript: 'x', srtNative: '', captionStyle: 'captik',
      captionTextColor: applied.captionTextColor, accentColor: applied.accentColor, brandKit,
    } as unknown as ProjectSnapshot;

    await saveStoredProject('proj1', { title: 'P', snapshot });
    const restored = normalizeAppliedBrandKit((await getStoredProject('proj1'))?.snapshot.brandKit);
    expect(restored).toEqual(brandKit);
    expect(restored?.kit.font?.data).toEqual(new Uint8Array([0, 1, 2, 3]));
  });
});
