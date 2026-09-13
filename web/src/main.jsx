// The clip editor IS Captik's editor: TopBar, LeftPanel, VideoCanvas, RightPanel and EditorTimeline come
// straight from captik-app (production master), laid out exactly as src/app/editor/page.tsx lays them out.
// This file only holds the state and handlers that page.tsx would, for one clipped short.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TopBar from '@/components/editor/TopBar';
import LeftPanel from '@/components/editor/LeftPanel';
import VideoCanvas from '@/components/editor/VideoCanvas';
import RightPanel from '@/components/editor/RightPanel';
import EditorTimeline from '@/components/editor/EditorTimeline';
import { segmentKeyOf } from '@/lib/captionSegments';
import { buildSRTFromSegments } from '@/lib/srtUtils';
import { chunkAdaptive } from '../../src/segments.js';
import './index.css';

const params = new URLSearchParams(location.search);
const JOB_ID = params.get('job');
const CLIP_ID = params.get('clip');
const EMPTY_SET = new Set();

async function api(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const STYLE_KEYS = ['captionStyle', 'accentColor', 'captionTextColor', 'captionBox', 'captionEmphBox', 'captionFontScale', 'emphFontScale', 'captionLines', 'textOverrides', 'emphasisStyle', 'layoutMode', 'templateSlots'];

function ClipEditor({ job, clip }) {
  const canvas = useRef(null);
  const initial = clip.edit;
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
  const [render, setRender] = useState({ rendering: false, progress: 0 });
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const durationMs = Math.round(clip.duration * 1000);
  const patchStyle = useCallback((patch) => setStyle((s) => ({ ...s, ...patch })), []);

  // ── undo: snapshots of the word/line structure, as page.tsx keeps ───────────────────────────
  const snapshot = () => ({ words, captionSegments, lineOverrides });
  const pushUndo = useCallback(() => {
    setUndoStack((u) => [...u.slice(-49), { words, captionSegments, lineOverrides }]);
    setRedoStack([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, captionSegments, lineOverrides]);
  const restore = (s) => { setWords(s.words); setCaptionSegments(s.captionSegments); setLineOverrides(s.lineOverrides); };
  const onUndo = () => { const prev = undoStack.at(-1); if (!prev) return; setRedoStack((r) => [...r, snapshot()]); setUndoStack((u) => u.slice(0, -1)); restore(prev); };
  const onRedo = () => { const next = redoStack.at(-1); if (!next) return; setUndoStack((u) => [...u, snapshot()]); setRedoStack((r) => r.slice(0, -1)); restore(next); };

  // ── per-line overrides → the override maps the preview and export read ─────────────────────
  const derived = useMemo(() => {
    const live = new Set(captionSegments.map(segmentKeyOf));
    const pick = (field) => Object.fromEntries(Object.entries(lineOverrides).filter(([k, v]) => live.has(k) && v?.[field] !== undefined).map(([k, v]) => [k, v[field]]));
    return {
      segmentStyleOverrides: pick('styleId'),
      segmentBoxOverrides: pick('box'),
      segmentFontScaleOverrides: pick('fontScale'),
      segmentEmphBoxOverrides: pick('emphBox'),
      segmentEmphFontScaleOverrides: pick('emphFontScale'),
      lineTextOverrides: pick('text'),
      lineSlotOverrides: pick('slots'),
    };
  }, [captionSegments, lineOverrides]);

  const editState = useMemo(() => ({ words, captionSegments, lineOverrides, ...style, ...derived }), [words, captionSegments, lineOverrides, style, derived]);

  // ── autosave ──────────────────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    setSaving(true);
    try {
      await api(`/api/jobs/${JOB_ID}/clips/${CLIP_ID}/edit`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ edit: editState }) });
    } finally {
      setSaving(false);
    }
  }, [editState]);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return undefined; }
    const t = setTimeout(() => { save().catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [editState, save]);

  // ── render progress comes over the job's event stream ─────────────────────────────────────
  const lastRendered = useRef(clip.renderedAt || null);
  const wantDownload = useRef(false);
  useEffect(() => {
    const es = new EventSource(`/api/jobs/${JOB_ID}/events`);
    es.onmessage = (e) => {
      const c = JSON.parse(e.data).clips?.find((x) => x.id === CLIP_ID);
      if (!c) return;
      const busy = c.status === 'rendering' || c.status === 'queued';
      setRender({ rendering: busy, progress: Math.round((c.progress || 0) * 100) });
      if (c.status === 'done' && c.renderedAt && c.renderedAt !== lastRendered.current) {
        lastRendered.current = c.renderedAt;
        if (wantDownload.current) {
          wantDownload.current = false;
          const a = document.createElement('a');
          a.href = `/media/${JOB_ID}/${c.file}?v=${Date.now()}`;
          a.download = `${String(c.rank).padStart(2, '0')}-${projectName.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 50)}.mp4`;
          a.click();
        }
      }
    };
    return () => es.close();
  }, [projectName]);

  const onExport = async () => {
    wantDownload.current = true;
    setRender({ rendering: true, progress: 0 });
    await api(`/api/jobs/${JOB_ID}/clips/${CLIP_ID}/render`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ edit: editState }) })
      .catch((err) => { wantDownload.current = false; setRender({ rendering: false, progress: 0 }); alert(err.message); });
  };

  const onDownloadSRT = () => {
    const blob = new Blob([buildSRTFromSegments(words, captionSegments)], { type: 'application/x-subrip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${projectName}.srt`;
    a.click();
  };

  // ── word + line handlers (behaviour mirrors captik-app's editor page) ───────────────────────
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
      id: `e${stamp}_${i}`, text,
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
    const span = Math.max(1, (inSeg.at(-1)?.endMs ?? s0 + 1) - s0);
    const k = (endMs - startMs) / span;
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

  // ── style panel + canvas geometry ──────────────────────────────────────────────────────────
  const scoped = selectedSegmentKeys.length > 0;
  const onStyleChange = (id) => (scoped ? onSegmentStyleChange(selectedSegmentKeys, id) : patchStyle({ captionStyle: id }));
  const onCaptionBoxChange = (box) => (scoped ? patchLineOverride(selectedSegmentKeys, { box }) : patchStyle({ captionBox: box }));
  const positionBox = (scoped && derived.segmentBoxOverrides[selectedSegmentKeys[0]]) || style.captionBox;
  const onPositionChange = (x, y) => onCaptionBoxChange({ ...positionBox, xPercent: x, yPercent: y });
  const hasStyleCustomizations = Boolean(style.textOverrides || style.emphasisStyle || style.templateSlots);
  const noop = () => {};
  const togglePlay = () => canvas.current?.toggle();
  const seek = (ms) => canvas.current?.seekTo(ms);

  return (
    <div className="flex flex-col h-screen bg-[#0B0B0D] overflow-hidden">
      <TopBar
        projectName={projectName} onProjectNameChange={setProjectName} exportHdReason={null}
        resolution={resolution} onResolutionChange={setResolution} allow4k={false}
        onExport={onExport} onDownloadSRT={onDownloadSRT} srtLocked={false}
        onSave={() => save().catch((err) => alert(err.message))}
        onBack={() => { location.href = `/#/job/${JOB_ID}`; }}
        rendering={render.rendering} renderProgress={render.progress} canExport isSaving={saving}
      />
      <div className="flex flex-1 overflow-hidden min-h-0">
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
      </div>
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

function Shell() {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    if (!JOB_ID || !CLIP_ID) { setState({ error: 'Open a clip from the Clipper dashboard.' }); return; }
    api(`/api/jobs/${JOB_ID}`)
      .then((job) => {
        const clip = job.clips.find((c) => c.id === CLIP_ID);
        if (!clip?.edit || !clip.base) setState({ error: 'This clip is not ready to edit yet.' });
        else setState({ job, clip });
      })
      .catch((err) => setState({ error: err.message }));
  }, []);
  if (state.error || state.loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B0B0D] text-white/70 text-sm">
        {state.error || 'Loading clip…'}
      </div>
    );
  }
  return <ClipEditor job={state.job} clip={state.clip} />;
}

createRoot(document.getElementById('root')).render(<Shell />);
