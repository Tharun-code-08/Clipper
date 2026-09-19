'use client';

// IndexedDB persistence for Brand Kits — local-only, like My Presets.
//
// Kits live in the EXISTING `presets` object store of the `captik` database, tagged with
// kind:'brandKit' (see toBrandKitRecord in lib/brandKit.ts for why the record also carries
// preset-shaped fields). No new store and no DB_VER bump: a version upgrade is blocked for as long
// as another tab holds the database open, which once froze transcription (see openCaptikDB).

import { openCaptikDB } from '@/lib/projectStore';
import { fromBrandKitRecord, isBrandKitRecord, toBrandKitRecord, type BrandKit } from '@/lib/brandKit';

const STORE = 'presets';

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openCaptikDB().then(db => new Promise<T>((resolve, reject) => {
    // Close on every outcome — a connection left open blocks a DB_VER upgrade in another tab.
    const close = () => { try { db.close(); } catch { /* already gone */ } };
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => { close(); reject(req.error); };
    t.onabort = () => { close(); reject(t.error); };
    t.oncomplete = close;
  }));
}

/** Every saved kit, most recently edited first. Never throws. */
export async function listBrandKits(): Promise<BrandKit[]> {
  try {
    const all = (await run<unknown[]>('readonly', s => s.getAll())) ?? [];
    return all
      .filter(isBrandKitRecord)
      .map(fromBrandKitRecord)
      .filter((k): k is BrandKit => k !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** Insert or update. Returns the stored kit (with a fresh updatedAt), or null if storage refused it. */
export async function saveBrandKit(kit: BrandKit, now = Date.now()): Promise<BrandKit | null> {
  const stored: BrandKit = { ...kit, createdAt: kit.createdAt || now, updatedAt: now };
  try {
    await run('readwrite', s => s.put(toBrandKitRecord(stored)));
    return stored;
  } catch {
    return null;
  }
}

export async function deleteBrandKit(id: string): Promise<void> {
  try {
    // Only ever delete a kit record — never a My Presets entry that happens to share an id.
    const existing = await run<unknown>('readonly', s => s.get(id));
    if (isBrandKitRecord(existing)) await run('readwrite', s => s.delete(id));
  } catch { /* best effort */ }
}
