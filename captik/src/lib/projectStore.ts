'use client';

// IndexedDB-backed persistence for recent projects.
//
// localStorage (see useRecentProjects) holds the lightweight list shown on the
// dashboard. This store holds the HEAVY data — the full editor snapshot plus the
// source video blob — so clicking a recent project can reopen it exactly where the
// user left off WITHOUT re-running the (slow + paid) transcription pipeline.
//
// Records are keyed by a stable id derived from the file signature so re-importing
// the same file maps back to the same project.

import type {
  TranscriptWord, CaptionBoxConfig, TextOverrides, EmphasisStyle, LayoutMode, LineOverride,
  TemplateSlotOverrides,
} from '@/types/transcript';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import type { BleepRange } from '@/lib/profanity';

// Everything needed to rehydrate the editor for a transcribed project.
export interface ProjectSnapshot {
  words:               TranscriptWord[];
  /** @deprecated no longer generated */
  wordsEn?:            TranscriptWord[];
  /** @deprecated no longer generated */
  wordsRoman?:         TranscriptWord[];
  srtNative:           string;
  /** @deprecated no longer generated */
  srtEn?:              string;
  /** @deprecated no longer generated */
  srtRoman?:           string;
  transcript:          string;
  /** @deprecated no longer used */
  isEnglish?:          boolean;
  /** @deprecated no longer used */
  subMode?:            string;
  durationMs:          number;
  captionSegments:     string[][];
  captionStyle:        CaptionStyleId;
  dominantColor:       string;
  accentColor:         string;
  captionTextColor:    string;
  captionYPercent:     number;
  captionFontScale:    number;
  captionLines:        'single' | 'double';
  captionBox:           CaptionBoxConfig;
  segmentBoxOverrides:  Record<string, CaptionBoxConfig>;
  /** "Big Reveal" template: the global TITLE box (optional — older snapshots won't have it).
      Per-line title boxes ride along inside lineOverrides.emphBox. */
  captionEmphBox?:      CaptionBoxConfig;
  /** "Big Reveal" title font scale (independent of captionFontScale). */
  emphFontScale?:       number;
  segmentStyleOverrides: Record<string, CaptionStyleId>;
  bleepRanges:          BleepRange[];
  // Optional (older snapshots won't have them) — the user's font choice + caption gap, so
  // reopening a project restores them too. customFontData carries an uploaded font's bytes
  // so a custom font round-trips entirely locally.
  captionGapMs?:        number;
  captionCustomFont?:   string | null;
  customFontIsCustom?:  boolean;
  customFontData?:      Uint8Array;
  // Reference-parity styling system (2026-06) — all optional so older snapshots load as-is.
  textOverrides?:       TextOverrides;
  emphasisStyle?:       EmphasisStyle;
  layoutMode?:          LayoutMode;
  /** Per-line override bundles keyed by segment first-word id. Supersedes (and is migrated
      from) segmentStyleOverrides/segmentBoxOverrides, which are kept for back-compat. */
  lineOverrides?:       Record<string, LineOverride>;
  /** Global per-template slot overrides (editor_masala/illusion/aura). */
  templateSlots?:       TemplateSlotOverrides;
}

/** Lift legacy per-segment style/box overrides into the unified lineOverrides map.
    Pure + idempotent: existing lineOverride entries win over legacy fields. */
export function migrateSnapshotOverrides(s: ProjectSnapshot): Record<string, LineOverride> {
  const out: Record<string, LineOverride> = { ...(s.lineOverrides ?? {}) };
  for (const [id, styleId] of Object.entries(s.segmentStyleOverrides ?? {})) {
    out[id] = { styleId, ...out[id] };
  }
  for (const [id, box] of Object.entries(s.segmentBoxOverrides ?? {})) {
    out[id] = { box, ...out[id] };
  }
  return out;
}

export interface FileMeta {
  name:         string;
  size:         number;
  lastModified: number;
  type:         string;
}

export interface StoredProject {
  id:       string;
  title:    string;
  fileMeta: FileMeta;
  video?:   Blob;            // source video — may be evicted under storage pressure
  snapshot: ProjectSnapshot;
  savedAt:  number;
}

const DB_NAME = 'captik';
// v2 adds the `corrections` store (see correctionsStore.ts) alongside `projects`.
// v3 adds the `presets` store (see presetStore.ts) — user-saved style presets.
// v4 adds the `videos` store: source blobs moved OUT of the project record.
// Upgrades are purely additive — existing project records and video blobs survive.
const DB_VER  = 4;
const STORE   = 'projects';
const CORR_STORE = 'corrections';
const PRESET_STORE = 'presets';
// Source videos, keyed by project id. SEPARATE from `projects` because IndexedDB has no
// partial update: a record is rewritten whole on every put. With the blob inline, each
// debounced caption autosave re-serialised the ENTIRE source video — measured as three
// 98 MB writes in the 700 ms after transcription finished, and another on every caption
// edit thereafter. On a phone that is a large, pointless memory + IO spike at exactly the
// moment the pipeline is already at its peak. Split out, a snapshot save touches only a
// few KB and the video is written once, when it actually changes.
const VIDEO_STORE = 'videos';

// Stable id for a file so the same video maps to the same project on re-import.
export function fileSignature(f: { name: string; size: number; lastModified: number }): string {
  return `f_${f.size}_${f.lastModified}_${f.name}`.replace(/\s+/g, '_');
}

/**
 * Single opener for the `captik` IndexedDB database. Creates ALL stores in
 * onupgradeneeded so whichever module opens the DB first provisions everything —
 * correctionsStore.ts and presetStore.ts reuse this same opener, which is why there must
 * be exactly one DB_VER across the app.
 *
 * MUST always settle. A version upgrade is BLOCKED for as long as another tab still holds
 * the database open at the previous version, and IndexedDB signals that by firing
 * `onblocked` and then leaving the request PENDING — neither onsuccess nor onerror runs.
 * With no onblocked handler the returned promise never settles, and a pending promise is
 * not a rejection, so the `.catch(() => [])` that every best-effort caller relies on can
 * never fire. That is load-bearing during transcription: the translate step awaits
 * getGlossary() → openCaptikDB(), so a second open tab froze the pipeline mid-run and no
 * captions were ever produced. Bumping DB_VER 3→4 is what made this reachable. Rejecting
 * instead lets each caller take the failure path it already has (no glossary, autosave
 * skipped once), and the next call succeeds as soon as the other tab lets go.
 */
export function openCaptikDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VER);
    // Set once the block has been reported, so the upgrade that eventually goes through
    // (when the other tab closes) doesn't leak an open connection nobody is waiting for —
    // a stray connection at the old version is itself what blocks the NEXT tab.
    let abandoned = false;
    req.onblocked = () => {
      abandoned = true;
      reject(new Error('IndexedDB upgrade blocked by another open tab'));
    };
    req.onupgradeneeded = () => {
      // iOS Safari can fire onupgradeneeded with `req.result` still undefined (flaky IDB under
      // storage pressure) — reading .objectStoreNames then crashes the editor (CAPTIK-APP-1V).
      // Bail: the open's own onerror follows, and every caller treats persistence as best-effort.
      const db = req.result as IDBDatabase | undefined;
      if (!db) return;
      if (!db.objectStoreNames.contains(STORE))        db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CORR_STORE))   db.createObjectStore(CORR_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(PRESET_STORE)) db.createObjectStore(PRESET_STORE, { keyPath: 'id' });
      // Out-of-line keys (the project id) — the value IS the blob, nothing to key off.
      // Purely additive: v3 records keep their inline `video`, and the read path below
      // still returns it, so no existing project loses its source on upgrade.
      if (!db.objectStoreNames.contains(VIDEO_STORE))  db.createObjectStore(VIDEO_STORE);
    };
    req.onsuccess = () => {
      if (abandoned) { try { req.result.close(); } catch { /* already gone */ } return; }
      resolve(req.result);
    };
    req.onerror   = () => reject(req.error);
  });
}

let persistRequested = false;
/**
 * Ask the browser to mark our origin's storage as PERSISTENT so the `captik`
 * IndexedDB (project snapshots + source video blobs) is not evicted under storage
 * pressure. Without this the browser treats IndexedDB as "best-effort" and can
 * clear it when disk runs low — the user then reopens a recent project to find its
 * saved data gone ("This project's saved data is no longer available"). The big
 * video blobs make our origin a prime eviction target, so request it once.
 *
 * Best-effort + memoised: silently no-ops where unsupported or denied.
 */
export async function requestPersistentStorage(): Promise<void> {
  if (persistRequested) return;
  persistRequested = true;
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
    if (await navigator.storage.persisted()) return;   // already granted
    await navigator.storage.persist();
  } catch { /* best effort — never throws into callers */ }
}

function runOn<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openCaptikDB().then(db => new Promise<T>((resolve, reject) => {
    // Close on EVERY outcome, not just oncomplete. A transaction that aborts — quota
    // exceeded on a video put is the common one — used to leave this connection open for
    // the life of the page, and an open connection at the old version is exactly what
    // blocks a DB_VER upgrade in another tab (see openCaptikDB).
    const close = () => { try { db.close(); } catch { /* already gone */ } };
    const t   = db.transaction(storeName, mode);
    const req = fn(t.objectStore(storeName));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror   = () => { close(); reject(req.error); };
    t.onabort     = () => { close(); reject(t.error); };
    t.oncomplete  = close;
  }));
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return runOn<T>(STORE, mode, fn);
}

/** The stored source video for a project, from the `videos` store. */
async function getStoredVideo(id: string): Promise<Blob | undefined> {
  try { return await runOn<Blob | undefined>(VIDEO_STORE, 'readonly', s => s.get(id)); }
  catch { return undefined; }
}

/** Metadata record only — never carries the (heavy) video for v4+ records. */
async function getProjectRecord(id: string): Promise<StoredProject | undefined> {
  try { return await run<StoredProject | undefined>('readonly', s => s.get(id)); }
  catch { return undefined; }
}

/**
 * A project plus its source video. The video lives in its own store (v4+); records
 * written before the split still carry it inline, and those are returned as-is so an
 * upgrade never loses a source. Callers see one shape either way.
 */
export async function getStoredProject(id: string): Promise<StoredProject | undefined> {
  const rec = await getProjectRecord(id);
  if (!rec) return undefined;
  if (rec.video) return rec;                       // legacy inline record
  const video = await getStoredVideo(id);
  return video ? { ...rec, video } : rec;
}

async function getAllStored(): Promise<StoredProject[]> {
  try { return (await run<StoredProject[]>('readonly', s => s.getAll())) ?? []; }
  catch { return []; }
}

/**
 * Merge-put a project record. Passing only some fields preserves the rest — e.g.
 * a snapshot-only autosave keeps the previously-stored video blob, and a video-only
 * save keeps the existing snapshot.
 *
 * Returns true if the full record (incl. video) was stored, false if it had to be
 * stored without the video (quota) or failed entirely.
 */
export async function saveStoredProject(
  id: string,
  data: { title?: string; fileMeta?: FileMeta; video?: Blob; snapshot?: ProjectSnapshot },
): Promise<boolean> {
  try {
    const existing = await getProjectRecord(id);

    // A legacy (pre-v4) record keeps its video inline. Move it across the first time we
    // touch the record, so the blob survives and later saves stop rewriting it.
    const legacyInline = existing?.video;
    const videoToWrite = data.video ?? legacyInline;

    // ORDER MATTERS: write the blob to its own store BEFORE stripping it from the record.
    // Doing it the other way round means a quota failure on the second write leaves the
    // record already stripped — silently destroying a legacy user's only copy of the source.
    let videoStored = false;
    if (videoToWrite) {
      try {
        await runOn(VIDEO_STORE, 'readwrite', s => s.put(videoToWrite, id));
        videoStored = true;
      } catch {
        // Almost always quota. Fall through: the captions still save, and a legacy record
        // KEEPS its inline video rather than losing it.
        videoStored = false;
      }
    }

    // The metadata record carries no blob once the split has taken — so a snapshot-only
    // autosave writes a few KB instead of re-serialising the whole source video.
    const merged: StoredProject = {
      id,
      title:    data.title    ?? existing?.title    ?? 'Untitled Project',
      fileMeta: data.fileMeta ?? existing?.fileMeta ?? { name: '', size: 0, lastModified: 0, type: '' },
      video:    videoStored ? undefined : legacyInline,
      snapshot: data.snapshot ?? existing?.snapshot ?? ({} as ProjectSnapshot),
      savedAt:  Date.now(),
    };

    try {
      await run('readwrite', s => s.put(merged));
    } catch {
      return false;
    }
    // False when a video was offered/held but couldn't be stored — the caller's signal
    // that reopening this project will have to ask for the file again.
    return videoToWrite ? videoStored : true;
  } catch {
    return false;
  }
}

export async function deleteStoredProject(id: string): Promise<void> {
  try { await run('readwrite', s => s.delete(id)); } catch { /* best effort */ }
  try { await runOn(VIDEO_STORE, 'readwrite', s => s.delete(id)); } catch { /* best effort */ }
}

/**
 * Bound disk usage: keep source videos only for the `keep` most-recently-saved projects,
 * dropping the blob (but keeping the caption snapshot) from the rest.
 */
export async function pruneVideos(keep = 4): Promise<void> {
  try {
    const recent = (await getAllStored()).sort((a, b) => b.savedAt - a.savedAt);
    const doomed = recent.slice(keep);
    for (const p of doomed) {
      // v4 blobs live in their own store...
      try { await runOn(VIDEO_STORE, 'readwrite', s => s.delete(p.id)); } catch {}
      // ...legacy ones still sit inline on the record.
      if (p.video) {
        try { await run('readwrite', s => s.put({ ...p, video: undefined })); } catch {}
      }
    }
  } catch { /* best effort */ }
}
