// Data + routing for the clipper home. Pages follow Captik's dashboard, so these stay free of markup.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../format.js';

const MODEL_LABELS = {
  'claude-opus-5': 'Claude Opus 5',
  'claude-sonnet-5': 'Claude Sonnet 5',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'sarvam:saaras:v3': 'Sarvam + ElevenLabs',
  'whisper-large-v3': 'Whisper large-v3 (Groq)',
  'whisper-large-v3-turbo': 'Whisper v3 turbo (Groq)',
};
export const labelOf = (id) => MODEL_LABELS[id] || id;

// What each pipeline stage is doing, in the voice of Captik's "Transcribing…" overlay.
export const STAGE_COPY = {
  audio: 'Downloading the audio',
  transcribe: 'Transcribing every word',
  curate: 'Picking the best moments',
  parts: 'Downloading the picked parts',
  style: 'Styling captions from frames',
  score: 'Scoring virality',
  render: 'Rendering with Captik templates',
};

const HOSTS = [
  ['youtube', ['youtube.com', 'youtu.be']], ['gdrive', ['drive.google.com', 'docs.google.com']], ['instagram', ['instagram.com']],
  ['tiktok', ['tiktok.com']], ['x', ['x.com', 'twitter.com']], ['facebook', ['facebook.com', 'fb.watch']], ['linkedin', ['linkedin.com']],
  ['vimeo', ['vimeo.com']], ['reddit', ['reddit.com', 'redd.it']], ['twitch', ['twitch.tv']], ['dropbox', ['dropbox.com']],
];

/** Which platform a pasted link points at, or null when it is not a full http(s) link. */
export function detectPlatform(value, platforms = []) {
  try {
    const u = new URL(String(value).trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const hit = HOSTS.find(([, hosts]) => hosts.some((h) => host === h || host.endsWith(`.${h}`)));
    if (hit) return platforms.find((p) => p.id === hit[0]) || { id: hit[0], label: hit[0] };
    if (/\.(mp4|mov|m4v|webm|mkv)$/i.test(u.pathname)) return { id: 'direct', label: 'Direct file' };
    return { id: 'web', label: 'Web page' };
  } catch {
    return null;
  }
}

export function youtubeId(link) {
  try {
    const u = new URL(link);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host.endsWith('youtube.com')) return u.searchParams.get('v') || u.pathname.match(/\/(?:shorts|live|embed)\/([\w-]{6,})/)?.[1] || null;
  } catch {
    // not a link
  }
  return null;
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export const usd = (v) => (v == null ? '—' : `$${v.toFixed(2)}`);
export const usd3 = (v) => (v == null ? '—' : `$${v > 0 && v < 0.001 ? v.toFixed(4) : v.toFixed(3)}`);
export const inr = (v) => (v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')}`);

export function timeAgo(iso) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const job = h.match(/^\/job\/([\w-]+)/);
  if (job) return { name: 'job', id: job[1] };
  if (h.startsWith('/cost')) return { name: 'cost' };
  if (h.startsWith('/train')) return { name: 'train' };
  return { name: 'home' };
}

export function useHashRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function useHealth() {
  const [state, setState] = useState({ health: null, error: null });
  useEffect(() => {
    api('/api/health').then((health) => setState({ health, error: null })).catch((err) => setState({ health: null, error: err.message }));
  }, []);
  return state;
}

/** Recent runs; polls quickly while one is running. */
export function useJobs() {
  const [jobs, setJobs] = useState(null);
  useEffect(() => {
    let alive = true;
    let timer;
    const load = async () => {
      const list = await api('/api/jobs').catch(() => null);
      if (!alive) return;
      if (list) setJobs(list);
      const busy = list?.some((j) => j.status === 'running' || j.status === 'queued');
      timer = setTimeout(load, busy ? 3000 : 20000);
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return jobs;
}

/** One job, kept live over its event stream. */
export function useJob(id) {
  const [state, setState] = useState({ job: null, error: null });
  useEffect(() => {
    let alive = true;
    let es = null;
    setState({ job: null, error: null });
    api(`/api/jobs/${id}`)
      .then((job) => {
        if (!alive) return;
        setState({ job, error: null });
        es = new EventSource(`/api/jobs/${id}/events`);
        es.onmessage = (e) => setState({ job: JSON.parse(e.data), error: null });
      })
      .catch((err) => { if (alive) setState({ job: null, error: err.message }); });
    return () => { alive = false; es?.close(); };
  }, [id]);
  return state;
}

export function useModel() {
  const [model, setModel] = useState(null);
  const reload = useCallback(() => api('/api/model').then(setModel).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);
  return [model, reload];
}
