'use client';

// The music FILE lives in the same IndexedDB store as the source video, under its own key
// (`<projectId>::music::<trackId>`), so adding music needs NO schema change — bumping the DB
// version is blocked while another tab holds the database open, which once froze transcription.
// Only the track's description is persisted in the project snapshot (types/music.ts).

import { openCaptikDB, VIDEO_STORE } from '@/lib/projectStore';

const key = (projectId: string, trackId: string) => `${projectId}::music::${trackId}`;

function runOnVideos<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    openCaptikDB()
      .then((db) => {
        const tx = db.transaction(VIDEO_STORE, mode);
        const req = fn(tx.objectStore(VIDEO_STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      })
      .catch(reject);
  });
}

/** Stores the track's audio. Returns false when it couldn't be stored (almost always quota). */
export async function saveMusicFile(projectId: string, trackId: string, file: Blob): Promise<boolean> {
  try {
    await runOnVideos('readwrite', (s) => s.put(file, key(projectId, trackId)));
    return true;
  } catch {
    return false;
  }
}

export async function getMusicFile(projectId: string, trackId: string): Promise<Blob | undefined> {
  try { return await runOnVideos<Blob | undefined>('readonly', (s) => s.get(key(projectId, trackId))); }
  catch { return undefined; }
}

export async function deleteMusicFile(projectId: string, trackId: string): Promise<void> {
  try { await runOnVideos('readwrite', (s) => s.delete(key(projectId, trackId))); }
  catch { /* best effort */ }
}
