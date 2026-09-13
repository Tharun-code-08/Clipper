'use client';

// IndexedDB cache for user-uploaded custom fonts.
// Uses a dedicated 'captik-fonts' database to avoid version conflicts with projectStore.

export interface StoredFont {
  id: string;           // supabaseKey or 'local:<timestamp>'
  name: string;         // PostScript / CSS family name (user-supplied)
  displayName: string;  // shown in the UI
  fileName: string;     // original file name
  supabaseKey?: string; // path in Supabase Storage: {userId}/{timestamp}-{fileName}
  data: Uint8Array;     // raw font binary (ttf/otf)
  storedAt: number;
}

const DB_NAME  = 'captik-fonts';
const DB_VER   = 1;
const STORE    = 'fonts';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(db => new Promise<T>((resolve, reject) => {
    const tx  = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror   = () => reject(req.error);
    tx.onabort    = () => reject(tx.error);
    tx.oncomplete = () => db.close();
  }));
}

export async function saveFont(font: StoredFont): Promise<void> {
  try { await run('readwrite', s => s.put(font)); } catch { /* quota */ }
}

export async function getFont(id: string): Promise<StoredFont | undefined> {
  try { return await run<StoredFont | undefined>('readonly', s => s.get(id)); }
  catch { return undefined; }
}

export async function listFonts(): Promise<StoredFont[]> {
  try { return (await run<StoredFont[]>('readonly', s => s.getAll())) ?? []; }
  catch { return []; }
}

export async function deleteFont(id: string): Promise<void> {
  try { await run('readwrite', s => s.delete(id)); } catch {}
}
