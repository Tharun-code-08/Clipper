// One clipping run, in Captik's dashboard language: Captik's processing card while it runs (the editor's
// "Transcribing…" overlay), project-style cards for the clips, and plain cards for the source map and cost.
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle, ArrowLeft, Check, CheckCircle2, ChevronDown, Circle, Clock, Copy, Download, ExternalLink,
  Film, Loader2, RotateCcw, Scissors, ThumbsDown, ThumbsUp, Volume2,
} from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import ProgressBar from '@/components/ui/ProgressBar';
import { api, tierTone } from '../format.js';
import { STAGE_COPY, fmtTime, inr, labelOf, usd, usd3, useJob, useModel } from './lib.js';
import { DISPLAY_FONT, EmptyState, PageHeader, SectionLabel, Spinner, card, ghostBtn, iconBtn, primaryBtn } from './ui.jsx';

const studioHref = (jobId, clipId) => `/editor/?job=${encodeURIComponent(jobId)}${clipId ? `&clip=${encodeURIComponent(clipId)}` : ''}`;
const slug = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 50) || 'clip';
const smallBtn = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200 cursor-pointer';

function stageSeconds(st) {
  if (st?.status === 'running' && st.startedAt) return (Date.now() - st.startedAt) / 1000;
  if (st?.status === 'done' && st.startedAt && st.endedAt) return (st.endedAt - st.startedAt) / 1000;
  return null;
}

function Processing({ job, stages }) {
  const list = stages.length ? stages : Object.keys(job.stages).map((key) => ({ key, label: key }));
  const running = list.find((s) => job.stages[s.key]?.status === 'running');
  const pct = Math.round((list.reduce((a, s) => {
    const st = job.stages[s.key];
    return a + (st?.status === 'done' ? 1 : st?.progress || 0);
  }, 0) / list.length) * 100);
  const lastLine = job.log.at(-1)?.msg;
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-10">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-400 shadow-xl"
        >
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        </motion.div>
        <p className="text-sm font-semibold text-white">{running ? `${STAGE_COPY[running.key] || running.label}…` : 'Waiting for the run ahead to finish…'}</p>
        {lastLine && <p className="-mt-2 max-w-xl truncate text-center text-[11px] text-zinc-500" title={lastLine}>{lastLine}</p>}
        <div className="w-64">
          <ProgressBar value={pct} height={5} />
          <p className="mt-1.5 text-center text-[10px] tabular-nums text-zinc-500">{pct}%</p>
        </div>
      </div>
      <ol className="grid grid-cols-2 border-t border-white/[0.05] sm:grid-cols-4 xl:grid-cols-7">
        {list.map((s) => {
          const st = job.stages[s.key] || {};
          const secs = stageSeconds(st);
          return (
            <li key={s.key} className="flex flex-col gap-1.5 border-b border-r border-white/[0.04] px-3 py-3">
              <div className="flex items-center gap-1.5">
                {st.status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
                  : st.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                    : st.status === 'error' ? <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                      : <Circle className="h-3.5 w-3.5 text-zinc-700" />}
                <span className={`truncate text-[11px] font-medium ${st.status === 'pending' || !st.status ? 'text-zinc-600' : 'text-zinc-300'}`}>{s.label}</span>
              </div>
              <span className="text-[10px] tabular-nums text-zinc-600">
                {st.note || (secs != null ? `${secs < 10 ? secs.toFixed(1) : Math.round(secs)} s` : '—')}
              </span>
              {st.status === 'running' && <ProgressBar value={Math.round((st.progress || 0) * 100)} height={2} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ClipCard({ job, clip, index, features, onRated }) {
  const videoRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState(clip.feedback ?? null);
  const [sound, setSound] = useState(false);
  const editable = Boolean(clip.edit && clip.base);
  const busy = clip.status === 'rendering' || clip.status === 'queued' || clip.status === 'trimming';
  const src = clip.file ? `/media/${job.id}/${clip.file}?v=${encodeURIComponent(clip.renderedAt || '')}` : null;

  const rate = async (label) => {
    const next = rating === label ? null : label;
    setRating(next);
    await api(`/api/jobs/${job.id}/clips/${clip.id}/feedback`, { method: 'POST', json: { label: next } }).then(onRated).catch(() => setRating(rating));
  };
  const copy = async () => {
    await navigator.clipboard.writeText(`${clip.caption}\n\n${(clip.hashtags || []).join(' ')}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const playWithSound = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (sound) { v.pause(); v.muted = true; setSound(false); return; }
    v.muted = false;
    v.currentTime = 0;
    v.play().then(() => setSound(true)).catch(() => {});
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.04 }}
      className="group relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.04]"
    >
      <div
        className="relative aspect-[9/16] overflow-hidden bg-black"
        onMouseEnter={() => { const v = videoRef.current; if (v && !sound) { v.muted = true; v.play().catch(() => {}); } }}
        onMouseLeave={() => { const v = videoRef.current; if (v && !sound) v.pause(); }}
      >
        {src ? (
          <video
            ref={videoRef}
            src={src}
            poster={clip.poster ? `/media/${job.id}/${clip.poster}` : undefined}
            muted
            loop
            playsInline
            preload="none"
            onEnded={() => setSound(false)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : clip.poster ? (
          <img src={`/media/${job.id}/${clip.poster}`} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"><Film className="h-5 w-5 text-zinc-700" /></div>
        )}
        <div className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-zinc-300">#{String(clip.rank).padStart(2, '0')}</div>
        {clip.score != null && (
          <div className="absolute right-2 top-2">
            <Tooltip label={`${clip.tier} · virality score`} side="bottom">
              <span className={`block rounded-md border px-1.5 py-px font-mono text-[10px] font-semibold backdrop-blur-sm ${tierTone(clip.score)}`}>{clip.score}</span>
            </Tooltip>
          </div>
        )}
        <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-white/85">{Math.round(clip.duration)}s</div>
        {src && !busy && (
          <div className="absolute bottom-2 right-2">
          <Tooltip label={sound ? 'Stop' : 'Play with sound'} side="top">
            <button type="button" onClick={playWithSound} aria-label={sound ? 'Stop' : 'Play with sound'} className={`flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.1] bg-black/60 transition-colors ${sound ? 'text-amber-300' : 'text-zinc-300 opacity-0 group-hover:opacity-100'}`}>
              <Volume2 className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75">
            <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
            <p className="text-[11px] font-semibold text-white">
              {clip.status === 'trimming' ? 'Trimming…' : clip.status === 'queued' ? 'Queued to render' : `Rendering ${Math.round((clip.progress || 0) * 100)}%`}
            </p>
            <div className="w-24"><ProgressBar value={clip.status === 'queued' ? undefined : Math.round((clip.progress || 0) * 100)} height={3} /></div>
          </div>
        )}
        {clip.status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-4 text-center">
            <AlertCircle className="h-6 w-6 text-red-400" />
            <p className="text-[11px] text-red-300">{clip.error || 'This clip failed'}</p>
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.05] px-3 py-2.5">
        <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-zinc-200">{clip.title}</p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-600">
          <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{fmtTime(clip.start)}–{fmtTime(clip.end)}</span>
          {clip.dirty && <span className="text-amber-400/70">edited</span>}
        </div>
        {clip.hookText && <p className="mt-1.5 line-clamp-2 text-[11px] text-zinc-500">“{clip.hookText}”</p>}

        <div className="mt-2.5 flex items-center gap-1">
          {editable ? (
            <a href={studioHref(job.id, clip.id)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-md shadow-amber-400/20 transition-colors hover:bg-amber-400">
              <Scissors className="h-3 w-3" /> Edit
            </a>
          ) : (
            <span className="flex flex-1 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-bold text-zinc-600">Not ready</span>
          )}
          <Tooltip label="Download MP4" side="top">
            {src ? (
              <a href={src} download={`${String(clip.rank).padStart(2, '0')}-${slug(clip.title)}.mp4`} aria-label="Download MP4" className={smallBtn}><Download className="h-3.5 w-3.5" /></a>
            ) : (
              <span className={`${smallBtn} cursor-not-allowed opacity-40`}><Download className="h-3.5 w-3.5" /></span>
            )}
          </Tooltip>
          <Tooltip label={copied ? 'Copied' : 'Copy caption & hashtags'} side="top">
            <button type="button" onClick={copy} aria-label="Copy caption" className={smallBtn}>{copied ? <Check className="h-3.5 w-3.5 text-amber-400" /> : <Copy className="h-3.5 w-3.5" />}</button>
          </Tooltip>
          <Tooltip label="Good pick" side="top">
            <button type="button" onClick={() => rate(1)} aria-label="Good pick" aria-pressed={rating === 1} className={`${smallBtn} ${rating === 1 ? 'border-amber-400/30 bg-amber-500/15 text-amber-300' : ''}`}><ThumbsUp className="h-3.5 w-3.5" /></button>
          </Tooltip>
          <Tooltip label="Bad pick" side="top">
            <button type="button" onClick={() => rate(0)} aria-label="Bad pick" aria-pressed={rating === 0} className={`${smallBtn} ${rating === 0 ? 'border-amber-400/30 bg-amber-500/15 text-amber-300' : ''}`}><ThumbsDown className="h-3.5 w-3.5" /></button>
          </Tooltip>
          <Tooltip label={open ? 'Hide details' : 'Why this clip'} side="top">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Why this clip" className={smallBtn}><ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} /></button>
          </Tooltip>
        </div>

        {open && (
          <div className="mt-3 space-y-3 border-t border-white/[0.05] pt-3">
            {clip.why && <p className="text-[11px] leading-relaxed text-zinc-400">{clip.why}</p>}
            {features.length > 0 && (
              <div className="space-y-1.5">
                {features.map((f) => {
                  const v = clip.features?.[f.key] ?? 0;
                  return (
                    <div key={f.key} className="grid grid-cols-[76px_1fr_22px] items-center gap-2" title={f.hint}>
                      <span className="truncate text-[10px] text-zinc-500">{f.label}</span>
                      <span className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <span className={`block h-full rounded-full ${f.source === 'llm' ? 'bg-amber-400' : 'bg-sky-400/70'}`} style={{ width: `${v * 100}%` }} />
                      </span>
                      <span className="text-right text-[10px] tabular-nums text-zinc-400">{f.source === 'llm' ? Math.round(v * 10) : Math.round(v * 100)}</span>
                    </div>
                  );
                })}
                <p className="text-[9px] text-zinc-600">Amber: curator judgement /10 · Blue: measured /100</p>
              </div>
            )}
            {clip.caption && (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                <p className="text-[11px] leading-relaxed text-zinc-300">{clip.caption}</p>
                {clip.hashtags?.length > 0 && <p className="mt-1 text-[10px] text-amber-400/70">{clip.hashtags.join(' ')}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SourceMap({ job }) {
  if (!job.energy?.length || !job.source?.duration) return null;
  const dur = job.source.duration;
  return (
    <div>
      <SectionLabel>Where the clips come from</SectionLabel>
      <div className={`${card} p-4`}>
        <div className="relative h-24">
          <div className="absolute inset-0 flex items-end gap-px">
            {job.energy.map((v, i) => <span key={i} className="flex-1 rounded-t-[1px] bg-white/[0.12]" style={{ height: `${Math.max(3, v * 100)}%` }} />)}
          </div>
          {job.clips.map((c) => (
            <a
              key={c.id}
              href={c.edit && c.base ? studioHref(job.id, c.id) : undefined}
              title={`#${c.rank} ${c.title} · ${fmtTime(c.start)}–${fmtTime(c.end)}`}
              className="absolute inset-y-0 border-x border-amber-400/80 bg-amber-400/15 transition-colors hover:bg-amber-400/30"
              style={{ left: `${(c.start / dur) * 100}%`, width: `${Math.max(0.5, (c.duration / dur) * 100)}%` }}
            >
              <span className="absolute left-1/2 top-1 -translate-x-1/2 font-mono text-[9px] font-bold text-amber-300">{c.rank}</span>
            </a>
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-zinc-600">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{fmtTime(dur * f)}</span>)}
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">Loudness across the whole video; amber marks the picked moments.</p>
      </div>
    </div>
  );
}

function Receipt({ job }) {
  const c = job.cost;
  return (
    <div>
      <SectionLabel>Cost</SectionLabel>
      <div className={`${card} p-4`}>
        {!c ? (
          <p className="text-[12px] text-zinc-600">Costs appear here as each paid step finishes.</p>
        ) : (
          <>
            <ul className="space-y-2.5">
              {c.items.map((i, k) => (
                <li key={k} className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-zinc-300">{i.stage} <span className="text-zinc-600">· {i.provider}</span></p>
                    <p className="truncate text-[10px] text-zinc-600" title={i.detail}>{i.model?.startsWith('claude') ? `${labelOf(i.model)} · ` : ''}{i.detail}</p>
                  </div>
                  <span className="text-[12px] tabular-nums text-zinc-300">{usd3(i.usd || 0)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-baseline justify-between border-t border-white/[0.06] pt-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">{job.status === 'done' ? 'Total' : 'So far'}</span>
              <span className="text-[22px] font-black tabular-nums text-white" style={DISPLAY_FONT}>{usd(c.usd)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[11px]">
              <dt className="text-zinc-600">In rupees</dt><dd className="text-right tabular-nums text-zinc-300">{inr(c.inr)}</dd>
              <dt className="text-zinc-600">Per clip</dt><dd className="text-right tabular-nums text-zinc-300">{usd3(c.perClipUsd)}</dd>
              <dt className="text-zinc-600">Per source minute</dt><dd className="text-right tabular-nums text-zinc-300">{usd3(c.perSourceMinuteUsd)}</dd>
              <dt className="text-zinc-600">A 20-min video at this rate</dt><dd className="text-right tabular-nums text-zinc-300">{usd(c.per20MinUsd)} · {inr(c.per20MinUsd * c.usdInr)}</dd>
              <dt className="text-zinc-600">If hosted (with CPU time)</dt><dd className="text-right tabular-nums text-zinc-300">{usd(c.hostedUsd)}</dd>
            </dl>
          </>
        )}
      </div>
    </div>
  );
}

export default function JobPage({ id, health }) {
  const { job, error } = useJob(id);
  const [model, reloadModel] = useModel();
  const [notice, setNotice] = useState('');
  const [, tick] = useState(0);
  useEffect(() => {
    if (job?.status !== 'running') return undefined;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [job?.status]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto bg-[#08080d]">
        <PageHeader title="Run not found" left={<a href="#/" aria-label="Back to home" className={iconBtn}><ArrowLeft className="h-4 w-4" /></a>} />
        <div className="px-8 py-8"><EmptyState icon={AlertCircle} title="This run could not be loaded" hint={error} /></div>
      </div>
    );
  }
  if (!job) {
    return <div className="flex flex-1 items-center justify-center bg-[#08080d]"><Spinner /></div>;
  }

  const src = job.source;
  const running = job.status === 'running' || job.status === 'queued';
  const clips = [...job.clips].sort((a, b) => a.rank - b.rank);
  const firstEditable = clips.find((c) => c.edit && c.base);
  const canRecurate = Boolean(src) && !running;
  const title = src?.title || job.input.url || job.input.fileName || 'New run';
  const meta = [
    src?.platformLabel,
    src?.duration ? fmtTime(src.duration) : null,
    src?.uploader,
    `Picked by ${labelOf(job.input.model)}`,
    job.input.kind === 'recurate' ? 'Re-curated' : null,
  ].filter(Boolean).join(' · ');

  const recurate = async () => {
    setNotice('');
    try {
      const { id: next } = await api(`/api/jobs/${job.id}/recurate`, { method: 'POST', json: { maxClips: job.input.maxClips, model: job.input.model } });
      location.hash = `#/job/${next}`;
    } catch (err) {
      setNotice(err.message);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-[#08080d]">
      <PageHeader
        display={false}
        title={title}
        subtitle={meta}
        left={<a href="#/" aria-label="Back to home" className={iconBtn}><ArrowLeft className="h-4 w-4" /></a>}
        right={(
          <>
            {src?.url && (
              <a href={src.url} target="_blank" rel="noopener noreferrer" className={ghostBtn}><ExternalLink className="h-3.5 w-3.5" /> Source</a>
            )}
            {canRecurate && (
              <Tooltip label="Pick clips again from the saved transcript, guided by your ratings">
                <button type="button" onClick={recurate} className={ghostBtn}><RotateCcw className="h-3.5 w-3.5" /> Re-curate</button>
              </Tooltip>
            )}
            {firstEditable && (
              <a href={studioHref(job.id, firstEditable.id)} className={primaryBtn}><Scissors className="h-3.5 w-3.5" /> Open Studio</a>
            )}
          </>
        )}
      />

      <div className="flex-1 space-y-8 px-8 py-8">
        {notice && <p className="text-[11px] text-red-400">{notice}</p>}
        {running && <Processing job={job} stages={health?.stages || []} />}
        {job.status === 'error' && (
          <div className={`${card} flex flex-col items-center gap-3 px-6 py-10 text-center`}>
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="max-w-xl text-sm text-red-300">{job.error}</p>
          </div>
        )}

        {(job.summary || job.status === 'done') && (
          <div className="max-w-3xl">
            {job.summary && <p className="text-[13px] leading-relaxed text-zinc-400">{job.summary}</p>}
            {job.status === 'done' && job.cost && (
              <p className="mt-2 text-[11px] text-zinc-600">
                {clips.filter((c) => c.file).length} clips{job.totalMs ? ` in ${fmtTime(job.totalMs / 1000)}` : ''} · {usd(job.cost.usd)} ({inr(job.cost.inr)})
              </p>
            )}
          </div>
        )}

        {clips.length > 0 && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <SectionLabel className="">{clips.length} clip{clips.length === 1 ? '' : 's'}</SectionLabel>
              <span className="text-[10px] text-zinc-600">Ranked by virality score · hover to preview</span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {clips.map((c, i) => <ClipCard key={c.id} job={job} clip={c} index={i} features={model?.features || []} onRated={reloadModel} />)}
            </div>
          </div>
        )}

        {src && (
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
            <SourceMap job={job} />
            <Receipt job={job} />
          </div>
        )}

        {job.rejected?.length > 0 && (
          <details className={`${card} group`}>
            <summary className="cursor-pointer list-none px-4 py-3 text-[12px] text-zinc-400 hover:text-zinc-200">
              {job.rejected.length} proposed moment{job.rejected.length === 1 ? '' : 's'} rejected by the validator
            </summary>
            <ul className="space-y-1 border-t border-white/[0.05] px-4 py-3 text-[11px] text-zinc-500">
              {job.rejected.map((r, i) => <li key={i}>{r.title} — {r.reason}</li>)}
            </ul>
          </details>
        )}

        {job.log?.length > 0 && (
          <details className={card} open={running}>
            <summary className="cursor-pointer list-none px-4 py-3 text-[12px] text-zinc-400 hover:text-zinc-200">Pipeline log</summary>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-white/[0.05] px-4 py-3 font-mono text-[11px] leading-relaxed text-zinc-500">
              {job.log.map((l) => `${new Date(l.at).toLocaleTimeString([], { hour12: false })}  ${l.msg}`).join('\n')}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
