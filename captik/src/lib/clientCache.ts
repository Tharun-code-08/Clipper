'use client';

// Tiny stale-while-revalidate cache for client data fetching: a module-level Map
// backed by a localStorage mirror. Cached data renders instantly (even across
// reloads); a background revalidation runs only when the entry is older than its
// TTL, so each dataset effectively loads once per session and stays.
//
// No dependency on swr/react-query on purpose — this matches the codebase's
// existing localStorage-cache idiom (transcription cache, recent projects).

import { useCallback, useEffect, useRef, useState } from 'react';

interface Entry<T> {
  data: T;
  ts:   number;
}

const mem       = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<() => void>>();
const inflight  = new Map<string, Promise<unknown>>();

const lsKey = (key: string) => `captik_cache_${key}`;

/** Entry regardless of age (staleness is the caller's call), or null. */
function readEntry<T>(key: string): Entry<T> | null {
  const m = mem.get(key);
  if (m) return m as Entry<T>;
  try {
    const raw = localStorage.getItem(lsKey(key));
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry<T>;
    if (!e || typeof e.ts !== 'number') return null;
    mem.set(key, e);
    return e;
  } catch { return null; }
}

export function writeCache<T>(key: string, data: T): void {
  const e: Entry<T> = { data, ts: Date.now() };
  mem.set(key, e);
  try { localStorage.setItem(lsKey(key), JSON.stringify(e)); } catch { /* quota/private mode */ }
  listeners.get(key)?.forEach(fn => fn());
}

/** Drop a key after a mutation (payment, export, transcription) so every
 *  subscribed component refetches fresh data. */
export function invalidateCache(key: string): void {
  mem.delete(key);
  inflight.delete(key);
  try { localStorage.removeItem(lsKey(key)); } catch { /* ignore */ }
  listeners.get(key)?.forEach(fn => fn());
}

function subscribe(key: string, fn: () => void): () => void {
  let set = listeners.get(key);
  if (!set) { set = new Set(); listeners.set(key, set); }
  set.add(fn);
  return () => { set!.delete(fn); };
}

export interface CachedFetch<T> {
  data:    T | null;
  /** True only on a cold cache (nothing to show yet) — drives skeletons. */
  loading: boolean;
  /** Force a refetch (and rebroadcast) regardless of TTL. */
  refresh: () => Promise<void>;
}

/**
 * Stale-while-revalidate fetch hook.
 *   - key null → disabled (e.g. logged out): no fetch, no loading.
 *   - cached data (any age) renders immediately; if older than ttlMs a single
 *     deduped background fetch refreshes it.
 *   - all components on the same key share the entry and re-render together.
 */
export function useCachedFetch<T>(
  key: string | null,
  fetcher: () => Promise<T | null>,
  ttlMs = 5 * 60_000,
): CachedFetch<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [, setTick] = useState(0);
  const entry = key ? readEntry<T>(key) : null;

  const runFetch = useCallback(async (k: string) => {
    let p = inflight.get(k) as Promise<T | null> | undefined;
    if (!p) {
      p = fetcherRef.current().finally(() => inflight.delete(k));
      inflight.set(k, p);
    }
    try {
      const data = await p;
      if (data !== null && data !== undefined) writeCache(k, data);
    } catch { /* keep showing the stale entry */ }
  }, []);

  useEffect(() => {
    if (!key) return;
    const check = () => {
      const e = readEntry<T>(key);
      if (!e || Date.now() - e.ts > ttlMs) void runFetch(key);
    };
    // Invalidation drops the entry, the broadcast lands here, check() refetches.
    const unsub = subscribe(key, () => { setTick(t => t + 1); check(); });
    check();
    return unsub;
  }, [key, ttlMs, runFetch]);

  const refresh = useCallback(async () => {
    if (!key) return;
    inflight.delete(key);
    await runFetch(key);
  }, [key, runFetch]);

  return {
    data:    entry?.data ?? null,
    loading: !!key && !entry,
    refresh,
  };
}
