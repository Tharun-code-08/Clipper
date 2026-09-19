'use client';

// Runtime state for the Cover editor: the captured frame, the cut-out, and the download.
// Settings (what gets persisted in the project snapshot) are owned by the caller; everything here is
// transient (blob: URLs, canvases, statuses) and rebuilt from the settings on demand.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TranscriptWord } from '@/types/transcript';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import { capture } from '@/lib/analytics';
import { captureFrameWithRecovery } from '@/lib/cover/frameCapture';
import { canvasToObjectUrl, downloadBlob, renderCoverBlob } from '@/lib/cover/coverExport';
import {
  segmentStill, disposeStillSegmenter, StillCutoutError, type StillCutoutFailure,
} from '@/lib/matte/subjectMatte';
import {
  coverPreset, coverSeedText, coverStyleFor, coverWatermarked, coverFileName,
  defaultCoverSettings, defaultCoverBox, defaultCoverFontScale, cleanCoverText,
  type CoverSettings, type CoverPresetId, type HookLike,
} from '@/lib/cover/coverLayout';
import {
  coverHeadlineKey, coverProbeWidths, placeHeadline, shapeAt, subjectCoverage, type HeadlineLayouts,
} from '@/lib/cover/headlinePlacement';
import { subjectGridFor } from '@/lib/cover/subjectGrid';
import type { CoverStageProps } from './CoverStage';

export const CUTOUT_MESSAGES: Record<StillCutoutFailure, string> = {
  unsupported:    "This browser can't cut out the subject. Try Chrome on a computer.",
  load_failed:    "Couldn't load the cut-out model. Check your connection and try again.",
  segment_failed: 'The cut-out failed on this frame. Try a different frame.',
  no_subject:     'No person found in this frame. Pick a frame where the subject is clearly visible.',
};

export interface UseCoverEditorOpts {
  open:              boolean;
  settings:          CoverSettings | null;
  onSettingsChange:  (s: CoverSettings) => void;
  videoSrc:          string;
  currentTimeMs:     number;
  isPlaying:         boolean;
  /** Exact capture from the visible player (VideoCanvasHandle.captureFrame). */
  liveCapture?:      (tMs: number) => Promise<HTMLCanvasElement>;
  /** Stored source bytes, for rebuilding a stale blob: URL. */
  loadStoredBlob?:   () => Promise<Blob | null>;
  hook:              HookLike | null;
  words:             TranscriptWord[];
  segments:          string[][];
  projectStyle:      CaptionStyleId;
  accentColor:       string;
  textColor:         string;
  plan:              string | null | undefined;
  projectClean:      boolean;
  /** False while a signed-in user's plan is still loading — downloads wait so a paid cover isn't watermarked. */
  entitlementReady:  boolean;
  fileBase?:         string | null;
  onWatermarkedDownload?: () => void;
}

export type CoverFrameStatus = 'idle' | 'capturing' | 'ready' | 'error';
export type CoverCutoutStatus = 'idle' | 'working' | 'ready' | 'error';

interface FrameState { url: string; w: number; h: number; tMs: number }

export function useCoverEditor(o: UseCoverEditorOpts) {
  const settings = useMemo(() => o.settings ?? defaultCoverSettings(), [o.settings]);
  const settingsRef = useRef(settings);
  const onChangeRef = useRef(o.onSettingsChange);
  useEffect(() => { settingsRef.current = settings; onChangeRef.current = o.onSettingsChange; });

  const update = useCallback((patch: Partial<CoverSettings>) => {
    onChangeRef.current({ ...settingsRef.current, ...patch });
  }, []);

  const [frame, setFrame] = useState<FrameState | null>(null);
  const [frameStatus, setFrameStatus] = useState<CoverFrameStatus>('idle');
  const [frameError, setFrameError] = useState('');
  const [cutoutUrl, setCutoutUrl] = useState<string | null>(null);
  const [cutoutCanvas, setCutoutCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cutoutStatus, setCutoutStatus] = useState<CoverCutoutStatus>('idle');
  const [cutoutError, setCutoutError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [headMeasure, setHeadMeasure] = useState<HeadlineLayouts | null>(null);

  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cutoutCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const seqRef = useRef(0);
  const lastCapturedMsRef = useRef<number | null>(null);
  const urlsRef = useRef<{ frame: string | null; cutout: string | null }>({ frame: null, cutout: null });

  const setFrameUrl = (next: FrameState | null) => {
    if (urlsRef.current.frame && urlsRef.current.frame !== next?.url) URL.revokeObjectURL(urlsRef.current.frame);
    urlsRef.current.frame = next?.url ?? null;
    setFrame(next);
  };
  const setCutout = (url: string | null, canvas: HTMLCanvasElement | null) => {
    if (urlsRef.current.cutout && urlsRef.current.cutout !== url) URL.revokeObjectURL(urlsRef.current.cutout);
    urlsRef.current.cutout = url;
    cutoutCanvasRef.current = canvas;
    setCutoutUrl(url);
    setCutoutCanvas(canvas);
  };

  // Latest inputs for async callbacks.
  const inputsRef = useRef(o);
  useEffect(() => { inputsRef.current = o; });

  const runCutout = useCallback(async (canvas: HTMLCanvasElement, seq: number) => {
    setCutoutStatus('working');
    setCutoutError('');
    try {
      const out = await segmentStill(canvas);
      if (seq !== seqRef.current) return;
      const url = await canvasToObjectUrl(out, 'image/png');
      if (seq !== seqRef.current) { URL.revokeObjectURL(url); return; }
      setCutout(url, out);
      setCutoutStatus('ready');
    } catch (e) {
      if (seq !== seqRef.current) return;
      const reason: StillCutoutFailure = e instanceof StillCutoutError ? e.reason : 'segment_failed';
      setCutout(null, null);
      setCutoutStatus('error');
      setCutoutError(CUTOUT_MESSAGES[reason]);
      capture('cover_cutout_failed', { reason });
      onChangeRef.current({ ...settingsRef.current, subjectInFront: false });
    }
  }, []);

  const captureAt = useCallback(async (tMs: number, lock: boolean) => {
    const seq = ++seqRef.current;
    const inp = inputsRef.current;
    setFrameStatus('capturing');
    setFrameError('');
    if (lock) onChangeRef.current({ ...settingsRef.current, frameMs: Math.max(0, Math.round(tMs)) });
    try {
      const canvas = await captureFrameWithRecovery({
        tMs, src: inp.videoSrc, live: inp.liveCapture, loadStoredBlob: inp.loadStoredBlob,
      });
      if (seq !== seqRef.current) return;
      const url = await canvasToObjectUrl(canvas, 'image/png');
      if (seq !== seqRef.current) { URL.revokeObjectURL(url); return; }
      frameCanvasRef.current = canvas;
      lastCapturedMsRef.current = tMs;
      setFrameUrl({ url, w: canvas.width, h: canvas.height, tMs });
      setCutout(null, null);
      setCutoutStatus('idle');
      setFrameStatus('ready');
      if (settingsRef.current.subjectInFront) void runCutout(canvas, seq);
    } catch {
      if (seq !== seqRef.current) return;
      setFrameStatus('error');
      setFrameError("Couldn't grab this frame. Try another point on the timeline.");
    }
  }, [runCutout]);

  // Open: analytics, seed the headline, and bring in the frame (the locked one, else the playhead).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!o.open) {
      if (wasOpenRef.current) { seqRef.current++; disposeStillSegmenter(); }
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    capture('cover_opened', { restored: o.settings != null });
    const s = settingsRef.current;
    if (!s.text) {
      const seed = coverSeedText(o.hook, o.words, o.segments);
      if (seed.text) {
        onChangeRef.current({ ...s, text: seed.text });
        if (seed.source === 'hook_overlay' || seed.source === 'hook_script') capture('cover_seeded_from_hook', { source: seed.source });
      }
    }
    void captureAt(s.frameMs ?? o.currentTimeMs, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the open edge only
  }, [o.open]);

  // Follow the playhead while no frame is locked, so scrubbing the timeline previews the cover live.
  const locked = settings.frameMs != null;
  useEffect(() => {
    if (!o.open || locked || o.isPlaying) return;
    const last = lastCapturedMsRef.current;
    if (last != null && Math.abs(last - o.currentTimeMs) < 20) return;
    const t = setTimeout(() => { void captureAt(o.currentTimeMs, false); }, 300);
    return () => clearTimeout(t);
  }, [o.open, locked, o.isPlaying, o.currentTimeMs, captureAt]);

  useEffect(() => () => {
    seqRef.current++;
    if (urlsRef.current.frame) URL.revokeObjectURL(urlsRef.current.frame);
    if (urlsRef.current.cutout) URL.revokeObjectURL(urlsRef.current.cutout);
    disposeStillSegmenter();
  }, []);

  const useCurrentFrame = useCallback(() => { void captureAt(inputsRef.current.currentTimeMs, true); }, [captureAt]);
  const followPlayhead = useCallback(() => {
    update({ frameMs: null });
    lastCapturedMsRef.current = null;
  }, [update]);

  const setSubjectInFront = useCallback((on: boolean) => {
    update({ subjectInFront: on });
    setCutoutError('');
    if (!on) return;
    const canvas = frameCanvasRef.current;
    if (canvas && !urlsRef.current.cutout) void runCutout(canvas, seqRef.current);
  }, [update, runCutout]);

  const setPreset = useCallback((id: CoverPresetId) => {
    update({ preset: id, box: defaultCoverBox(id), boxAuto: true, fontScale: defaultCoverFontScale(id), panX: 0.5, panY: 0.5, zoom: 1 });
  }, [update]);

  const setText = useCallback((text: string, fromHook = false) => {
    update({ text: fromHook ? cleanCoverText(text) : text.slice(0, 90) });
    if (fromHook) capture('cover_seeded_from_hook', { source: 'hook_overlay_pick' });
  }, [update]);

  const watermarked = coverWatermarked(o.plan, o.projectClean);
  const styleId = coverStyleFor(settings.styleId, o.projectStyle);
  const preset = coverPreset(settings.preset);

  // ── Keep the headline clear of the subject ────────────────────────────────
  // With "subject in front" on, the cut-out is drawn over the headline. By default the headline moves to
  // wherever the subject hides the least of it — a different height, or a narrower column beside a centred
  // subject. Positioning or resizing the box by hand turns that off (settings.boxAuto).
  const subjectShown = settings.subjectInFront && !!cutoutUrl && !!cutoutCanvas;
  const autoPlacing = subjectShown && settings.boxAuto;
  const probeWidths = useMemo(() => (autoPlacing ? coverProbeWidths(settings.preset) : undefined), [autoPlacing, settings.preset]);
  const grid = useMemo(
    () => (subjectShown && cutoutCanvas ? subjectGridFor(cutoutCanvas, preset, settings.panX, settings.panY, settings.zoom) : null),
    [subjectShown, cutoutCanvas, preset, settings.panX, settings.panY, settings.zoom],
  );
  const headKey = coverHeadlineKey({
    text: settings.text, styleId, fontScale: settings.fontScale, box: settings.box, preset: settings.preset,
  });
  // A measurement taken before the last text / size / position change describes a different layout.
  const measured = headMeasure && headMeasure.key === headKey ? headMeasure : null;
  const headlineCoverage = grid && measured
    ? subjectCoverage(grid, shapeAt(measured.current, settings.box.xPercent, settings.box.yPercent))
    : null;
  const clearance = useMemo(
    () => (autoPlacing && grid && measured ? placeHeadline({ grid, box: settings.box, preset: settings.preset, layouts: measured }) : null),
    [autoPlacing, grid, measured, settings.box, settings.preset],
  );
  useEffect(() => {
    if (!o.open || !clearance) return;
    const b = settings.box;
    const c = clearance.box;
    if (Math.abs(c.xPercent - b.xPercent) < 1 && Math.abs(c.yPercent - b.yPercent) < 1 && Math.abs(c.widthPercent - b.widthPercent) < 1) return;
    update({ box: c });
  }, [o.open, clearance, settings.box, update]);
  const clearOfSubject = useCallback(() => update({ boxAuto: true }), [update]);

  const stageProps: Omit<CoverStageProps, 'onReady'> = {
    preset,
    frameUrl: frame?.url ?? null, frameW: frame?.w ?? 0, frameH: frame?.h ?? 0,
    cutoutUrl: settings.subjectInFront ? cutoutUrl : null,
    panX: settings.panX, panY: settings.panY, zoom: settings.zoom,
    text: settings.text, styleId, box: settings.box, fontScale: settings.fontScale,
    accentColor: o.accentColor, textColor: o.textColor, watermarked,
  };

  const canDownload = !!frame && frameStatus !== 'capturing' && cutoutStatus !== 'working' && o.entitlementReady && !downloading;

  const stagePropsRef = useRef(stageProps);
  useEffect(() => { stagePropsRef.current = stageProps; });

  const download = useCallback(async () => {
    const props = stagePropsRef.current;
    const frameCanvas = frameCanvasRef.current;
    if (!props.frameUrl || !frameCanvas) return;
    // The export composites these pixels directly (see coverExport) — the cut-out only when it is shown.
    const pixels = { frame: frameCanvas, cutout: props.cutoutUrl ? cutoutCanvasRef.current : null };
    const s = settingsRef.current;
    setDownloading(true);
    setDownloadError('');
    try {
      let blob: Blob;
      try {
        blob = await renderCoverBlob(props, s.format, pixels);
      } catch (first) {
        // One retry: a transient renderer failure (font / mount) usually succeeds on the second try.
        console.warn('[cover] render failed, retrying once', first);
        blob = await renderCoverBlob(props, s.format, pixels);
      }
      downloadBlob(blob, coverFileName(props.preset, s.format, inputsRef.current.fileBase));
      capture('cover_downloaded', {
        size: props.preset.id, style: props.styleId, cutout: !!props.cutoutUrl, watermarked: props.watermarked, format: s.format,
      });
      // Covers never spend a watermark credit — a free cover just invites the upgrade.
      if (props.watermarked) inputsRef.current.onWatermarkedDownload?.();
    } catch (e) {
      console.warn('[cover] download failed', e);
      setDownloadError("Couldn't create the image. Please try again.");
    } finally {
      setDownloading(false);
    }
  }, []);

  return {
    settings, update, setPreset, setText, stageProps,
    frame, frameStatus, frameError, locked, useCurrentFrame, followPlayhead,
    cutoutStatus, cutoutError, setSubjectInFront,
    subjectShown, headlineCoverage, clearOfSubject, onHeadlineMeasure: setHeadMeasure, probeWidths,
    watermarked, canDownload, downloading, downloadError, download,
  };
}

export type CoverEditor = ReturnType<typeof useCoverEditor>;
