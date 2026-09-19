import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SFX_IDS } from './sfxIds';
import { SFX_GROUPS, SFX_LIBRARY, SFX_META, sfxByGroup, sfxLabel } from './sfxLibrary';
import { clampSfxGain, newSfxInstance, sanitizeSfxList, SFX_GAIN_MAX } from '@/types/sfx';

const ROOT = join(__dirname, '..', '..', '..');

describe('sound bank', () => {
  it('is the synthesized bank only — never a licensed import', () => {
    const bank = readFileSync(join(__dirname, 'sfxBank.ts'), 'utf8');
    // Epidemic Sound imports carried es_ ids; nothing like that may ship.
    expect(bank).not.toMatch(/\bes_[a-z0-9]/i);
    expect(SFX_IDS.some((id) => id.startsWith('es_'))).toBe(false);
    const entries = bank.match(/^\s{2}[a-z0-9_]+: 'data:audio\/webm;base64,[A-Za-z0-9+/=]+',$/gm) ?? [];
    expect(entries.length).toBe(SFX_IDS.length);
    // Opus keeps it small; the WAV bank this replaced was ~10MB.
    expect(statSync(join(__dirname, 'sfxBank.ts')).size).toBeLessThan(3 * 1024 * 1024);
    expect(readFileSync(join(ROOT, 'scripts', 'gen_sfx.mjs'), 'utf8')).not.toMatch(/\bes_[a-z0-9]/i);
  });

  it('nothing imports the bank statically — that would undo its code split', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(e.name) || /\.spec\.tsx?$/.test(e.name)) continue;
        if (e.name === 'sfxLoader.ts' || e.name === 'sfxBank.ts') continue;
        const src = readFileSync(p, 'utf8');
        if (/\bfrom\s+['"][^'"]*sfxBank['"]/.test(src) || /import\(\s*['"][^'"]*sfxBank['"]\s*\)/.test(src)) {
          offenders.push(p.slice(ROOT.length + 1));
        }
      }
    };
    walk(join(ROOT, 'src'));
    expect(offenders).toEqual([]);
  });
});

describe('sfx library', () => {
  it('every generated sound has a label and a shelf', () => {
    for (const id of SFX_IDS) {
      expect(SFX_META[id], id).toBeDefined();
      expect(SFX_GROUPS.some((g) => g.key === SFX_META[id][0]), id).toBe(true);
    }
    expect(SFX_LIBRARY.length).toBe(SFX_IDS.length);
    expect(sfxLabel('cash')).toBe('Cash Register');
  });

  it('search matches labels, ids and extra words; every word must match', () => {
    const ids = (q: string) => sfxByGroup(q).flatMap((g) => g.sounds.map((s) => s.id));
    expect(ids('paisa')).toEqual(expect.arrayContaining(['cash', 'coin']));
    expect(ids('air horn')).toEqual(expect.arrayContaining(['airhorn', 'airhorn_trip']));
    expect(ids('zzz nothing')).toEqual([]);
    expect(ids('').length).toBe(SFX_IDS.length);
  });
});

describe('SfxInstance helpers', () => {
  it('newSfxInstance rounds and floors the time and uses the default gain', () => {
    const s = newSfxInstance('boom', -12.4);
    expect(s.atMs).toBe(0);
    expect(s.gain).toBeGreaterThan(0);
    expect(s.id).toMatch(/^sx_/);
  });

  it('clampSfxGain bounds the volume', () => {
    expect(clampSfxGain(9)).toBe(SFX_GAIN_MAX);
    expect(clampSfxGain(-1)).toBe(0);
    expect(clampSfxGain(Number.NaN)).toBeGreaterThan(0);
  });

  it('sanitizeSfxList drops junk and unknown ids, clamps, and sorts', () => {
    const known = new Set<string>(SFX_IDS);
    const out = sanitizeSfxList([
      { id: 'sx_b', sfxId: 'boom', atMs: 2000.4, gain: 4 },
      { id: 'sx_a', sfxId: 'pop', atMs: 100, gain: 0.5, label: 'x' },
      { id: 'sx_c', sfxId: 'es_licensed_thing', atMs: 50, gain: 1 },
      { id: 'sx_d', sfxId: 'pop', atMs: Number.NaN, gain: 1 },
      null, 'junk',
    ], known);
    expect(out.map((s) => s.id)).toEqual(['sx_a', 'sx_b']);
    expect(out[1]).toMatchObject({ atMs: 2000, gain: SFX_GAIN_MAX });
    expect(sanitizeSfxList('nope')).toEqual([]);
  });
});
