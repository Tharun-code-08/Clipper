export async function api(url, { json, ...opts } = {}) {
  const init = json === undefined
    ? opts
    : { ...opts, body: JSON.stringify(json), headers: { 'content-type': 'application/json', ...opts.headers } };
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, code: data.code });
  return data;
}

/** 83.4 → "1:23.4"; 3723 → "1:02:03.0". */
export function fmtClock(sec, tenths = true) {
  const t = Math.max(0, sec || 0);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = tenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Clip length: 42.3 → "42s", 83 → "1:23". */
export function fmtLength(sec) {
  const t = Math.max(0, sec || 0);
  return t < 60 ? `${Math.round(t)}s` : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

// Virality tiers (85+ Viral bet · 70+ Strong · 55+ Solid · below Long shot) in Captik's palette.
export function tierTone(score) {
  if (score >= 85) return 'bg-amber-500/15 text-amber-300 border-amber-400/30';
  if (score >= 70) return 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20';
  if (score >= 55) return 'bg-sky-500/10 text-sky-300 border-sky-400/20';
  return 'bg-white/[0.04] text-zinc-400 border-white/10';
}

export function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private window or blocked storage: the preference just isn't remembered
  }
}
