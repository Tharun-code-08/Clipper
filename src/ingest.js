import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';
import { run, readJson, exists } from './util.js';

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'] },
  { id: 'gdrive', label: 'Google Drive', hosts: ['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com'] },
  { id: 'instagram', label: 'Instagram', hosts: ['instagram.com', 'instagr.am'] },
  { id: 'tiktok', label: 'TikTok', hosts: ['tiktok.com'] },
  { id: 'x', label: 'X / Twitter', hosts: ['x.com', 'twitter.com'] },
  { id: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.watch', 'fb.com'] },
  { id: 'linkedin', label: 'LinkedIn', hosts: ['linkedin.com'] },
  { id: 'vimeo', label: 'Vimeo', hosts: ['vimeo.com'] },
  { id: 'reddit', label: 'Reddit', hosts: ['reddit.com', 'redd.it'] },
  { id: 'twitch', label: 'Twitch', hosts: ['twitch.tv'] },
  { id: 'dropbox', label: 'Dropbox', hosts: ['dropbox.com'] },
];
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;

export const SUPPORTED_PLATFORMS = PLATFORMS.map(({ id, label }) => ({ id, label }));

/** Identify where a pasted link points. Returns null for anything that is not an http(s) URL. */
export function classifySource(raw) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const p = PLATFORMS.find((x) => x.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  if (p) return { platform: p.id, label: p.label, url: url.toString() };
  if (VIDEO_EXT.test(url.pathname)) return { platform: 'direct', label: 'Direct file', url: url.toString() };
  return { platform: 'web', label: 'Web page', url: url.toString() };
}

export function driveFileId(link) {
  const url = new URL(link);
  const m = url.pathname.match(/\/(?:file\/d|d)\/([\w-]{10,})/);
  return m ? m[1] : url.searchParams.get('id');
}

let ytdlpResolved;
/** Find a working yt-dlp: explicit YTDLP env, then `yt-dlp` on PATH, then `python -m yt_dlp`. */
export async function ytdlpCommand() {
  if (ytdlpResolved !== undefined) return ytdlpResolved;
  const candidates = config.ytdlp
    ? [{ cmd: config.ytdlp, pre: [] }]
    : [{ cmd: 'yt-dlp', pre: [] }, { cmd: 'python', pre: ['-m', 'yt_dlp'] }, { cmd: 'python3', pre: ['-m', 'yt_dlp'] }];
  for (const c of candidates) {
    const r = await run(c.cmd, [...c.pre, '--version']).catch(() => null);
    if (r?.code === 0) return (ytdlpResolved = { ...c, version: r.stdout.trim() });
  }
  return (ytdlpResolved = null);
}

async function downloadWithYtdlp(link, dir, onProgress) {
  const yt = await ytdlpCommand();
  if (!yt) throw new Error('yt-dlp is not installed. Run `pip install yt-dlp` and restart the server.');
  const h = config.maxDownloadHeight;
  const args = [
    ...yt.pre,
    '-f', `bv*[height<=${h}]+ba/b[height<=${h}]/b`,
    '--merge-output-format', 'mp4',
    '--no-playlist', '--newline', '--progress', '--write-info-json',
    '--js-runtimes', 'node',
    '-o', path.join(dir, 'source.%(ext)s'),
    '--print', 'after_move:filepath',
  ];
  if (config.ytdlpCookiesFromBrowser) args.push('--cookies-from-browser', config.ytdlpCookiesFromBrowser);
  args.push(link);

  // Video and audio download as two passes; each restarts at 0%.
  let phase = 0;
  let last = 0;
  const r = await run(yt.cmd, args, {
    onLine: (line) => {
      const m = line.match(/\[download\]\s+([\d.]+)%/);
      if (!m) return;
      const pct = Number(m[1]);
      if (pct + 50 < last) phase = Math.min(phase + 1, 1);
      last = pct;
      onProgress?.(Math.min(1, (phase + pct / 100) / 2));
    },
  });
  if (r.code !== 0) {
    const lines = r.stderr.split(/\r?\n/);
    const err = (lines.filter((l) => l.includes('ERROR')).pop() || lines.filter(Boolean).pop() || 'unknown error').replace(/^ERROR:\s*/, '');
    const needsLogin = /login|cookies|private|rate-limit|sign in/i.test(err);
    throw new Error(needsLogin
      ? `${err} — this platform wants a logged-in session. Set YTDLP_COOKIES_FROM_BROWSER=chrome (or edge/firefox) in .env and retry.`
      : `Could not download the link: ${err}`);
  }
  const printed = r.stdout.trim().split(/\r?\n/).filter(Boolean).pop();
  let file = printed && (await exists(printed)) ? printed : null;
  if (!file) {
    const hit = (await fsp.readdir(dir)).find((n) => /^source\.(mp4|mkv|webm|mov)$/i.test(n));
    if (hit) file = path.join(dir, hit);
  }
  if (!file) throw new Error('yt-dlp finished but no video file was written.');
  const info = (await readJson(path.join(dir, 'source.info.json'))) || {};
  return {
    file,
    title: info.title || path.basename(file),
    uploader: info.uploader || info.channel || '',
    description: (info.description || '').slice(0, 1500),
    webpageUrl: info.webpage_url || link,
    thumbnail: info.thumbnail || '',
    viewCount: info.view_count ?? null,
  };
}

async function downloadHttp(link, dir, onProgress, { drive = false } = {}) {
  const res = await fetch(link, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (CaptikClipper)' } });
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (type.includes('text/html')) {
    throw new Error(drive
      ? 'Google Drive returned a web page instead of the video. Set sharing to "Anyone with the link" and try again.'
      : 'That link opened a web page, not a video file.');
  }
  const disp = res.headers.get('content-disposition') || '';
  const named = decodeURIComponent((disp.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i) || [])[1] || '');
  const fromPath = decodeURIComponent(path.basename(new URL(res.url || link).pathname));
  const title = named || fromPath || 'video';
  const ext = VIDEO_EXT.test(title) ? path.extname(title).toLowerCase() : '.mp4';
  const file = path.join(dir, `source${ext}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let got = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (c) => { got += c.length; if (total) onProgress?.(got / total); });
  await pipeline(body, fs.createWriteStream(file));
  return { file, title, uploader: '', description: '', webpageUrl: link, thumbnail: '', viewCount: null };
}

/** Download any supported link into `dir`. Resolves {file, title, ..., source}. */
export async function ingestUrl(raw, dir, onProgress) {
  const source = classifySource(raw);
  if (!source) throw new Error('That does not look like a link. Paste a full https:// URL.');
  let result;
  if (source.platform === 'gdrive') {
    const id = driveFileId(source.url);
    if (!id) throw new Error('Could not find a file id in that Google Drive link.');
    const direct = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
    try {
      result = await downloadHttp(direct, dir, onProgress, { drive: true });
    } catch (err) {
      result = await downloadWithYtdlp(source.url, dir, onProgress).catch(() => { throw err; });
    }
  } else if (source.platform === 'dropbox') {
    const u = new URL(source.url);
    u.searchParams.set('dl', '1');
    result = await downloadHttp(u.toString(), dir, onProgress);
  } else if (source.platform === 'direct') {
    result = await downloadHttp(source.url, dir, onProgress);
  } else {
    result = await downloadWithYtdlp(source.url, dir, onProgress);
  }
  return { ...result, source };
}
