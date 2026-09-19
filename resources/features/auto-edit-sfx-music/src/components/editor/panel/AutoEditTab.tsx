'use client';

// Auto-Edit left-panel tab — three cleanup toggles, a 4-stop Aggression slider, the
// Run button, the Original / Edited switch and the removed-clips list. Detection runs
// locally from the transcript (no upload, no model), so Run is instant.

import { Wand2, Loader2, AlertCircle, Info } from 'lucide-react';
import { ToggleRow } from './controls';
import RemovedClipsPanel from './RemovedClipsPanel';
import { AGGRESSION_LEVELS, getAggressionLevel } from '@/lib/autoedit/aggression';
import type { EditOptions, RemovedSegment } from '@/lib/autoedit/types';
import type { EditMode } from '@/lib/autoedit/useAutoEdit';

interface AutoEditTabProps {
  settings: EditOptions;
  setSettings: (patch: Partial<EditOptions>) => void;
  onRun: () => void;
  running: boolean;
  error: string | null;
  notice: string | null;
  /** true once a transcribed video is loaded. */
  hasVideo: boolean;
  hasEdits: boolean;
  savedSeconds: number;
  removed: RemovedSegment[];
  editMode: EditMode;
  onEditModeChange: (m: EditMode) => void;
  hoveredRemovedId: string | null;
  onHover: (id: string | null) => void;
  onSeek: (sec: number) => void;
  onRestore: (id: string) => void;
  onCutAgain: (id: string) => void;
  onClear: () => void;
}

function AggressionControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const level = getAggressionLevel(value);
  const pct = (value / (AGGRESSION_LEVELS.length - 1)) * 100;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Aggression</span>
        <span className="text-[11px] font-semibold text-amber-300 bg-amber-500/15 border border-amber-400/25 rounded-md px-2 py-0.5">
          {level.label}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={AGGRESSION_LEVELS.length - 1}
        step={1}
        value={value}
        aria-label="Aggression"
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right, #f59e0b ${pct}%, #3f3f46 ${pct}%)`, accentColor: '#f59e0b' }}
      />
      <div className="flex justify-between px-0.5">
        {AGGRESSION_LEVELS.map((l) => (
          <button
            key={l.value}
            onClick={() => onChange(l.value)}
            className={`text-[9.5px] font-medium transition-colors cursor-pointer ${
              value === l.value ? 'text-amber-300' : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2">
        <p className="text-[11px] leading-relaxed text-zinc-400">
          <span className="text-zinc-200 font-semibold">{level.short}</span> — {level.desc}
        </p>
      </div>
    </div>
  );
}

/** Original / Edited segmented switch — also rendered on the preview toolbar. */
export function EditModeSwitch({
  mode,
  onChange,
  compact = false,
}: {
  mode: EditMode;
  onChange: (m: EditMode) => void;
  compact?: boolean;
}) {
  const btn = (m: EditMode, label: string) => (
    <button
      key={m}
      onClick={() => onChange(m)}
      aria-pressed={mode === m}
      className={`${compact ? 'px-2 py-0.5 text-[10px]' : 'flex-1 py-1.5 text-[11px]'} rounded-md font-semibold whitespace-nowrap transition-all cursor-pointer ${
        mode === m ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Preview original or edited cut"
      className={`flex items-center gap-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06] p-0.5 ${compact ? '' : 'w-full'}`}
    >
      {btn('original', 'Original')}
      {btn('edited', 'Edited')}
    </div>
  );
}

export default function AutoEditTab({
  settings,
  setSettings,
  onRun,
  running,
  error,
  notice,
  hasVideo,
  hasEdits,
  savedSeconds,
  removed,
  editMode,
  onEditModeChange,
  hoveredRemovedId,
  onHover,
  onSeek,
  onRestore,
  onCutAgain,
  onClear,
}: AutoEditTabProps) {
  const noCategory = !settings.removeSilences && !settings.removeFillers && !settings.removeRepetitions;
  const disabledReason = !hasVideo
    ? 'Transcribe a video to use Auto-Edit'
    : noCategory
      ? 'Turn on at least one option'
      : running
        ? 'Auto-editing…'
        : '';
  const canRun = !disabledReason;

  return (
    <div className="flex flex-col gap-4 px-3 py-3" data-testid="autoedit-tab">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-white">Auto-Edit</span>
          <span className="text-[8.5px] font-bold tracking-wider text-amber-300 bg-amber-500/15 border border-amber-400/30 rounded px-1.5 py-0.5">
            BETA
          </span>
        </div>
        <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
          One click cuts silences, filler words and obvious retakes. Nothing is deleted — restore any cut below.
        </p>
      </div>

      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-0.5">What to remove</span>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-1.5">
          <ToggleRow label="Silences" on={settings.removeSilences} onChange={(v) => setSettings({ removeSilences: v })} />
          <ToggleRow label="Filler words (umm, uh, हम्म)" on={settings.removeFillers} onChange={(v) => setSettings({ removeFillers: v })} />
          <ToggleRow label="Retakes (restarted lines)" on={settings.removeRepetitions} onChange={(v) => setSettings({ removeRepetitions: v })} />
        </div>
      </div>

      <AggressionControl value={settings.aggressionLevel} onChange={(v) => setSettings({ aggressionLevel: v })} />

      <div className="space-y-1.5" data-testid="audio-cleanup">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-0.5">Clean up audio</span>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-1.5">
          <ToggleRow label="Reduce background noise" on={settings.denoiseAudio} onChange={(v) => setSettings({ denoiseAudio: v })} />
          <ToggleRow label="Even out loudness" on={settings.levelAudio} onChange={(v) => setSettings({ levelAudio: v })} />
        </div>
        <p className="text-[10px] text-zinc-600 leading-relaxed px-0.5">
          Applied when you export, tuned to this recording. Works with or without cuts.
        </p>
      </div>

      <button
        onClick={() => canRun && onRun()}
        disabled={!canRun}
        title={disabledReason || undefined}
        data-testid="autoedit-run"
        className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[12.5px] font-semibold transition-all ${
          canRun ? 'bg-amber-500 text-black hover:bg-amber-400 cursor-pointer' : 'bg-white/[0.05] text-zinc-600 cursor-not-allowed'
        }`}
      >
        {running ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Auto-Editing…
          </>
        ) : (
          <>
            <Wand2 className="w-4 h-4" /> {hasEdits ? 'Re-run Auto-Edit' : 'Auto Edit'}
          </>
        )}
      </button>
      {!hasVideo && <p className="text-[10.5px] text-zinc-600 text-center -mt-2">{disabledReason}</p>}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-500/[0.08] border border-rose-400/20 px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 text-rose-300 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-200/90 leading-relaxed flex-1">{error}</p>
        </div>
      )}
      {notice && !error && (
        <div className="flex items-start gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
          <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-400 leading-relaxed">{notice}</p>
        </div>
      )}

      {removed.length > 0 && (
        <div className="space-y-2">
          <EditModeSwitch mode={editMode} onChange={onEditModeChange} />
          <div className="rounded-lg bg-emerald-500/[0.06] border border-emerald-400/15 px-3 py-2 space-y-1">
            <p className="text-[11px] text-emerald-300 font-semibold" data-testid="autoedit-saved">
              {hasEdits ? `${savedSeconds.toFixed(1)}s removed from the final cut` : 'Every cut is restored'}
            </p>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              {editMode === 'edited'
                ? 'Preview and export play the edited cut; captions follow it.'
                : 'Showing the original — switch to Edited to preview and export the cut.'}
            </p>
            <button
              onClick={onClear}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2 cursor-pointer"
            >
              Discard Auto-Edit
            </button>
          </div>
          <RemovedClipsPanel
            removed={removed}
            hoveredRemovedId={hoveredRemovedId}
            onHover={onHover}
            onSeek={onSeek}
            onRestore={onRestore}
            onCutAgain={onCutAgain}
          />
        </div>
      )}
    </div>
  );
}
