// Clipper home = Captik's dashboard (components/editor/Dashboard.tsx): the same header, the same drop zone
// and the same project cards, with a link bar above the drop zone for YouTube / Drive / social links.
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Clock, Film, Link2, Plus, Trash2, Upload, Zap } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import ProgressBar from '@/components/ui/ProgressBar';
import { tierTone } from '../format.js';
import { detectPlatform, fmtTime, timeAgo, usd, useJobs } from './lib.js';
import { EmptyState, PageHeader, SectionLabel, primaryBtn } from './ui.jsx';

const VIDEO_FILE = /\.(mp4|mov|mkv|avi|webm|m4v|wmv|flv|3gp|ts|mts|m2ts)$/i;

function RunCard({ job, index }) {
  const running = job.status === 'running' || job.status === 'queued';
  const pct = Math.round((job.progress || 0) * 100);
  const image = job.thumbnail || job.poster;
  const badge = running
    ? { text: `${job.stage || 'Queued'} · ${pct}%`, tone: 'text-amber-300' }
    : job.status === 'error'
      ? { text: 'Failed', tone: 'text-red-300' }
      : { text: `${job.clipCount} clip${job.clipCount === 1 ? '' : 's'}`, tone: 'text-zinc-400' };
  return (
    <motion.a
      href={`#/job/${job.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.04 }}
      title="Open run"
      className="group relative block cursor-pointer overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.04]"
    >
      <div className="relative aspect-video overflow-hidden" style={{ background: 'linear-gradient(135deg, #f59e0b18, #f59e0b30)' }}>
        {image ? (
          <img src={image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/25">
              <Film className="h-4 w-4 text-white/50" />
            </div>
          </div>
        )}
        <div className={`absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${badge.tone}`}>{badge.text}</div>
        {job.topScore != null && (
          <span className={`absolute right-2 top-2 rounded-md border px-1.5 py-px font-mono text-[10px] font-semibold backdrop-blur-sm ${tierTone(job.topScore)}`}>{job.topScore}</span>
        )}
        {running && (
          <div className="absolute inset-x-0 bottom-0">
            <ProgressBar value={pct} height={3} />
          </div>
        )}
      </div>
      <div className="border-t border-white/[0.05] px-3 py-2.5">
        <p className="truncate text-[12px] font-semibold text-zinc-200">{job.title}</p>
        <div className="mt-1 flex items-center gap-2">
          {job.duration > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-zinc-600">
              <Clock className="h-2.5 w-2.5" />
              {fmtTime(job.duration)}
            </span>
          )}
          <span className="text-[10px] text-zinc-700">{timeAgo(job.createdAt)}</span>
          {job.costUsd != null && <span className="ml-auto text-[10px] tabular-nums text-zinc-600">{usd(job.costUsd)}</span>}
        </div>
      </div>
    </motion.a>
  );
}

export default function HomePage({ health, onPrepare }) {
  const [url, setUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [focused, setFocused] = useState(false);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const urlRef = useRef(null);
  const fileRef = useRef(null);
  const jobs = useJobs();
  const platforms = health?.platforms || [];
  const platform = url.trim() ? detectPlatform(url, platforms) : null;

  const startLink = () => {
    if (!platform) {
      setLinkError(url.trim() ? 'That is not a full link. Paste one that starts with https://' : 'Paste a link to a long video first.');
      urlRef.current?.focus();
      return;
    }
    setLinkError('');
    onPrepare({ kind: 'url', url: url.trim(), platform });
  };

  const acceptFile = (f) => {
    if (!f) return;
    if (!(f.type.startsWith('video/') || VIDEO_FILE.test(f.name))) {
      setFileError(`"${f.name}" is not a video file.`);
      return;
    }
    setFileError('');
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer.files[0]);
  };

  const shownPlatforms = platforms.slice(0, 6);
  const morePlatforms = Math.max(0, platforms.length - shownPlatforms.length);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-[#08080d]">
      <PageHeader
        title="Your Clips"
        subtitle="One long video in, up to ten captioned shorts out"
        right={(
          <Tooltip label="Paste a link or drop a long video; Claude picks up to 10 clips">
            <button type="button" onClick={() => urlRef.current?.focus()} className={primaryBtn}>
              <Plus className="h-3.5 w-3.5" />
              New Clips
            </button>
          </Tooltip>
        )}
      />

      <div className="flex-1 space-y-8 px-8 py-8">
        {/* Link */}
        <div>
          <SectionLabel>Paste a link</SectionLabel>
          <form
            onSubmit={(e) => { e.preventDefault(); startLink(); }}
            className={`flex items-center gap-2 rounded-2xl border p-2 transition-colors duration-200 ${focused ? 'border-amber-400/30 bg-white/[0.03]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'}`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
              <Link2 className={`h-4 w-4 ${platform ? 'text-amber-400' : 'text-zinc-600'}`} />
            </div>
            <input
              ref={urlRef}
              value={url}
              onChange={(e) => { setUrl(e.target.value); setLinkError(''); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://www.youtube.com/watch?v=…"
              aria-label="Video link"
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[14px] text-zinc-200 placeholder:text-zinc-700 focus:outline-none"
            />
            {platform && (
              <span className={`shrink-0 rounded border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${platform.id === 'web' ? 'border-white/[0.08] bg-white/[0.04] text-zinc-500' : 'border-amber-400/20 bg-amber-500/10 text-amber-300'}`}>
                {platform.label}
              </span>
            )}
            <motion.button
              type="submit"
              whileTap={platform ? { scale: 0.97 } : {}}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold transition-all ${platform ? 'bg-amber-500 text-white shadow-md shadow-amber-400/20 hover:bg-amber-400' : 'cursor-default border border-white/[0.07] bg-white/[0.04] text-zinc-600'}`}
            >
              Find Clips <ChevronRight className="h-3.5 w-3.5" />
            </motion.button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {shownPlatforms.map((p) => (
              <span
                key={p.id}
                className={`rounded border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition-colors ${platform?.id === p.id ? 'border-amber-400/25 bg-amber-500/10 text-amber-300' : 'border-white/[0.06] bg-white/[0.04] text-zinc-600'}`}
              >
                {p.label}
              </span>
            ))}
            {morePlatforms > 0 && (
              <span className="rounded border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">+{morePlatforms} more</span>
            )}
          </div>
          {linkError && <p className="mt-2 text-[11px] text-red-400">{linkError}</p>}
        </div>

        {/* Drop zone — Captik's, unchanged in look and behaviour */}
        <div>
          <SectionLabel>Or upload a video</SectionLabel>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !file && fileRef.current?.click()}
            className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-200 ${
              dragOver
                ? 'cursor-copy border-amber-400/60 bg-amber-400/[0.05]'
                : file
                  ? 'cursor-default border-zinc-700/60 bg-white/[0.02]'
                  : 'cursor-pointer border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.03]'
            }`}
            style={{ minHeight: 200 }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="video/*,.mkv"
              className="hidden"
              onChange={(e) => { acceptFile(e.target.files?.[0]); e.target.value = ''; }}
              aria-label="Upload video"
            />
            <AnimatePresence mode="wait">
              {file ? (
                <motion.div key="uploaded" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex h-full flex-col items-center justify-center gap-4 pb-16 pt-10">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-500/15">
                    <Film className="h-6 w-6 text-amber-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-semibold text-white">{file.name}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    className="flex items-center gap-1 text-[11px] text-zinc-600 transition-colors hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full flex-col items-center justify-center gap-3 pb-16 pt-10">
                  {dragOver ? (
                    <div className="animate-pulse-glow flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/15">
                      <Upload className="h-6 w-6 text-amber-400" />
                    </div>
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                      <Upload className="h-6 w-6 text-zinc-600" />
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-[14px] font-semibold text-zinc-300">{dragOver ? 'Drop it!' : 'Drop your video here'}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-600">or click to browse. Podcasts, interviews and streams up to 3 hours</p>
                    {fileError && <p className="mx-auto mt-2 max-w-md text-[11px] text-red-400">{fileError}</p>}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {['Hinglish', 'Hindi', 'English', 'Up to 10 clips'].map((l) => (
                      <span key={l} className="rounded border border-white/[0.06] bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">{l}</span>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-white/[0.05] bg-[#08080d]/80 px-5 py-3 backdrop-blur-sm">
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
                <Zap className="h-3 w-3 text-amber-400/60" />
                Only the picked moments are downloaded and rendered
              </div>
              <motion.button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (file) onPrepare({ kind: 'file', file });
                  else fileRef.current?.click();
                }}
                whileTap={file ? { scale: 0.97 } : {}}
                className={`flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-bold transition-all ${file ? 'bg-amber-500 text-white shadow-md shadow-amber-400/20 hover:bg-amber-400' : 'cursor-default border border-white/[0.07] bg-white/[0.04] text-zinc-600'}`}
              >
                {file ? <>Find Clips <ChevronRight className="h-3.5 w-3.5" /></> : 'Choose file'}
              </motion.button>
            </div>
          </div>
        </div>

        {/* Runs */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <SectionLabel className="">{jobs?.length ? `${jobs.length} run${jobs.length === 1 ? '' : 's'}` : 'Recent runs'}</SectionLabel>
          </div>
          {jobs === null ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[16/11] animate-pulse rounded-xl bg-white/[0.06]" />)}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState icon={Film} title="No runs yet" hint="Paste a link or upload a video to get started" />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {jobs.map((job, i) => <RunCard key={job.id} job={job} index={i} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
