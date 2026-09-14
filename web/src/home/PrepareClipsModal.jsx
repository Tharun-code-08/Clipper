// Captik's "Prepare Your Media" modal (components/editor/PrepareMediaModal.tsx) for a clipping run: the same
// preview, "Ready for processing" line, settings card and full-width amber CTA.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calculator, CheckCircle, ChevronRight, Film, Globe, Languages, Scissors, Sparkles, X } from 'lucide-react';
import ProgressBar from '@/components/ui/ProgressBar';
import { api } from '../format.js';
import { inr, labelOf, usd, youtubeId } from './lib.js';
import { FieldLabel, Select } from './ui.jsx';

function upload(form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/jobs');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
      if (xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed: the clipper server is unreachable.'));
    xhr.send(form);
  });
}

export default function PrepareClipsModal({ source, health, onClose, onStarted }) {
  const maxAllowed = health?.maxClips || 10;
  const [maxClips, setMaxClips] = useState(String(maxAllowed));
  const [model, setModel] = useState(health?.defaults.model || 'claude-opus-5');
  const [sttModel, setSttModel] = useState(health?.defaults.sttModel || 'sarvam:saaras:v3');
  const [minutes, setMinutes] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [thumbReady, setThumbReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadPct, setUploadPct] = useState(null);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const objectUrl = useMemo(() => (source.kind === 'file' ? URL.createObjectURL(source.file) : null), [source]);
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);
  const ytId = source.kind === 'url' ? youtubeId(source.url) : null;

  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams({ minutes: String(Math.max(1, Math.round(minutes || 20))), model, sttModel, maxClips });
      api(`/api/estimate?${q}`).then(setEstimate).catch(() => setEstimate(null));
    }, 150);
    return () => clearTimeout(t);
  }, [minutes, model, sttModel, maxClips]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !submitting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    const opts = { maxClips: Number(maxClips), model, sttModel };
    try {
      let id;
      if (source.kind === 'file') {
        const form = new FormData();
        Object.entries(opts).forEach(([k, v]) => form.append(k, String(v)));
        form.append('file', source.file);
        setUploadPct(0);
        id = (await upload(form, setUploadPct)).id;
      } else {
        id = (await api('/api/jobs', { method: 'POST', json: { url: source.url, ...opts } })).id;
      }
      onStarted(id);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
      setUploadPct(null);
    }
  };

  const modelOptions = (health?.models || [model]).map((m) => ({ value: m, label: labelOf(m) }));
  const sttOptions = (health?.sttModels || [sttModel]).map((m) => ({ value: m, label: labelOf(m) }));
  const clipOptions = Array.from({ length: maxAllowed }, (_, i) => ({ value: String(i + 1), label: `Up to ${i + 1} clip${i ? 's' : ''}` }));
  let host = '';
  try { host = source.kind === 'url' ? new URL(source.url).hostname.replace(/^www\./, '') : ''; } catch { /* validated before */ }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="prepare-clips-title"
          className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#09090d] shadow-2xl"
        >
          <div className="flex items-start justify-between p-5 pb-4">
            <div>
              <h2 id="prepare-clips-title" className="text-[17px] font-bold tracking-tight text-white">Prepare Your Clips</h2>
              <p className="mt-0.5 text-[12px] text-zinc-500">Choose how Claude clips this video.</p>
            </div>
            <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="ml-4 shrink-0 cursor-pointer rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-white/[0.06] hover:text-zinc-300 disabled:cursor-not-allowed">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 pb-4">
            <div className="relative w-full overflow-hidden rounded-xl border border-white/[0.06] bg-black" style={{ aspectRatio: '16/9', maxHeight: 168 }}>
              {source.kind === 'file' ? (
                <video
                  ref={videoRef}
                  src={objectUrl || undefined}
                  preload="metadata"
                  muted
                  playsInline
                  onLoadedMetadata={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    if (Number.isFinite(v.duration)) setMinutes(v.duration / 60);
                    v.currentTime = 0.5;
                  }}
                  onSeeked={() => setThumbReady(true)}
                  className={`h-full w-full object-cover transition-opacity duration-300 ${thumbReady ? 'opacity-100' : 'opacity-0'}`}
                />
              ) : ytId ? (
                <img
                  src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`}
                  alt=""
                  onLoad={() => setThumbReady(true)}
                  className={`h-full w-full object-cover transition-opacity duration-300 ${thumbReady ? 'opacity-100' : 'opacity-0'}`}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.08]">
                    <Globe className="h-4 w-4 text-white/50" />
                  </div>
                  <p className="max-w-[80%] truncate text-[11px] text-zinc-500">{host}</p>
                </div>
              )}
              {!thumbReady && (source.kind === 'file' || ytId) && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.08]">
                    <div className="ml-1 h-0 w-0 border-y-[8px] border-l-[13px] border-y-transparent border-l-white/50" />
                  </div>
                </div>
              )}
            </div>
            <div className="mt-2.5 flex items-center justify-center gap-1.5">
              <CheckCircle className="h-3 w-3 text-amber-400" />
              <span className="text-[11px] text-zinc-500">
                {source.kind === 'file'
                  ? `Ready for processing${minutes ? ` · ${Math.round(minutes)} min` : ''}`
                  : `${source.platform?.label || 'Link'} ready · only the audio downloads first`}
              </span>
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-400/15 bg-amber-500/10">
                  <Scissors className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white">Clip Settings</p>
                  <p className="text-[11px] text-zinc-600">How many clips, and which models read the video</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel icon={Film}>How many clips?</FieldLabel>
                  <Select value={maxClips} onChange={setMaxClips} options={clipOptions} disabled={submitting} />
                </div>
                <div>
                  <FieldLabel icon={Sparkles}>Who picks them?</FieldLabel>
                  <Select value={model} onChange={setModel} options={modelOptions} disabled={submitting} />
                </div>
                <div>
                  <FieldLabel icon={Languages}>Transcribed by</FieldLabel>
                  <Select value={sttModel} onChange={setSttModel} options={sttOptions} disabled={submitting} />
                  {sttModel.startsWith('whisper') && (
                    <p className="mt-1.5 text-[10px] leading-tight text-amber-400/70">Translates Hinglish into English</p>
                  )}
                </div>
                <div>
                  <FieldLabel icon={Calculator}>Estimated cost</FieldLabel>
                  <div className="flex items-baseline gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px]">
                    <span className="font-semibold tabular-nums text-zinc-200">{estimate ? usd(estimate.usd) : '…'}</span>
                    {estimate && <span className="tabular-nums text-zinc-500">≈ {inr(estimate.inr)}</span>}
                  </div>
                  <p className="mt-1.5 text-[10px] leading-tight text-zinc-600">
                    {minutes ? `For this ${Math.round(minutes)}-minute video` : 'Per 20-minute video; the receipt shows the real cost'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 pb-5">
            {uploadPct !== null && (
              <div className="mb-3">
                <ProgressBar value={Math.round(uploadPct * 100)} height={5} />
                <p className="mt-1.5 text-center text-[10px] tabular-nums text-zinc-500">Uploading {Math.round(uploadPct * 100)}%</p>
              </div>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-[14px] font-bold text-white shadow-lg shadow-amber-900/20 transition-colors hover:bg-amber-400 disabled:cursor-wait disabled:opacity-70"
            >
              {submitting ? (source.kind === 'file' ? 'Uploading…' : 'Starting…') : 'Find Clips'}
              {!submitting && <ChevronRight className="h-4 w-4" />}
            </button>
            {error && <p className="mt-2 text-center text-[11px] text-red-400">{error}</p>}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
