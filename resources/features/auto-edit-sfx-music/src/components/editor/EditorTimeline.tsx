'use client';

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut, Undo2, Redo2, Trash2, Plus, Zap, Focus, FlipHorizontal2, ArrowLeft, ArrowRight, AlertTriangle, Clock3, Loader2, Wand2 } from 'lucide-react';
import type { TranscriptWord } from '@/types/transcript';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import SegmentStylePicker from './SegmentStylePicker';
import Tooltip from '@/components/ui/Tooltip';
import { isHeroTemplate } from '@/lib/styleResolve';
import { segmentKeyOf, selectionSegmentKeys } from '@/lib/captionSegments';
import { reasonStyle } from '@/lib/autoedit/reasons';
import type { RemovalReason } from '@/lib/autoedit/types';

interface EditorTimelineProps {
  words:           TranscriptWord[];
  captionSegments: string[][];
  selectedWordId:  string | null;
  isPlaying:       boolean;
  currentTimeMs:   number;
  durationMs:      number;
  mobile?:         boolean;
  waveform?:       number[];   // normalised 0..1 peaks across the whole clip (optional)
  onWordSelect:    (id: string | null) => void;   // null clears the word/segment selection
  /** Emits the segment first-word ids currently selected (rubber-band multi OR the single
      selected word's segment) so the per-block position edit can target them. */
  onSelectionChange?: (segmentKeys: string[]) => void;
  onPlayPause:     () => void;
  onSeek:          (ms: number) => void;
  onSegmentTimeChange: (segIdx: number, startMs: number, endMs: number) => void;
  // Fired ONCE when a whole-caption MOVE drag finishes, with the net shift in ms
  // (negative = earlier). Drives the learned global lead/lag; resizes don't fire it.
  onSegmentMoved?: (deltaMs: number) => void;
  onEditStart:     () => void;   // snapshot for undo before a drag mutates timing
  onUndo:          () => void;
  onRedo:          () => void;
  onDeleteSegments: (indices: number[]) => void;
  onDeleteWords?:   (ids: string[]) => void;   // WORD track: delete selected word(s) by id
  canUndo:         boolean;
  canRedo:         boolean;
  segmentStyleOverrides: Record<string, CaptionStyleId>;
  captionStyle:    CaptionStyleId;
  onSegmentStyleChange: (segKeys: string[], style: CaptionStyleId | null) => void;
  // WORD-track tools
  onWordTimeChange?: (wordId: string, startMs: number, endMs: number) => void;
  onWordEmphasis?:   (id: string) => void;
  onWordSpotlight?:  (id: string) => void;
  onAddWord?:        () => void;
  onAddLine?:        () => void;
  onSplitAtPlayhead?: () => void;
  onNextLine?:       (segIdx: number, wordId: string) => void;
  onPrevLine?:       (segIdx: number, wordId: string) => void;
  // Timing-confidence affordances: segments whose timing the aligner could not
  // verify get an amber badge + a one-click Re-align (works on the rubber-band
  // multi-selection too); the nudge control shifts ALL captions earlier/later as
  // the always-available manual rescue.
  lowConfidenceSegments?: Set<number>;
  realigningSegments?:    Set<number>;
  onRealignSegments?:     (segIdxs: number[]) => void;
  onGlobalNudge?:         (deltaMs: number) => void;
  /** Auto-Edit: removed spans of the source (SECONDS), drawn hatched over the waveform lane. */
  removedRanges?:         { id: string; start: number; end: number; reason: RemovalReason }[];
  /** Original view is on: the spans play and won't be cut, so draw them faded. */
  removedMuted?:          boolean;
  /** Placed sound effects (SOURCE ms) — pins on the waveform lane. Drag to move, click to seek. */
  sfxMarkers?:            SfxMarkerData[];
  onSfxSelect?:           (id: string) => void;
  onSfxMove?:             (id: string, atMs: number) => void;
}

export interface SfxMarkerData {
  id:       string;
  atMs:     number;
  label:    string;
  selected: boolean;
  /** Inside a removed Auto-Edit span (won't be heard in the edited cut). */
  cut?:     boolean;
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const SKIP_MS  = 5000;
const MIN_DUR  = 200;     // a caption can't be shorter than 0.2s
const clamp    = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Clip { idx: number; startMs: number; endMs: number; text: string; firstWordId: string }
type DragMode = 'move' | 'left' | 'right';
interface ClipDrag {
  mode: DragMode; segIdx: number; startX: number;
  origStart: number; origEnd: number; lower: number; upper: number; moved: boolean;
  clipStart: number;  // for click-to-seek fallback
  netDelta: number;   // net start shift of a 'move' drag, committed on pointer-up
  isWord?: boolean;   // WORD track: the drag retimes a single word, not a segment
  wordId?: string;
}
interface SelBoxDrag {
  startMs: number; currentMs: number; startX: number; currentX: number;
}

export default function EditorTimeline({
  words, captionSegments, selectedWordId, isPlaying, currentTimeMs, durationMs, mobile,
  waveform, onWordSelect, onSelectionChange, onPlayPause, onSeek, onSegmentTimeChange, onSegmentMoved, onEditStart,
  onUndo, onRedo, onDeleteSegments, onDeleteWords, canUndo, canRedo,
  segmentStyleOverrides, captionStyle, onSegmentStyleChange,
  onWordTimeChange, onWordEmphasis, onWordSpotlight, onAddWord, onAddLine, onSplitAtPlayhead,
  onNextLine, onPrevLine,
  lowConfidenceSegments, realigningSegments, onRealignSegments, onGlobalNudge,
  removedRanges, removedMuted = false,
  sfxMarkers, onSfxSelect, onSfxMove,
}: EditorTimelineProps) {
  const [pxPerSec, setPxPerSec] = useState(60);
  const ZOOM_MIN = 16, ZOOM_MAX = 240, ZOOM_DEFAULT = 60;
  // WORD | LINE track mode — LINE shows caption segments (the default), WORD shows
  // individual word blocks whose edges retime the word within its neighbours.
  const [trackMode, setTrackMode] = useState<'word' | 'line'>('line');

  const scrubRef   = useRef<HTMLDivElement>(null);   // top overview scrubber
  const trackRef   = useRef<HTMLDivElement>(null);   // time origin (ruler + lanes share it)
  const scrollRef  = useRef<HTMLDivElement>(null);   // horizontal scrolling viewport
  const pxRef      = useRef(pxPerSec);               // live zoom for the wheel listener
  useEffect(() => { pxRef.current = pxPerSec; }, [pxPerSec]);

  const clipDrag     = useRef<ClipDrag | null>(null);
  const seekDrag     = useRef(false);
  const overviewDrag = useRef(false);
  const selDrag      = useRef<SelBoxDrag | null>(null);

  // Multi-select state
  const [selectedIdxs, setSelectedIdxs] = useState<Set<number>>(new Set());
  const [selRange, setSelRange]          = useState<{ startMs: number; endMs: number } | null>(null);

  // Ref so the keyboard handler always sees the latest selectedIdxs without re-registering.
  const selectedIdxsRef = useRef<Set<number>>(new Set());
  useEffect(() => { selectedIdxsRef.current = selectedIdxs; }, [selectedIdxs]);

  // Ref so the keyboard handler can delete the single picked word without re-registering.
  const selectedWordIdRef = useRef(selectedWordId);
  useEffect(() => { selectedWordIdRef.current = selectedWordId; }, [selectedWordId]);

  // Style picker popup state (right-click)
  const [stylePicker, setStylePicker] = useState<{
    segKeys: string[]; x: number; y: number;
  } | null>(null);

  // Global nudge popover (shift ALL captions). sessionNudge anchors the slider and
  // readout to the cumulative shift applied from this popover; the slider edits a
  // pending value and commits the delta on release so undo/learned-bias see one
  // clean step instead of every drag tick.
  const [nudgeOpen, setNudgeOpen]         = useState(false);
  const [sessionNudge, setSessionNudge]   = useState(0);
  const [pendingNudge, setPendingNudge]   = useState<number | null>(null);
  const commitPendingNudge = useCallback(() => {
    setPendingNudge(p => {
      if (p !== null && p !== sessionNudge) {
        onGlobalNudge?.(p - sessionNudge);
        setSessionNudge(p);
      }
      return null;
    });
  }, [sessionNudge, onGlobalNudge]);

  // CapCut-style single track: a ruler, a lane of caption blocks, and a waveform lane.
  const RULER_H = 20;
  const BLOCK_H = mobile ? 50 : 68;
  const WAVE_H  = mobile ? 32 : 50;

  const durationSec = durationMs / 1000;
  const pxPerMs     = pxPerSec / 1000;
  const trackWidth  = Math.max(durationSec * pxPerSec, 320);
  const playheadX   = (currentTimeMs / 1000) * pxPerSec;
  const pct         = durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;

  // Resolve each segment's time window + text from the word list.
  const clips = useMemo<Clip[]>(() => {
    if (!durationMs) return [];
    const wmap = new Map(words.map(w => [w.id, w]));
    const out: Clip[] = [];
    captionSegments.forEach((seg, idx) => {
      const ws = seg.map(id => wmap.get(id)).filter((w): w is TranscriptWord => !!w);
      if (!ws.length) return;
      out.push({
        idx,
        startMs:     Math.min(...ws.map(w => w.startMs)),
        endMs:       Math.max(...ws.map(w => w.endMs)),
        text:        ws.map(w => w.text).join(' '),
        // The per-line override KEY is the RAW segment head (seg[0]), matching the preview, the
        // Remotion export and deleteWords()/applyLineKeyMigration() — NOT ws[0].id (the first
        // *surviving* word). They differ only when the head was pruned without re-keying, and
        // using ws[0].id there made a per-caption template's override miss on export. segmentKeyOf
        // centralises the choice. (seg[0] === ws[0].id on any pristine transcription.)
        firstWordId: segmentKeyOf(seg),
      });
    });
    return out;
  }, [captionSegments, words, durationMs]);

  // WORD track: one block per word (segment order), retimed individually.
  const wordClips = useMemo<Clip[]>(() => {
    if (!durationMs) return [];
    return [...words]
      .sort((a, b) => a.startMs - b.startMs)
      .map((w, idx) => ({ idx, startMs: w.startMs, endMs: w.endMs, text: w.text, firstWordId: w.id }));
  }, [words, durationMs]);

  const blocks = trackMode === 'word' ? wordClips : clips;

  // Lift the current selection (rubber-band multi OR the single selected word's segment) as
  // segment first-word ids, so the bounding-box "Only selected" position edit targets them.
  // selectionSegmentKeys owns the line-vs-word index mapping (see its doc comment). Declared
  // after `wordClips` because it reads it.
  useEffect(() => {
    let keys: string[] = [];
    if (selectedIdxs.size > 0) {
      keys = selectionSegmentKeys(
        captionSegments, selectedIdxs, trackMode,
        trackMode === 'word' ? wordClips.map(c => c.firstWordId) : [],
      );
    } else if (selectedWordId) {
      const seg = captionSegments.find(s => s.includes(selectedWordId));
      if (seg) keys = [segmentKeyOf(seg)];
    }
    onSelectionChange?.(keys);
  }, [selectedIdxs, selectedWordId, captionSegments, trackMode, wordClips, onSelectionChange]);

  // Real-time selection: highlights blocks while the rubber-band box is being dragged.
  const liveSelIdxs = useMemo(() => {
    if (!selRange) return selectedIdxs;
    const { startMs: lo, endMs: hi } = selRange;
    return new Set(blocks.filter(c => c.startMs < hi && c.endMs > lo).map(c => c.idx));
  }, [selRange, blocks, selectedIdxs]);

  // Which clip holds the currently-selected word (highlighted even when paused).
  const selectedSegIdx = useMemo(() => {
    if (!selectedWordId) return -1;
    return captionSegments.findIndex(seg => seg.includes(selectedWordId));
  }, [captionSegments, selectedWordId]);

  // Live ref so the once-attached window listeners always see fresh values.
  const live = useRef({ clips, blocks, onSeek, onSegmentTimeChange, onSegmentMoved, onWordSelect, onWordTimeChange, durationMs, pxPerMs });
  useEffect(() => { live.current = { clips, blocks, onSeek, onSegmentTimeChange, onSegmentMoved, onWordSelect, onWordTimeChange, durationMs, pxPerMs }; });

  // Single set of window listeners dispatching to whichever drag is active.
  useEffect(() => {
    const seekFromTrack = (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      const { durationMs: dur, pxPerMs: ppm, onSeek: seek } = live.current;
      if (!rect || dur === 0) return;
      seek(clamp((clientX - rect.left) / ppm, 0, dur));
    };
    const seekFromOverview = (clientX: number) => {
      const rect = scrubRef.current?.getBoundingClientRect();
      const { durationMs: dur, onSeek: seek } = live.current;
      if (!rect || dur === 0) return;
      seek(Math.floor(clamp((clientX - rect.left) / rect.width, 0, 1) * dur));
    };

    const onMove = (e: PointerEvent) => {
      const cd = clipDrag.current;
      if (cd) {
        const { onSegmentTimeChange, onWordTimeChange, pxPerMs: ppm } = live.current;
        // WORD track drags retime the single word; LINE track drags retime the segment.
        const change = cd.isWord && cd.wordId
          ? (_: number, s: number, e2: number) => onWordTimeChange?.(cd.wordId!, s, e2)
          : onSegmentTimeChange;
        const wordMinDur = cd.isWord ? 80 : MIN_DUR;
        const deltaMs = (e.clientX - cd.startX) / ppm;
        if (Math.abs(e.clientX - cd.startX) > 3) cd.moved = true;
        if (cd.mode === 'move') {
          const span = cd.origEnd - cd.origStart;
          const ns = clamp(cd.origStart + deltaMs, cd.lower, Math.max(cd.lower, cd.upper - span));
          cd.netDelta = Math.round(ns) - cd.origStart;   // net shift, committed on pointer-up
          change(cd.segIdx, Math.round(ns), Math.round(ns + span));
        } else if (cd.mode === 'left') {
          const ns = clamp(cd.origStart + deltaMs, cd.lower, cd.origEnd - wordMinDur);
          change(cd.segIdx, Math.round(ns), cd.origEnd);
        } else {
          const ne = clamp(cd.origEnd + deltaMs, cd.origStart + wordMinDur, cd.upper);
          change(cd.segIdx, cd.origStart, Math.round(ne));
        }
        return;
      }
      if (selDrag.current) {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect) return;
        const ms = (e.clientX - rect.left) / live.current.pxPerMs;
        selDrag.current.currentMs = ms;
        selDrag.current.currentX  = e.clientX;
        const lo = Math.min(selDrag.current.startMs, ms);
        const hi = Math.max(selDrag.current.startMs, ms);
        setSelRange({ startMs: lo, endMs: hi });
        return;
      }
      if (seekDrag.current)          seekFromTrack(e.clientX);
      else if (overviewDrag.current) seekFromOverview(e.clientX);
    };

    const onUp = () => {
      const cd = clipDrag.current;
      if (cd && !cd.moved) live.current.onSeek(cd.clipStart);  // click = seek to clip
      // A completed whole-caption move → learn the net lead/lag (once, not per move-frame).
      if (cd && cd.moved && cd.mode === 'move' && cd.netDelta && !cd.isWord) live.current.onSegmentMoved?.(cd.netDelta);
      clipDrag.current = null;

      if (selDrag.current) {
        const { startMs, currentMs, startX, currentX } = selDrag.current;
        if (Math.abs(currentX - startX) < 5) {
          // Click (no drag) on empty space — clear BOTH the multi-selection and the
          // single word/segment selection so the timeline fully deselects.
          setSelectedIdxs(new Set());
          live.current.onWordSelect(null);
        } else {
          const lo = Math.min(startMs, currentMs);
          const hi = Math.max(startMs, currentMs);
          const hitIdxs = new Set(
            live.current.blocks.filter(c => c.startMs < hi && c.endMs > lo).map(c => c.idx),
          );
          setSelectedIdxs(hitIdxs);
        }
        selDrag.current = null;
        setSelRange(null);
      }

      seekDrag.current      = false;
      overviewDrag.current  = false;
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  // Keep the playhead in view while playing.
  useEffect(() => {
    if (!isPlaying) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = (currentTimeMs / 1000) * pxPerSec;
    const viewLeft  = el.scrollLeft + 48;
    const viewRight = el.scrollLeft + el.clientWidth - 48;
    if (x < viewLeft || x > viewRight) el.scrollLeft = x - el.clientWidth / 3;
  }, [currentTimeMs, isPlaying, pxPerSec]);

  // Ctrl/⌘ + wheel zooms the timeline.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect    = el.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const cur     = pxRef.current;
      const tSec    = (el.scrollLeft + offsetX) / cur;
      const factor  = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const next    = clamp(Math.round(cur * factor), ZOOM_MIN, ZOOM_MAX);
      if (next === cur) return;
      setPxPerSec(next);
      requestAnimationFrame(() => { el.scrollLeft = tSec * next - offsetX; });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clips.length]);

  // Keyboard: Delete removes selected captions; Escape deselects all.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      // Escape deselects in two stages: first press clears the multi-selection,
      // a second press clears the single word/segment pick. Other panels
      // (bounding box, style picker) also close on the same window keydown — the
      // staging keeps their dismissal from silently wiping the segment selection
      // their edits were anchored to.
      if (e.key === 'Escape') {
        if (selectedIdxsRef.current.size > 0) setSelectedIdxs(new Set());
        else live.current.onWordSelect(null);
        return;
      }
      if (e.key !== 'Delete') return;
      if (trackModeRef.current === 'word') {
        // WORD mode: delete the selected word(s) by id (the selection holds wordClip indices;
        // fall back to the single picked word).
        const ids = [...selectedIdxsRef.current]
          .map(i => live.current.blocks.find(b => b.idx === i)?.firstWordId)
          .filter((x): x is string => !!x);
        const finalIds = ids.length ? ids : (selectedWordIdRef.current ? [selectedWordIdRef.current] : []);
        if (!finalIds.length) return;
        onDeleteWords?.(finalIds);
        setSelectedIdxs(new Set());
        return;
      }
      const idxs = selectedIdxsRef.current;
      if (idxs.size === 0) return;
      onDeleteSegments([...idxs]);
      setSelectedIdxs(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDeleteSegments, onDeleteWords]);

  // Mode switch invalidates index-based selections.
  const trackModeRef = useRef(trackMode);
  useEffect(() => {
    trackModeRef.current = trackMode;
    setSelectedIdxs(new Set());
  }, [trackMode]);

  const startClipDrag = useCallback((e: React.PointerEvent, clip: Clip, posInClips: number, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Click: toggle this clip in/out of multi-selection without seeking
      setSelectedIdxs(prev => {
        const next = new Set(prev);
        if (next.has(clip.idx)) next.delete(clip.idx);
        else next.add(clip.idx);
        return next;
      });
      return;
    }
    onEditStart();
    onWordSelect(clip.firstWordId);
    setSelectedIdxs(new Set([clip.idx]));
    const prev = live.current.blocks[posInClips - 1];
    const next = live.current.blocks[posInClips + 1];
    clipDrag.current = {
      mode, segIdx: clip.idx, startX: e.clientX,
      origStart: clip.startMs, origEnd: clip.endMs,
      lower: prev ? prev.endMs : 0,
      upper: next ? next.startMs : live.current.durationMs,
      moved: false, clipStart: clip.startMs, netDelta: 0,
      isWord: trackMode === 'word', wordId: clip.firstWordId,
    };
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
  }, [onEditStart, onWordSelect, trackMode]);

  const startSeekDrag = useCallback((e: React.PointerEvent) => {
    if (durationMs === 0) return;
    e.preventDefault();
    e.stopPropagation();   // ruler seeks only — don't also start a track-wide select
    seekDrag.current = true;
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect) onSeek(clamp((e.clientX - rect.left) / pxPerMs, 0, durationMs));
  }, [durationMs, pxPerMs, onSeek]);

  const startOverviewDrag = useCallback((e: React.PointerEvent) => {
    if (durationMs === 0) return;
    e.preventDefault();
    overviewDrag.current = true;
    const rect = scrubRef.current?.getBoundingClientRect();
    if (rect) onSeek(Math.floor(clamp((e.clientX - rect.left) / rect.width, 0, 1) * durationMs));
  }, [durationMs, onSeek]);

  // Start a rubber-band selection drag on the clip lane background.
  const startSelDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ms = clamp((e.clientX - rect.left) / pxPerMs, 0, durationMs);
    selDrag.current = { startMs: ms, currentMs: ms, startX: e.clientX, currentX: e.clientX };
  }, [pxPerMs, durationMs]);

  // Waveform handler: seeks immediately on click, and starts a rubber-band drag.
  // • Click  (< 5 px)  → seek to that position AND deselect all captions.
  // • Drag   (≥ 5 px)  → rubber-band select (selDrag takes priority in onMove).
  const startWaveDrag = useCallback((e: React.PointerEvent) => {
    if (durationMs === 0) return;
    e.preventDefault();
    e.stopPropagation();   // waveform handles its own seek + rubber-band
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ms = (e.clientX - rect.left) / pxPerMs;
    onSeek(clamp(ms, 0, durationMs));
    selDrag.current = { startMs: ms, currentMs: ms, startX: e.clientX, currentX: e.clientX };
  }, [durationMs, pxPerMs, onSeek]);

  // Ruler tick spacing scales with zoom.
  const tickSec  = pxPerSec >= 100 ? 1 : pxPerSec >= 50 ? 2 : pxPerSec >= 25 ? 5 : 10;
  const ticks    = useMemo(() => {
    const arr: number[] = [];
    for (let s = 0; s <= Math.ceil(durationSec); s += tickSec) arr.push(s);
    return arr;
  }, [durationSec, tickSec]);

  const totalHeight = mobile ? 172 : 258;
  const peaks = waveform && waveform.length ? waveform : null;

  // Toolbar context: the selected word + its segment (for Emphasize/Spotlight/Move).
  const selectedWord = useMemo(
    () => (selectedWordId ? words.find(w => w.id === selectedWordId) ?? null : null),
    [words, selectedWordId],
  );
  const selectedWordSegIdx = useMemo(
    () => (selectedWordId ? captionSegments.findIndex(seg => seg.includes(selectedWordId)) : -1),
    [captionSegments, selectedWordId],
  );
  const selIsEmph = !!(selectedWord?.styleOverride?.scale && selectedWord.styleOverride.scale > 1);
  const selIsSpot = !!selectedWord?.styleOverride?.spotlight;
  const heroTpl   = isHeroTemplate(captionStyle);

  // Delete target: caption LINES in line mode, the selected word(s) in word mode. In word mode the
  // multi-selection holds wordClip indices → resolve to ids; fall back to the single picked word.
  const wordMode    = trackMode === 'word';
  const deleteCount = wordMode
    ? (selectedIdxs.size > 0 ? selectedIdxs.size : (selectedWordId ? 1 : 0))
    : selectedIdxs.size;
  const deleteSelection = () => {
    if (wordMode) {
      const ids = [...selectedIdxs]
        .map(i => wordClips.find(c => c.idx === i)?.firstWordId)
        .filter((x): x is string => !!x);
      const finalIds = ids.length ? ids : (selectedWordId ? [selectedWordId] : []);
      if (finalIds.length) onDeleteWords?.(finalIds);
    } else if (selectedIdxs.size > 0) {
      onDeleteSegments([...selectedIdxs]);
    }
    setSelectedIdxs(new Set());
  };

  const toolBtn = (enabled: boolean) =>
    `p-1.5 rounded transition-colors ${enabled
      ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] cursor-pointer'
      : 'text-zinc-800 cursor-not-allowed'}`;

  return (
    <div data-tour="timeline" className="flex flex-col shrink-0 bg-zinc-900/60 border-t border-white/[0.06]" style={{ height: totalHeight }}>
      {/* Controls row */}
      <div className="flex items-center gap-3 px-3 sm:px-4 h-11 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-1">
          <Tooltip label="Skip back 5 seconds" side="top">
          <button
            onClick={() => onSeek(Math.max(0, currentTimeMs - SKIP_MS))}
            aria-label="Skip back 5s"
            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          </Tooltip>
          <Tooltip label={isPlaying ? 'Pause' : 'Play'} side="top">
          <button
            onClick={onPlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 flex items-center justify-center transition-colors shadow-lg shadow-amber-400/30 cursor-pointer"
          >
            {isPlaying
              ? <Pause className="w-3.5 h-3.5 text-white fill-white" />
              : <Play  className="w-3.5 h-3.5 text-white fill-white ml-0.5" />}
          </button>
          </Tooltip>
          <Tooltip label="Skip forward 5 seconds" side="top">
          <button
            onClick={() => onSeek(Math.min(durationMs, currentTimeMs + SKIP_MS))}
            aria-label="Skip forward 5s"
            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          </Tooltip>
        </div>

        {/* Undo / Redo / Delete */}
        <div className="flex items-center gap-0.5">
          <Tooltip label="Undo" shortcut="Ctrl+Z" side="top">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            className={`p-1.5 rounded transition-colors ${canUndo ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] cursor-pointer' : 'text-zinc-800 cursor-not-allowed'}`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          </Tooltip>
          <Tooltip label="Redo" shortcut="Ctrl+Shift+Z" side="top">
          <button
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            className={`p-1.5 rounded transition-colors ${canRedo ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] cursor-pointer' : 'text-zinc-800 cursor-not-allowed'}`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          </Tooltip>
          <Tooltip
            label={
              deleteCount > 0
                ? (wordMode
                    ? `Delete ${deleteCount} word${deleteCount > 1 ? 's' : ''}`
                    : `Delete ${deleteCount} caption${deleteCount > 1 ? 's' : ''}`)
                : (wordMode
                    ? 'Select a word first, then delete'
                    : 'Click a caption block (or drag across several) first, then delete')
            }
            shortcut="Del"
            side="top"
          >
          <button
            onClick={deleteSelection}
            disabled={deleteCount === 0}
            aria-label={wordMode ? 'Delete selected words' : 'Delete selected captions'}
            className={`p-1.5 rounded transition-colors ${
              deleteCount > 0
                ? 'text-red-400 hover:text-red-300 hover:bg-red-400/[0.08] cursor-pointer'
                : 'text-zinc-800 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          </Tooltip>
        </div>

        {/* WORD | LINE track mode + caption tools (reference toolbar) */}
        {!mobile && (
          <div className="flex items-center gap-1 shrink-0">
            <div data-tour="track-mode" className="flex p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              {(['word', 'line'] as const).map(m => (
                <Tooltip
                  key={m}
                  label={m === 'word'
                    ? 'WORD track — retime, restyle or delete single words'
                    : 'LINE track — whole caption blocks (drag edges to retime, drag across several to multi-select)'}
                  side="top"
                >
                <button
                  onClick={() => setTrackMode(m)}
                  className={`px-2 py-0.5 rounded-md text-[9.5px] font-bold tracking-wider transition-colors cursor-pointer ${
                    trackMode === m ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-600 hover:text-zinc-300'}`}
                >
                  {m.toUpperCase()}
                </button>
                </Tooltip>
              ))}
            </div>

            <Tooltip label={trackMode === 'word' ? 'Add a new word at the playhead' : 'Add a new caption line at the playhead'} side="top">
            <button
              onClick={() => (trackMode === 'word' ? onAddWord?.() : onAddLine?.())}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" /> {trackMode === 'word' ? 'Word' : 'Line'}
            </button>
            </Tooltip>

            <div className="w-px h-4 bg-white/[0.07] mx-0.5" />

            <Tooltip label={selectedWordId ? 'Emphasize — make the selected word stand out' : 'Select a word first, then emphasize it'} side="top">
            <button
              onClick={() => selectedWordId && onWordEmphasis?.(selectedWordId)}
              disabled={!selectedWordId}
              aria-label="Emphasize word"
              className={`${toolBtn(!!selectedWordId)} ${selIsEmph ? '!text-emerald-400' : ''}`}
            >
              <Zap className="w-3.5 h-3.5" />
            </button>
            </Tooltip>
            <Tooltip
              label={!heroTpl ? 'Spotlight needs a Captik hero template — pick one in Templates'
                : selectedWordId ? 'Spotlight — feature this word full-frame'
                : 'Select a word first, then spotlight it'}
              side="top"
            >
            <button
              onClick={() => selectedWordId && heroTpl && onWordSpotlight?.(selectedWordId)}
              disabled={!selectedWordId || !heroTpl}
              aria-label="Spotlight word"
              className={`${toolBtn(!!selectedWordId && heroTpl)} ${selIsSpot ? '!text-amber-300' : ''}`}
            >
              <Focus className="w-3.5 h-3.5" />
            </button>
            </Tooltip>

            <div className="w-px h-4 bg-white/[0.07] mx-0.5" />

            <Tooltip label="Split the caption line at the playhead" side="top">
            <button
              onClick={() => onSplitAtPlayhead?.()}
              aria-label="Split caption at playhead"
              className={toolBtn(true)}
            >
              <FlipHorizontal2 className="w-3.5 h-3.5" />
            </button>
            </Tooltip>
            <Tooltip label="Move the selected word to the previous line" side="top">
            <button
              onClick={() => {
                if (selectedWordId && selectedWordSegIdx >= 0) onPrevLine?.(selectedWordSegIdx, selectedWordId);
              }}
              disabled={!selectedWordId || selectedWordSegIdx < 0}
              aria-label="Move word to previous line"
              className={toolBtn(!!selectedWordId && selectedWordSegIdx >= 0)}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            </Tooltip>
            <Tooltip label="Move the selected word to the next line" side="top">
            <button
              onClick={() => {
                if (selectedWordId && selectedWordSegIdx >= 0) onNextLine?.(selectedWordSegIdx, selectedWordId);
              }}
              disabled={!selectedWordId || selectedWordSegIdx < 0}
              aria-label="Move word to next line"
              className={toolBtn(!!selectedWordId && selectedWordSegIdx >= 0)}
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            </Tooltip>

            <div className="w-px h-4 bg-white/[0.07] mx-0.5" />

            {(() => {
              // Re-align targets the rubber-band multi-selection when one exists
              // (LINE mode — same semantics as Delete), else the selected caption.
              const realignTargets =
                trackMode === 'line' && selectedIdxs.size > 0 ? [...selectedIdxs]
                : selectedWordSegIdx >= 0 ? [selectedWordSegIdx]
                : [];
              const realignBusy = (realigningSegments?.size ?? 0) > 0;
              const anyLowConf  = realignTargets.some(i => lowConfidenceSegments?.has(i));
              return (
                <Tooltip
                  label={realignTargets.length > 1
                    ? `Re-align ${realignTargets.length} captions — re-sync their timing to the audio (amber = timing unverified)`
                    : realignTargets.length === 1
                      ? 'Re-align — re-sync this caption’s timing to the audio (amber = timing unverified)'
                      : 'Select a caption (or drag across several) to re-align its timing to the audio'}
                  side="top"
                >
                <button
                  onClick={() => {
                    if (realignTargets.length && !realignBusy) onRealignSegments?.(realignTargets);
                  }}
                  disabled={!realignTargets.length || realignBusy}
                  aria-label="Re-align caption timing"
                  className={`relative ${toolBtn(realignTargets.length > 0 && !realignBusy)} ${anyLowConf ? '!text-amber-400' : ''}`}
                >
                  {realignBusy
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Wand2 className="w-3.5 h-3.5" />}
                  {realignTargets.length > 1 && !realignBusy && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-amber-500 text-black text-[8.5px] font-bold leading-[14px] text-center">
                      {realignTargets.length}
                    </span>
                  )}
                </button>
                </Tooltip>
              );
            })()}
          </div>
        )}

        {/* Global timing nudge — shift every caption earlier/later (manual rescue
            when the source timing is off; feeds the learned bias). */}
        {onGlobalNudge && (
          <div className="relative shrink-0">
            <Tooltip label="All captions early or late? Shift every caption at once" side="top">
            <button
              onClick={() => setNudgeOpen(o => !o)}
              aria-label="Shift all caption timing"
              className={`${toolBtn(true)} ${nudgeOpen ? '!text-amber-300' : ''}`}
            >
              <Clock3 className="w-3.5 h-3.5" />
            </button>
            </Tooltip>
            {nudgeOpen && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur p-3 shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold tracking-wider text-zinc-400">SHIFT ALL CAPTIONS</span>
                  <button onClick={() => setNudgeOpen(false)} aria-label="Close" className="text-zinc-600 hover:text-zinc-300 text-xs cursor-pointer">✕</button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => { onGlobalNudge(-50); setSessionNudge(v => v - 50); }}
                    className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-semibold text-zinc-200 cursor-pointer"
                  >
                    −50 ms
                  </button>
                  <span className="font-mono text-[11px] text-amber-300 tabular-nums">
                    {(pendingNudge ?? sessionNudge) > 0 ? '+' : ''}{pendingNudge ?? sessionNudge} ms
                  </span>
                  <button
                    onClick={() => { onGlobalNudge(50); setSessionNudge(v => v + 50); }}
                    className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-semibold text-zinc-200 cursor-pointer"
                  >
                    +50 ms
                  </button>
                </div>
                <input
                  type="range" min={-500} max={500} step={10}
                  value={pendingNudge ?? sessionNudge}
                  onChange={(e) => setPendingNudge(Number(e.target.value))}
                  onPointerUp={commitPendingNudge}
                  onBlur={commitPendingNudge}
                  aria-label="Shift all captions (ms)"
                  className="w-full mt-3 accent-amber-400 cursor-pointer"
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-zinc-600">earlier</span>
                  <button
                    onClick={() => { if (sessionNudge) onGlobalNudge(-sessionNudge); setSessionNudge(0); setPendingNudge(null); }}
                    className="text-[9.5px] text-zinc-500 hover:text-zinc-200 cursor-pointer"
                  >
                    Reset
                  </button>
                  <span className="text-[9px] text-zinc-600">later</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-500 shrink-0 tabular-nums">
          <span>{fmt(currentTimeMs)}</span>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-700">{fmt(durationMs)}</span>
        </div>

        {/* Overview scrubber */}
        <div className="flex-1 relative" style={{ height: 20 }}>
          <div
            ref={scrubRef}
            role="slider"
            aria-label="Playback position"
            aria-valuemin={0} aria-valuemax={durationMs} aria-valuenow={currentTimeMs}
            tabIndex={0}
            onPointerDown={startOverviewDrag}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') onSeek(Math.min(durationMs, currentTimeMs + 500));
              if (e.key === 'ArrowLeft')  onSeek(Math.max(0, currentTimeMs - 500));
            }}
            className="absolute inset-0 group"
            style={{ cursor: 'pointer', touchAction: 'none' }}
          >
            <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-1 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(to right,#f59e0b,#fcd34d)' }} />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow-md shadow-amber-400/50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${pct}%` }}
            />
          </div>
        </div>

        {/* Zoom — buttons, Ctrl+wheel on the track, click % to reset */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Tooltip label="Zoom the timeline out" shortcut="Ctrl+Scroll" side="top">
          <button
            onClick={() => setPxPerSec(p => clamp(Math.round(p / 1.4), ZOOM_MIN, ZOOM_MAX))}
            disabled={pxPerSec <= ZOOM_MIN}
            aria-label="Zoom out"
            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          </Tooltip>
          <Tooltip label="Timeline zoom — click to reset to 100%" side="top">
          <button
            onClick={() => setPxPerSec(ZOOM_DEFAULT)}
            aria-label="Reset zoom"
            className="text-[10px] font-mono text-zinc-600 hover:text-zinc-300 tabular-nums w-9 text-center cursor-pointer transition-colors"
          >
            {Math.round((pxPerSec / ZOOM_DEFAULT) * 100)}%
          </button>
          </Tooltip>
          <Tooltip label="Zoom the timeline in" shortcut="Ctrl+Scroll" side="top">
          <button
            onClick={() => setPxPerSec(p => clamp(Math.round(p * 1.4), ZOOM_MIN, ZOOM_MAX))}
            disabled={pxPerSec >= ZOOM_MAX}
            aria-label="Zoom in"
            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          </Tooltip>
        </div>
      </div>

      {/* Single-track timeline: ruler → caption/word blocks → waveform (horizontal scroll) */}
      {blocks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-zinc-700 px-4 text-center">
          {durationMs === 0 ? 'Upload a video to see your captions here' : 'Captions will appear here once transcribed'}
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden relative" style={{ overscrollBehavior: 'contain' }}>
          {/* The whole track is the select/deselect surface: a click on any empty area clears
              the selection, a drag rubber-bands. Ruler, waveform and clips stopPropagation so
              they keep their own behaviour, so everything else (incl. the area below the
              waveform) selects/deselects. */}
          <div
            ref={trackRef}
            className="relative"
            // minWidth fills the viewport when the track is shorter than it (zoomed out /
            // short videos) so clicks past the end of the track still select/deselect
            // instead of dying on the scroll container.
            style={{ width: trackWidth, minWidth: '100%', minHeight: '100%', touchAction: 'none' }}
            onPointerDown={startSelDrag}
          >
            {/* Ruler — click/drag to seek */}
            <div
              className="relative bg-zinc-900/95 border-b border-white/[0.05] select-none"
              style={{ height: RULER_H, cursor: 'pointer', touchAction: 'none' }}
              onPointerDown={startSeekDrag}
            >
              {ticks.map((s) => (
                <div key={s} className="absolute top-0 h-full flex items-start" style={{ left: s * pxPerSec }}>
                  <div className="w-px h-2 bg-white/10" />
                  <span className="text-[9px] text-zinc-600 font-mono ml-1 -mt-0.5 tabular-nums">{fmt(s * 1000)}</span>
                </div>
              ))}
            </div>

            {/* Caption blocks lane — empty-area clicks bubble up to the track-wide
                select/deselect handler on trackRef. */}
            <div
              className="relative"
              style={{ height: BLOCK_H, touchAction: 'none' }}
            >
              {blocks.map((clip, pos) => {
                // 1px seam on each side so back-to-back captions read as separate blocks
                // instead of one clustered wall; min width keeps short clips grabbable.
                const isWordMode  = trackMode === 'word';
                const left        = clip.startMs * pxPerMs + 1;
                const width       = Math.max((clip.endMs - clip.startMs) * pxPerMs - 2, isWordMode ? 14 : 24);
                const active      = currentTimeMs >= clip.startMs && currentTimeMs < clip.endMs;
                const picked      = isWordMode ? clip.firstWordId === selectedWordId : clip.idx === selectedSegIdx;
                const inSel       = liveSelIdxs.has(clip.idx);
                const styleOverride = isWordMode ? undefined : segmentStyleOverrides[clip.firstWordId];
                const wordOv = isWordMode ? words.find(w => w.id === clip.firstWordId)?.styleOverride : undefined;
                // Timing-confidence affordances (LINE mode): amber dashed ring + ⚠ when
                // the aligner couldn't verify this segment's timing; spinner while the
                // region re-aligns.
                const lowConf    = !isWordMode && !!lowConfidenceSegments?.has(clip.idx);
                const realigning = !isWordMode && !!realigningSegments?.has(clip.idx);
                return (
                  <div
                    key={clip.idx}
                    onPointerDown={(e) => startClipDrag(e, clip, pos, 'move')}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (isWordMode) return;   // style picker targets caption LINES
                      // If this clip is inside the current selection, target all selected;
                      // otherwise just this single clip.
                      const targetKeys = inSel
                        ? clips.filter(c => liveSelIdxs.has(c.idx)).map(c => c.firstWordId)
                        : [clip.firstWordId];
                      setStylePicker({ segKeys: targetKeys, x: e.clientX, y: e.clientY });
                    }}
                    title={isWordMode
                      ? `${clip.text} · drag edges to retime · toolbar to emphasize`
                      : lowConf
                        ? `${clip.text} · Timing may be off — select it and click Re-align`
                        : `${clip.text} · Right-click to change style · Ctrl+click to multi-select`}
                    className={`group absolute rounded-lg border overflow-hidden select-none transition-colors ${
                      picked || inSel
                        ? 'border-amber-300 bg-amber-400/90 shadow-md shadow-amber-400/30 z-10'
                        : active
                          ? 'border-amber-300/80 bg-[#c9b277] shadow-sm'
                          : 'border-black/30 bg-[#bda86d] hover:bg-[#c9b277]'
                    } ${lowConf ? 'border-dashed !border-amber-500' : ''}`}
                    style={{ left, width, top: 6, height: BLOCK_H - 12, cursor: 'grab', touchAction: 'none' }}
                  >
                    {/* Left trim handle */}
                    <div
                      onPointerDown={(e) => startClipDrag(e, clip, pos, 'left')}
                      className="absolute left-0 top-0 bottom-0 w-1.5 bg-black/25 hover:bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ cursor: 'ew-resize', touchAction: 'none' }}
                    />
                    <div className="h-full flex flex-col justify-center px-2.5 pointer-events-none gap-0.5">
                      <span className={`text-[11px] font-semibold leading-tight truncate ${picked || inSel ? 'text-black' : 'text-black/85'}`}>
                        {clip.text}
                      </span>
                      {wordOv?.spotlight ? (
                        <span className="text-[8px] font-bold leading-none bg-black/25 rounded px-1 py-0.5 text-black/75 self-start">◎ Spot</span>
                      ) : wordOv?.scale && wordOv.scale > 1 ? (
                        <span className="text-[8px] font-bold leading-none bg-black/25 rounded px-1 py-0.5 text-black/75 self-start">⚡ Emph</span>
                      ) : styleOverride ? (
                        <span className="text-[8px] font-medium leading-none bg-black/20 rounded px-1 py-0.5 truncate text-black/70 self-start">
                          {styleOverride}
                        </span>
                      ) : (
                        <span className={`flex items-center gap-1 text-[9px] leading-none ${picked || inSel ? 'text-black/70' : 'text-black/55'}`}>
                          <span className="italic font-serif">I</span>
                          <span>Text</span>
                        </span>
                      )}
                    </div>
                    {/* Right trim handle */}
                    <div
                      onPointerDown={(e) => startClipDrag(e, clip, pos, 'right')}
                      className="absolute right-0 top-0 bottom-0 w-1.5 bg-black/25 hover:bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ cursor: 'ew-resize', touchAction: 'none' }}
                    />
                    {lowConf && !realigning && (
                      <span className="absolute top-0.5 right-1 pointer-events-none">
                        <AlertTriangle className="w-3 h-3 text-amber-700 fill-amber-300/80" />
                      </span>
                    )}
                    {realigning && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      </span>
                    )}
                  </div>
                );
              })}

            </div>

            {/* Waveform lane — click seeks + deselects; drag rubber-bands */}
            <div
              className="relative bg-black/30 border-t border-white/[0.04]"
              style={{ height: WAVE_H, cursor: 'pointer', touchAction: 'none' }}
              onPointerDown={startWaveDrag}
            >
              {peaks ? (
                <svg
                  width={trackWidth} height={WAVE_H} preserveAspectRatio="none"
                  viewBox={`0 0 ${peaks.length} 100`} className="block"
                >
                  {peaks.map((p, i) => {
                    const h = Math.max(1.5, p * 96);
                    return <rect key={i} x={i + 0.15} width={0.7} y={50 - h / 2} height={h} rx={0.3} fill="#34d399" opacity={0.85} />;
                  })}
                </svg>
              ) : (
                <div className="absolute top-1/2 left-0 right-0 h-px bg-emerald-400/30" />
              )}
              {/* Auto-Edit removed spans — hatched, click-through (the lane still seeks). */}
              {removedRanges?.map((r) => {
                const tint = reasonStyle(r.reason).overlay;
                return (
                  <div
                    key={r.id}
                    data-removed-range={r.reason}
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{
                      left: r.start * pxPerSec,
                      width: Math.max(1, (r.end - r.start) * pxPerSec),
                      opacity: removedMuted ? 0.35 : 1,
                      backgroundColor: 'rgba(9,9,11,0.55)',
                      backgroundImage: `repeating-linear-gradient(135deg, ${tint.replace(/[\d.]+\)$/, '0.9)')} 0 2px, transparent 2px 6px)`,
                      boxShadow: `inset 1px 0 0 ${tint}, inset -1px 0 0 ${tint}`,
                    }}
                  />
                );
              })}
              {sfxMarkers?.map((m) => (
                <SfxMarker
                  key={m.id}
                  marker={m}
                  pxPerSec={pxPerSec}
                  durationMs={durationMs}
                  onSelect={onSfxSelect}
                  onMove={onSfxMove}
                  onSeek={onSeek}
                />
              ))}
            </div>

            {/* Rubber-band selection overlay — spans the full track height (below the ruler)
                so the selection reads across the whole timeline, not just the caption lane. */}
            {selRange && (
              <div
                className="absolute bg-amber-400/15 border border-amber-400/40 pointer-events-none rounded z-10"
                style={{
                  top: RULER_H,
                  bottom: 0,
                  left: selRange.startMs * pxPerMs,
                  width: Math.max(0, (selRange.endMs - selRange.startMs) * pxPerMs),
                }}
              />
            )}

            {/* Playhead — spans ruler + both lanes */}
            <div
              className="absolute top-0 bottom-0 w-px bg-amber-400 pointer-events-none z-20"
              style={{ left: playheadX }}
            >
              <div className="absolute -top-0 -translate-x-1/2 w-2.5 h-2.5 rounded-sm bg-amber-400 rotate-45" />
            </div>
          </div>
        </div>
      )}

      {/* Right-click style picker */}
      {stylePicker && (
        <SegmentStylePicker
          segKeys={stylePicker.segKeys}
          currentEffectiveStyle={
            (segmentStyleOverrides[stylePicker.segKeys[0]] ?? captionStyle)
          }
          hasOverride={stylePicker.segKeys.some(k => k in segmentStyleOverrides)}
          x={stylePicker.x}
          y={stylePicker.y}
          mobile={mobile}
          count={stylePicker.segKeys.length}
          onSelect={(style) => {
            onSegmentStyleChange(stylePicker.segKeys, style);
          }}
          onClose={() => setStylePicker(null)}
        />
      )}
    </div>
  );
}

/** A placed sound on the waveform lane: a pin you can drag along time (commits on release) or
 *  click to jump the playhead to. Its own pointer handling so the lane's seek/rubber-band drag
 *  never starts underneath it. */
function SfxMarker({
  marker, pxPerSec, durationMs, onSelect, onMove, onSeek,
}: {
  marker:     SfxMarkerData;
  pxPerSec:   number;
  durationMs: number;
  onSelect?:  (id: string) => void;
  onMove?:    (id: string, atMs: number) => void;
  onSeek:     (ms: number) => void;
}) {
  const [dragMs, setDragMs] = useState<number | null>(null);
  const drag = useRef<{ x0: number; ms0: number; last: number; moved: boolean } | null>(null);
  const atMs = dragMs ?? marker.atMs;
  return (
    <div
      role="button"
      aria-label={`Sound effect: ${marker.label}`}
      title={`${marker.label} — drag to move`}
      data-sfx-marker={marker.id}
      className="absolute top-0 bottom-0 z-10 flex justify-center cursor-ew-resize"
      style={{ left: (atMs / 1000) * pxPerSec - 7, width: 14, touchAction: 'none' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x0: e.clientX, ms0: marker.atMs, last: marker.atMs, moved: false };
        onSelect?.(marker.id);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x0;
        if (!d.moved && Math.abs(dx) < 3) return;
        d.moved = true;
        d.last = clamp(d.ms0 + (dx / pxPerSec) * 1000, 0, durationMs > 0 ? durationMs : Number.MAX_SAFE_INTEGER);
        setDragMs(d.last);
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        setDragMs(null);
        if (!d) return;
        if (d.moved) onMove?.(marker.id, Math.round(d.last));
        else onSeek(marker.atMs);
      }}
      onPointerCancel={() => { drag.current = null; setDragMs(null); }}
    >
      {/* Full opacity even over a cut's hatch; a cut sound gets a rose outline + dashed stem instead. */}
      <div className={`h-full ${marker.cut ? 'border-l border-dashed border-rose-300' : `w-px ${marker.selected ? 'bg-amber-200' : 'bg-amber-400'}`}`} />
      <div
        className={`absolute top-1 w-2.5 h-2.5 rotate-45 rounded-[2px] border shadow-[0_0_0_1px_rgba(0,0,0,0.6)] ${
          marker.cut
            ? 'bg-zinc-900 border-rose-300'
            : marker.selected ? 'bg-amber-300 border-white' : 'bg-amber-500 border-amber-200/60'
        }`}
      />
    </div>
  );
}
