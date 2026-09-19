// Editorial pull-quote: an oversized ghosted gold quotation mark, the quote itself in serif
// italic rising line-block by line-block would over-complicate — it lands as one measured
// settle — then a tracked uppercase attribution. Built for the "wisdom beat" in documentary
// edits where the footage slows and a line is worth holding on screen.

import { spring } from 'remotion';
import { defineGraphicsTemplate } from '../defineTemplate';
import { fontStack } from '../fonts';
import { FPS, clamp01, fr } from '../motion';
import { LUXE, easeOutQuint, luxeGrain, luxeLabel } from '../luxe';
import { depthPose, parallax } from '../juice';

export const luxeQuote = defineGraphicsTemplate({
  id: 'luxe_quote',
  name: 'Pull Quote',
  category: 'title',
  tags: ['Quote', 'Serif', 'Editorial', 'Luxury'],
  badge: 'New',
  design: { w: 900, h: 760 },
  // Transparent by design — floats over footage; the shared plate reads as a weird border.
  backdrop: false,
  defaultDurationMs: 5000,
  defaultBox: { xPercent: 50, yPercent: 42, widthPercent: 84 },
  fonts: ['montserrat', 'playfair'],

  elements: [
    { key: 'mark',  label: 'Quote mark' },
    { key: 'quote', label: 'Quote', hideable: false },
    { key: 'attr',  label: 'Attribution' },
  ],

  params: [
    { type: 'text', key: 'quote', label: 'Quote', group: 'Content', default: 'Discipline is choosing what you want most over what you want now.', maxLength: 140, multiline: true },
    { type: 'text', key: 'attr',  label: 'Attribution', group: 'Content', default: '— IMAN GADZHI', maxLength: 40 },
    { type: 'image', key: 'attrImg', label: 'Author photo', group: 'Content', default: '', help: 'Optional — adds a small round headshot beside the attribution; nothing when empty.' },

    { type: 'color', key: 'accent', label: 'Accent', group: 'Style', default: '#F59E0B' },
    { type: 'color', key: 'ink',    label: 'Text',   group: 'Style', default: '#F4F1E8' },

    { type: 'number', key: 'delay', label: 'Delay', group: 'Motion', default: 0, min: 0, max: 2000, step: 20, unit: 'ms' },
  ],

  // The wisdom beat whispers: one air pass as the line racks into focus, one luxe ping when the
  // attribution sets — the same 250ms / 850ms beats the motion is cut to, off the same delay.
  sfx: (p) => [
    { atMs: p.delay + 250, id: 'whoosh', gain: 0.4 },
    { atMs: p.delay + 850, id: 'glass', gain: 0.28 },
  ],

  render: ({ params: p, el, timeMs, width, height, seed }) => {
    const t = timeMs - p.delay;

    const markIn = easeOutQuint(clamp01(t / 700));
    const quoteIn = spring({
      frame: fr(t - 250), fps: FPS,
      config: { damping: 36, mass: 0.9, stiffness: 110 },
      durationInFrames: Math.max(1, Math.round(fr(800))),
    });
    const attrIn = easeOutQuint(clamp01((t - 850) / 600));

    const fsQuote = Math.round(height * 0.072);
    const fsAttr = Math.round(height * 0.03);
    const fsMark = Math.round(height * 0.42);
    // Optional headshot chip beside the attribution — exists only when a photo is set.
    const chip = Math.round(fsAttr * 2.4);

    // The page lives in space: it turns in on a shallow top hinge with the quote's own spring,
    // then breathes at ±1.4° on a slow 4.8s period — a pull-quote is a held beat, not a slam.
    const pose = depthPose(t, seed, { enter: quoteIn, rx: -8, ry: 6, z: -60, swayDeg: 1.4, periodMs: 4800 });
    // Ghost mark far behind, quote on the page, attribution proud of it — three depths, so the
    // breath SHEARS the layers instead of sliding one flat card.
    const parMark = parallax(t, seed, 0.25, height * 0.014, 4800);
    const parAttr = parallax(t, seed, 0.7, height * 0.014, 4800);
    // RACK FOCUS — the documentary language for "this line matters". Dead sharp at rest.
    const focusQuote = (1 - quoteIn) * height * 0.008;
    const focusMark = (1 - markIn) * height * 0.01;

    return (
      <div style={{ position: 'absolute', inset: 0, transform: pose }}>
        <span
          style={{
            position: 'absolute', left: width * 0.02, top: -height * 0.06,
            fontFamily: fontStack('playfair'), fontWeight: 700,
            fontSize: fsMark, lineHeight: 1, color: p.accent,
            opacity: 0.22 * markIn,
            filter: focusMark > 0.3 ? `blur(${focusMark.toFixed(2)}px)` : undefined,
            transform: `translate(${parMark.x.toFixed(2)}px, ${(parMark.y + (1 - markIn) * -height * 0.03).toFixed(2)}px)`,
            ...el('mark'),
          }}
        >
          &ldquo;
        </span>

        <div
          style={{
            position: 'absolute', left: width * 0.08, right: width * 0.06, top: height * 0.2,
            fontFamily: fontStack('playfair'), fontStyle: 'italic', fontWeight: 500,
            fontSize: fsQuote, lineHeight: 1.35, color: p.ink,
            opacity: quoteIn,
            filter: focusQuote > 0.3 ? `blur(${focusQuote.toFixed(2)}px)` : undefined,
            transform: `translateY(${((1 - quoteIn) * height * 0.025).toFixed(2)}px)`,
            ...el('quote'),
          }}
        >
          {p.quote}
        </div>

        {p.attrImg && (
          <div
            style={{
              position: 'absolute', left: width * 0.08,
              bottom: height * 0.09 - (chip - fsAttr * 1.2) / 2,
              width: chip, height: chip,
              borderRadius: '50%', overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.22)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
              opacity: attrIn,
              transform: `translate(${(parAttr.x + (1 - attrIn) * -width * 0.015).toFixed(2)}px, ${parAttr.y.toFixed(2)}px)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.attrImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        )}

        <span
          style={{
            position: 'absolute', left: width * 0.08 + (p.attrImg ? chip + fsAttr * 0.8 : 0), bottom: height * 0.09,
            ...luxeLabel(fsAttr, LUXE.inkDim),
            opacity: attrIn,
            transform: `translate(${(parAttr.x + (1 - attrIn) * -width * 0.015).toFixed(2)}px, ${parAttr.y.toFixed(2)}px)`,
            ...el('attr'),
          }}
        >
          {p.attr}
        </span>

        <div style={luxeGrain(0.04)} />
      </div>
    );
  },
});
