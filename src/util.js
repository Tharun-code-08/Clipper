import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

/** Run a command, resolve with {code, stdout, stderr}. Rejects only on spawn failure. */
export function run(cmd, args, { cwd, onLine, input, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timer;
    if (timeoutMs) timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    const lineBuf = { out: '', err: '' };
    const feed = (key, chunk) => {
      if (!onLine) return;
      lineBuf[key] += chunk;
      const parts = lineBuf[key].split(/\r?\n|\r/);
      lineBuf[key] = parts.pop();
      for (const p of parts) if (p.trim()) onLine(p);
    };
    child.stdout.on('data', (d) => { const s = d.toString(); stdout += s; feed('out', s); });
    child.stderr.on('data', (d) => { const s = d.toString(); stderr += s; feed('err', s); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    if (input) child.stdin.end(input);
  });
}

/** Run and throw with the tail of stderr when the exit code is non-zero. */
export async function runOk(cmd, args, opts) {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) {
    const tail = (r.stderr || r.stdout).trim().split(/\r?\n/).slice(-6).join('\n');
    throw new Error(`${cmd} exited ${r.code}: ${tail}`);
  }
  return r;
}

export const readJson = async (file, fallback = null) => {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
};

export const writeJson = async (file, value) => {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
};

export const exists = (p) => fs.access(p).then(() => true, () => false);

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const fmtTime = (sec) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

/** Map over items with at most `limit` concurrent async workers, preserving order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
