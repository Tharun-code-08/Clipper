'use client';

// ─────────────────────────────────────────────────────────────────────────────
// useAutoEdit — the client-side Auto-Edit brain, kept out of the editor hub.
// Owns the settings + last-run result (the recycle bin), derives the keep
// segments, runs LOCAL detection (./detectLocal — no network, no model, no key),
// and exposes restore / cut-again / clear / hydrate.
//
// All times are SECONDS (matches HTMLVideoElement.currentTime). The transcript is
// captik's ms-based TranscriptWord[].
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from 'react';
import type { TranscriptWord } from '@/types/transcript';
import type { SpeechRegion } from '@/lib/srtUtils';
import { detectLocal } from './detectLocal';
import { deriveKeepSegments, totalDuration } from './segments';
import { uid } from './util';
import {
  DEFAULT_EDIT_OPTIONS,
  type AutoEditResult,
  type EditOptions,
  type KeepSegment,
  type RemovedSegment,
} from './types';

/** 'edited' = cuts apply to the preview AND the export; 'original' = both bypass them. */
export type EditMode = 'original' | 'edited';

export const LOCAL_DETECTOR_ID = 'local-v1';

/** The three optional ProjectSnapshot fields this hook persists. */
export interface AutoEditPersisted {
  autoEditSettings?: EditOptions;
  autoEditResult?: AutoEditResult | null;
  autoEditMode?: EditMode;
}

export interface UseAutoEdit {
  settings: EditOptions;
  setSettings: (patch: Partial<EditOptions>) => void;
  result: AutoEditResult | null;
  running: boolean;
  error: string | null;
  /** Set after a run that found nothing to cut (cleared on the next change). */
  notice: string | null;
  editMode: EditMode;
  setEditMode: (m: EditMode) => void;
  hoveredRemovedId: string | null;
  setHoveredRemovedId: (id: string | null) => void;
  /** Non-restored removals (what actually gets cut). */
  activeRemoved: RemovedSegment[];
  /** Contiguous kept spans that make up the final edit (seconds). */
  keepSegments: KeepSegment[];
  hasEdits: boolean;
  /** True when cuts exist AND the Edited view is on — the preview skips and the export cuts. */
  cutsApply: boolean;
  /** Seconds the cuts remove (1dp; the union, never double-counted). */
  savedSeconds: number;
  run: () => void;
  restore: (id: string) => void;
  cutAgain: (id: string) => void;
  clear: () => void;
  /** Load persisted state when a project reopens (absent fields → defaults). */
  hydrate: (snap: AutoEditPersisted) => void;
}

export function useAutoEdit(
  words: TranscriptWord[],
  durationMs: number,
  /** Energy-VAD regions for the current source, when the PCM was decoded this session. */
  getSpeechRegions?: () => readonly SpeechRegion[] | null | undefined,
): UseAutoEdit {
  const [settings, setSettingsState] = useState<EditOptions>(DEFAULT_EDIT_OPTIONS);
  const [result, setResult] = useState<AutoEditResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editMode, setEditModeState] = useState<EditMode>('original');
  const [hoveredRemovedId, setHoveredRemovedId] = useState<string | null>(null);

  const durationSec = durationMs / 1000;

  const setSettings = useCallback((patch: Partial<EditOptions>) => {
    setSettingsState((s) => ({ ...s, ...patch }));
    setNotice(null);
  }, []);

  const setEditMode = useCallback((m: EditMode) => setEditModeState(m), []);

  const activeRemoved = useMemo(
    () => (result?.removed ?? []).filter((r) => !r.restored && r.end > r.start),
    [result],
  );

  const keepSegments = useMemo(
    () => (durationSec > 0 ? deriveKeepSegments(activeRemoved, durationSec) : []),
    [activeRemoved, durationSec],
  );

  const hasEdits = activeRemoved.length > 0;
  const cutsApply = hasEdits && editMode === 'edited' && keepSegments.length > 0;

  const savedSeconds = useMemo(() => {
    if (!hasEdits || durationSec <= 0) return 0;
    return Math.max(0, Math.round((durationSec - totalDuration(keepSegments)) * 10) / 10);
  }, [hasEdits, durationSec, keepSegments]);

  const run = useCallback(() => {
    if (words.length === 0 || durationMs <= 0) {
      setError('Transcribe the video first.');
      return;
    }
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const regions = getSpeechRegions?.() ?? null;
      const { removals } = detectLocal({ words, durationMs, speechRegions: regions, options: settings });
      const removed: RemovedSegment[] = removals.map((r) => ({
        id: uid(r.reason === 'silence' ? 'sil' : r.reason === 'filler' ? 'fil' : 'rtk'),
        start: r.start,
        end: r.end,
        reason: r.reason,
        text: r.text,
        detail: r.detail,
        restored: false,
      }));
      setResult({ removed, detector: LOCAL_DETECTOR_ID, durationSec: durationMs / 1000, generatedAt: Date.now() });
      setHoveredRemovedId(null);
      if (removed.length) setEditModeState('edited');
      else setNotice('Nothing to cut at this level — try a stronger setting.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auto-Edit failed.');
    } finally {
      setRunning(false);
    }
  }, [words, durationMs, settings, getSpeechRegions]);

  const setRestored = useCallback((id: string, restored: boolean) => {
    setResult((r) =>
      r ? { ...r, removed: r.removed.map((s) => (s.id === id ? { ...s, restored } : s)) } : r,
    );
  }, []);

  const restore = useCallback((id: string) => setRestored(id, true), [setRestored]);
  const cutAgain = useCallback((id: string) => setRestored(id, false), [setRestored]);

  const clear = useCallback(() => {
    setResult(null);
    setEditModeState('original');
    setError(null);
    setNotice(null);
    setHoveredRemovedId(null);
  }, []);

  const hydrate = useCallback((snap: AutoEditPersisted) => {
    setSettingsState({ ...DEFAULT_EDIT_OPTIONS, ...(snap.autoEditSettings ?? {}) });
    const res = snap.autoEditResult ?? null;
    setResult(res && Array.isArray(res.removed) ? res : null);
    setEditModeState(res && snap.autoEditMode === 'edited' ? 'edited' : 'original');
    setError(null);
    setNotice(null);
    setHoveredRemovedId(null);
  }, []);

  return {
    settings,
    setSettings,
    result,
    running,
    error,
    notice,
    editMode,
    setEditMode,
    hoveredRemovedId,
    setHoveredRemovedId,
    activeRemoved,
    keepSegments,
    hasEdits,
    cutsApply,
    savedSeconds,
    run,
    restore,
    cutAgain,
    clear,
    hydrate,
  };
}
