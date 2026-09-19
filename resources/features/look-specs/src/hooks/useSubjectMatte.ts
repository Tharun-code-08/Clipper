'use client';

// Orchestrates the "Behind the subject" cut-out for the editor: watches the behind-subject
// caption windows, (re)generates the per-frame cut-outs (debounced), and exposes a SubjectMatte
// that the preview + Element-Capture export blit as a canvas overlay. No video encoding/upload —
// the cut-out frames live in memory and are reused by both surfaces.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  generateSubjectMatte, matteSourceSig, canGenerateMatte,
  type MatteWindow, type SubjectMatte,
} from '@/lib/matte/subjectMatte';

export type MatteStatus = 'idle' | 'generating' | 'ready' | 'error' | 'unsupported';

export interface UseSubjectMatteArgs {
  videoSrc:    string | null;
  fps:         number;
  durationMs:  number;
  windows:     MatteWindow[];
  /** Caption windows that need only the speaker's face position (face-anchored looks). */
  faceWindows?: MatteWindow[];
  sourceSig:   string | null;
  enabled:     boolean;
  /** Longer-side cap for the generated cut-out. Lower = lighter (fewer pixels to segment/encode per
   *  frame) — used to keep whole-video mattes (Big Reveal) responsive. Defaults to 1080. */
  maxDim?:     number;
}

export interface UseSubjectMatteResult {
  status:   MatteStatus;
  progress: number;
  matte:    SubjectMatte | null;
  error:    string | null;
  regenerate: () => void;
}

const DEBOUNCE_MS = 1200;
const EMPTY_WINDOWS: MatteWindow[] = [];

export function useSubjectMatte(args: UseSubjectMatteArgs): UseSubjectMatteResult {
  const { videoSrc, fps, durationMs, windows, sourceSig, enabled, maxDim } = args;
  const faceWindows = args.faceWindows ?? EMPTY_WINDOWS;

  const [status,   setStatus]   = useState<MatteStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [matte,    setMatte]    = useState<SubjectMatte | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const localSigRef = useRef<string | null>(null);
  const matteRef    = useRef<SubjectMatte | null>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const want = enabled && videoSrc && sourceSig && (windows.length > 0 || faceWindows.length > 0)
    ? matteSourceSig(sourceSig, fps, windows, faceWindows)
    : null;

  const clear = useCallback(() => {
    try { matteRef.current?.close(); } catch { /* noop */ }
    matteRef.current = null;
    setMatte(null);
    localSigRef.current = null;
  }, []);

  const run = useCallback(async (wantSig: string, runWindows: MatteWindow[], src: string, runFaceWindows: MatteWindow[] = []) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setError(null);
    setStatus('generating');
    setProgress(0);
    console.info('[matte] generating', { windows: runWindows.length, durationMs, fps });
    let result: SubjectMatte;
    try {
      result = await generateSubjectMatte({
        videoSrc: src, fps, durationMs, windows: runWindows, faceWindows: runFaceWindows, maxDim,
        onProgress: (p) => setProgress(p), signal: ac.signal,
      });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      console.error('[matte] generation failed', e);
      setStatus('error');
      setError('Could not cut out the subject. Try a clearer, well-lit clip on desktop Chrome.');
      return;
    }
    if (ac.signal.aborted) { result.close(); return; }
    console.info('[matte] ready', { frames: result.frameCount, w: result.width, h: result.height });
    try { matteRef.current?.close(); } catch { /* noop */ }
    matteRef.current = result;
    localSigRef.current = wantSig;
    setMatte(result);
    // A face-only run has no cut-out frames by design; it is ready if it found a face.
    const found = result.frameCount > 0 || (runWindows.length === 0 && result.faceTrack.t.length > 0);
    setStatus(found ? 'ready' : 'error');
    if (!found) setError('No subject was detected in this clip.');
    setProgress(1);
  }, [fps, durationMs, maxDim]);

  useEffect(() => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const src = videoSrc;
    const runWindows = windows;
    const runFaceWindows = faceWindows;
    const delay = want && localSigRef.current !== want ? DEBOUNCE_MS : 0;
    debounceRef.current = setTimeout(() => {
      if (!want || !src) {
        if (runWindows.length > 0) console.warn('[matte] behind-subject ON but not generating', { hasVideoSrc: !!src, sourceSig, enabled });
        abortRef.current?.abort();
        clear();
        setStatus('idle');
        return;
      }
      if (!canGenerateMatte()) { console.warn('[matte] unsupported browser (needs desktop Chrome)'); setStatus('unsupported'); return; }
      if (localSigRef.current === want && matteRef.current) { setStatus('ready'); return; }
      void run(want, runWindows, src, runFaceWindows);
    }, delay);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, videoSrc]);

  useEffect(() => () => { abortRef.current?.abort(); try { matteRef.current?.close(); } catch { /* noop */ } }, []);

  const regenerate = useCallback(() => {
    localSigRef.current = null;
    if (want && videoSrc) void run(want, windows, videoSrc, faceWindows);
  }, [want, videoSrc, windows, faceWindows, run]);

  return { status, progress, matte, error, regenerate };
}
