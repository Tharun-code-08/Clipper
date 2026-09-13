'use client';

import { useState, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Check, Download, FileText, ArrowLeft, Save, Loader2, Sparkles, Lock, MoreVertical } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import Tooltip from '@/components/ui/Tooltip';
import ProgressBar from '@/components/ui/ProgressBar';

export type ExportFormat = '16:9' | '9:16';
export type ExportResolution = '720p' | '1080p' | '4k';

// Cross-tab invalidation for the help-seen flag (and a stable no-op unsubscribe).
function subscribeStorage(cb: () => void) {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
}

export interface CreditsInfo {
  plan:                string;
  /** Paid plan or a one-shot credit ready — next export renders without the bug. */
  watermarkFree:       boolean;
  wmCredits:           number;
  icebreakerPurchased: boolean;
  /** Transcription minutes left this month (null = unmetered plan). */
  sttMinutesLeft?:     number | null;
  /** The plan's monthly transcription allowance, for the meter denominator. */
  sttMinutesTotal?:    number;
}

interface TopBarProps {
  projectName:         string;
  onProjectNameChange: (name: string) => void;
  resolution:          ExportResolution;
  onResolutionChange:  (r: ExportResolution) => void;
  /** Offer the 4K option only when the source video is actually ≥4K. */
  allow4k?:            boolean;
  onExport:            (format: ExportFormat) => void;
  onDownloadSRT:       () => void;
  /** Free plan: SRT download is locked — the button opens the paywall instead. */
  srtLocked?:          boolean;
  onSrtLocked?:        () => void;
  onSave?:             () => void;
  onBack:              () => void;
  /** Open the in-app Help guide (works on mobile too). */
  onHelp?:             () => void;
  rendering:           boolean;
  renderProgress:      number;
  /** ≥0 while the export is waiting in the box render queue (0 = next up); null = actively rendering. */
  renderQueueAhead?:   number | null;
  canExport:           boolean;
  isSaving?:           boolean;
  creditsInfo?:        CreditsInfo;
  /** Opens the remove-watermark paywall (₹9 first export, ₹99 after). */
  onRemoveWatermark?:  () => void;
  /** Set when the styling needs the HD renderer (e.g. "gradient text") — shown
      as a small note so the slower export isn't a surprise. */
  exportHdReason?:     string | null;
  /** True when an in-browser (WYSIWYG) render is going pathologically slowly on this
      device — shows a non-blocking hint that a longer/heavier export may finish faster
      via the cloud. Never aborts the in-progress render. */
  renderSlow?:         boolean;
}

export default function TopBar({
  projectName, onProjectNameChange,
  resolution, onResolutionChange, allow4k,
  onExport, onDownloadSRT, srtLocked, onSrtLocked, onSave, onBack, onHelp,
  rendering, renderProgress, renderQueueAhead, canExport,
  isSaving, creditsInfo, onRemoveWatermark, exportHdReason, renderSlow,
}: TopBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(projectName);
  // Mobile "more actions" dropdown — consolidates rename/quality/SRT/Help/Save that don't fit
  // the phone top bar.
  const [menuOpen, setMenuOpen] = useState(false);
  // Amber dot on the "?" until the Help guide has been opened once. Read via
  // useSyncExternalStore so SSR renders the no-dot state without an effect;
  // clicking sets the local flag for the immediate re-render.
  const helpSeenStored = useSyncExternalStore(
    subscribeStorage,
    () => { try { return localStorage.getItem('captik_help_opened') === '1'; } catch { return true; } },
    () => true,
  );
  const [helpClicked, setHelpClicked] = useState(false);
  const helpSeen = helpSeenStored || helpClicked;

  const handleConfirm = () => {
    const trimmed = editValue.trim();
    onProjectNameChange(trimmed || projectName);
    setIsEditing(false);
  };

  return (
    <header className="relative flex items-center justify-between h-12 px-3 bg-[#09090d] border-b border-white/[0.06] shrink-0 z-50 gap-2">
      {/* Export progress strip — upload (0-30) then render (30-100) */}
      {rendering && (
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <ProgressBar value={renderProgress} height={2} />
        </div>
      )}
      {/* Left */}
      <div className="flex items-center gap-1.5 min-w-0">
        <Tooltip label="Back to projects — work is saved on this device">
        <button
          onClick={onBack}
          title="Back to projects — your work is saved on this device"
          aria-label="Back to projects"
          className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] transition-colors shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        </Tooltip>

        <div className="group flex items-center gap-1.5 shrink-0 cursor-default">
          <LogoMark size={24} />
          <span className="font-bold text-[12px] text-white tracking-tight hidden sm:block">Captik</span>
        </div>

        {/* Separator + project name — hidden on mobile to keep the language toggle visible */}
        <div className="hidden sm:block w-px h-4 bg-white/[0.07] shrink-0" />

        <div className="hidden sm:flex items-center gap-1 min-w-0">
          {isEditing ? (
            <input
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={handleConfirm}
              onKeyDown={e => {
                if (e.key === 'Enter') handleConfirm();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              aria-label="Project name"
              className="bg-white/[0.05] border border-amber-400/40 text-zinc-100 text-[12px] px-2 py-0.5 rounded-md focus:outline-none w-36 transition-colors"
            />
          ) : (
            <span className="text-[12px] text-zinc-400 truncate max-w-[120px] sm:max-w-[180px] font-medium">{projectName}</span>
          )}
          <Tooltip label={isEditing ? 'Save the new name' : 'Rename this project'}>
          <button
            onClick={() => { setEditValue(projectName); setIsEditing(v => !v); }}
            aria-label={isEditing ? 'Confirm' : 'Edit project name'}
            className="p-0.5 rounded text-zinc-700 hover:text-zinc-300 hover:bg-white/[0.05] transition-colors cursor-pointer shrink-0"
          >
            {isEditing
              ? <Check className="w-3 h-3 text-amber-400" />
              : <Pencil className="w-3 h-3" />}
          </button>
          </Tooltip>
        </div>
      </div>

      {/* Centre */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          {([...(allow4k ? (['4k'] as const) : []), '1080p', '720p'] as ExportResolution[]).map(r => (
            <Tooltip
              key={r}
              label={
                r === '4k'    ? '4K — sharpest, but renders noticeably slower'
                : r === '1080p' ? '1080p — best quality/speed balance for posting'
                : '720p — smallest file, fastest export'
              }
            >
            <button
              onClick={() => onResolutionChange(r)}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer ${
                resolution === r ? 'bg-white/[0.08] text-white' : 'text-zinc-600 hover:text-zinc-300'
              }`}
            >
              {r === '4k' ? '4K' : r}
            </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Transcription meter — counts down the plan's monthly window */}
        {creditsInfo && typeof creditsInfo.sttMinutesLeft === 'number' && (
          <Tooltip label="Transcription minutes left this month">
          <div
            title="Transcription minutes left this month"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${
              creditsInfo.sttMinutesLeft <= 0
                ? 'border-red-500/30 bg-red-500/[0.08] text-red-400'
                : creditsInfo.sttMinutesLeft <= 3
                ? 'border-amber-400/30 bg-amber-400/[0.08] text-amber-300'
                : 'border-white/[0.07] bg-white/[0.04] text-zinc-400'
            }`}
          >
            <span className="tabular-nums">{Math.max(0, creditsInfo.sttMinutesLeft)}/{creditsInfo.sttMinutesTotal ?? 15}</span>
            <span className="text-[9px] font-normal">min</span>
          </div>
          </Tooltip>
        )}

        {/* Watermark state — free tier sees the remove-watermark CTA (₹9 anchored
            against ₹99), a ready credit shows as a chip, paid plans see nothing */}
        {creditsInfo && !creditsInfo.watermarkFree && onRemoveWatermark && (
          <Tooltip label="Exports carry the Captik watermark — remove it">
          <button
            onClick={onRemoveWatermark}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-amber-400/30 bg-amber-400/[0.08] text-amber-300 hover:bg-amber-400/[0.15] transition-colors cursor-pointer"
          >
            <Sparkles className="w-3 h-3" />
            <span>
              Remove watermark —{' '}
              {creditsInfo.icebreakerPurchased
                ? '₹99'
                : <>₹9 <s className="text-amber-300/50 font-normal">₹99</s></>}
            </span>
          </button>
          </Tooltip>
        )}
        {creditsInfo && creditsInfo.watermarkFree && creditsInfo.wmCredits > 0 && (
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300">
            <Sparkles className="w-3 h-3" />
            <span>{creditsInfo.wmCredits === 1 ? 'Clean export ready' : `${creditsInfo.wmCredits} clean exports ready`}</span>
          </div>
        )}
        {onSave && (
          <Tooltip label="Save project on this device">
          <button
            onClick={onSave}
            disabled={isSaving}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] rounded-lg transition-all cursor-pointer disabled:opacity-40"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            <span className="hidden sm:inline">{isSaving ? 'Saving…' : 'Save'}</span>
          </button>
          </Tooltip>
        )}

        <Tooltip label={srtLocked ? 'SRT needs a paid plan — Starter unlocks it' : 'Download .srt subtitle file'}>
        <button
          onClick={srtLocked ? onSrtLocked : onDownloadSRT}
          disabled={!canExport}
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-white/[0.04] border rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            srtLocked
              ? 'text-amber-300/80 border-amber-400/25 hover:bg-amber-400/[0.08]'
              : 'text-zinc-500 border-white/[0.07] hover:bg-white/[0.07] hover:text-zinc-200'
          }`}
        >
          {srtLocked ? <Lock className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
          <span className="hidden sm:inline">SRT</span>
        </button>
        </Tooltip>

        {/* Help guide (and tour replay, inside the guide) */}
        {onHelp && (
          <Tooltip label="Help & shortcuts">
          <button
            data-tour="help"
            onClick={() => {
              try { localStorage.setItem('captik_help_opened', '1'); } catch {}
              setHelpClicked(true);
              onHelp();
            }}
            aria-label="Open the help guide"
            className="relative hidden sm:flex items-center justify-center w-7 h-7 text-[12px] font-bold text-zinc-600 hover:text-zinc-200 hover:bg-white/[0.05] rounded-lg transition-all cursor-pointer"
          >
            ?
            {!helpSeen && (
              <span aria-hidden className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>
          </Tooltip>
        )}

        {/* Slow in-browser render note — surfaced only when this device is rendering
            pathologically slowly; purely informational, the export keeps running. */}
        {rendering && renderSlow && (
          <Tooltip label="Rendering on this device is slow — heavier or longer videos export faster via the cloud (try a different style or resolution).">
            <span className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-400/10 border border-amber-400/25 text-[9.5px] font-semibold text-amber-300 select-none">
              ⏳ slow on this device
            </span>
          </Tooltip>
        )}

        {/* Box render queue note — the export is waiting its turn for a free render slot. */}
        {rendering && renderQueueAhead != null && (
          <Tooltip label={renderQueueAhead === 0
            ? 'Your export is next in line — it will start in a moment.'
            : `Your export is in the queue — ${renderQueueAhead} ${renderQueueAhead === 1 ? 'export' : 'exports'} ahead of you. It will start shortly.`}>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-400/10 border border-sky-400/25 text-[9.5px] font-semibold text-sky-300 select-none">
              ⏳ {renderQueueAhead === 0 ? 'in queue · next up' : `in queue · ${renderQueueAhead} ahead`}
            </span>
          </Tooltip>
        )}

        {/* HD-render note — styling features libass can't draw route to the HD renderer */}
        {exportHdReason && !rendering && (
          <Tooltip label={`Your ${exportHdReason} needs the HD renderer — export takes a little longer`}>
            <span className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[9.5px] font-semibold text-zinc-400 select-none">
              ✦ HD render
            </span>
          </Tooltip>
        )}

        {/* Mobile "more actions" dropdown — consolidates the controls that don't fit a phone bar */}
        <div className="relative sm:hidden">
          <button
            onClick={() => setMenuOpen(v => !v)}
            title="More — rename, quality, transcription left, SRT, save & help"
            aria-label="More actions"
            aria-expanded={menuOpen}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-50 w-60 rounded-xl border border-white/10 bg-[#15151b] shadow-2xl shadow-black/60 p-2.5 space-y-2.5">
                {/* Project name */}
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Project name</label>
                  <input
                    value={isEditing ? editValue : projectName}
                    onFocus={() => { setEditValue(projectName); setIsEditing(true); }}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={handleConfirm}
                    onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
                    aria-label="Project name"
                    className="mt-1 w-full bg-white/[0.05] border border-white/10 rounded-lg text-[13px] text-white px-2.5 py-2 outline-none focus:border-amber-400/40"
                  />
                </div>

                {/* Quality / resolution */}
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Quality</label>
                  <div className="mt-1 flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                    {([...(allow4k ? (['4k'] as const) : []), '1080p', '720p'] as ExportResolution[]).map(r => (
                      <button
                        key={r}
                        onClick={() => onResolutionChange(r)}
                        title={r === '4k' ? '4K — sharpest, renders slower' : r === '1080p' ? '1080p — best quality/speed for posting' : '720p — smallest file, fastest export'}
                        className={`flex-1 px-2 py-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          resolution === r ? 'bg-white/[0.1] text-white' : 'text-zinc-500'
                        }`}
                      >
                        {r === '4k' ? '4K' : r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transcription left */}
                {creditsInfo && typeof creditsInfo.sttMinutesLeft === 'number' && (
                  <div className="flex items-center justify-between px-1" title="Transcription minutes remaining in your plan's monthly window">
                    <span className="text-[12px] text-zinc-400">Transcription left</span>
                    <span className={`text-[12px] font-bold tabular-nums ${
                      creditsInfo.sttMinutesLeft <= 0 ? 'text-red-400'
                      : creditsInfo.sttMinutesLeft <= 3 ? 'text-amber-300' : 'text-zinc-200'
                    }`}>
                      {Math.max(0, creditsInfo.sttMinutesLeft)}/{creditsInfo.sttMinutesTotal ?? 15} min
                    </span>
                  </div>
                )}

                <div className="h-px bg-white/[0.06]" />

                {creditsInfo && !creditsInfo.watermarkFree && onRemoveWatermark && (
                  <button
                    onClick={() => { setMenuOpen(false); onRemoveWatermark(); }}
                    title="Exports carry the Captik watermark — remove it"
                    className="w-full flex items-center gap-2 px-1 py-1.5 text-[13px] font-semibold text-amber-300 active:opacity-80 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" /> Remove watermark — {creditsInfo.icebreakerPurchased ? '₹99' : '₹9'}
                  </button>
                )}

                <button
                  onClick={() => { setMenuOpen(false); (srtLocked ? onSrtLocked : onDownloadSRT)?.(); }}
                  disabled={!canExport}
                  title={srtLocked ? 'SRT needs a paid plan — Starter unlocks it' : 'Download the .srt subtitle file'}
                  className="w-full flex items-center gap-2 px-1 py-1.5 text-[13px] font-medium text-zinc-200 active:opacity-80 disabled:opacity-40 cursor-pointer"
                >
                  {srtLocked ? <Lock className="w-4 h-4" /> : <FileText className="w-4 h-4" />} Download SRT
                </button>

                {onSave && (
                  <button
                    onClick={() => { setMenuOpen(false); onSave(); }}
                    disabled={isSaving}
                    title="Save this project on your device"
                    className="w-full flex items-center gap-2 px-1 py-1.5 text-[13px] font-medium text-zinc-200 active:opacity-80 disabled:opacity-40 cursor-pointer"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {isSaving ? 'Saving…' : 'Save project'}
                  </button>
                )}

                {onHelp && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      try { localStorage.setItem('captik_help_opened', '1'); } catch {}
                      setHelpClicked(true);
                      onHelp();
                    }}
                    title="Open the help guide & shortcuts"
                    className="w-full flex items-center gap-2 px-1 py-1.5 text-[13px] font-medium text-zinc-200 active:opacity-80 cursor-pointer"
                  >
                    <span className="w-4 h-4 flex items-center justify-center font-bold">?</span> Help &amp; shortcuts
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Export — uses the orientation currently shown in the preview. */}
        <Tooltip label="Export video in the preview's aspect ratio">
        <motion.button
          data-tour="export"
          onClick={() => canExport && !rendering && onExport('9:16')}
          disabled={!canExport || rendering}
          title="Export the video in the preview's aspect ratio"
          whileTap={canExport && !rendering ? { scale: 0.97 } : {}}
          className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
            rendering
              ? 'bg-amber-400/15 border border-amber-400/25 text-amber-300 cursor-wait'
              : canExport
              ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-md shadow-amber-400/20'
              : 'bg-white/[0.04] border border-white/[0.07] text-zinc-600 cursor-not-allowed'
          }`}
        >
          {rendering ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          {rendering
            ? (renderQueueAhead != null
                ? <span className="text-[11px]">In&nbsp;queue</span>
                : <span className="tabular-nums">{renderProgress}%</span>)
            : <span className="hidden sm:inline">Export</span>}
        </motion.button>
        </Tooltip>
      </div>
    </header>
  );
}
