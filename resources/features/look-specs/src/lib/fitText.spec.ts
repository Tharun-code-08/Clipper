import { describe, it, expect } from 'vitest';
import { charUnit, estTextWidth, fitRowScale, fitWordScale, fontWeightFactor, fontWidthFactor } from './fitText';

describe('fitText', () => {
  it('charUnit covers the char classes with sane relative widths', () => {
    expect(charUnit('m')).toBeGreaterThan(charUnit('a'));
    expect(charUnit('a')).toBeGreaterThan(charUnit('i'));
    expect(charUnit('W')).toBeGreaterThan(charUnit('A'));
    expect(charUnit('ी')).toBeLessThan(charUnit('क'));   // matra (combining) narrower than a full letter
    expect(charUnit(' ')).toBeGreaterThan(0);
  });

  it('Indic spacing vowel signs are full glyphs; viramas add no advance', () => {
    expect(charUnit('ா')).toBeGreaterThan(0.5);          // Tamil aa sign (spacing)
    expect(charUnit('ൊ')).toBeGreaterThan(0.5);          // Malayalam o sign (spacing, two-part)
    expect(charUnit('்')).toBe(0);                       // Tamil pulli
    expect(charUnit('्')).toBe(0);                       // Devanagari virama
    expect(charUnit('।')).toBeLessThan(charUnit('क'));   // danda is narrow
  });

  // The fit shrinks a row until its ESTIMATE fills the box, so an estimate below the real width is
  // clipped verbatim — which is exactly how these captions got cut. Widths below were MEASURED in
  // Chrome on 2026-09-16 against the bundled caption fonts.

  // Worst width in em of real words across every caption font stack at weight 400–900, inside the
  // template's Latin stack AND inside the script's Noto face.
  const INDIC: Record<string, Record<string, number>> = {
    devanagari: { 'साल': 1.871, 'का': 1.221, 'जो': 1.131, 'अभी': 2.056, 'भी': 1.148, 'अपनी': 2.524, 'उसके': 2.487, 'लिए': 1.734, 'हमें': 1.386 },
    tamil: { 'இந்த': 3.17, 'வீடியோ': 4.852, 'மிகவும்': 4.423, 'அருமையாக': 7.559, 'உள்ளது': 4.809 },
    bengali: { 'আমি': 2.42, 'আজকে': 3.88, 'নতুন': 2.335, 'ভিডিও': 3.112, 'বানাচ্ছি': 3.62 },
    malayalam: { 'നമസ്കാരം': 6.074, 'മലയാളം': 5.528, 'വീഡിയോ': 6.585 },
    telugu: { 'నమస్కారం': 5.714, 'తెలుగు': 3.475, 'వీడియో': 3.764 },
    kannada: { 'ನಮಸ್ಕಾರ': 4.186, 'ಕನ್ನಡ': 2.346, 'ವಿಡಿಯೋ': 4.032 },
    gujarati: { 'નમસ્તે': 2.731, 'ગુજરાતી': 3.592, 'શબ્દ': 2.114, 'વાત': 1.791 },
    gurmukhi: { 'ਸਤਿ': 1.694, 'ਪੰਜਾਬੀ': 2.679, 'ਵੀਡੀਓ': 2.735, 'ਗੱਲ': 1.766 },
    oriya: { 'ନମସ୍କାର': 3.421, 'ଓଡ଼ିଆ': 2.531, 'ଭିଡିଓ': 2.464 },
  };
  it.each(Object.entries(INDIC))('a caption row of %s words is never under-counted', (_script, words) => {
    const real = Object.values(words).reduce((a, b) => a + b, 0);
    const est = Object.keys(words).reduce((a, w) => a + estTextWidth(w, 1), 0);
    expect(est).toBeGreaterThanOrEqual(real);
  });

  // Inter at CAPTION sizes (11–14px — rows render on the 270px logical canvas, then scale up), in em
  // per the weight's fontWeightFactor. Its optical sizing draws small text ~9% wider than at 100px.
  const INTER_SMALL: Record<number, Record<string, number>> = {
    400: { engineering: 5.62, graduate: 4.218, honestly: 4.03, life: 1.409, bhai: 2.009, editing: 3.212, bilkul: 2.48, zabardast: 4.686, unbelievable: 5.982, transformation: 6.915, happening: 4.999, everywhere: 5.58, minimum: 4.296, illicit: 2.109, prepare: 3.682, Because: 4.083, WORLD: 3.682, STORY: 3.317, IMPACT: 3.77, EXTRAORDINARY: 8.33 },
    600: { engineering: 5.62, graduate: 4.208, honestly: 4.066, life: 1.437, bhai: 2.013, editing: 3.233, bilkul: 2.516, zabardast: 4.684, unbelievable: 5.987, transformation: 6.959, happening: 4.988, everywhere: 5.577, minimum: 4.32, illicit: 2.179, prepare: 3.656, Because: 4.049, WORLD: 3.605, STORY: 3.282, IMPACT: 3.738, EXTRAORDINARY: 8.284 },
    900: { engineering: 5.535, graduate: 4.128, honestly: 4.062, life: 1.46, bhai: 1.989, editing: 3.219, bilkul: 2.536, zabardast: 4.61, unbelievable: 5.905, transformation: 6.925, happening: 4.897, everywhere: 5.49, minimum: 4.292, illicit: 2.257, prepare: 3.56, Because: 3.935, WORLD: 3.426, STORY: 3.177, IMPACT: 3.63, EXTRAORDINARY: 8.084 },
  };
  it.each(Object.keys(INTER_SMALL))('every Latin word at Inter %s, caption size, is covered', (wt) => {
    for (const [word, em] of Object.entries(INTER_SMALL[Number(wt)])) {
      expect(estTextWidth(word, 1), word).toBeGreaterThanOrEqual(em);
    }
  });

  it('Open Sans (Illusion) is covered by its family factor', () => {
    const OPEN_SANS_700 = { graduate: 4.543, happening: 5.303, bhai: 2.2, editing: 3.491, bilkul: 2.827, transformation: 7.71, minimum: 4.872 };
    for (const [word, em] of Object.entries(OPEN_SANS_700)) {
      expect(estTextWidth(word, 1, fontWidthFactor("'Open Sans', sans-serif")), word).toBeGreaterThanOrEqual(em);
    }
  });

  it('the Latin family factor does not scale Indic glyphs (they come from the script fallback)', () => {
    expect(estTextWidth('தமிழ்', 10, 1.3)).toBeCloseTo(estTextWidth('தமிழ்', 10));
    expect(estTextWidth('साल life', 10, 1.3)).toBeCloseTo(estTextWidth('साल', 10) + estTextWidth(' life', 10, 1.3));
  });

  it('estTextWidth scales linearly with fontPx and factor', () => {
    const w = estTextWidth('hello', 10);
    expect(estTextWidth('hello', 20)).toBeCloseTo(w * 2);
    expect(estTextWidth('hello', 10, 1.5)).toBeCloseTo(w * 1.5);
    expect(estTextWidth('', 10)).toBe(0);
  });

  it('fitRowScale is exactly 1 when the row fits (no visual change for fitting captions)', () => {
    // "hi there" at 10px is ~75px wide — fits a 500px box with margin.
    expect(fitRowScale([{ text: 'hi', fontPx: 10 }, { text: 'there', fontPx: 10 }], 6, 500)).toBe(1);
  });

  it('fitRowScale shrinks an overflowing row so scaled text + fixed gaps exactly fill the box', () => {
    const items = [{ text: 'SUBSCRIBE', fontPx: 100 }, { text: 'NOW', fontPx: 100 }];
    const gap = 6;
    const box = 300;
    const fit = fitRowScale(items, gap, box);
    expect(fit).toBeLessThan(1);
    expect(fit).toBeGreaterThan(0);
    // Gaps are FIXED pixels (they don't shrink with the font): text×fit + gaps == box.
    const text = items.reduce((s, it) => s + estTextWidth(it.text, it.fontPx), 0);
    expect(text * fit + gap).toBeCloseTo(box, 5);
  });

  it('fitRowScale floors at 0.15 when fixed gaps swallow the box', () => {
    const items = [{ text: 'aa', fontPx: 10 }, { text: 'aa', fontPx: 10 }];
    // text ≈ 24px, gaps = 200 → budget vs box 201 is ~1px → floored, text stays legible.
    expect(fitRowScale(items, 200, 201)).toBe(0.15);
  });

  it('fitRowScale counts inter-word gaps', () => {
    const one  = fitRowScale([{ text: 'aaaa', fontPx: 50 }], 20, 100);
    const many = fitRowScale([{ text: 'aa', fontPx: 50 }, { text: 'aa', fontPx: 50 }], 20, 100);
    expect(many).toBeLessThan(one); // same glyphs + one gap → needs more shrink
  });

  it('fitWordScale keys on the single widest word only', () => {
    const items = [
      { text: 'a', fontPx: 20 },
      { text: 'Anticonstitutionally', fontPx: 20 },
    ];
    const fit = fitWordScale(items, 100);
    expect(fit).toBeLessThan(1);
    expect(estTextWidth('Anticonstitutionally', 20) * fit).toBeCloseTo(100, 5);
    // A short word alone fits → 1.
    expect(fitWordScale([{ text: 'a', fontPx: 20 }], 100)).toBe(1);
  });

  it('degenerate inputs are safe no-ops', () => {
    expect(fitRowScale([], 6, 100)).toBe(1);
    expect(fitWordScale([], 100)).toBe(1);
    expect(fitRowScale([{ text: 'x', fontPx: 10 }], 6, 0)).toBe(1);
  });

  it('mixed per-word sizes (emphasis scale) are honored', () => {
    const small = fitRowScale([{ text: 'word', fontPx: 10 }, { text: 'HERO', fontPx: 10 }], 6, 80);
    const big   = fitRowScale([{ text: 'word', fontPx: 10 }, { text: 'HERO', fontPx: 40 }], 6, 80);
    expect(big).toBeLessThan(small);
  });

  it('font width factor widens the estimate (wide faces shrink more)', () => {
    const base = fitRowScale([{ text: 'template', fontPx: 50 }], 0, 100);
    const wide = fitRowScale([{ text: 'template', fontPx: 50, factor: 1.15 }], 0, 100);
    expect(wide).toBeLessThan(base);
    expect(fontWidthFactor('Montserrat, sans-serif')).toBeGreaterThan(1);
    expect(fontWidthFactor('Anton, sans-serif')).toBeLessThan(1);
    // TheBoldFont's stack falls back to Anton, but the face itself is NOT condensed.
    expect(fontWidthFactor('TheBoldFont, Anton, Impact, sans-serif')).toBeGreaterThan(1);
    expect(fontWidthFactor("'Open Sans', sans-serif")).toBeGreaterThan(1);
    expect(fontWidthFactor('Inter, sans-serif')).toBe(1);
    expect(fontWidthFactor(undefined)).toBe(1);
  });

  it('heavy weights widen the estimate; regular and unknown weights do not', () => {
    expect(fontWeightFactor(900)).toBeGreaterThan(fontWeightFactor(800));
    expect(fontWeightFactor(800)).toBeGreaterThan(fontWeightFactor(600));
    expect(fontWeightFactor(600)).toBeGreaterThan(fontWeightFactor(400));
    expect(fontWeightFactor('900')).toBe(fontWeightFactor(900));
    expect(fontWeightFactor('normal')).toBe(1);
    expect(fontWeightFactor(undefined)).toBe(1);
    const regular = fitRowScale([{ text: 'graduate', fontPx: 50 }], 0, 150);
    const heavy   = fitRowScale([{ text: 'graduate', fontPx: 50, weight: 900 }], 0, 150);
    expect(heavy).toBeLessThan(regular);
  });

  it('em letter-spacing adds per-character width', () => {
    const base    = fitRowScale([{ text: 'CINEMATIC', fontPx: 30 }], 0, 150);
    const tracked = fitRowScale([{ text: 'CINEMATIC', fontPx: 30, lsEm: 0.28 }], 0, 150);
    expect(tracked).toBeLessThan(base);
  });
});

describe('fontWidthFactor knows the display faces the look specs use', () => {
  it('DrukWide is measured wide, not assumed average', () => {
    // Measured against Inter on caption strings at 40/64/96px: 1.50-1.54. At the default 1.0 the
    // fit guard under-counted a DrukWide hero by ~52% and it rendered past both frame edges.
    expect(fontWidthFactor('DrukWide, Anton, sans-serif')).toBeCloseTo(1.52, 2);
  });

  it('DrukWide wins over Anton in its own fallback stack', () => {
    // Substring matching means order is behaviour: Anton first would return 0.84 for a face that
    // is nearly twice as wide. The same trap the theboldfont entry documents.
    expect(fontWidthFactor('DrukWide, Anton, sans-serif'))
      .not.toBeCloseTo(fontWidthFactor('Anton, sans-serif'), 2);
  });

  it('faces that measure ~1.0 are left at the baseline rather than given noise factors', () => {
    // InstrumentSans 1.013, Playfair Display 0.995 — inside the harness's own 2% control error.
    expect(fontWidthFactor('InstrumentSans, Inter, sans-serif')).toBe(1);
    expect(fontWidthFactor('"Playfair Display", serif')).toBe(1);
  });
});
