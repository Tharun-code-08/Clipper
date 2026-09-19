// Asserts the look engine against the REAL renderer source, not against a restatement of it —
// the same approach templateVariants.spec.ts takes. If CaptionOverlay stops dispatching through
// findLookSpec, or a spec names a face the app does not bundle, these fail instead of shipping a
// look that renders as a fallback font or not at all.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LOOK_SPECS, LOOK_IDS, findLookSpec, lookBaseStyle, lookAccentStyle, lookJitter, lookRestStyle,
  impactPx, splitsAroundSubject } from './lookSpec';
import { estTextWidth, fontWeightFactor } from '../fitText';
import { CaptionOverlay } from '../../components/editor/CaptionOverlay';
import { CAPTION_STYLES, STYLE_CATEGORIES, styleCategory } from '../captionStyles';

const OVERLAY_SRC = readFileSync(
  fileURLToPath(new URL('../../components/editor/CaptionOverlay.tsx', import.meta.url)), 'utf8');
const KINETIC_SRC = readFileSync(
  fileURLToPath(new URL('../../remotion/KineticCaptionComposition.tsx', import.meta.url)), 'utf8');

const CTX = { sz: (n: number) => n, captionTextColor: '#ffffff', accentColor: '#06b6d4' };

/** The whole stack branch, bounded by the branch after it rather than a character count. */
const stackBranch = () => {
  const at = OVERLAY_SRC.indexOf("if (lookSpec.family === 'stack' && lookSpec.stack) {");
  return OVERLAY_SRC.slice(at, OVERLAY_SRC.indexOf('(lookSpec.wrapRows ?? 1) > 1', at));
};

const primaryFamily = (stack: string) => stack.split(',')[0].replace(/["']/g, '').trim();

describe('the engine really renders these looks', () => {
  it('CaptionOverlay dispatches through findLookSpec, ahead of the hand-written branches', () => {
    const at = OVERLAY_SRC.indexOf('findLookSpec(captionStyle)');
    const firstHandWritten = OVERLAY_SRC.indexOf("if (captionStyle === 'captik')");
    expect(at).toBeGreaterThan(0);
    expect(firstHandWritten).toBeGreaterThan(0);
    expect(at).toBeLessThan(firstHandWritten);
  });

  it('composes the SHARED helpers instead of re-implementing layout', () => {
    const slice = OVERLAY_SRC.slice(
      OVERLAY_SRC.indexOf('const lookSpec = findLookSpec'),
      OVERLAY_SRC.indexOf("if (captionStyle === 'captik')"));
    // phraseRow / emphasisLayout carry the fit guard and the caption box, so the ordinary paths
    // must go through them. The ONE exception is the behind-the-speaker layout, which positions a
    // title block against the second box the way big_reveal does — and still fits it through
    // fitWordScale with this look's own width factor, so it cannot escape the guard either.
    expect(slice).toContain('emphasisLayout(');
    expect(slice).toContain('phraseRow(');
    const outsideBehind = slice.slice(slice.indexOf("if (lookSpec.family === 'stack'"));
    expect(outsideBehind).not.toContain("position: 'absolute'");
    const behind = slice.slice(0, slice.indexOf("if (lookSpec.family === 'stack'"));
    expect(behind).toContain('fitWordScale(');
    expect(behind).toContain('fontWidthFactor(lookSpec.font)');
  });

  it('every look id is a real CaptionStyleId (the union imports the spec ids)', () => {
    expect(KINETIC_SRC).toContain('LookSpecId');
  });
});

describe('ids', () => {
  it('are unique', () => {
    expect(new Set(LOOK_IDS).size).toBe(LOOK_IDS.length);
  });

  it('are browsable in the picker exactly once each', () => {
    for (const l of LOOK_SPECS) {
      expect(CAPTION_STYLES.filter((s) => s.id === l.id), `${l.id} in picker`).toHaveLength(1);
    }
  });

  it('findLookSpec resolves every look and never claims a hand-written template', () => {
    for (const id of LOOK_IDS) expect(findLookSpec(id)?.id).toBe(id);
    for (const handWritten of ['captik', 'aura', 'journal', 'big_red']) {
      expect(findLookSpec(handWritten)).toBeUndefined();
    }
  });
});

describe('every row produces a renderable style', () => {
  it('base and accent always carry a positive size and a colour', () => {
    for (const l of LOOK_SPECS) {
      for (const style of [lookBaseStyle(l, CTX), lookAccentStyle(l, CTX), lookRestStyle(l, CTX)]) {
        expect(Number(style.fontSize), l.id).toBeGreaterThan(0);
        expect(String(style.color ?? ''), l.id).not.toBe('');
      }
    }
  });

  it('an accented look actually differs from its base — otherwise it is a flat look by accident', () => {
    // Colour and size are not the only distinctions. A karaoke highlight can be pure brightness
    // (their Keel and Painter declare the same colour for both and dim the rest), a stack's hero is
    // its row scale (tested under stacked lockups), and an effect like inception is its own mark.
    // Forcing a colour difference is what pushed those accents out of the table, which left them
    // on the user's accent colour instead of the design's.
    for (const l of LOOK_SPECS.filter((x) => x.family !== 'flat')) {
      const b = lookBaseStyle(l, CTX);
      const a = lookAccentStyle(l, CTX);
      const distinct = `${a.color}|${a.fontSize}|${a.fontFamily}` !== `${b.color}|${b.fontSize}|${b.fontFamily}`
        || (l.family === 'karaoke' && (l.restOpacity ?? 0.45) < 1)
        || l.family === 'stack' || !!l.inception || !!l.chip;
      expect(distinct, l.id).toBe(true);
    }
  });

  it('a look whose design names an accent keeps it, even when it equals the base colour', () => {
    for (const id of ['look_keel', 'look_painter', 'look_rudder', 'look_scupper', 'look_lintel']) {
      expect(findLookSpec(id)?.accent, id).toBeTruthy();
    }
  });

  it('inception is marked only where it was verified, and it falls back without a video', () => {
    expect(LOOK_SPECS.filter((l) => l.inception).map((l) => l.id).sort()).toEqual(['look_mizzen', 'look_rudder']);
    const at = OVERLAY_SRC.indexOf('function InceptionWord(');
    const body = OVERLAY_SRC.slice(at, at + 3200);
    expect(body).toContain("if (!backdrop) return <span");
    expect(body).not.toContain('mixBlendMode');          // isolated by the export's scale transform
  });

  it('inception differences against the ACCENT colour, not a fixed inversion', () => {
    // Focusline's cyan accent: 12.3 off as |cyan - video|, 37.5 as plain inversion.
    const at = OVERLAY_SRC.indexOf('function InceptionWord(');
    const body = OVERLAY_SRC.slice(at, at + 3200);
    expect(body).toContain('Math.abs(c - (k * 255) / 63)');
    expect(body).toContain('backdropFilter: `url(#${filterId})`');
    expect(body).not.toContain("'invert(1)'");
  });

  it('the stack path hands the accent colour to the inception word', () => {
    const at = OVERLAY_SRC.indexOf('<InceptionWord key={w.id}');
    expect(OVERLAY_SRC.slice(at, at + 400)).toContain('style={{ ...st, ...lookAcc,');
  });

  it('karaoke dims the unspoken words; flat and emphasis leave them alone', () => {
    for (const l of LOOK_SPECS) {
      const rest = lookRestStyle(l, CTX);
      if (l.family === 'karaoke') {
        expect(Number(rest.opacity), l.id).toBeGreaterThan(0);
        expect(Number(rest.opacity), l.id).toBeLessThan(1);
      } else {
        expect(rest.opacity, l.id).toBeUndefined();
      }
    }
  });

  it('an emphasis look keeps its context words smaller than the hero word', () => {
    for (const l of LOOK_SPECS.filter((x) => x.family === 'emphasis')) {
      expect(Number(lookBaseStyle(l, CTX).fontSize), l.id)
        .toBeLessThan(Number(lookAccentStyle(l, CTX).fontSize));
    }
  });

  it('a spec that names no colour follows the user colour controls', () => {
    for (const l of LOOK_SPECS) {
      if (!l.color) expect(lookBaseStyle(l, CTX).color, l.id).toBe(CTX.captionTextColor);
      if (!l.accent) expect(lookAccentStyle(l, CTX).color, l.id).toBe(CTX.accentColor);
    }
  });
});

describe('fonts resolve the same in the preview and in every export', () => {
  // The families the app actually DECLARES. A plain substring search over the source is not good
  // enough: "Bebas Neue" and "Rubik" both appear in fallback stacks and comments while having no
  // @font-face of their own, so a looser check passes a look that silently falls back on export.
  const declared = new Set(
    [...KINETIC_SRC.matchAll(/font-family:\s*['"]?([A-Za-z0-9 _-]+)/gi)].map((m) => m[1].trim()));

  it('the harness found the real font table', () => {
    expect(declared.size).toBeGreaterThan(10);
    expect(declared.has('Inter')).toBe(true);
  });

  it('every face is one the app actually bundles', () => {
    for (const l of LOOK_SPECS) {
      const family = primaryFamily(l.font);
      expect(declared.has(family), `${l.id} uses ${family}, which has no @font-face`).toBe(true);
      if (l.accentFont) {
        const acc = primaryFamily(l.accentFont);
        expect(declared.has(acc), `${l.id} accent uses ${acc}, which has no @font-face`).toBe(true);
      }
      if (l.impact) {
        const im = primaryFamily(l.impact.font);
        expect(declared.has(im), `${l.id} impact word uses ${im}, which has no @font-face`).toBe(true);
      }
    }
  });

  it('a bundled accent face is declared for the preview too, and ships its licence', () => {
    const CSS = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8');
    for (const l of LOOK_SPECS.filter((x) => x.accentFont)) {
      const acc = primaryFamily(l.accentFont!);
      expect(CSS, `${acc} missing from globals.css`).toContain(`font-family: "${acc}"`);
    }
    const lic = fileURLToPath(new URL('../../../public/fonts/AbrilFatface-OFL.txt', import.meta.url));
    expect(readFileSync(lic, 'utf8')).toContain('SIL Open Font License');
  });

  it('every bundled behind-the-speaker face is declared for the preview and ships its licence', () => {
    const CSS = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8');
    const faces: [string, string, string][] = [
      ['RubikSprayPaint', 'RubikSprayPaint-OFL.txt', 'SIL Open Font License'],
      ['Gloock', 'Gloock-OFL.txt', 'SIL Open Font License'],
      ['InstrumentSerif', 'InstrumentSerif-OFL.txt', 'SIL Open Font License'],
      ['PressStart2P', 'PressStart2P-OFL.txt', 'SIL Open Font License'],
      ['BagelFatOne', 'BagelFatOne-OFL.txt', 'SIL Open Font License'],
      ['Baloo2', 'Baloo2-OFL.txt', 'SIL Open Font License'],
      ['ArchivoBlack', 'ArchivoBlack-OFL.txt', 'SIL Open Font License'],
      ['Unna', 'Unna-OFL.txt', 'SIL Open Font License'],
      ['SpecialElite', 'SpecialElite-LICENSE.txt', 'Apache License'],
      ['PoppinsBold', 'PoppinsBold-OFL.txt', 'SIL Open Font License'],
      ['GloriaHallelujah', 'GloriaHallelujah-OFL.txt', 'SIL Open Font License'],
      ['BebasNeue', 'BebasNeue-OFL.txt', 'SIL Open Font License'],
      ['BlackHanSans', 'BlackHanSans-OFL.txt', 'SIL Open Font License'],
      ['FredokaOne', 'FredokaOne-OFL.txt', 'SIL Open Font License'],
      ['BBHBartle', 'BBHBartle-OFL.txt', 'SIL Open Font License'],
    ];
    const used = new Set(LOOK_SPECS.flatMap((l) => [l.font, l.accentFont, l.impact?.font])
      .filter((f): f is string => !!f).map(primaryFamily));
    for (const [family, licence, text] of faces) {
      expect(used.has(family), `${family} is bundled but no look uses it`).toBe(true);
      expect(CSS, `${family} missing from globals.css`).toContain(`font-family: "${family}"`);
      expect(declared.has(family), `${family} missing from the export font table`).toBe(true);
      const lic = fileURLToPath(new URL(`../../../public/fonts/${licence}`, import.meta.url));
      expect(readFileSync(lic, 'utf8'), licence).toContain(text);
    }
    // a Reserved Font Name is never the declared family
    expect(CSS).not.toContain('font-family: "Press Start 2P"');
  });
});

describe('the picker files spec looks under the right heading', () => {
  it('each look is filed by its class, most specific first', () => {
    for (const l of LOOK_SPECS) {
      const cat = styleCategory(l.id);
      const tag = l.tags[0];
      expect(cat, `${l.id} (${tag})`).toBe(tag === 'Property' ? 'property' : tag === 'Popular' ? 'popular' : 'behind');
    }
  });

  it('all three classes are non-empty, since property and popular are behind-the-speaker too', () => {
    const counts = new Map<string, number>();
    for (const l of LOOK_SPECS) counts.set(styleCategory(l.id), (counts.get(styleCategory(l.id)) ?? 0) + 1);
    for (const c of ['behind', 'popular', 'property']) {
      expect(counts.get(c) ?? 0, `${c} is empty`).toBeGreaterThan(0);
    }
    const rendered = new Set(STYLE_CATEGORIES.map((c) => c.key));
    for (const l of LOOK_SPECS) expect(rendered.has(styleCategory(l.id)), l.id).toBe(true);
  });

  it('no look is left uncategorised into a heading the picker never renders', () => {
    const rendered = new Set(STYLE_CATEGORIES.map((c) => c.key));
    for (const l of LOOK_SPECS) expect(rendered.has(styleCategory(l.id)), l.id).toBe(true);
  });
});

describe('stacked lockups', () => {
  const stacks = LOOK_SPECS.filter((l) => l.family === 'stack');

  it('exist — this is the dimension that made looks actually differ', () => {
    expect(stacks.length).toBeGreaterThan(0);
  });

  it('every stack look carries a usable stack config', () => {
    for (const l of stacks) {
      expect(l.stack, l.id).toBeTruthy();
      expect(l.stack!.maxPerRow, l.id).toBeGreaterThanOrEqual(1);
      expect(l.stack!.rowScale.length, l.id).toBeGreaterThan(0);
    }
  });

  it('rows differ in size — a lockup, not a paragraph', () => {
    // Two earlier versions of this rule were wrong, each disproved by real designs: rows are not
    // always strictly increasing ([1.05, 1.05, 1.22] repeats before it steps), and they do not
    // always grow downward at all ([1, 1.06, 1] is a pyramid with the hero in the middle). The
    // only thing that has to be true is that the rows are real sizes and DIFFER from each other,
    // because identical rows are just a wrapped paragraph.
    for (const l of stacks) {
      const rs = l.stack!.rowScale;
      for (const v of rs) expect(v, `${l.id} row scale`).toBeGreaterThan(0);
      expect(Math.max(...rs), `${l.id} rows are all the same size`).toBeGreaterThan(Math.min(...rs));
    }
  });

  it('no look claims a stack config without being a stack look', () => {
    for (const l of LOOK_SPECS.filter((x) => x.family !== 'stack')) {
      expect(l.stack, l.id).toBeUndefined();
    }
  });

  it('CaptionOverlay renders stack rows through the shared fit guard, in its own face', () => {
    const slice = OVERLAY_SRC.slice(
      OVERLAY_SRC.indexOf("lookSpec.family === 'stack'"),
      OVERLAY_SRC.indexOf("if (captionStyle === 'captik')"));
    expect(slice).toContain('phraseFit(');
    expect(slice).toContain('fontWidthFactor(lookSpec.font)');
    expect(slice).toContain('data-cap-row');
  });
});

describe('behind-the-speaker looks', () => {
  const behind = LOOK_SPECS.filter((l) => l.behindSubject);

  it('exist', () => {
    expect(behind.length).toBeGreaterThan(0);
  });

  it('the editor honours the hint when such a look is picked', () => {
    // Reading the editor source, the same way the renderer checks above work: a look can only
    // "place itself" if onStyleChange actually acts on the flag.
    const PAGE_SRC = readFileSync(
      fileURLToPath(new URL('../../app/editor/page.tsx', import.meta.url)), 'utf8');
    const at = PAGE_SRC.indexOf('nextLook?.behindSubject');
    expect(at).toBeGreaterThan(0);
    // Bounded by the end of the block rather than a character count, which the comments outgrew.
    const slice = PAGE_SRC.slice(at, PAGE_SRC.indexOf('setCaptionStyle(next)', at));
    expect(slice).toContain('setCaptionBox');        // caption low, where theirs measures
    expect(slice).toContain('setCaptionEmphBox');    // hero high, at the measured 22%
    expect(slice).toContain('behindSubject: true');  // and the cut-out actually turned on
  });

  it('a variety look goes behind the subject only on its behind slots', () => {
    // Setting every line behind hid the FRONT phrases under the person in the cut-out export;
    // their footage shows those phrases over the body.
    const PAGE_SRC = readFileSync(
      fileURLToPath(new URL('../../app/editor/page.tsx', import.meta.url)), 'utf8');
    const at = PAGE_SRC.indexOf('nextLook?.behindSubject');
    const slice = PAGE_SRC.slice(at, PAGE_SRC.indexOf('setCaptionStyle(next)', at));
    expect(slice).toContain('nextLook.variety?.pattern');
    expect(slice).toMatch(/pat\[i % pat\.length\] === 'behind'/);
    expect(slice).toContain('behindSubject: undefined');
  });
});

describe('gradient fills and per-word jitter', () => {
  it('a gradient paints the GLYPHS, not a box behind them', () => {
    for (const l of LOOK_SPECS.filter((x) => x.gradient)) {
      const a = lookAccentStyle(l, CTX) as Record<string, unknown>;
      expect(String(a.backgroundImage), l.id).toContain('linear-gradient');
      // Without background-clip the gradient would render as a filled rectangle over the row.
      expect(a.backgroundClip ?? a.WebkitBackgroundClip, l.id).toBe('text');
      expect(a.WebkitTextFillColor, l.id).toBe('transparent');
    }
  });

  it('jitter is stable for a given word and differs between words', () => {
    const jittered = LOOK_SPECS.filter((x) => x.jitter);
    expect(jittered.length, 'some looks use jitter').toBeGreaterThan(0);
    for (const l of jittered) {
      // Same word, same value — twice. A random value per call would make the caption twitch as
      // every frame re-rendered it.
      expect(lookJitter(l, 'w3')).toEqual(lookJitter(l, 'w3'));
      const a = JSON.stringify(lookJitter(l, 'w1'));
      const b = JSON.stringify(lookJitter(l, 'w2'));
      expect(a, `${l.id} jitters every word identically`).not.toBe(b);
    }
  });

  it('a look without jitter gets no transform at all', () => {
    for (const l of LOOK_SPECS.filter((x) => !x.jitter).slice(0, 20)) {
      expect(lookJitter(l, 'w1'), l.id).toEqual({});
    }
  });
});

describe('subject outline', () => {
  const ringed = LOOK_SPECS.filter((l) => l.subjectOutline);

  it('only looks that sit behind the speaker ask for a ring', () => {
    // The ring is stamped from the subject MATTE. Without behind-the-subject there is no matte, so
    // the look would silently render no ring at all and nobody would know why.
    expect(ringed.length).toBeGreaterThan(0);
    for (const l of ringed) expect(l.behindSubject, `${l.id} rings without a cut-out`).toBe(true);
  });

  it('a ring has a visible width', () => {
    for (const l of ringed) expect(l.subjectOutline!.px, l.id).toBeGreaterThan(0);
  });

  it('the exporter stamps the ring BEFORE the subject, so it sits behind the person', () => {
    const EC_SRC = readFileSync(
      fileURLToPath(new URL('../export/elementCaptureExport.tsx', import.meta.url)), 'utf8');
    const ring = EC_SRC.indexOf('subjectOutline && subjectOutline.px > 0');
    const subject = EC_SRC.indexOf('cropCtx.drawImage(bmp, matteContain.dx');
    expect(ring, 'ring code present').toBeGreaterThan(0);
    expect(subject, 'subject composite present').toBeGreaterThan(0);
    expect(ring, 'ring must be drawn first, or it covers the person').toBeLessThan(subject);
  });
});

describe('placement and rows are reachable, not just declared', () => {
  // Each rule here is a bug that shipped. They are cheap to state and were expensive to find by
  // rendering, so they belong in the suite rather than in a scratch script.

  it('every look states where it goes — nothing silently inherits a class default', () => {
    // Nine looks sat on a class constant they did not match, one of them by 1233px, because a
    // missing position quietly fell back to the family median.
    for (const l of LOOK_SPECS) {
      expect(l.positionYPct, `${l.id} has no positionYPct`).toBeGreaterThan(0);
      expect(l.positionYPct, `${l.id} positionYPct off frame`).toBeLessThan(100);
    }
  });

  it('a stack can actually reach its own last row within a long caption', () => {
    // Rudder declared rowScale [1.08, 1.65, 2.75] behind maxPerRow 6: reaching row three needed a
    // thirteen-word phrase, so in practice it rendered as ONE flat row and the lockup never
    // appeared. A design whose own rows are unreachable is not a design.
    const LONG_CAPTION = 12;
    for (const l of LOOK_SPECS.filter((x) => x.family === 'stack' && x.stack)) {
      const need = l.stack!.maxPerRow * (l.stack!.rowScale.length - 1) + 1;
      expect(need, `${l.id} needs ${need} words to reach its last row`).toBeLessThanOrEqual(LONG_CAPTION);
    }
  });

  it('a multi-row lockup fits on the frame where it is placed', () => {
    // Belfry was moved to its measured 10% while still a three-row growing stack; the top row ran
    // off the top of the frame and the render came back a row short. MEASURED constant: a row of
    // sizePx N occupies about N * 0.25 percent of frame height.
    const PCT_PER_SIZE = 0.25;
    for (const l of LOOK_SPECS) {
      const rows = l.stack ? l.stack.rowScale.reduce((a, b) => a + b, 0) : (l.wrapRows ?? 1);
      if (rows <= 1) continue;
      const half = (l.sizePx * rows * PCT_PER_SIZE) / 2;
      expect(l.positionYPct! - half, `${l.id} overruns the top of the frame`).toBeGreaterThan(-1);
      expect(l.positionYPct! + half, `${l.id} overruns the bottom of the frame`).toBeLessThan(101);
    }
  });

  it('heroBox only appears where the renderer reads it', () => {
    // The two-box branch is gated on family === 'emphasis'; heroBox anywhere else is a silent no-op
    // that reads like an intention.
    for (const l of LOOK_SPECS.filter((x) => x.heroBox)) {
      expect(l.family, `${l.id} sets heroBox but is not an emphasis look`).toBe('emphasis');
    }
    const slice = OVERLAY_SRC.slice(OVERLAY_SRC.indexOf('lookSpec.behindSubject'),
                                    OVERLAY_SRC.indexOf("if (lookSpec.family === 'emphasis')"));
    expect(slice, 'the two-box path must be opt-in').toContain('lookSpec.heroBox');
  });

  it('wrapRows and stack do not both claim the row layout', () => {
    for (const l of LOOK_SPECS.filter((x) => x.wrapRows)) {
      expect(l.stack, `${l.id} declares both wrapRows and a stack`).toBeUndefined();
      expect(l.wrapRows, l.id).toBeGreaterThan(1);
    }
  });

  it('the wrapRows branch shows words that have not been spoken yet', () => {
    // It first applied the entrance animation to every word, so unspoken words sat at opacity 0 and
    // a two-row design rendered with its second row blank. Only a look that reveals word by word
    // may hide them, and none of the wrapRows looks does.
    const at = OVERLAY_SRC.indexOf('(lookSpec.wrapRows ?? 1) > 1');
    expect(at, 'wrapRows branch present').toBeGreaterThan(0);
    const slice = OVERLAY_SRC.slice(at, OVERLAY_SRC.indexOf('return phraseRow(phrase, rowActive', at));
    expect(slice).toContain('unseen(w) ? { opacity: 0 }');
    expect(slice).toContain('spoken || !perWordEnter ? enterAt(w)');
    for (const l of LOOK_SPECS.filter((x) => x.wrapRows)) expect(l.reveal, l.id).toBeFalsy();
  });
});

describe('entrances are the look\'s own, on every render path', () => {
  // Their registry declares an entrance on 19 of these looks, 10ms to 560ms, some travelling up or
  // down. The engine used one hardcoded 160ms fade, the stack path honoured only 'pop', and the
  // emphasis path hard-revealed regardless — so three looks declared as travelling fades simply
  // appeared. Read back from rendered frames, all six probed looks now land within one 33ms step.

  it('a declared duration is a real, bounded number', () => {
    for (const l of LOOK_SPECS.filter((x) => x.animInMs !== undefined)) {
      expect(l.animInMs, l.id).toBeGreaterThanOrEqual(1);
      expect(l.animInMs, l.id).toBeLessThanOrEqual(1500);
      expect(l.animIn, `${l.id} has a duration but no entrance`).not.toBe('none');
    }
  });

  it('directional entrances exist in the table — the capability is used, not just declared', () => {
    expect(LOOK_SPECS.some((l) => l.animIn === 'fadeUp')).toBe(true);
    expect(LOOK_SPECS.some((l) => l.animIn === 'fadeDown')).toBe(true);
  });

  it('no spec render path keeps its own hardcoded fade', () => {
    const at = OVERLAY_SRC.indexOf('const lookSpec = findLookSpec');
    const slice = OVERLAY_SRC.slice(at, OVERLAY_SRC.indexOf("if (captionStyle === 'captik')"));
    expect(slice).not.toMatch(/\/\s*160\)/);
    // flat/karaoke rows, the wrapRows block, the stack rows and the hero box
    expect(slice.split('lookEnterStyle(').length - 1).toBeGreaterThanOrEqual(4);
  });

  it('the emphasis path hands its declared entrance to the shared layout', () => {
    const at = OVERLAY_SRC.indexOf("if (lookSpec.family === 'emphasis')");
    const slice = OVERLAY_SRC.slice(at, at + 1400);
    expect(slice).toContain('enter: (w) => isLockupHero(w) && lookSpec.heroEnter');
    expect(slice).toContain('lookEnterStyle(lookSpec, currentTimeMs, w.startMs, !noLineFade)');
  });

  it("Captik's own emphasis templates keep their hard reveal", () => {
    const at = OVERLAY_SRC.indexOf("if (captionStyle === 'captik')");
    expect(OVERLAY_SRC.slice(at, at + 500)).not.toContain('enter:');
  });
});

describe('variety: a per-phrase layout cycle', () => {
  const cyc = LOOK_SPECS.filter((l) => l.variety && !l.variety.layerOnly);

  it('exists, and every slot it names can be rendered', () => {
    expect(cyc.length).toBeGreaterThan(0);
    for (const l of cyc) {
      for (const s of l.variety!.pattern) expect(['front', 'behind', 'curve'], l.id).toContain(s);
      if (l.variety!.pattern.includes('curve')) expect(l.curve, `${l.id} curves with no arc`).toBeTruthy();
      if (l.variety!.pattern.includes('behind')) expect(l.variety!.behindScale, l.id).toBeGreaterThan(1);
    }
  });

  it('no variety look also claims a hero box — the "hero" was a held behind phrase', () => {
    for (const l of LOOK_SPECS.filter((x) => x.variety)) expect(l.heroBox, l.id).toBeFalsy();
  });

  it('the slot comes from the shared display window, so preview and export agree', () => {
    const at = OVERLAY_SRC.indexOf('const variety = lookSpec.variety');
    expect(at).toBeGreaterThan(0);
    expect(OVERLAY_SRC.slice(at, at + 400)).toContain('segWindow?.index');
  });

  it('the arc types every letter before its word ends', () => {
    const at = OVERLAY_SRC.indexOf("slot === 'curve'");
    expect(OVERLAY_SRC.slice(at, at + 4000)).toContain('0.75 * (g.w.endMs - g.w.startMs)');
  });

  it('a held behind phrase sits under the front caption', () => {
    expect(OVERLAY_SRC).toContain('return preservedLayer ? <>{preservedLayer}{frontOut}</> : frontOut;');
  });

  it('a behind phrase is held only where it clears the front caption', () => {
    // Two of three export routes have no subject matte, so an overlap nobody hides is drawn in
    // plain view. Vang's bands sit 8 points apart and must not hold; Abbey's sit 30 apart and do.
    const at = OVERLAY_SRC.indexOf("if (sk === 'behind') {");
    const slice = OVERLAY_SRC.slice(at, at + 1400);
    expect(slice).toContain('if (gap >= (heldH + frontH) / 2) preservedLayer');
  });

  it("a variety look's front phrase is one inline line, not the stacked lockup", () => {
    const at = OVERLAY_SRC.indexOf("slot === 'front' && lookSpec.family === 'emphasis'");
    expect(at, 'inline front branch present').toBeGreaterThan(0);
    expect(OVERLAY_SRC.slice(at, at + 900)).toContain("{ alignItems: 'baseline' }");
  });
});

describe('videoBackdrop is only claimed where video really sits behind the captions', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  it('the transparent Lambda export does not claim it', () => {
    expect(read('../../remotion/LambdaCaptionComposition.tsx')).toContain('videoBackdrop={!noVideo && !transparent}');
  });
  it('the in-browser export claims it only with video', () => {
    expect(read('../../remotion/CaptionExportComposition.tsx')).toContain('videoBackdrop={!noVideo}');
  });
  it('the overlay defaults it OFF, so a new mount cannot make a word vanish', () => {
    expect(OVERLAY_SRC).toContain('videoBackdrop = false');
  });
});

describe('neon: a measured halo, composed with the drop shadow', () => {
  it('the three neon looks carry it, and nothing else does', () => {
    expect(LOOK_SPECS.filter((l) => l.glow).map((l) => l.id).sort())
      .toEqual(['look_lintel', 'look_taffrail', 'look_vang']);
  });

  it('the halo comes first and the drop shadow still applies', () => {
    const vang = findLookSpec('look_vang')!;
    const ts = String(lookBaseStyle(vang, CTX).textShadow);
    expect(ts).toMatch(/^0 0 3\.75px rgba\(255,255,255,0\.82\), 0 \d+px/);
    // and the accent word inherits it, since the spoken word glows too
    expect(String(lookAccentStyle(vang, CTX).textShadow)).toBe(ts);
  });

  it('a look without a glow renders exactly its shadow, as before', () => {
    const beacon = findLookSpec('look_beacon')!;
    const s = beacon.shadow!;
    expect(lookBaseStyle(beacon, CTX).textShadow).toBe(`0 ${s.offsetY}px ${s.blurPx}px ${s.color}`);
  });
});

describe('stack row spacing is in the row\'s own units', () => {
  it('the gap scales with the row, not with an inherited font size', () => {
    const slice = stackBranch();
    expect(slice).toContain('marginTop: ri > 0 ? Math.round((st.rowGapEm ?? 0) * (rowPxs[ri - 1] + rowPx) * 100) / 100 : 0');
    expect(slice).not.toMatch(/rowGapEm \?\? 0\}em/);
  });

  it('the tight lockups keep their measured overlap', () => {
    // MEASURED gaps between rows, as a fraction of the upper row's ink height: their Keystone
    // +0.03 (rows nearly touching, 27% overlapping). Tuned by rendering to +0.05. (Yawl renders as
    // a popoff zigzag now; its stack row only feeds the picker card.)
    expect(findLookSpec('look_keystone')!.stack!.rowGapEm).toBeLessThan(0);
  });
});

describe('popoff: context flush left, accents flush right, in phrase order', () => {
  const at = OVERLAY_SRC.indexOf('if (lookSpec.popoff) {');
  const body = OVERLAY_SRC.slice(at, at + 4200);

  it('is rendered ahead of the stack branch, so it wins for a look that has both', () => {
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(OVERLAY_SRC.indexOf("if (lookSpec.family === 'stack' && lookSpec.stack) {"));
  });

  it('groups plain runs into one row and gives each accent word its own', () => {
    expect(body).toContain('if (!acc && last && !last.acc) last.ws.push(w);');
  });

  it('pins context left and accents right, at the measured margins', () => {
    expect(body).toContain("r.acc ? { right: `${100 - po.rightPct}%` } : { left: `${po.leftPct}%` }");
    const y = findLookSpec('look_yawl')!;
    expect(y.popoff).toBeTruthy();
    expect(y.popoff!.leftPct).toBeLessThan(5);         // their context ink starts at 3.9%
    expect(y.popoff!.rightPct).toBeGreaterThan(89);    // their accents end at 90.7%
  });

  it('fits every row to the space between the margins', () => {
    expect(body).toContain('fitRowScale(items, sz(6), availPx)');
  });

  it('keeps their face and case: Inter Black, lowercase', () => {
    const y = findLookSpec('look_yawl')!;
    expect(y.weight).toBe(900);
    expect(y.transform).toBe('lowercase');
  });
});

describe('stacked accents follow emphasis, not the spoken word', () => {
  it('the stack styles a word as accent because it is emphasised', () => {
    const slice = stackBranch();
    expect(slice).toContain('...(isAccent(w) ? lookAcc : lookRest), fontSize: rowPx');
    expect(slice).not.toContain('...(spoken ? lookAcc : lookRest)');
  });

  it("Focusline's faces: regular context, black italic accent", () => {
    const m = findLookSpec('look_mizzen')!;
    expect(m.weight).toBe(400);
    expect(m.accentWeight).toBe(900);
    expect(lookAccentStyle(m, CTX).fontStyle).toBe('italic');
    expect(lookBaseStyle(m, CTX).fontStyle).toBeUndefined();
  });
});

describe('exit fades, and fades that survive the inception filter', () => {
  it('the eight looks that declare an exit carry it', () => {
    expect(LOOK_SPECS.filter((l) => l.animOutMs).map((l) => l.id).sort()).toEqual([
      'look_cloister', 'look_font', 'look_lintel', 'look_mizzen', 'look_scupper', 'look_taffrail', 'look_underway', 'look_windlass']);
    for (const l of LOOK_SPECS.filter((x) => x.animOutMs)) {
      expect(l.animOutMs!, l.id).toBeGreaterThanOrEqual(80);
      expect(l.animOutMs!, l.id).toBeLessThanOrEqual(200);
    }
  });

  it('the exit runs off the SHARED display window', () => {
    const at = OVERLAY_SRC.indexOf('const exitAlpha =');
    expect(OVERLAY_SRC.slice(at, at + 260)).toContain('segWindow.winEnd - currentTimeMs');
  });

  it('an opacity never sits on an ancestor of the inception filter', () => {
    // Checked in Chrome: opacity on a wrapper cut the backdrop filter off entirely; on the filtered
    // element itself it fades correctly. So inception looks are never wrapped, and the word moves any
    // opacity onto its filtered layer.
    expect(OVERLAY_SRC).toContain('if (specOut && lookSpec.animOutMs && !lookSpec.inception) {');
    const at = OVERLAY_SRC.indexOf('function InceptionWord(');
    const body = OVERLAY_SRC.slice(at, at + 3600);
    expect(body).toContain('const { opacity: fade, ...outer } = style;');
    expect(body).toContain('position: \'absolute\', inset: 0, opacity: fade,');
    expect(body).toContain('...outer, display: \'inline-block\', position: \'relative\',');
  });

  it('inception only lives in the stack path, which fades each element itself', () => {
    for (const l of LOOK_SPECS.filter((x) => x.inception)) expect(l.family, l.id).toBe('stack');
  });

  it('a stacked word is hidden before its turn, so its entrance cannot blink', () => {
    expect(stackBranch()).toContain(": lookSpec.animIn && lookSpec.animIn !== 'none' ? { opacity: 0 } : {};");
  });
});

describe('face-anchored looks: the face track reaches every render route', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  it('the overlay takes a face track and defaults it off', () => {
    expect(OVERLAY_SRC).toContain('faceTrack = null');
  });

  it('the preview and the Element Capture export pass it', () => {
    const vc = read('../../components/editor/VideoCanvas.tsx');
    expect(vc.split('faceTrack={matte?.faceTrack ?? null}').length - 1).toBe(2);
    expect(read('../export/elementCaptureExport.tsx')).toContain('faceTrack={props.faceTrack ?? null}');
  });

  it('both export compositions forward it', () => {
    for (const f of ['../../remotion/CaptionExportComposition.tsx', '../../remotion/LambdaCaptionComposition.tsx']) {
      expect(read(f), f).toContain('faceTrack={faceTrack}');
    }
  });

  it('the editor sends it with every export, thinned for the cloud', () => {
    const page = read('../../app/editor/page.tsx');
    expect(page.split('faceTrack:           subjectMatte.matte?.faceTrack ?? null').length - 1).toBeGreaterThanOrEqual(3);
    expect(page).toContain('faceTrack: downsampleFaceTrack(subjectMatte.matte?.faceTrack)');
    expect(page).toContain('findLookSpec(captionStyle)?.faceAware ? allCaptionWindows(captionSegments, words) : []');
  });

  it('face anchoring only appears where the renderer reads it', () => {
    for (const l of LOOK_SPECS.filter((x) => x.focusline)) expect(l.family, l.id).toBe('stack');
    expect(findLookSpec('look_mizzen')!.focusline).toBe(true);
  });

  it('rows break and scale through the shared buildStackRows / stackRowScale', () => {
    const slice = stackBranch();
    expect(slice).toContain('buildStackRows(phrase, (w) => (isAccent(w) ? 2 : 0), per, { heroPair: st.heroPair, hyphenSplit: st.hyphenSplit })');
    expect(slice).toContain('stackRowScale(st.rowScale, stackRows[ri].tier)');
    expect(slice).not.toContain('st.rowScale[Math.min(ri');
  });
});

// ─── rendered, not read: the overlay itself, server-rendered ────────────────────────────────────
type TW = { id: string; text: string; startMs: number; endMs: number; styleOverride?: { scale: number } };
const tw = (id: string, text: string, startMs: number, endMs: number, marked = false): TW =>
  ({ id, text, startMs, endMs, ...(marked ? { styleOverride: { scale: 1.4 } } : {}) });
const renderAt = (style: string, words: TW[], t: number, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(CaptionOverlay, {
    words, currentTimeMs: t, captionStyle: style, accentColor: '#06b6d4', bleepRanges: [],
    segments: [words.map((w) => w.id)], ...extra,
  } as never)).replace(/<style>[\s\S]*?<\/style>/g, '');
/** The hero word's text and style, if one is drawn. */
const heroIn = (html: string) => {
  const m = /<span data-impact=""(?: data-depth="")? style="([^"]*)">(?:<span[^>]*style="([^"]*)"[^>]*><\/span>)?([^<]*)<\/span>/.exec(html);
  return m ? { style: m[1], chip: m[2] ?? null, text: m[3] } : null;
};
/** The row's words with their opacity. */
const rowIn = (html: string) => {
  const at = html.indexOf('data-cap-row=""');
  if (at < 0) return null;
  return [...html.slice(at).matchAll(/<span(?: data-depth="")? style="([^"]*)">([^<]*)<\/span>/g)].map((m) => ({
    text: m[2], opacity: Number(/opacity:([0-9.e-]+)/.exec(m[1])?.[1] ?? 1), style: m[1],
  }));
};

describe('impact words: one word of the phrase, huge, behind the speaker', () => {
  const impactLooks = LOOK_SPECS.filter((l) => l.impact);

  it('fourteen designs carry one, each a behind design the row renderer can split', () => {
    expect(impactLooks.length).toBe(14);
    for (const l of impactLooks) {
      const im = l.impact!;
      expect(l.behindSubject, l.id).toBe(true);
      expect(['karaoke', 'flat'], l.id).toContain(l.family);
      expect(im.sizePx, l.id).toBeGreaterThanOrEqual(30);
      expect(im.sizePx, l.id).toBeLessThanOrEqual(160);
      expect(im.yPct, l.id).toBeGreaterThan(8);
      expect(im.yPct, l.id).toBeLessThan(40);
      expect(im.widthPct, l.id).toBeLessThanOrEqual(95);
      expect(im.fitFactor, l.id).toBeGreaterThan(0.3);
      // the caption row sits well below the hero, so the export's matte clip can separate them
      expect((l.positionYPct ?? 0) - 10, l.id).toBeGreaterThan(im.yPct + 12);
    }
  });

  it('the marked word becomes the hero and leaves the row', () => {
    const html = renderAt('look_garnet', [tw('a', 'the', 0, 300), tw('b', 'right', 300, 600, true), tw('c', 'words', 600, 900)], 100);
    expect(heroIn(html)?.text).toBe('right');
    expect(rowIn(html)!.map((w) => w.text)).toEqual(['the', 'words']);
  });

  it('with no marked word, the longest word that is not a stopword stands in', () => {
    const html = renderAt('look_garnet', [tw('a', 'this', 0, 300), tw('b', 'is', 300, 600), tw('c', 'wonderful', 600, 900)], 100);
    expect(heroIn(html)?.text).toBe('wonderful');
    expect(rowIn(html)!.map((w) => w.text)).toEqual(['this', 'is']);
  });

  it('split layers: behind draws only the hero, front only the row', () => {
    const ws = [tw('a', 'the', 0, 300), tw('b', 'right', 300, 600, true), tw('c', 'words', 600, 900)];
    const back = renderAt('look_garnet', ws, 100, { subjectLayer: 'behind' });
    const front = renderAt('look_garnet', ws, 100, { subjectLayer: 'front' });
    expect(heroIn(back)?.text).toBe('right');
    expect(rowIn(back)).toBeNull();
    expect(heroIn(front)).toBeNull();
    expect(rowIn(front)!.map((w) => w.text)).toEqual(['the', 'words']);
  });

  it('the hero sits in the title box, so the user can move it', () => {
    const html = renderAt('look_garnet', [tw('a', 'big', 0, 300, true), tw('b', 'news', 300, 600)], 100,
      { emphBoxYPercent: 31, emphBoxXPercent: 40 });
    expect(html).toMatch(/data-caption-content="emph" style="position:absolute;top:31%;left:40%/);
  });

  it('a short word keeps the design size; a long one is fitted to the frame', () => {
    const im = findLookSpec('look_garnet')!.impact!;
    expect(impactPx('HIT', im, 270, im.sizePx)).toBe(im.sizePx);
    const long = impactPx('extraordinary', im, 270, im.sizePx);
    expect(long).toBeLessThan(im.sizePx);
    const est = estTextWidth('EXTRAORDINARY', long, im.fitFactor * fontWeightFactor(im.weight));
    expect(est).toBeCloseTo(270 * im.widthPct / 100, 1);
  });

  it('reveal looks hold unspoken words invisibly, and their hero appears when spoken', () => {
    const ws = [tw('a', 'years', 0, 300), tw('b', 'ten', 300, 600, true), tw('c', 'into', 600, 900)];
    const early = renderAt('look_jetty', ws, 100);
    expect(heroIn(early)).toBeNull();
    const row = rowIn(early)!;
    expect(row.find((w) => w.text === 'years')!.opacity).toBeGreaterThan(0.5);
    expect(row.find((w) => w.text === 'into')!.opacity).toBe(0);
    expect(heroIn(renderAt('look_jetty', ws, 400))?.text).toBe('ten');
    // a whole-phrase look shows its hero from the first word
    expect(heroIn(renderAt('look_garnet', ws, 100))?.text).toBe('ten');
  });

  it('a lit hero takes its lit colour only while it is spoken', () => {
    const ws = [tw('a', 'idea', 0, 300, true), tw('b', 'here', 300, 600)];
    expect(heroIn(renderAt('look_ibis', ws, 100))!.style).toContain('color:#FFE500');
    expect(heroIn(renderAt('look_ibis', ws, 400))!.style).toContain('color:#FFFFFF');
  });

  it("Netting's chip wipes in once the word is spoken, and stays", () => {
    const ws = [tw('a', 'clever', 0, 400, true), tw('b', 'words', 400, 900)];
    expect(heroIn(renderAt('look_netting', ws, 0))!.chip).toBeNull();
    expect(heroIn(renderAt('look_netting', ws, 85))!.chip).toMatch(/width:calc\(50\.0% \+ 0\.100em\)/);
    expect(heroIn(renderAt('look_netting', ws, 800))!.chip).toMatch(/width:calc\(100\.0%/);
  });

  it('only split designs keep the matte off their caption', () => {
    expect(splitsAroundSubject('big_reveal')).toBe(true);
    expect(splitsAroundSubject('look_garnet')).toBe(true);
    expect(splitsAroundSubject('look_hawser')).toBe(false);   // behind, but its caption IS the title
    expect(splitsAroundSubject('look_mizzen')).toBe(false);
    expect(splitsAroundSubject('captik')).toBe(false);
  });

  it('every behind-subject route honours the split', () => {
    const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    const canvas = src('../../components/editor/VideoCanvas.tsx');
    expect(canvas).toContain("subjectLayer={splitsSubject ? 'behind' : undefined}");
    expect(canvas).toMatch(/words\.length > 0 && splitsSubject && \(/);
    expect(canvas).toContain('subjectLayer="front"');
    expect(canvas).toMatch(/\{splitsSubject && onEmphBoxChange/);
    expect(src('../export/elementCaptureExport.tsx')).toContain('const matteClipFrac = splitsAroundSubject(props.captionStyle)');
    expect(src('../../app/editor/page.tsx')).toContain('if (splitsAroundSubject(captionStyle)) {');
  });
});

describe('karaoke entrances run once per phrase', () => {
  it('the spoken word is not blinked out as it lights', () => {
    // Belfry declares a 450ms fade. It used to restart on each word as it lit, so a word 10ms into
    // being spoken sat at opacity 0.02.
    const ws = [tw('a', 'make', 0, 1000), tw('b', 'them', 1000, 1600), tw('c', 'yours', 1600, 2200)];
    const lit = rowIn(renderAt('look_belfry', ws, 1010))!.find((w) => w.text === 'them')!;
    expect(lit.opacity).toBeGreaterThan(0.95);
  });

  it('the phrase itself still fades in', () => {
    const ws = [tw('a', 'make', 0, 1000), tw('b', 'them', 1000, 1600)];
    const row = rowIn(renderAt('look_belfry', ws, 90))!;
    for (const w of row) expect(w.opacity, w.text).toBeLessThan(0.3);
  });

  it('an accent face stays on the marked word and off the lit one', () => {
    const ws = [tw('a', 'the', 0, 300), tw('b', 'right', 300, 600, true), tw('c', 'words', 600, 900), tw('d', 'done', 900, 1200, true)];
    const row = rowIn(renderAt('look_beacon', ws, 100))!;
    expect(row.find((w) => w.text === 'the')!.style).toContain('font-family:Montserrat');
    expect(row.find((w) => w.text === 'done')!.style).toContain('font-family:KaushanScript');
  });
});

describe('row geometry a design measures for itself', () => {
  const rowStyle = (html: string) => /data-cap-row="" style="([^"]*)"/.exec(html)?.[1] ?? '';

  it('word spacing is in the row size, where the look gives one', () => {
    const ws = [tw('a', 'and', 0, 300), tw('b', 'let', 300, 600), tw('c', 'sound', 600, 900, true)];
    const l = findLookSpec('look_ferrier')!;
    expect(rowStyle(renderAt('look_ferrier', ws, 100))).toContain(`gap:${Math.round(l.sizePx * l.wordGapEm!)}px`);
    // a look without one keeps the engine's 6px
    expect(rowStyle(renderAt('look_belfry', ws, 100))).toContain('gap:6px');
    for (const x of LOOK_SPECS.filter((y) => y.wordGapEm)) {
      expect(x.wordGapEm!, x.id).toBeGreaterThan(0.2);
      expect(x.wordGapEm!, x.id).toBeLessThan(0.6);
    }
  });

  it('a wrapping design wraps even when the user asked for single lines', () => {
    const ws = [tw('h', 'ten', 0, 300, true), tw('a', 'years', 300, 600), tw('b', 'into', 600, 900), tw('c', 'editing', 900, 1200)];
    expect(rowStyle(renderAt('look_jetty', ws, 1000, { captionLines: 'single' }))).toContain('flex-wrap:wrap');
    expect(rowStyle(renderAt('look_garnet', ws, 1000, { captionLines: 'single' }))).toContain('flex-wrap:nowrap');
  });

  it("a measured width factor keeps a capitals row at the design's size", () => {
    // Anton's table factor is a lowercase worst case; on SIMPLE it shrank the word to 91% of its size.
    const l = findLookSpec('look_hawser')!;
    const html = renderAt('look_hawser', [tw('a', 'simple', 0, 900)], 100);
    expect(html).toContain(`font-size:${l.sizePx}px`);
  });

  it('the editor opens a look with its own box width, bounded', () => {
    const page = readFileSync(fileURLToPath(new URL('../../app/editor/page.tsx', import.meta.url)), 'utf8');
    expect(page).toContain('widthPercent: nextLook.boxWidthPct ?? 84');
    for (const l of LOOK_SPECS.filter((x) => x.boxWidthPct)) {
      expect(l.boxWidthPct!, l.id).toBeGreaterThanOrEqual(84);
      expect(l.boxWidthPct!, l.id).toBeLessThanOrEqual(100);
    }
  });
});

describe('lockups', () => {
  it('an emphasised word opens the second row of a two-row design', () => {
    const ws = [tw('a', 'If', 0, 100), tw('b', 'your', 100, 200), tw('c', 'idea', 200, 300), tw('d', 'feels', 300, 400), tw('e', 'messy,', 400, 500, true)];
    const html = renderAt('look_effigy', ws, 600);
    const rows = [...html.matchAll(/data-cap-row=""[^>]*>(.*?)<\/div>/g)].map((m) => [...m[1].matchAll(/>([^<]+)</g)].map((x) => x[1]));
    expect(rows).toEqual([['If', 'your', 'idea', 'feels'], ['messy,']]);
    // and it keeps its accent scale there
    const size = (t: string) => Number(new RegExp(`font-size:([0-9.]+)px[^>]*>${t}<`).exec(html)?.[1]);
    expect(size('messy,') / size('feels')).toBeGreaterThan(1.2);
  });

  it('only a look that always has a hero invents one', () => {
    const ws = [tw('a', 'into', 0, 100), tw('b', 'everyone', 100, 200)];
    expect(renderAt('look_outhaul', ws, 300)).toContain('data-emph=""');
    // a property lockup shows a context line on its own, at its context size (the reels are scenes now)
    const font = renderAt('look_font', [tw('a', 'Imagine', 0, 100), tw('b', 'a', 100, 200), tw('c', 'home', 200, 300)], 400);
    expect(font).not.toContain('data-emph=""');
    expect(font).toContain(`font-size:${findLookSpec('look_font')!.contextSizePx}px`);
  });

  it('capitals on the accent only, never on the lit word', () => {
    const painter = findLookSpec('look_painter')!;
    expect(lookAccentStyle(painter, CTX).textTransform).toBe('uppercase');
    expect(lookBaseStyle(painter, CTX).textTransform).toBeUndefined();
    // two marked words that cannot share the hero: the first is the hero for the whole phrase and
    // the other sits in the row in the accent case, as their THREE over "first SECONDS" does
    const ws = [tw('h', 'hook', 0, 100, true), tw('a', 'breaks', 100, 900), tw('b', 'seconds', 150, 900, true)];
    for (const t of [50, 200, 800]) {
      const html = renderAt('look_painter', ws, t);
      expect(heroIn(html)?.text).toBe('hook');
      const row = rowIn(html)!;
      expect(row.find((w) => w.text === 'breaks')!.style).not.toContain('text-transform:uppercase');
      expect(row.find((w) => w.text === 'seconds')!.style).toContain('text-transform:uppercase');
    }
  });

  it('a short leading pair that cannot be set at the design size leaves its second word in the row, in capitals', () => {
    // their "TEN" behind "YEARS into editing": Jetty picks the first content word and its neighbour,
    // the pair does not fit at 130px, and YEARS stays in the row in the hero's case
    const ws = [tw('a', 'ten', 0, 300, true), tw('b', 'years', 300, 600, true), tw('c', 'into', 600, 900), tw('d', 'editing', 900, 1200)];
    const html = renderAt('look_jetty', ws, 1000);
    expect(heroIn(html)?.text).toBe('ten');
    const row = rowIn(html)!;
    expect(row.map((w) => w.text)).toEqual(['years', 'into', 'editing']);
    expect(row[0].style).toContain('text-transform:uppercase');
    expect(row[1].style).not.toContain('text-transform:uppercase');
    // with room, the pair is the hero
    const wide = renderAt('look_jetty', ws, 1000, { canvasWidthPx: 4000 });
    expect(heroIn(wide)?.text).toBe('ten years');
  });

  it('the by-length rule needs no marks: the design chooses for an unmarked phrase', () => {
    // nothing scores (function words only) -> Keel's leading rule takes the first word
    const ws = [tw('a', 'you', 0, 300), tw('b', 'me', 300, 600), tw('c', 'them', 600, 900), tw('d', 'us', 900, 1200)];
    const html = renderAt('look_keel', ws, 1000);
    expect(heroIn(html)?.text).toBe('you');
    // and an emphasis-family look with heroSelect takes the last content word
    const out = renderAt('look_outhaul', [tw('a', 'into', 0, 300), tw('b', 'everyone', 300, 600), tw('c', 'progress', 600, 900)], 1000);
    expect(/data-emph=""[^>]*>progress</.test(out)).toBe(true);
  });
});

describe('focusline: the band a phrase takes, rendered', () => {
  // the box is at the look's own position (27), as the editor sets it on selection
  const AT = { captionYPercent: 27 };
  const blockTop = (html: string) => {
    const m = /style="[^"]*top:calc\(([0-9.]+)% - ([0-9.]+)px\)[^"]*" data-focusline="([a-z-]+)"/.exec(html);
    return m ? [m[0], m[3], m[1], m[2]] : null;
  };
  const rowJustify = (html: string) => [...html.matchAll(/data-cap-row="" style="display:flex;gap:[0-9.]+px;justify-content:([a-z-]+)/g)].map((m) => m[1]);

  it('a short phrase with an article stacks as a headline, its bottom on 22%', () => {
    const html = renderAt('look_mizzen', [tw('a', 'The', 0, 300), tw('b', 'biggest', 300, 600, true), tw('c', 'mistake', 600, 900)], 1000, AT);
    const m = blockTop(html)!;
    expect(m[1]).toBe('headline-stack');
    expect(Number(m[2])).toBeCloseTo(22, 3);
    expect(Number(m[3])).toBeGreaterThan(20);
    expect(new Set(rowJustify(html))).toEqual(new Set(['center']));
  });

  it('a phrase opened by a question word takes the lower story, rows flush left', () => {
    const ws = ['What', 'you', 'should', 'really', 'be', 'paying'].map((t, i) => tw(`w${i}`, t, i * 300, i * 300 + 250, t === 'really'));
    const html = renderAt('look_mizzen', ws, 1600, AT);   // every word started, window still open
    const m = blockTop(html)!;
    expect(m[1]).toBe('lower-story');
    expect(Number(m[2])).toBeCloseTo(68, 3);
    expect(new Set(rowJustify(html))).toEqual(new Set(['flex-start']));
  });

  it('a split cluster sets the rows before the hero flush right and after it flush left', () => {
    const ws = ['fits', 'your', 'day-to-day', 'life.'].map((t, i) => tw(`w${i}`, t, i * 300, i * 300 + 250, t === 'day-to-day'));
    const html = renderAt('look_mizzen', ws, 1000, AT);
    const m = blockTop(html)!;
    expect(m[1]).toBe('split-cluster');
    expect(Number(m[2])).toBeCloseTo(34, 3);
    expect(rowJustify(html)).toEqual(['flex-end', 'center', 'flex-start']);
  });

  it('a drag of the caption box shifts the band', () => {
    const html = renderAt('look_mizzen', [tw('a', 'The', 0, 300), tw('b', 'biggest', 300, 600, true), tw('c', 'mistake', 600, 900)], 1000,
      { captionYPercent: 37 });
    expect(Number(blockTop(html)![2])).toBeCloseTo(32, 3);   // 22 + (37 - 27)
  });

  it('the editor sets only the lower-story phrases behind the speaker', () => {
    const page = readFileSync(fileURLToPath(new URL('../../app/editor/page.tsx', import.meta.url)), 'utf8');
    expect(page).toContain('focuslineBehindKeys(resolveSegments(captionSegments, words)');
    expect(page).toContain('const behindKeys = focusBehind ? keys.filter((k) => focusBehind.has(k))');
    expect(page).toContain('const frontKeys = focusBehind ? keys.filter((k) => !focusBehind.has(k))');
  });
});

describe('dynamic layout: a zone per phrase', () => {
  const top = (html: string) => Number(/style="position:absolute;top:([0-9.]+)%;left:([0-9.]+)%;width:84%;transform:translate\(-50%, -50%\);pointer-events:none;padding:0 10px/.exec(html)?.[1]);

  it("Cloister hops between the lower zones, by the caption's key, shifted with the box", () => {
    const at = (key: string) => {
      const ws = [tw(key, 'building', 0, 300), tw(key + 'b', 'a', 300, 600), tw(key + 'c', 'visual', 600, 900), tw(key + 'd', 'direction', 900, 1200, true)];
      return top(renderAt('look_cloister', ws, 1000, { captionYPercent: 56 }));
    };
    const ys = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'].map(at);
    for (const y of ys) { expect(y).toBeGreaterThanOrEqual(55 + 6 - 3 - 1e-6); expect(y).toBeLessThanOrEqual(81 + 6 + 3 + 1e-6); }
    expect(new Set(ys.map((y) => y.toFixed(2))).size).toBeGreaterThan(1);
    expect(at('w1')).toBe(at('w1'));
  });

  it('Taffrail draws a hero phrase 1.1x and nudges it; a plain phrase stays put', () => {
    const size = (html: string) => Math.max(...[...html.matchAll(/font-size:([0-9.]+)px/g)].map((m) => Number(m[1])));
    const hero = [tw('h1', 'make', 0, 300), tw('h2', 'it', 300, 600), tw('h3', 'count', 600, 900, true)];
    const plain = [tw('p1', 'make', 0, 300), tw('p2', 'it', 300, 600), tw('p3', 'count', 600, 900)];
    const a = renderAt('look_taffrail', hero, 1000, { captionYPercent: 58 });
    const b = renderAt('look_taffrail', plain, 1000, { captionYPercent: 58 });
    expect(size(a) / size(b)).toBeGreaterThan(1.05);
    expect(a).not.toContain('top:58.000%;left:50.000%');
    expect(b).toContain('top:58.000%;left:50.000%');
  });
});

describe('entrances by role, and lingering captions', () => {
  const opacityOf = (style: string) => Number(/opacity:([0-9.e-]+)/.exec(style)?.[1] ?? 1);
  const translate = (style: string) => /transform:translate([XY])\((-?[0-9.]+)em\)/.exec(style);

  it("Quay's hero rises over 300ms with the 2.2x opacity ramp while its row cuts in", () => {
    const ws = [tw('a', 'complicated', 0, 300, true), tw('b', 'this', 300, 600), tw('c', 'looks', 600, 900)];
    const early = heroIn(renderAt('look_quay', ws, 100))!;
    expect(opacityOf(early.style)).toBeCloseTo(Math.min(1, 2.2 * 100 / 300), 3);
    const tr = translate(early.style)!;
    expect(tr[1]).toBe('Y');
    expect(Number(tr[2])).toBeGreaterThan(0);
    const mid = heroIn(renderAt('look_quay', ws, 200))!;
    expect(opacityOf(mid.style)).toBe(1);
    expect(Number(translate(mid.style)![2])).toBeGreaterThan(0);          // still settling
    expect(Number(translate(mid.style)![2])).toBeLessThan(Number(tr[2]));
    expect(translate(heroIn(renderAt('look_quay', ws, 400))!.style)?.[2]).toBe('0.0000');
  });

  it("Windlass's hero comes in from the right", () => {
    const ws = [tw('a', 'one', 0, 300), tw('b', 'sliding', 300, 600, true), tw('c', 'hook', 600, 900)];
    const html = renderAt('look_windlass', ws, 400);
    const emph = /data-emph=""[^>]*style="([^"]*)"/.exec(html)![1];
    const tr = translate(emph)!;
    expect(tr[1]).toBe('X');
    expect(Number(tr[2])).toBeGreaterThan(0);
  });

  it("Outhaul's hero is up from the phrase start, and its context follows 120ms later, rising", () => {
    const ws = [tw('a', 'into', 0, 300), tw('b', 'everyone', 300, 600), tw('c', 'progress', 600, 900)];
    const at50 = renderAt('look_outhaul', ws, 50);
    const emph = /data-emph=""[^>]*style="([^"]*)"/.exec(at50)![1];
    expect(opacityOf(emph)).toBeGreaterThan(0);                            // PROGRESS shows before its word
    expect(translate(emph)![1]).toBe('Y');
    expect(Number(translate(emph)![2])).toBeLessThan(0);                   // fadeDown: drops in
    const ctx50 = /<span style="([^"]*)">into<\/span>/.exec(at50)![1];
    expect(opacityOf(ctx50)).toBe(0);                                       // the context waits its delay
    const at300 = renderAt('look_outhaul', ws, 300);
    const ctx300 = /<span style="([^"]*)">into<\/span>/.exec(at300)![1];
    expect(opacityOf(ctx300)).toBeGreaterThan(0.9);
    expect(translate(ctx300)![1]).toBe('Y');
  });

  it("Mizzen's hero row and its context rows take their own entrances", () => {
    const ws = [tw('a', 'The', 0, 300), tw('b', 'biggest', 300, 600, true), tw('c', 'mistake', 600, 900)];
    const html = renderAt('look_mizzen', ws, 330, { captionYPercent: 27 });
    const hero = /<span style="([^"]*)">biggest<\/span>/.exec(html)![1];
    expect(opacityOf(hero)).toBeCloseTo(Math.min(1, 2.2 * 30 / 220), 3);   // heroEnter 220ms, 30ms in
    expect(Number(translate(hero)![2])).toBeGreaterThan(0);
    const ctx = /<span style="([^"]*)">The<\/span>/.exec(html)![1];
    expect(opacityOf(ctx)).toBe(1);                                          // rowEnter 200ms, long done
  });

  it('a lingering look holds each caption until the next one begins', async () => {
    const { captionTailMs, LINGER_TAIL_MS, activeSegmentWindowAt, resolveSegments } = await import('../captionSegments');
    expect(captionTailMs('look_belfry', 0)).toBe(LINGER_TAIL_MS);
    expect(captionTailMs('look_garnet', 250)).toBe(250);
    expect(captionTailMs(undefined, 250)).toBe(250);
    for (const l of LOOK_SPECS.filter((x) => x.linger)) expect(['look_belfry', 'look_dovecote', 'look_effigy', 'look_taffrail', 'look_yawl']).toContain(l.id);
    const words = [tw('a', 'make', 0, 400), tw('b', 'them', 400, 800), tw('c', 'stay', 3000, 3400)];
    const resolved = resolveSegments([['a', 'b'], ['c']], words as never);
    const held = activeSegmentWindowAt(resolved, 2000, captionTailMs('look_belfry', 0));
    expect(held?.index).toBe(0);
    expect(held?.winEnd).toBe(3000);                                         // clamped at the next caption
    expect(activeSegmentWindowAt(resolved, 2000, captionTailMs('look_garnet', 0))).toBeNull();
    expect(activeSegmentWindowAt(resolved, 60000, captionTailMs('look_belfry', 0))?.index).toBe(1);
  });

  it('every route resolves the active caption through the same tail', () => {
    const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    expect(OVERLAY_SRC).toContain('activeSegmentWindowAt(resolvedSegs, currentTimeMs, captionTailMs(captionStyle, captionGapMs), captionMinMs(captionStyle))');
    expect(src('../../app/editor/page.tsx')).toContain('captionTailMs(captionStyle, captionGapMs), captionMinMs(captionStyle))');
    expect(src('../../remotion/CaptionExportComposition.tsx')).toContain('captionTailMs(captionStyleBase, captionGapMs), captionMinMs(captionStyleBase))');
    expect(src('../../remotion/LambdaCaptionComposition.tsx')).toContain('captionTailMs(captionStyleBase, captionGapMs), captionMinMs(captionStyleBase))');
    expect(src('../export/elementCaptureExport.tsx')).toContain('captionTailMs(captionStyle, captionGapMs), captionMinMs(captionStyle))');
  });

  it('a look holds a short caption for 0.9s, or to 20ms before the next; other templates do not', async () => {
    const { captionMinMs, activeSegmentWindowAt, resolveSegments } = await import('../captionSegments');
    expect(captionMinMs('look_garnet')).toBe(900);
    expect(captionMinMs('captik')).toBe(0);
    expect(captionMinMs(undefined)).toBe(0);
    const words = [tw('a', 'quick', 0, 200), tw('b', 'one', 200, 400), tw('c', 'then', 2000, 2400), tw('d', 'soon', 800, 1400)];
    const two = resolveSegments([['a', 'b'], ['c']], words as never);
    expect(activeSegmentWindowAt(two, 700, 0, 900)?.index).toBe(0);            // held: 400ms of speech, up at 0.7s
    expect(activeSegmentWindowAt(two, 700, 0)).toBeNull();                      // without the minimum it is gone
    expect(activeSegmentWindowAt(two, 900 + 120, 0, 900)?.index).toBe(0);      // the tail rides on the hold
    expect(activeSegmentWindowAt(two, 900 + 121, 0, 900)).toBeNull();
    const close = resolveSegments([['a', 'b'], ['d']], words as never);
    expect(activeSegmentWindowAt(close, 790, 0, 900)?.index).toBe(0);          // held, but the next caption at 800 clamps it
    expect(activeSegmentWindowAt(close, 790, 0, 900)?.winEnd).toBe(800);
    const long = resolveSegments([['a', 'b', 'c']], words as never);
    expect(activeSegmentWindowAt(long, 2400 + 120, 0, 900)?.index).toBe(0);    // a caption over 0.9s is unchanged
  });
});

describe('Rudder: the letter-mask plate, and stack rows by tier', () => {
  const plateRows = (html: string) => [...html.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
  const plateSizes = (html: string) => [...html.matchAll(/font-size="([0-9.]+)"/g)].map((m) => Number(m[1]));
  const stackRows = (html: string) => html.split('data-cap-row=""').slice(1).map((chunk) =>
    [...chunk.matchAll(/<span(?: data-depth="")? style="([^"]*)">([^<]*)<\/span>/g)].map((m) => ({ text: m[2], px: Number(/font-size:([0-9.]+)px/.exec(m[1])?.[1]) })));
  const ws = [
    tw('a', 'One', 100, 400), tw('b', 'sharp', 400, 733, true), tw('c', 'visual', 733, 1133),
    tw('d', 'makes', 2000, 2300), tw('e', 'people', 2300, 2600), tw('f', 'stop', 2600, 2900, true), tw('g', 'scrolling', 2900, 3300),
  ];
  const segs = { segments: [['a', 'b', 'c'], ['d', 'e', 'f', 'g']], captionGapMs: 100 };

  it('the opening phrase is a black plate with its letters cut out, typed on as spoken, re-flowing as their frames do', () => {
    const at200 = renderAt('look_rudder', ws, 200, segs);
    expect(at200).toContain('data-letter-mask=""');
    expect(at200).not.toContain('data-cap-row=""');
    expect(plateRows(at200)).toEqual(['One']);
    expect(plateRows(renderAt('look_rudder', ws, 500, segs))).toEqual(['One', 'sharp']);
    expect(plateRows(renderAt('look_rudder', ws, 900, segs))).toEqual(['One sharp', 'visual']);
  });

  it('the plate is opaque black masked by white-with-black-letters, fading in over the look\'s 60ms', () => {
    const at130 = renderAt('look_rudder', ws, 130, segs);
    expect(/data-letter-mask="" style="[^"]*opacity:0\.5/.test(at130)).toBe(true);        // 30 of 60ms
    expect(at130).toContain('<rect x="0" y="0" width="100%" height="100%" fill="#fff"></rect>');
    expect(at130).toContain('fill="#000" mask="url(#letter-mask-a)"');
    expect(at130).toContain('fill="#000" font-family="ArchivoBlack, sans-serif"');
    expect(at130).toContain('letter-spacing="-0.065em"');
    expect(/data-letter-mask="" style="[^"]*opacity:1[;"]/.test(renderAt('look_rudder', ws, 200, segs))).toBe(true);
  });

  it('a lone row is capped at half the frame width; two rows share the size that fits the widest at 1.025 of it', () => {
    expect(plateSizes(renderAt('look_rudder', ws, 200, segs))).toEqual([135]);              // 0.5 x 270
    const two = plateSizes(renderAt('look_rudder', ws, 500, segs));
    expect(two).toHaveLength(2);
    expect(two[0]).toBe(two[1]);
    expect(two[0]).toBeLessThan(135);
    const three = plateSizes(renderAt('look_rudder', ws, 900, segs));
    expect(three[0]).toBe(three[1]);
    expect(three[0]).toBeLessThan(two[0]);
    // the rows pitch 0.92em about the frame's middle, the two-row block 0.8% lower
    const html = renderAt('look_rudder', ws, 500, segs);
    expect(html).toContain('y="50.80%"');
    expect(renderAt('look_rudder', ws, 200, segs)).toContain('y="50%"');
  });

  it('the plate is only for the moment: the later phrase renders the normal stack', () => {
    const html = renderAt('look_rudder', ws, 3000, segs);
    expect(html).not.toContain('data-letter-mask=""');
    expect(html).toContain('data-cap-row=""');
  });

  it('"makes people / stop / scrolling": a hero alone, the rows after it BACK at the plain size', () => {
    const rows = stackRows(renderAt('look_rudder', ws, 3200, segs));
    expect(rows.map((r) => r.map((w) => w.text))).toEqual([['makes', 'people'], ['stop'], ['scrolling']]);
    // plain 22.6 x 1.08 = 24; the hero asks 22.6 x 2.75 x 1.75 = 109 and is fitted to the box on
    // its width — the estimator's here (87); in a browser the face's real advances land it at 93,
    // their measured size
    expect(rows.map((r) => r[0].px)).toEqual([24, 87, 24]);
    const html = renderAt('look_rudder', ws, 3200, segs);
    expect(html).toContain('gap:6.72px');                                                     // .28em of the 24px row
    expect(html).toContain('gap:24.36px');                                                    // .28em of the 87px hero row
    expect(html).toContain('margin-top:2.78px');                                              // .025 x (24 + 87)
  });

  it('Keystone, Lintel, Scupper, Underway, Taffrail scale their rows by tier the same way, the hero by its accent scale too', () => {
    const words = [tw('a', 'this', 0, 300), tw('b', 'is', 300, 600), tw('c', 'exactly', 600, 900, true), tw('d', 'right', 900, 1200)];
    // Scupper 24 x 1.72 x 1.36 = 56; Taffrail 20 x 2.2 x 1.7 = 75 (their fontPairing.accentScale),
    // under its dynamic layout's 1.05 and then fitted to the box by the estimator (54)
    for (const [id, plain, hero] of [['look_keystone', 20, 36], ['look_lintel', 28, 40], ['look_scupper', 25, 56], ['look_underway', 17, 25], ['look_taffrail', 22, 54]] as const) {
      const rows = stackRows(renderAt(id, words, 1100));
      expect(rows.map((r) => r.map((w) => w.text)), id).toEqual([['this', 'is'], ['exactly'], ['right']]);
      expect(rows.map((r) => r[0].px), id).toEqual([plain, hero, plain]);
    }
  });

  it('the moment comes from the shared rule over the segment list, with the video length as the last caption end', () => {
    const slice = stackBranch();
    expect(slice).toContain('letterMaskMoments(resolvedSegs, resolvedSegs.reduce((m, s) => Math.max(m, s.endMs), 0), lm)');
    expect(slice).toContain('const rows = letterMaskRows(shownWords, rowEm);');
    expect(slice).toContain('Math.min(canvasWidthPx * LETTER_MASK_MAX_PX_OF_WIDTH, (canvasWidthPx * LETTER_MASK_WIDTH_FRAC) / widest)');
  });
});

describe('depth treatment: the words a behind layer marks', () => {
  const ws = [tw('a', 'the', 0, 300), tw('b', 'right', 300, 600, true), tw('c', 'words', 600, 900)];
  it('a depth look marks its words on the behind layer (and when unsplit), never on the front layer', () => {
    expect((renderAt('look_garnet', ws, 400, { subjectLayer: 'behind' }).match(/data-depth=""/g) ?? []).length).toBe(1);   // the hero alone
    expect(renderAt('look_garnet', ws, 400, { subjectLayer: 'front' })).not.toContain('data-depth=""');
    expect((renderAt('look_garnet', ws, 400).match(/data-depth=""/g) ?? []).length).toBe(3);                              // hero + the row's two
    const hawser = renderAt('look_hawser', [tw('a', 'simple', 0, 900), tw('b', 'sentence', 0, 900)], 100);
    expect((hawser.match(/data-depth=""/g) ?? []).length).toBe(2);
  });
  it('a look without depthFx marks nothing; no legacy template does either', () => {
    expect(renderAt('look_quay', ws, 400)).not.toContain('data-depth');
    expect(renderAt('look_mizzen', ws, 400, { captionYPercent: 27 })).not.toContain('data-depth');
    expect(renderAt('captik', ws, 400)).not.toContain('data-depth');
  });
  it('the root applies the treatment after each commit and on every published grid, behind only', () => {
    expect(OVERLAY_SRC).toContain("const depthOn = !!depthFx && props.subjectLayer !== 'front';");
    expect(OVERLAY_SRC).toContain('const run = () => applyDepthTreatment(root, props.depthGrid ?? currentDepthGrid(), depthFx);');
    expect(OVERLAY_SRC).toContain('return subscribeDepthGrid(run);');
    const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    expect(src('../../components/editor/VideoCanvas.tsx')).toContain('publishDepthGrid(bmp ? depthGridFromBitmap(bmp) : null);');
    const ec = src('../export/elementCaptureExport.tsx');
    expect(ec).toContain('publishDepthGrid(bmp ? depthGridFromBitmap(bmp) : null);\n      ctl.setMs(tMs);');
  });
});

describe('Gable: their agent story as a scene', () => {
  const ws = [tw('a', 'Imagine', 300, 500), tw('b', 'the', 500, 650), tw('c', 'asking', 700, 1000), tw('d', 'price', 1100, 1400, true), tw('e', 'is', 1400, 1500), tw('f', '$800,000', 1550, 2200)];
  // a track sampled every 250ms (a sample further than the track's gap from the moment counts as no face)
  const ts = Array.from({ length: 21 }, (_, i) => i * 250);
  const face = { v: 1, t: ts, cx: ts.map(() => 0.5), headTop: ts.map(() => 0.102), faceTop: ts.map(() => 0.16), faceBottom: ts.map(() => 0.27) };
  const at = (t: number, extra: Record<string, unknown> = {}) => renderAt('look_gable', ws, t, { captionGapMs: 1500, canvasHeightPx: 480, faceTrack: face, captionYPercent: 47, ...extra });

  it('the caption is planned into a moment: the marked word headlines behind the head in difference blend', () => {
    const html = at(1200);
    expect(html).toContain('data-agent-story-scene="amount"');
    const head = /<div data-agent-story-headline="" style="([^"]*)"/.exec(html)![1];
    expect(head).toContain('mix-blend-mode:difference');
    expect(head).toContain('color:#F1F66F');
    expect(head).toContain('font-family:PoppinsBold, Poppins, sans-serif');
    expect(/data-caption-word-id="d"[^>]*>price</.test(html)).toBe(true);
    // the box centre sits at headTop x H + .24 x size: .102 x 480 = 48.96 plus a quarter of the size
    const top = Number(/top:([0-9.]+)px/.exec(head)![1]);
    const size = Number(/font-size:([0-9.]+)px/.exec(head)![1]);
    expect(top).toBeCloseTo(48.96 + 0.24 * size, 1);
    expect(size).toBeGreaterThan(30);
  });

  it('the amount row is outlined in the accent and pushed clear of the face; support words slot in white', () => {
    const html = at(1700);
    const amount = /<div data-agent-story-amount="outline" style="([^"]*)"/.exec(html)![1];
    expect(amount).toContain('-webkit-text-stroke');
    expect(amount).toContain('color:transparent');
    const top = Number(/top:([0-9.]+)px/.exec(amount)![1]);
    // V = clamp(headTop + .18, .4, .6) = .4 -> 192px, then under the face band (chin .27 x 480 + 2.5%) when it would cross
    expect(top).toBeGreaterThanOrEqual(0.27 * 480);
    expect(/data-caption-word-id="f"[^>]*>\$800,000</.test(html)).toBe(true);
    expect(html).toContain('data-cinematic-satellites=""');
  });

  it('the behind layer draws only the headline (and an icon); the front layer the amount and support', () => {
    const behind = at(1700, { subjectLayer: 'behind' });
    expect(behind).toContain('data-agent-story-headline=""');
    expect(behind).not.toContain('data-agent-story-amount');
    const front = at(1700, { subjectLayer: 'front' });
    expect(front).not.toContain('data-agent-story-headline=""');
    expect(front).toContain('data-agent-story-amount="outline"');
    expect(splitsAroundSubject('look_gable')).toBe(true);
  });

  it('with nothing marked, the emphasis score picks the headline; an icon word draws its icon', () => {
    const plain = [tw('a', 'the', 0, 300), tw('b', 'seller', 300, 600), tw('c', 'kept', 600, 900), tw('d', 'calling', 900, 1200)];
    const html = renderAt('look_gable', plain, 1000, { captionGapMs: 1500, canvasHeightPx: 480 });
    expect(html).toContain('data-agent-story-scene="icon-phone"');
    expect(html).toContain('data-agent-story-icon="phone"');
    const keyword = [tw('a', 'the', 0, 300), tw('b', 'buyers', 300, 600), tw('c', 'keep', 600, 900), tw('d', 'walking', 900, 1200)];
    expect(renderAt('look_gable', keyword, 1000, { captionGapMs: 1500, canvasHeightPx: 480 })).toContain('data-agent-story-scene="headline"');
  });
});

describe('the property reels as scenes: Hassock, Iron, Jamb', () => {
  const ts = Array.from({ length: 25 }, (_, i) => i * 250);
  const face = { v: 1, t: ts, cx: ts.map(() => 0.5), headTop: ts.map(() => 0.11), faceTop: ts.map(() => 0.17), faceBottom: ts.map(() => 0.27) };
  const base = { captionGapMs: 1500, canvasHeightPx: 480, faceTrack: face, captionYPercent: 47 };
  const counterWords = [tw('a', 'this', 700, 900), tw('b', 'listing', 900, 1250), tw('c', 'reached', 1300, 1650), tw('d', '1,800,000', 1700, 2600), tw('e', 'views', 2650, 3000)];

  it('Hassock counts a figure up in a gradient inception, its setup above it, the rest sliding below', () => {
    const early = renderAt('look_hassock', counterWords, 1800, base);
    expect(early).toContain('data-property-reel="reach-counter"');
    expect(early).toContain('data-property-treatment="counter"');
    expect(early).toContain('data-reel-ink="inception"');
    expect(early).toContain('data-reel-counter="1800000"');
    // 100ms in: the count is on its cubic ease, well under the figure
    const shown = /data-reel-ink="inception"[^>]*>([\d,]+)</.exec(early)![1];
    expect(Number(shown.replace(/,/g, ''))).toBeLessThan(1800000);
    expect(Number(shown.replace(/,/g, ''))).toBeGreaterThan(0);
    const late = renderAt('look_hassock', counterWords, 2400, base);
    expect(/data-reel-ink="inception"[^>]*>1,800,000</.test(late)).toBe(true);
    expect(late).toContain('data-number-attached-caption="above"');                 // "this listing reached"
    expect(late).toContain('font-family:Roboto, sans-serif');                       // their figures face
    expect(/data-caption-word-id="a"[^>]*>(?:<span[^>]*>)?this</.test(late)).toBe(true);   // a slide word wraps its text
    expect(renderAt('look_hassock', counterWords, 2800, base)).toContain('data-number-attached-caption="below"');   // "views"
  });

  it('Hassock without a figure: a keyword headline, quiet word slots for the rest', () => {
    const ws = [tw('a', 'buyers', 0, 300), tw('b', 'are', 300, 500), tw('c', 'already', 500, 900), tw('d', 'watching', 900, 1300)];
    const html = renderAt('look_hassock', ws, 1000, base);
    expect(html).toContain('data-property-treatment="headline"');
    expect(/data-reel-ink="inception"[^>]*>.*already/.test(html)).toBe(true);
  });

  it('Iron outlines a lakh figure with its unit beside it, glows and banners its magenta moments', () => {
    const lakh = [tw('a', 'listed', 1100, 1400), tw('b', 'at', 1450, 1550), tw('c', '20', 1650, 1950), tw('d', 'lakh', 2000, 2400)];
    const html = renderAt('look_iron', lakh, 2100, base);
    expect(html).toContain('data-property-reel="magenta-estate"');
    expect(html).toContain('data-property-treatment="outline"');
    expect(html).toContain('data-reel-ink="outline-inception"');
    expect(/<svg[^>]*data-reel-ink="outline-inception"[^>]*style="[^"]*mix-blend-mode:difference/.test(html)).toBe(true);
    expect(/<text[^>]*stroke="url\(#reel-stroke-[^"]+\)"[^>]*>20</.test(html)).toBe(true);
    expect(/>lakh</.test(html)).toBe(true);                                             // the unit, small, beside it
    const glow = renderAt('look_iron', [tw('a', 'a', 0, 200), tw('b', 'great', 200, 500), tw('c', 'investment', 500, 1000), tw('d', 'possible', 1000, 1400)], 1100, base);
    expect(glow).toContain('data-property-treatment="glow"');
    expect(glow).toContain('background:#D500EE');
    const banner = renderAt('look_iron', [tw('a', 'only', 0, 200), tw('b', 'in', 200, 400), tw('c', 'punjab', 400, 800), tw('d', 'today', 800, 1200)], 900, base);
    expect(banner).toContain('data-property-treatment="banner"');
    expect(banner).toContain('rotate(-9deg)');
  });

  it('Jamb plays beats: heroes in cycling accents as inceptions, planes alternating behind and front', () => {
    const ws = [tw('a', 'Some', 600, 850), tw('b', 'homes', 900, 1150), tw('c', 'get', 1200, 1350), tw('d', 'seen', 1400, 1900, true), tw('e', 'a', 2000, 2100), tw('f', 'few', 2100, 2300), tw('g', 'get', 2300, 2450), tw('h', 'remembered', 2500, 3000)];
    const html = renderAt('look_jamb', ws, 1500, base);
    expect(html).toContain('data-property-reel="dimension-story"');
    expect(html).toContain('data-reel-ink="inception"');
    expect(/data-caption-word-id="d"[^>]*>seen</.test(html)).toBe(true);              // the marked word is the beat's hero
    expect(html).toContain('data-dimension-support="above-hero"');                     // a behind beat: its words above the hero
    expect(html).toContain('#AF48F4');                                                  // the first accent
    const later = renderAt('look_jamb', ws, 2600, base);
    expect(later).toContain('data-dimension-plane="front"');
    expect(later).toContain('#47D8EC');
    // the behind layer draws only the behind beats' hero ink; the front layer their support and the front beats
    expect(renderAt('look_jamb', ws, 1500, { ...base, subjectLayer: 'behind' })).not.toContain('data-dimension-support');
    expect(renderAt('look_jamb', ws, 1500, { ...base, subjectLayer: 'front' })).toContain('data-dimension-support="above-hero"');
    for (const id of ['look_jamb', 'look_hassock', 'look_iron']) expect(splitsAroundSubject(id), id).toBe(true);
  });

  it('a reel groups by its own breaks: and / but / when / because, or 3.8s', async () => {
    const { segmentsForLook } = await import('./lookGrouping');
    const ws = [tw('a', 'this', 0, 300), tw('b', 'listing', 300, 600), tw('c', 'reached', 600, 900), tw('d', 'and', 900, 1200), tw('e', 'buyers', 1200, 1500), tw('f', 'watched', 1500, 1800)];
    expect(segmentsForLook(ws as never, findLookSpec('look_hassock')!)).toEqual([['a', 'b', 'c'], ['d', 'e', 'f']]);
  });
});
