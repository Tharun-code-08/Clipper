'use client';

// IndexedDB-backed "My Presets" — a named bundle of the full caption look
// (template + colours + global text overrides + emphasis settings + layout).
// Local-only by design: all project/edit persistence stays on-device.

import type { TextOverrides, EmphasisStyle, LayoutMode, CaptionBoxConfig, TemplateSlotOverrides } from '@/types/transcript';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import { openCaptikDB } from '@/lib/projectStore';

export interface StylePreset {
  id: string;
  name: string;
  savedAt: number;
  styleId: CaptionStyleId;
  accentColor: string;
  captionTextColor: string;
  captionBox: CaptionBoxConfig;
  /** "Big Reveal" template: the global TITLE box (optional — older presets won't have it). */
  captionEmphBox?: CaptionBoxConfig;
  /** "Big Reveal" title font scale (independent of captionFontScale). */
  emphFontScale?: number;
  captionFontScale: number;
  captionLines: 'single' | 'double';
  textOverrides?: TextOverrides;
  emphasisStyle?: EmphasisStyle;
  layoutMode?: LayoutMode;
  captionCustomFont?: string | null;
  /** Per-template slot overrides (editor_masala/illusion/aura). */
  templateSlots?: TemplateSlotOverrides;
}

const STORE = 'presets';

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openCaptikDB().then(db => new Promise<T>((resolve, reject) => {
    // Close on every outcome — a connection left open by an aborted transaction blocks a
    // DB_VER upgrade in another tab (see openCaptikDB in projectStore.ts).
    const close = () => { try { db.close(); } catch { /* already gone */ } };
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => { close(); reject(req.error); };
    t.onabort = () => { close(); reject(t.error); };
    t.oncomplete = close;
  }));
}

export async function listPresets(): Promise<StylePreset[]> {
  try {
    const all = (await run<StylePreset[]>('readonly', s => s.getAll())) ?? [];
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } catch { return []; }
}

export async function savePreset(p: Omit<StylePreset, 'id' | 'savedAt'>): Promise<StylePreset | null> {
  const preset: StylePreset = { ...p, id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, savedAt: Date.now() };
  try { await run('readwrite', s => s.put(preset)); return preset; }
  catch { return null; }
}

export async function deletePreset(id: string): Promise<void> {
  try { await run('readwrite', s => s.delete(id)); } catch { /* best effort */ }
}

export async function renamePreset(id: string, name: string): Promise<void> {
  try {
    const existing = await run<StylePreset | undefined>('readonly', s => s.get(id));
    if (existing) await run('readwrite', s => s.put({ ...existing, name }));
  } catch { /* best effort */ }
}
