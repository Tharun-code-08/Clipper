import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { CAPTIK_DIR, CAPTIK_SRC, SHIMS, DATA_DIR } from './config.js';

// Remotion is pinned to the exact version captik-app ships (captik/UPSTREAM.json), and the composition is
// Captik's own KineticCaption from captik/src — the one production's Lambda / render worker use.
const require = createRequire(import.meta.url);
export const COMPOSITION_ID = 'KineticCaption';

let bundling = null;

/** Content hash of the vendored Captik sources + shims: a re-sync or a shim change rebuilds the bundle. */
function captikFingerprint() {
  const hash = crypto.createHash('sha256');
  for (const dir of [CAPTIK_SRC, path.join(CAPTIK_DIR, 'shims')]) {
    const files = fs.readdirSync(dir, { recursive: true }).map(String).sort();
    for (const f of files) {
      const abs = path.join(dir, f);
      if (!fs.statSync(abs).isFile()) continue;
      hash.update(f.split(path.sep).join('/'));
      hash.update(fs.readFileSync(abs));
    }
  }
  return hash.digest('hex').slice(0, 12);
}

/** Bundle Captik's src/remotion once per version of the vendored sources. Returns the local serveUrl (a directory). */
export function ensureBundle() {
  bundling ||= (async () => {
    const rev = captikFingerprint();
    const outDir = path.join(DATA_DIR, 'captik-bundle', rev);
    if (fs.existsSync(path.join(outDir, 'index.html'))) return outDir;
    // Always a fresh directory: re-copying public/ over an existing bundle fails with EPERM on OneDrive.
    const tmp = `${outDir}.tmp-${Date.now()}`;
    const { bundle } = require('@remotion/bundler');
    await bundle({
      entryPoint: path.join(CAPTIK_SRC, 'remotion', 'index.tsx'),
      publicDir: path.join(CAPTIK_DIR, 'public'),
      outDir: tmp,
      // Same `@` alias captik-app's remotion.config.ts sets for the Lambda site (shims first, matched exactly).
      webpackOverride: (c) => ({
        ...c,
        resolve: {
          ...c.resolve,
          alias: {
            ...(c.resolve?.alias || {}),
            ...Object.fromEntries(Object.entries(SHIMS).map(([spec, file]) => [`${spec}$`, file])),
            '@': CAPTIK_SRC,
          },
        },
      }),
    });
    await fsp.rm(outDir, { recursive: true, force: true });
    await fsp.rename(tmp, outDir);
    return outDir;
  })().catch((err) => {
    bundling = null;
    throw err;
  });
  return bundling;
}

// Headless Chrome fetches the clip's base video over HTTP with byte ranges.
const assets = new Map();
let assetServer = null;

function startAssetServer() {
  assetServer ||= new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = assets.get(req.url.slice(1).split('?')[0]);
      if (!file) { res.writeHead(404).end(); return; }
      const size = fs.statSync(file).size;
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      const start = m && m[1] ? Number(m[1]) : 0;
      const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      res.writeHead(m ? 206 : 200, {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Content-Length': end - start + 1,
        ...(m ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
      });
      fs.createReadStream(file, { start, end }).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  return assetServer;
}

async function serveAsset(file) {
  const port = await startAssetServer();
  const token = crypto.randomBytes(12).toString('hex');
  assets.set(token, path.resolve(file));
  return { url: `http://127.0.0.1:${port}/${token}`, release: () => assets.delete(token) };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const isBox = (b) => b && ['xPercent', 'yPercent', 'widthPercent'].every((k) => Number.isFinite(Number(b[k])));
const box = (b, fallback) => (isBox(b) ? { xPercent: Number(b.xPercent), yPercent: Number(b.yPercent), widthPercent: Number(b.widthPercent) } : fallback);
const plainObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : undefined);

/** Keep only the editor state the composition understands; fall back to the previous state for anything malformed. */
export function sanitizeEdit(next, prev = {}) {
  const words = Array.isArray(next?.words)
    ? next.words
      .filter((w) => w && typeof w.id === 'string' && typeof w.text === 'string' && Number.isFinite(w.startMs) && Number.isFinite(w.endMs))
      .map((w) => ({ id: w.id, text: w.text.slice(0, 80), startMs: Math.max(0, w.startMs), endMs: Math.max(w.startMs, w.endMs), styleOverride: plainObject(w.styleOverride) || {} }))
    : prev.words;
  const ids = new Set((words || []).map((w) => w.id));
  const captionSegments = Array.isArray(next?.captionSegments)
    ? next.captionSegments.map((s) => (Array.isArray(s) ? s.filter((id) => ids.has(id)) : [])).filter((s) => s.length)
    : prev.captionSegments;
  return {
    ...prev,
    words,
    captionSegments,
    captionStyle: typeof next?.captionStyle === 'string' ? next.captionStyle : prev.captionStyle,
    accentColor: HEX.test(next?.accentColor) ? next.accentColor : prev.accentColor,
    captionTextColor: HEX.test(next?.captionTextColor) ? next.captionTextColor : prev.captionTextColor,
    captionBox: box(next?.captionBox, prev.captionBox),
    captionEmphBox: box(next?.captionEmphBox, prev.captionEmphBox),
    captionFontScale: Number.isFinite(Number(next?.captionFontScale)) ? Number(next.captionFontScale) : prev.captionFontScale,
    emphFontScale: Number.isFinite(Number(next?.emphFontScale)) ? Number(next.emphFontScale) : prev.emphFontScale,
    captionLines: next?.captionLines === 'double' ? 'double' : next?.captionLines === 'single' ? 'single' : prev.captionLines,
    segmentBoxOverrides: plainObject(next?.segmentBoxOverrides) ?? prev.segmentBoxOverrides ?? {},
    segmentStyleOverrides: plainObject(next?.segmentStyleOverrides) ?? prev.segmentStyleOverrides ?? {},
    segmentFontScaleOverrides: plainObject(next?.segmentFontScaleOverrides) ?? prev.segmentFontScaleOverrides ?? {},
    textOverrides: plainObject(next?.textOverrides) ?? prev.textOverrides,
    emphasisStyle: plainObject(next?.emphasisStyle) ?? prev.emphasisStyle,
    layoutMode: next?.layoutMode === 'splash' || next?.layoutMode === 'center' ? next.layoutMode : prev.layoutMode,
    lineTextOverrides: plainObject(next?.lineTextOverrides) ?? prev.lineTextOverrides,
    templateSlots: plainObject(next?.templateSlots) ?? prev.templateSlots,
    lineSlotOverrides: plainObject(next?.lineSlotOverrides) ?? prev.lineSlotOverrides,
    lineOverrides: plainObject(next?.lineOverrides) ?? prev.lineOverrides ?? {},
  };
}

/** Editor state → KineticCaption inputProps (everything except video, size and timing). */
export function captionPropsFromEdit(edit) {
  const props = {
    words: edit.words,
    captionSegments: edit.captionSegments,
    captionStyle: edit.captionStyle,
    accentColor: edit.accentColor,
    captionTextColor: edit.captionTextColor,
    captionBox: edit.captionBox,
    captionEmphBox: edit.captionEmphBox,
    captionFontScale: edit.captionFontScale,
    emphFontScale: edit.emphFontScale,
    captionLines: edit.captionLines,
    segmentBoxOverrides: edit.segmentBoxOverrides || {},
    segmentStyleOverrides: edit.segmentStyleOverrides || {},
    segmentFontScaleOverrides: edit.segmentFontScaleOverrides || {},
    segmentEmphBoxOverrides: {},
    textOverrides: edit.textOverrides,
    emphasisStyle: edit.emphasisStyle,
    layoutMode: edit.layoutMode,
    lineTextOverrides: edit.lineTextOverrides,
    templateSlots: edit.templateSlots,
    lineSlotOverrides: edit.lineSlotOverrides,
  };
  return Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined));
}

/**
 * Render one clip through Captik's KineticCaption composition: the 9:16 base video underneath,
 * Captik's CaptionOverlay template on top — the exact component the editor preview uses.
 */
export async function renderWithCaptik({ baseVideo, outFile, captionProps, fps, durationInFrames, onProgress }) {
  const serveUrl = await ensureBundle();
  const { selectComposition, renderMedia } = require('@remotion/renderer');
  const asset = await serveAsset(baseVideo);
  try {
    const inputProps = {
      bleepRanges: [],
      ...captionProps,
      videoSrc: asset.url,
      isPro: true,
      noVideo: false,
      width: 1080,
      height: 1920,
      fps,
      durationInFrames,
    };
    const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: 'h264',
      crf: 20,
      outputLocation: outFile,
      onProgress: ({ progress }) => onProgress?.(progress),
    });
  } finally {
    asset.release();
  }
}
