// One clip in the clip studio. The editing surfaces are Captik's own — TopBar, LeftPanel, VideoCanvas,
// RightPanel and EditorTimeline from captik/src — with the state and handlers Captik's editor page keeps.
// The studio adds the clip rail on the left and the trim strip above the timeline.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import TopBar from '@/components/editor/TopBar';
import LeftPanel from '@/components/editor/LeftPanel';
import VideoCanvas from '@/components/editor/VideoCanvas';
import RightPanel from '@/components/editor/RightPanel';
import EditorTimeline from '@/components/editor/EditorTimeline';
import { buildSRTFromSegments } from '@/lib/srtUtils';
import { chunkAdaptive } from '../../src/segments.js';
import { overrideMapsFrom } from '../../src/trim.js';
import ClipRail from './ClipRail.jsx';
import TrimBar from './TrimBar.jsx';
import { api, readPref, writePref } from './format.js';

const EMPTY_SET = new Set();
const STYLE_KEYS = ['captionStyle', 'accentColor', 'captionTextColor', 'captionBox', 'captionEmphBox', 'captionFontScale', 'emphFontScale', 'captionLines', 'textOverrides', 'emphasisStyle', 'layoutMode', 'templateSlots'];

function download(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

export default function ClipEditor({ job, clip, onSelectClip }) {
  const JOB_ID = job.id;
  const CLIP_ID = clip.id;
  const canvas = useRef(null);
  const initial = clip.edit;
  // The trim this editor was loaded at: saves made against an older trim are refused by the server.
  const trimRev = useRef(clip.trim?.trimmedAt ?? null).current;
  const trimming = clip.status === 'trimming';

  const [projectName, setProjectName] = useState(clip.title);
  const [words, setWords] = useState(initial.words);
  const [captionSegments, setCaptionSegments] = useState(initial.captionSegments);
  const [lineOverrides, setLineOverrides] = useState(initial.lineOverrides || {});
  const [style, setStyle] = useState(() => Object.fromEntries(STYLE_KEYS.map((k) => [k, initial[k]])));
  const [selectedWordId, setSelectedWordId] = useState(null);
  const [selectedSegmentKeys, setSelectedSegmentKeys] = useState([]);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resolution, setResolution] = useState('1080p');
  const [saving, setSaving] = useState(false);
  const [exportRequested, setExportRequested] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [railTab, setRailTab] = useState(() => readPref('studio.railTab', 'clips'));
  const [trimCollapsed, setTrimCollapsed] = useState(() => readPref('studio.trimCollapsed', false));
  const durationMs = Math.round(clip.duration * 1000);
  const patchStyle = useCallback((patch) => setStyle((s) => ({ ...s, ...patch })), []);

  // ── undo: snapshots of the word/line structure, as Captik's editor page keeps ──────────────────
  const snapshot = () => ({ words, captionSegments, lineOverrides });
  const pushUndo = useCallback(() => {
    setUndoStack((u) => [...u.slice(-49), { words, captionSegments, lineOverrides }]);
    setRedoStack([]);
  }, [words, captionSegments, lineOverrides]);
  const restore = (s) => { setWords(s.words); setCaptionSegments(s.captionSegments); setLineOverrides(s.lineOverrides); };
  const onUndo = () => { const prev = undoStack.at(-1); if (!prev) return; setRedoStack((r) => [...r, snapshot()]); setUndoStack((u) => u.slice(0, -1)); restore(prev); };
  const onRedo = () => { const next = redoStack.at(-1); if (!next) return; setUndoStack((u) => [...u, snapshot()]); setRedoStack((r) => r.slice(0, -1)); restore(next); };

  // ── per-line overrides → the override maps the preview and export read ───────────────────────
  const derived = useMemo(() => overrideMapsFrom(captionSegments, lineOverrides), [captionSegments, lineOverrides]);
  const editState = useMemo(() => ({ words, captionSegments, lineOverrides, ...style, ...derived }), [words, captionSegments, lineOverrides, style, derived]);
  const editRef = useRef(editState);
  editRef.current = editState;

  // ── autosave, and a last save when switching clips or leaving the page ─────────────────────────
  const unsaved = useRef(false);
  const save = useCallback(async () => {
    setSaving(true);
    try {
      await api(`/api/jobs/${JOB_ID}/clips/${CLIP_ID}/edit`, { method: 'PUT', json: { edit: editRef.current, trimRev } });
      unsaved.current = false;
    } finally {
      setSaving(false);
    }
  }, [JOB_ID, CLIP_ID, trimRev]);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return undefined; }
    unsaved.current = true;
    if (trimming) return undefined;
    const t = setTimeout(() => { save().catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [editState, save, trimming]);
  useEffect(() => {
    const flush = () => {
      if (!unsaved.current) return;
      unsaved.current = false;
      const body = JSON.stringify({ edit: editRef.current, trimRev });
      fetch(`/api/jobs/${JOB_ID}/clips/${CLIP_ID}/edit`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body, keepalive: body.length < 60_000 }).catch(() => {});
    };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [JOB_ID, CLIP_ID, trimRev]);

  // ── export: progress comes from the job's event stream; the file downloads when it lands ────────
  const rendering = exportRequested || clip.status === 'rendering' || clip.status === 'queued';
  const lastRendered = useRef(clip.renderedAt || null);
  const wantDownload = useRef(false);
  const nameRef = useRef(projectName);
  nameRef.current = projectName;
  useEffect(() => {
    if (clip.status === 'rendering' || clip.status === 'queued') setExportRequested(false);
    if (clip.status === 'error') { setExportRequested(false); wantDownload.current = false; }
    if (clip.renderedAt && clip.renderedAt !== lastRendered.current) {
      lastRendered.current = clip.renderedAt;
      setExportRequested(false);
      if (wantDownload.current && clip.status === 'done') {
        wantDownload.current = false;
        download(`/media/${JOB_ID}/${clip.file}?v=${Date.now()}`, `${String(clip.rank).padStart(2, '0')}-${nameRef.current.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 50)}.mp4`);
      }
    }
  }, [clip.status, clip.renderedAt, clip.file, clip.rank, JOB_ID]);

  const onExport = async () => {
    wantDownload.current = true;
    setExportRequested(true);
    unsaved.current = false;
    await api(`/api/jobs/${JOB_ID}/clips/${CLIP_ID}/render`, { method: 'POST', json: { edit: editRef.current, trimRev } })
      .catch((err) => { wantDownload.current = false; setExportRequested(false); alert(err.message); });
  };

  const onApplyTrim = async ({ start, end }) => {
    if (canvas.current?.isPlaying?.()) canvas.current.toggle();
    await api(`/api/jobs/${JOB_ID}/clips/${CLIP_ID}/trim`, { method: 'POST', json: { start, end, edit: editRef.current, trimRev } });
    unsaved.current = false;
  };

  const onDownloadSRT = () => {
    const blob = new Blob([buildSRTFromSegments(words, captionSegments)], { type: 'application/x-subrip' });
    download(URL.createObjectURL(blob), `${projectName}.srt`);
  };

  // ── word + line handlers (behaviour mirrors Captik's editor page) ─────────────────────────────
  const mapWord = (id, fn) => setWords((ws) => ws.map((w) => (w.id === id ? fn(w) : w)));
  const onWordUpdate = (id, text) => mapWord(id, (w) => ({ ...w, text }));
  const onWordColor = (id, color) => mapWord(id, (w) => ({ ...w, styleOverride: { ...w.styleOverride, color: color || undefined } }));
  const onWordEmphasis = (id) => { pushUndo(); mapWord(id, (w) => ({ ...w, styleOverride: { ...w.styleOverride, scale: (w.styleOverride?.scale ?? 1) > 1 ? undefined : 1.4 } })); };
  const onWordHighlight = (id) => { pushUndo(); mapWord(id, (w) => ({ ...w, styleOverride: { ...w.styleOverride, highlight: w.styleOverride?.highlight ? undefined : true } })); };
  const onWordSpotlight = (id) => {
    pushUndo();
    mapWord(id, (w) => ({
      ...w,
      styleOverride: w.styleOverride?.spotlight
        ? { ...w.styleOverride, spotlight: undefined }
        : { ...w.styleOverride, spotlight: true, scale: (w.styleOverride?.scale ?? 1) > 1 ? w.styleOverride.scale : 1.4 },
    }));
  };
  const onWordTimeChange = (id, startMs, endMs) => mapWord(id, (w) => ({ ...w, startMs, endMs }));
  const onWordSelect = (id) => {
    setSelectedWordId(id);
    const w = words.find((x) => x.id === id);
    if (w) canvas.current?.seekTo(w.startMs);
  };

  const editSegments = (fn) => { pushUndo(); setCaptionSegments((segs) => fn(segs)); };
  const onSplitAfter = (segIdx, afterId) => editSegments((segs) => {
    const seg = segs[segIdx]; const i = seg?.indexOf(afterId) ?? -1;
    if (i < 0 || i === seg.length - 1) return segs;
    const next = [...segs]; next.splice(segIdx, 1, seg.slice(0, i + 1), seg.slice(i + 1)); return next;
  });
  const onSplitBefore = (segIdx, beforeId) => editSegments((segs) => {
    const seg = segs[segIdx]; const i = seg?.indexOf(beforeId) ?? -1;
    if (i <= 0) return segs;
    const next = [...segs]; next.splice(segIdx, 1, seg.slice(0, i), seg.slice(i)); return next;
  });
  const onMergeWithPrev = (segIdx) => editSegments((segs) => {
    if (segIdx <= 0) return segs;
    const next = [...segs]; next.splice(segIdx - 1, 2, [...segs[segIdx - 1], ...segs[segIdx]]); return next;
  });
  const onMergeWithNext = (segIdx) => editSegments((segs) => {
    if (segIdx >= segs.length - 1) return segs;
    const next = [...segs]; next.splice(segIdx, 2, [...segs[segIdx], ...segs[segIdx + 1]]); return next;
  });
  const onDeleteSegments = (idxs) => { const drop = new Set(idxs); editSegments((segs) => segs.filter((_, i) => !drop.has(i))); };
  const onDeleteSegment = (segIdx) => onDeleteSegments([segIdx]);
  const onDeleteWords = (ids) => {
    const drop = new Set(ids);
    pushUndo();
    setWords((ws) => ws.filter((w) => !drop.has(w.id)));
    setCaptionSegments((segs) => segs.map((s) => s.filter((id) => !drop.has(id))).filter((s) => s.length));
    setSelectedWordId(null);
  };
  const onNextLine = (segIdx, wordId) => editSegments((segs) => {
    const seg = segs[segIdx];
    if (!seg || segIdx >= segs.length - 1 || seg.at(-1) !== wordId || seg.length < 2) return segs;
    const next = [...segs]; next[segIdx] = seg.slice(0, -1); next[segIdx + 1] = [wordId, ...segs[segIdx + 1]]; return next;
  });
  const onPrevLine = (segIdx, wordId) => editSegments((segs) => {
    const seg = segs[segIdx];
    if (!seg || segIdx === 0 || seg[0] !== wordId || seg.length < 2) return segs;
    const next = [...segs]; next[segIdx] = seg.slice(1); next[segIdx - 1] = [...segs[segIdx - 1], wordId]; return next;
  });
  const onSplitAtCursor = (segIdx, cursorPos, fullText) => {
    const seg = captionSegments[segIdx];
    const before = fullText.slice(0, cursorPos).trim().split(/\s+/).filter(Boolean).length;
    if (seg && before > 0 && before < seg.length) onSplitAfter(segIdx, seg[before - 1]);
  };
  const onEditCaption = (segIdx, newText) => {
    const seg = captionSegments[segIdx];
    const tokens = newText.trim().split(/\s+/).filter(Boolean);
    if (!seg || !tokens.length) return;
    pushUndo();
    const byId = new Map(words.map((w) => [w.id, w]));
    const startMs = byId.get(seg[0])?.startMs ?? 0;
    const endMs = byId.get(seg.at(-1))?.endMs ?? durationMs;
    const per = (endMs - startMs) / tokens.length;
    const stamp = Date.now();
    const fresh = tokens.map((text, i) => ({
      id: `e${stamp}_${i}`,
      text,
      startMs: Math.round(startMs + i * per),
      endMs: Math.max(Math.round(startMs + i * per) + 50, Math.round(startMs + (i + 1) * per) - 50),
      styleOverride: {},
    }));
    const old = new Set(seg);
    setWords((ws) => {
      const at = ws.findIndex((w) => old.has(w.id));
      const kept = ws.filter((w) => !old.has(w.id));
      kept.splice(at < 0 ? kept.length : at, 0, ...fresh);
      return kept;
    });
    setCaptionSegments((segs) => segs.map((s, i) => (i === segIdx ? fresh.map((w) => w.id) : s)));
    // Line overrides are keyed by a line's first word; carry them to the new first word.
    setLineOverrides((ov) => {
      if (!ov[seg[0]]) return ov;
      const { [seg[0]]: moved, ...rest } = ov;
      return { ...rest, [fresh[0].id]: moved };
    });
  };
  const onRegenerateSegments = (settings) => {
    pushUndo();
    const perLine = settings.lines === 'double' ? settings.maxWords * 2 : settings.maxWords;
    setCaptionSegments(chunkAdaptive(words, perLine));
    patchStyle({ captionLines: settings.lines });
  };
  const onSegmentTimeChange = (segIdx, startMs, endMs) => {
    const seg = captionSegments[segIdx];
    if (!seg) return;
    const ids = new Set(seg);
    const inSeg = words.filter((w) => ids.has(w.id));
    const s0 = inSeg[0]?.startMs ?? 0;
    const segSpan = Math.max(1, (inSeg.at(-1)?.endMs ?? s0 + 1) - s0);
    const k = (endMs - startMs) / segSpan;
    setWords((ws) => ws.map((w) => (ids.has(w.id) ? { ...w, startMs: Math.round(startMs + (w.startMs - s0) * k), endMs: Math.round(startMs + (w.endMs - s0) * k) } : w)));
  };
  const onGlobalNudge = (deltaMs) => { pushUndo(); setWords((ws) => ws.map((w) => ({ ...w, startMs: Math.max(0, w.startMs + deltaMs), endMs: Math.max(1, w.endMs + deltaMs) }))); };

  const patchLineOverride = (keys, patch) => setLineOverrides((ov) => {
    const next = { ...ov };
    for (const key of [].concat(keys)) {
      if (patch === null) delete next[key];
      else next[key] = Object.fromEntries(Object.entries({ ...next[key], ...patch }).filter(([, v]) => v !== undefined));
    }
    return next;
  });
  const onLineOverride = (keys, patch) => { pushUndo(); patchLineOverride(keys, patch); };
  const onSegmentStyleChange = (keys, id) => {
    if (!keys.length) return;
    pushUndo();
    patchLineOverride(keys, id === null ? { styleId: undefined, colors: undefined, boxSize: undefined } : { styleId: id });
  };

  // ── style panel + canvas geometry ──────────────────────────────────────────────────────────────
  const scoped = selectedSegmentKeys.length > 0;
  // Switching the whole video's template behaves as in Captik's editor: the colours of the template being left
  // are remembered, the target's remembered colours (or its own defaults) come back, and The Big Red moves the
  // caption to its top-middle lockup.
  const perTemplateColors = useRef({});
  const applyTemplate = (next) => {
    if (next === style.captionStyle) return;
    perTemplateColors.current[style.captionStyle] = { accentColor: style.accentColor, captionTextColor: style.captionTextColor };
    const saved = perTemplateColors.current[next];
    patchStyle({
      captionStyle: next,
      accentColor: saved?.accentColor ?? '#06b6d4',
      captionTextColor: saved?.captionTextColor ?? '#ffffff',
      ...(next === 'big_red' ? { captionBox: { xPercent: 50, yPercent: 30, widthPercent: 84 } } : {}),
    });
  };
  const onStyleChange = (id) => (scoped ? onSegmentStyleChange(selectedSegmentKeys, id) : applyTemplate(id));
  const onCaptionBoxChange = (box) => (scoped ? patchLineOverride(selectedSegmentKeys, { box }) : patchStyle({ captionBox: box }));
  const positionBox = (scoped && derived.segmentBoxOverrides[selectedSegmentKeys[0]]) || style.captionBox;
  const onPositionChange = (x, y) => onCaptionBoxChange({ ...positionBox, xPercent: x, yPercent: y });
  const hasStyleCustomizations = Boolean(style.textOverrides || style.emphasisStyle || style.templateSlots);
  const noop = () => {};
  const togglePlay = () => canvas.current?.toggle();
  const seek = (ms) => canvas.current?.seekTo(ms);
  const chooseRailTab = (t) => { setRailTab(t); writePref('studio.railTab', t); };
  const toggleTrim = () => setTrimCollapsed((c) => { writePref('studio.trimCollapsed', !c); return !c; });

  // Captik's editor shortcuts: Space play/pause, ←/→ 5 s, Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z or Ctrl/⌘+Y redo, 1–0 templates.
  const shortcuts = useRef(null);
  shortcuts.current = (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName) || e.target?.isContentEditable || trimming) return;
    switch (e.key) {
      case 'z':
      case 'Z':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (e.shiftKey) onRedo(); else onUndo(); }
        break;
      case 'y':
      case 'Y':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); onRedo(); }
        break;
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        seek(Math.max(0, currentTimeMs - 5000));
        break;
      case 'ArrowRight':
        e.preventDefault();
        seek(Math.min(durationMs, currentTimeMs + 5000));
        break;
      default: {
        const template = { 1: 'hormozi', 2: 'mrbeast', 3: 'minimal', 4: 'glow', 5: 'pop', 6: 'fire', 7: 'wordpop', 8: 'grit', 9: 'prism', 0: 'glitch' }[e.key];
        if (template) applyTemplate(template);
      }
    }
  };
  useEffect(() => {
    const onKey = (e) => shortcuts.current?.(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const captionsPanel = (
    <LeftPanel
      words={words} selectedWordId={selectedWordId} currentTimeMs={currentTimeMs}
      onWordSelect={onWordSelect} onWordUpdate={onWordUpdate} onWordColor={onWordColor}
      onWordEmphasis={onWordEmphasis} onWordHighlight={onWordHighlight}
      captionSegments={captionSegments}
      onSplitAfter={onSplitAfter} onSplitBefore={onSplitBefore} onMergeWithPrev={onMergeWithPrev} onMergeWithNext={onMergeWithNext}
      onDeleteSegment={onDeleteSegment} onNextLine={onNextLine} onPrevLine={onPrevLine}
      onRegenerateSegments={onRegenerateSegments} onEditCaption={onEditCaption} onSplitAtCursor={onSplitAtCursor}
      onAddLine={noop} onSeekTo={seek}
      hookData={null} hookError={null} isLoadingHook={false} onGenerateHook={noop}
      transcript={clip.transcript || ''} accentColor={style.accentColor}
      captionLines={style.captionLines} onCaptionLinesChange={(v) => patchStyle({ captionLines: v })}
      captionStyle={style.captionStyle} onUndo={onUndo} canUndo={undoStack.length > 0} onRedo={onRedo} canRedo={redoStack.length > 0}
      lineOverrides={lineOverrides} onLineOverride={onLineOverride} captionBox={style.captionBox}
    />
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0B0B0D]">
      <TopBar
        projectName={projectName} onProjectNameChange={setProjectName} exportHdReason={null}
        resolution={resolution} onResolutionChange={setResolution} allow4k={false}
        onExport={onExport} onDownloadSRT={onDownloadSRT} srtLocked={false}
        onSave={() => save().catch((err) => alert(err.message))}
        onBack={() => {
          if (rendering && !window.confirm('An export is still in progress. Leave the editor anyway?')) return;
          location.href = `/#/job/${JOB_ID}`;
        }}
        rendering={rendering} renderProgress={Math.round((clip.progress || 0) * 100)} canExport={!trimming} isSaving={saving}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ClipRail job={job} activeId={CLIP_ID} onSelect={onSelectClip} tab={railTab} onTab={chooseRailTab} captions={captionsPanel} />
        <div className="relative flex min-w-0 flex-1 overflow-hidden">
          <VideoCanvas
            ref={canvas} videoSrc={`/media/${JOB_ID}/${clip.base}`} words={words} phase="ready" phaseProgress={null}
            lowMemoryMode={false} errMsg="" onVideoError={(msg) => console.error(msg)}
            dominantColor="#000000" accentColor={style.accentColor} bleepRanges={[]}
            captionStyle={style.captionStyle} captionSegments={captionSegments} durationMs={durationMs}
            captionFontScale={style.captionFontScale} captionLines={style.captionLines} captionTextColor={style.captionTextColor}
            captionFont={null} captionBox={style.captionBox}
            segmentBoxOverrides={derived.segmentBoxOverrides} segmentFontScaleOverrides={derived.segmentFontScaleOverrides}
            segmentStyleOverrides={derived.segmentStyleOverrides} activeSegmentKey={selectedSegmentKeys[0] ?? null}
            pendingBox={null} pendingFontScale={null} onBoxFontScalePreview={noop}
            selectedSegmentCount={selectedSegmentKeys.length} boxScopeMode="auto" isScrubbing={false} captionGapMs={0}
            onCaptionBoxChange={onCaptionBoxChange} onCaptionBoxScope={noop} onCaptionBoxCancel={noop} onCaptionBoxOutside={noop}
            captionEmphBox={style.captionEmphBox} segmentEmphBoxOverrides={derived.segmentEmphBoxOverrides}
            segmentEmphFontScaleOverrides={derived.segmentEmphFontScaleOverrides} pendingEmphBox={null} pendingEmphFontScale={null}
            onEmphBoxChange={(box) => patchStyle({ captionEmphBox: box })} onEmphBoxScope={noop} onEmphBoxCancel={noop} onEmphBoxOutside={noop}
            emphFontScale={style.emphFontScale} onEmphBoxFontScalePreview={noop}
            onCaptionFontScaleChange={(v) => patchStyle({ captionFontScale: v })}
            onTimeUpdate={setCurrentTimeMs} onPlayStateChange={setIsPlaying}
            aspectRatio="9:16" onAspectRatioChange={noop} mobile={false} videoDims={{ w: 1080, h: 1920 }} watermarked={false}
            textOverrides={style.textOverrides} emphasisStyle={style.emphasisStyle} layoutMode={style.layoutMode}
            lineTextOverrides={derived.lineTextOverrides} templateSlots={style.templateSlots} lineSlotOverrides={derived.lineSlotOverrides}
            matte={null} behindSubject={false} behindSubjectCount={0} onToggleBehindSubject={noop} matteStatus="idle" matteProgress={0}
          />
          <RightPanel
            captionStyle={style.captionStyle} onStyleChange={onStyleChange} styleScopeCount={selectedSegmentKeys.length}
            captionYPercent={positionBox.yPercent} onCaptionYPercentChange={(y) => onPositionChange(positionBox.xPercent, y)}
            captionFontScale={style.captionFontScale} onCaptionFontScaleChange={(v) => patchStyle({ captionFontScale: v })}
            emphFontScale={style.emphFontScale} onEmphFontScaleChange={(v) => patchStyle({ emphFontScale: v })}
            captionLines={style.captionLines} onCaptionLinesChange={(v) => patchStyle({ captionLines: v })}
            accentColor={style.accentColor} onAccentColorChange={(c) => patchStyle({ accentColor: c })}
            captionTextColor={style.captionTextColor} onCaptionTextColorChange={(c) => patchStyle({ captionTextColor: c })}
            selectedFont={style.textOverrides?.fontFamily ?? null}
            onFontSelect={(sel) => patchStyle({ textOverrides: { ...style.textOverrides, fontFamily: sel?.family ?? sel?.name ?? undefined } })}
            captionXPercent={positionBox.xPercent} onPositionChange={onPositionChange} positionScopeCount={selectedSegmentKeys.length}
            textOverrides={style.textOverrides} onTextOverrides={(p) => patchStyle({ textOverrides: { ...style.textOverrides, ...p } })}
            emphasisStyle={style.emphasisStyle} onEmphasisStyle={(p) => patchStyle({ emphasisStyle: { ...style.emphasisStyle, ...p } })}
            templateSlots={style.templateSlots} onTemplateSlot={(p) => patchStyle({ templateSlots: { ...style.templateSlots, ...p } })}
            layoutMode={style.layoutMode} onLayoutMode={(m) => patchStyle({ layoutMode: m })}
            buildPresetPayload={() => ({ ...style })} onApplyPreset={(p) => patchStyle(Object.fromEntries(STYLE_KEYS.filter((k) => p?.[k] !== undefined).map((k) => [k, p[k]])))}
            onRemoveStyleCustomizations={() => patchStyle({ textOverrides: undefined, emphasisStyle: undefined, templateSlots: undefined })}
            hasStyleCustomizations={hasStyleCustomizations}
          />
          {trimming && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0B0B0D]/70 backdrop-blur-[2px]">
              <div className="w-72 rounded-2xl border border-white/[0.08] bg-[#111114] p-4 shadow-2xl shadow-black/60">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                  Trimming clip
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">{clip.trim?.stage || 'Preparing'}</p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-amber-400 transition-[width] duration-300" style={{ width: `${Math.round((clip.trim?.progress || 0) * 100)}%` }} />
                </div>
                <p className="mt-2.5 text-[10px] leading-relaxed text-zinc-600">Your caption edits, template and line styles carry over to the new range.</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <TrimBar jobId={JOB_ID} clip={clip} busy={trimming} collapsed={trimCollapsed} onToggleCollapsed={toggleTrim} onApply={onApplyTrim} />
      <EditorTimeline
        words={words} captionSegments={captionSegments} selectedWordId={selectedWordId} isPlaying={isPlaying}
        currentTimeMs={currentTimeMs} durationMs={durationMs} mobile={false}
        onWordSelect={(id) => (id ? onWordSelect(id) : setSelectedWordId(null))} onSelectionChange={setSelectedSegmentKeys}
        onPlayPause={togglePlay} onSeek={seek} onSegmentTimeChange={onSegmentTimeChange} onSegmentMoved={noop}
        lowConfidenceSegments={EMPTY_SET} realigningSegments={EMPTY_SET} onRealignSegments={noop} onGlobalNudge={onGlobalNudge}
        onEditStart={pushUndo} onUndo={onUndo} onRedo={onRedo} onDeleteSegments={onDeleteSegments} onDeleteWords={onDeleteWords}
        canUndo={undoStack.length > 0} canRedo={redoStack.length > 0}
        segmentStyleOverrides={derived.segmentStyleOverrides} captionStyle={style.captionStyle} onSegmentStyleChange={onSegmentStyleChange}
        onWordTimeChange={onWordTimeChange} onWordEmphasis={onWordEmphasis} onWordSpotlight={onWordSpotlight}
        onAddWord={noop} onAddLine={noop} onSplitAtPlayhead={noop} onNextLine={onNextLine} onPrevLine={onPrevLine}
      />
    </div>
  );
}
