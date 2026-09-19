import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MAX_WORDS, lookGroupingOptions, lookIsAuthored, segmentsForLook } from './lookGrouping';
import { LOOK_SPECS, findLookSpec } from './lookSpec';
import type { TranscriptWord } from '@/types/transcript';

const spec = (id: string) => findLookSpec(id)!;
const speak = (text: string, each = 300): TranscriptWord[] =>
  text.split(' ').map((t, i) => ({ id: `w${i}`, text: t, startMs: i * each, endMs: i * each + each } as TranscriptWord));

describe("a look's caption grouping", () => {
  it('every mapped look carries their maxWordsPerLine; Deep Focus two rows of two', () => {
    const table: Record<string, number> = {
      look_anchorage: 3, look_beacon: 4, look_cove: 4, look_driftwood: 4, look_ellis: 4, look_ferrier: 4, look_garnet: 4,
      look_hawser: 4, look_ibis: 4, look_jetty: 4, look_keel: 3, look_lanyard: 3, look_mizzen: 7, look_netting: 4,
      look_outhaul: 4, look_painter: 4, look_quay: 4, look_rudder: 4, look_scupper: 4, look_taffrail: 4, look_underway: 4,
      look_vang: 3, look_windlass: 4, look_yawl: 4, look_abbey: 4, look_belfry: 3, look_cloister: 4, look_font: 5,
      look_keystone: 4, look_lintel: 5, look_mullion: 4,
    };
    for (const [id, n] of Object.entries(table)) expect(spec(id).maxWords, id).toBe(n);
    expect(spec('look_hawser').wordsPerLine).toBe(2);
    expect(LOOK_SPECS.filter((l) => l.maxWords === undefined).map((l) => l.id).sort()).toEqual(['look_dovecote', 'look_effigy']);
    for (const id of ['look_jamb', 'look_hassock', 'look_iron']) expect(spec(id).maxWords, id).toBe(16);   // their reels' maxWordsPerLine
    expect(spec('look_gable').maxWords).toBe(16);                                    // their maxWordsPerLine for the story
    expect(DEFAULT_MAX_WORDS).toBe(4);
  });

  it('an authored design (stack, lockup, curve, dynamic, popoff, focusline) lays its own rows and skips the fit', () => {
    for (const id of ['look_rudder', 'look_jetty', 'look_vang', 'look_cloister', 'look_yawl', 'look_mizzen', 'look_outhaul']) {
      expect(lookIsAuthored(spec(id)), id).toBe(true);
      expect(lookGroupingOptions(spec(id)).fits, id).toBeUndefined();
    }
    // (Beacon, Garnet and the other karaoke behind looks carry an impact hero here, so they lay their own rows)
    for (const id of ['look_anchorage', 'look_hawser']) {
      expect(lookIsAuthored(spec(id)), id).toBe(false);
      expect(lookGroupingOptions(spec(id)).fits, id).toBeTypeOf('function');
    }
    expect(lookGroupingOptions(spec('look_mizzen'))).toEqual({ maxWords: 7, focusline: true });
    expect(lookGroupingOptions(spec('look_gable'))).toEqual({ maxWords: 16, focusline: false, story: 'agent' });
  });

  it("a rows design's fit: within its rows (Deep Focus: two rows of two)", () => {
    const fits = lookGroupingOptions(spec('look_hawser')).fits!;
    const w = (t: string) => ({ id: t, text: t, startMs: 0, endMs: 100 });
    expect(fits([w('BUILT'), w('INTO'), w('THE'), w('SCENE')])).toBe(true);           // two rows of two
    expect(fits([w('a'), w('b'), w('c'), w('d'), w('e')])).toBe(false);                 // three rows
    expect(fits([w('one')])).toBe(true);
    // a one-row design: the row is the caption
    const one = lookGroupingOptions(spec('look_anchorage')).fits!;
    expect(one([w('a'), w('b'), w('c')])).toBe(true);
    expect(one([w('a'), w('b'), w('c'), w('d')])).toBe(false);
  });

  it('segmentsForLook returns id lists grouped their way, marked words as heroes for Focusline', () => {
    expect(segmentsForLook(speak('we tried. it worked'), spec('look_garnet'))).toEqual([['w0', 'w1'], ['w2', 'w3']]);
    const words = speak('The biggest mistake people make', 300);
    words[1].styleOverride = { scale: 1.4 };
    // Focusline: "make" is a verb after a plain opening with no verb in the run — its own caption
    expect(segmentsForLook(words, spec('look_mizzen'))).toEqual([['w0', 'w1', 'w2', 'w3'], ['w4']]);
    expect(segmentsForLook([], spec('look_garnet'))).toEqual([]);
  });

  it('an agent story groups by its own breaks and never splits a run by cost', () => {
    // "and" opens a new caption after three words; a run past 4.2s breaks too
    const ws = speak('the seller kept calling and the buyer walked', 300);
    expect(segmentsForLook(ws, spec('look_gable'))).toEqual([['w0', 'w1', 'w2', 'w3'], ['w4', 'w5', 'w6', 'w7']]);
    const long = speak('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen', 300);
    expect(segmentsForLook(long, spec('look_gable')).map((g) => g.length)).toEqual([15]);        // 4.2s from the run start: fifteen starts at 4.2 exactly
    const longer = speak('a b c d e f g h i j k l m n o p q r', 300);
    expect(segmentsForLook(longer, spec('look_gable')).map((g) => g.length)).toEqual([15, 3]);   // p starts at 4.5s: past 4.2
  });

  it('the editor regroups on picking a look and on a rebuild, through the shared helper', () => {
    const page = readFileSync(fileURLToPath(new URL('../../app/editor/page.tsx', import.meta.url)), 'utf8');
    expect(page).toContain('const segs = segmentsForLook(words, nextLook);');
    expect(page).toContain('editSegments(() => segs, explicit);');
    expect(page).toContain('look ? segmentsForLook(targetWords, look) : []');
  });
});
