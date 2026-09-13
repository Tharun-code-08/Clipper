import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const JOBS_DIR = path.join(DATA_DIR, 'jobs');
export const TRAINING_DIR = path.join(ROOT, 'training');
export const FONTS_DIR = path.join(ROOT, 'assets', 'fonts');

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const config = {
  port: num(process.env.PORT, 4321),
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  groqKey: process.env.GROQ_API_KEY || '',
  curatorModel: process.env.CURATOR_MODEL || 'claude-opus-5',
  curatorFallbackModel: process.env.CURATOR_FALLBACK_MODEL || 'claude-sonnet-5',
  curatorEffort: process.env.CURATOR_EFFORT || 'high',
  sttModel: process.env.STT_MODEL || 'whisper-large-v3',
  ytdlp: process.env.YTDLP || '', // empty = auto: yt-dlp on PATH, else `python -m yt_dlp`
  // e.g. chrome / edge / firefox: lets yt-dlp reuse a logged-in browser for Instagram/Facebook.
  ytdlpCookiesFromBrowser: process.env.YTDLP_COOKIES_FROM_BROWSER || '',
  ffmpeg: process.env.FFMPEG || 'ffmpeg',
  ffprobe: process.env.FFPROBE || 'ffprobe',
  maxSourceMinutes: num(process.env.MAX_SOURCE_MINUTES, 180),
  maxDownloadHeight: num(process.env.MAX_DOWNLOAD_HEIGHT, 1080),
  usdInr: num(process.env.USD_INR, 88),
  // What the local ffmpeg work would cost on a rented 8-vCPU box (c7i.2xlarge on-demand).
  hostedCpuUsdPerHour: num(process.env.HOSTED_CPU_USD_PER_HOUR, 0.357),
  renderConcurrency: num(process.env.RENDER_CONCURRENCY, 2),
};

// Hard product rule: one long-form video never yields more than 10 clips.
export const MAX_CLIPS = 10;
export const CLIP_MIN_SEC = 12;
export const CLIP_MAX_SEC = 90;

// Anthropic first-party list prices, USD per million tokens.
export const LLM_PRICING = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};
export const CACHE_READ_MULT = 0.1;
export const CACHE_WRITE_MULT = 1.25;

// Groq speech-to-text, USD per hour of audio; every request bills at least 10 s.
export const STT_PRICING = {
  'whisper-large-v3': 0.111,
  'whisper-large-v3-turbo': 0.04,
};
export const STT_MIN_BILLED_SEC = 10;
