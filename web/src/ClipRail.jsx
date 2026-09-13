// Left column of the clip studio: every clip from the long video (ranked, scored, with export state), and
// Captik's own captions panel one tab away. Styled with the tab bar and surfaces of Captik's editor panels.
import { Scissors } from 'lucide-react';
import { fmtLength, tierTone } from './format.js';

const TABS = [
  { id: 'clips', label: 'Clips' },
  { id: 'captions', label: 'Captions' },
];

export const isEditable = (clip) => Boolean(clip?.edit && clip?.base);

function ClipState({ clip }) {
  let dot = 'bg-zinc-600';
  let text = 'Not exported';
  if (!isEditable(clip)) {
    dot = 'bg-red-400';
    text = 'Not ready to edit';
  } else if (clip.status === 'trimming') {
    dot = 'bg-amber-400 animate-pulse';
    text = `Trimming · ${Math.round((clip.trim?.progress || 0) * 100)}%`;
  } else if (clip.status === 'rendering') {
    dot = 'bg-amber-400 animate-pulse';
    text = `Exporting · ${Math.round((clip.progress || 0) * 100)}%`;
  } else if (clip.status === 'queued') {
    dot = 'bg-amber-400/60';
    text = 'Queued to export';
  } else if (clip.status === 'error') {
    dot = 'bg-red-400';
    text = 'Export failed';
  } else if (clip.dirty) {
    dot = 'bg-amber-400';
    text = 'Edited · export to update';
  } else if (clip.file) {
    dot = 'bg-emerald-400';
    text = 'Exported';
  }
  return (
    <span className="mt-1.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{text}</span>
    </span>
  );
}

function ClipRow({ jobId, clip, active, onSelect }) {
  const ready = isEditable(clip);
  return (
    <button
      type="button"
      disabled={!ready}
      onClick={() => onSelect(clip.id)}
      aria-current={active ? 'true' : undefined}
      className={`group relative flex w-full gap-2.5 rounded-xl p-2 text-left transition-colors duration-150 ${
        active
          ? 'bg-amber-500/[0.07] ring-1 ring-amber-400/25'
          : ready ? 'cursor-pointer hover:bg-white/[0.04]' : 'cursor-not-allowed opacity-40'
      }`}
    >
      <span className="relative block h-[78px] w-[44px] shrink-0 overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/[0.06]">
        {clip.poster && <img src={`/media/${jobId}/${clip.poster}`} alt="" loading="lazy" className="h-full w-full object-cover" />}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1 pb-0.5 pt-3 text-center font-mono text-[9px] text-white/85">
          {fmtLength(clip.duration)}
        </span>
      </span>
      <span className="min-w-0 flex-1 py-0.5">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-zinc-500">#{String(clip.rank).padStart(2, '0')}</span>
          {clip.score != null && (
            <span title={clip.tier} className={`rounded-md border px-1.5 py-px font-mono text-[10px] font-semibold ${tierTone(clip.score)}`}>
              {clip.score}
            </span>
          )}
          {clip.trim?.trimmedAt && (
            <span title="Trimmed in the studio" className="text-zinc-500">
              <Scissors className="h-3 w-3" strokeWidth={2} />
            </span>
          )}
        </span>
        <span className={`mt-1 block text-[12px] font-medium leading-snug line-clamp-2 ${active ? 'text-white' : 'text-zinc-300 group-hover:text-zinc-100'}`}>
          {clip.title}
        </span>
        <ClipState clip={clip} />
      </span>
    </button>
  );
}

export default function ClipRail({ job, activeId, onSelect, tab, onTab, captions }) {
  return (
    <aside className="flex h-full shrink-0 flex-col border-r border-white/[0.06] bg-[#111114]" style={{ width: 261 }}>
      <div className="flex shrink-0 border-b border-white/[0.07] bg-[#0d0d10]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={`relative flex-1 cursor-pointer whitespace-nowrap py-3 text-[11px] font-semibold transition-all duration-150 ${
              tab === t.id ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            {t.label}
            {t.id === 'clips' && <span className="ml-1.5 font-mono text-[10px] text-zinc-500">{job.clips.length}</span>}
            {tab === t.id && <span className="absolute bottom-0 left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full bg-amber-400" />}
          </button>
        ))}
      </div>

      {tab === 'clips' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-white/[0.05] px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Clipped from</p>
            <p className="mt-1 text-[12px] leading-snug text-zinc-300 line-clamp-2" title={job.source?.title}>{job.source?.title}</p>
            <p className="mt-1 font-mono text-[10px] text-zinc-600">
              {fmtLength(job.source?.duration)} · {job.source?.platformLabel || 'Video'}
            </p>
          </div>
          <ul className="space-y-1 p-2">
            {job.clips.map((c) => (
              <li key={c.id}>
                <ClipRow jobId={job.id} clip={c} active={c.id === activeId} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">{captions}</div>
      )}
    </aside>
  );
}
