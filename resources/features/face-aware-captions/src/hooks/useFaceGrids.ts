'use client';

// "Keep captions off faces" — analyses the face at the instants caption placement needs and keeps
// the grids cached per source, so a caption edit only analyses the instants it adds (samples sit on
// a fixed time grid, see SAMPLE_STEP_MS). Grids live in memory only; the placed boxes themselves are
// persisted in the project snapshot, so a reload keeps them while this re-analyses in the background.

import { useEffect, useRef, useState } from 'react';
import type { CoverageGrid } from '@/lib/faceAware/faceGrid';

export type FaceGridStatus = 'idle' | 'analyzing' | 'ready' | 'error' | 'unsupported';

export interface UseFaceGridsArgs {
  videoSrc: string | null;
  enabled:  boolean;
  /** Instants to analyse (ms) — faceAwareSampleTimes(...). */
  times:    number[];
}

export interface UseFaceGridsResult {
  status:   FaceGridStatus;
  /** 0–1 over the instants still being analysed. */
  progress: number;
  /** Every analysed instant for the current source (a new Map whenever it changes). */
  grids:    ReadonlyMap<number, CoverageGrid>;
}

const DEBOUNCE_MS = 400;

export function useFaceGrids({ videoSrc, enabled, times }: UseFaceGridsArgs): UseFaceGridsResult {
  const [state, setState] = useState<UseFaceGridsResult>({ status: 'idle', progress: 0, grids: new Map() });
  const cacheRef = useRef<{ src: string | null; grids: Map<number, CoverageGrid> }>({ src: null, grids: new Map() });
  // Stable dependency for the instant list (a new array every render upstream).
  const timesKey = times.join(',');

  useEffect(() => {
    const wanted = timesKey ? timesKey.split(',').map(Number) : [];
    const ac = new AbortController();
    const timer = setTimeout(() => {
      if (!enabled || !videoSrc) {
        setState(s => (s.status === 'idle' ? s : { ...s, status: 'idle', progress: 0 }));
        return;
      }
      if (cacheRef.current.src !== videoSrc) cacheRef.current = { src: videoSrc, grids: new Map() };
      const cache = cacheRef.current.grids;
      const publish = (status: FaceGridStatus, progress: number) =>
        setState({ status, progress, grids: new Map(cache) });
      const missing = wanted.filter(t => !cache.has(t));
      if (!missing.length) { publish('ready', 1); return; }

      void (async () => {
        const { sampleFaceGrids, canSampleFaceGrids } = await import('@/lib/matte/faceGridSampler');
        if (ac.signal.aborted) return;
        if (!canSampleFaceGrids()) { publish('unsupported', 0); return; }
        publish('analyzing', 0);
        let done = 0;
        try {
          await sampleFaceGrids({
            videoSrc, times: missing, signal: ac.signal,
            onGrid: (t, grid) => {
              cache.set(t, grid);
              done++;
              if (!ac.signal.aborted) setState(s => ({ ...s, progress: done / missing.length }));
            },
          });
          if (ac.signal.aborted) return;
          console.info('[face-aware] analysed', { instants: missing.length, cached: cache.size });
          publish('ready', 1);
        } catch (e) {
          if ((e as Error)?.name === 'AbortError' || ac.signal.aborted) return;
          console.warn('[face-aware] analysis failed', e);
          publish('error', 0);
        }
      })();
    }, enabled ? DEBOUNCE_MS : 0);
    return () => { clearTimeout(timer); ac.abort(); };
  }, [enabled, videoSrc, timesKey]);

  return state;
}
