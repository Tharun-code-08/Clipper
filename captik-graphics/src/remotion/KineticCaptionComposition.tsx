import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
  random,
  delayRender,
  continueRender,
} from 'remotion';
import { useEffect, useState } from 'react';
import type { TranscriptWord, CaptionBoxConfig, TextOverrides, EmphasisStyle, LayoutMode, TemplateSlotOverrides } from '../types/transcript';
import type { BleepRange } from '../lib/profanity';
import { getFontFamily, customFontStack, indicScriptsIn } from '../lib/textParser';
import { buildTextOverrideCSS, isStyleLocked } from '../lib/styleResolve';
import { fontFamiliesFromCss } from '../lib/fontFamilies';
import {
  resolveIllusionSlots, resolveEditorMasalaSlots, resolveAuraSlots, resolveSwissSlots, resolveGlitch, resolveInAnimPose,
  type ResolvedIllusionSlots, type ResolvedEditorMasalaSlots, type ResolvedAuraSlots,
} from '../lib/kineticSlots';
import { resolveSegments } from '../lib/captionSegments';
import { INSTRUMENT_SERIF_ITALIC_DATA_URL } from './embeddedFonts';
import { Watermark } from './Watermark';

// Re-exported so CaptionExportComposition (and older imports) keep working.
export { Watermark };

function hexToRgba(hex: string, alpha: number): string {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map(c => c + c).join('') : n;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Absolute base so fonts load correctly in both the Next.js preview and Lambda.
// In the browser we use the current origin; in Lambda (Node.js / no window)
// we fall back to the deployed site URL from the environment.
function fontBase(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL ?? '';
}

export function buildFontsCss(): string {
  const b = fontBase();
  return `
@font-face { font-family: "Anton";            src: url("${b}/fonts/Anton-Regular.ttf")          format("truetype"); }
@font-face { font-family: "ClashDisplay";     src: url("${b}/fonts/ClashDisplay-Bold.ttf")      format("truetype"); }
@font-face { font-family: "DrukWide";         src: url("${b}/fonts/DrukWideBold.ttf")           format("truetype"); }
@font-face { font-family: "Futura";           src: url("${b}/fonts/Futura-Bold-font.ttf")       format("truetype"); font-weight: 700; }
@font-face { font-family: "Futura";           src: url("${b}/fonts/Futura-Heavy-font.ttf")      format("truetype"); font-weight: 900; }
@font-face { font-family: "LuckiestGuy";      src: url("${b}/fonts/LuckiestGuy-Regular.ttf")    format("truetype"); }
@font-face { font-family: "Luckiest Guy";     src: url("${b}/fonts/LuckiestGuy-Regular.ttf")    format("truetype"); }
@font-face { font-family: "Montserrat";       src: url("${b}/fonts/Montserrat-VariableFont_wght.ttf") format("truetype"); font-weight: 100 900; }
@font-face { font-family: "Montserrat Light"; src: url("${b}/fonts/Montserrat-VariableFont_wght.ttf") format("truetype"); font-weight: 300; }
@font-face { font-family: "MontserratSemiBold";    src: url("${b}/fonts/Montserrat-VariableFont_wght.ttf") format("truetype"); font-weight: 600; }
@font-face { font-family: "Poppins";          src: url("${b}/fonts/Poppins-Medium.ttf")         format("truetype"); }
@font-face { font-family: "TimesNewRomanBold"; src: url("${b}/fonts/Times-New-Roman-Bold.ttf")  format("truetype"); }
@font-face { font-family: "Times New Roman";  src: url("${b}/fonts/Times-New-Roman-Bold.ttf")  format("truetype"); }
@font-face { font-family: "VPPixel";          src: url("${b}/fonts/VPPixel-Simplified.otf")     format("opentype"); }
@font-face { font-family: "MonaSans";         src: url("${b}/fonts/MonaSans.ttf")               format("truetype"); font-weight: 400; }
@font-face { font-family: "MonaSans";         src: url("${b}/fonts/Mona-Sans-Bold.ttf")         format("truetype"); font-weight: 700; }
@font-face { font-family: "TheBoldFont";      src: url("${b}/fonts/TheBoldFont.ttf")            format("truetype"); }
@font-face { font-family: "KomikaAxis";       src: url("${b}/fonts/KomikaAxis.ttf")             format("truetype"); }
@font-face { font-family: "Inter";            src: url("${b}/fonts/Inter.ttf")                  format("truetype"); }
@font-face { font-family: "HelveticaBold";    src: url("${b}/fonts/Inter-Black.ttf")             format("truetype"); font-weight: 100 900; }
@font-face { font-family: "RubikBlack";       src: url("${b}/fonts/RubikBlack.ttf")             format("truetype"); }
@font-face { font-family: "InstrumentSans";   src: url("${b}/fonts/InstrumentSans-SemiBold.ttf") format("truetype"); }
@font-face { font-family: "LobsterTwoItalic"; src: url("${b}/fonts/LobsterTwo-Italic.ttf")      format("truetype"); }
@font-face { font-family: "InstrumentSerifItalic"; src: url("${INSTRUMENT_SERIF_ITALIC_DATA_URL}") format("woff2"); font-style: italic; }
@font-face { font-family: "Open Sans";        src: url("${b}/fonts/OpenSans-Variable.ttf") format("truetype"); font-weight: 300 800; }
@font-face { font-family: "Playfair Display"; src: url("${b}/fonts/PlayfairDisplay-Italic.ttf") format("truetype"); font-style: italic; font-weight: 400 900; }
`;
}

// Indic caption faces are split OUT of buildFontsCss and registered on demand: a single
// non-Latin export would otherwise fetch (and the font-wait below would BLOCK on) every Noto
// Indic face on every render, including pure-English ones. buildIndicFontsCss(text) emits an
// @font-face only for the scripts ACTUALLY present in the caption text, so an English export is
// byte-identical to before (returns ''), while a Malayalam/Telugu/… export registers exactly the
// one face it needs. The family names match getFontFamily()'s per-script return so the caption
// <span>s resolve to a real, loaded face instead of tofu boxes in the rendered MP4.
export function buildIndicFontsCss(text: string): string {
  const b = fontBase();
  return indicScriptsIn(text)
    .map(s => `@font-face { font-family: "${s.family}"; src: url("${b}/fonts/${s.file}") format("woff2"); font-weight: 100 900; font-display: block; }`)
    .join('\n');
}

// Templates whose look IS their typography (pixel font, editorial serif/script pairings,
// the italic emphasis faces). The user's custom/Google font must NOT override these — their
// branches mark their container with data-cfont-lock, which the override CSS excludes.
// Keep in sync with the same attribute in CaptionOverlay (preview).
export const FONT_LOCKED_STYLES: CaptionStyleId[] = ['aura', 'aura_helvetica', 'pixelated', 'delhi', 'editor_masala'];

// Family names that buildFontsCss already registers (Anton, Inter, "Luckiest Guy", …). Computed
// once from the CSS itself so it can never drift from the real @font-face set. The base URL in
// buildFontsCss doesn't affect the extracted names, so a single evaluation is safe.
let _builtinFamilies: Set<string> | null = null;
function isBuiltinFontFamily(name: string): boolean {
  if (!_builtinFamilies) _builtinFamilies = new Set(fontFamiliesFromCss(buildFontsCss()));
  return _builtinFamilies.has(name.trim());
}

// Builds the CSS that registers a user-selected custom font (uploaded / Google) and
// forces it onto every caption <span> via an !important rule — EXCEPT spans inside a
// [data-cfont-lock] container (the font-locked templates above). Only caption text uses
// <span>; the watermark is a <div>, so it keeps its own font. Empty when no font is set.
export function buildCustomFontCss(customFontName?: string, customFontDataUrl?: string): string {
  if (!customFontName) return '';
  let css = '';
  if (customFontDataUrl) {
    // Register the binary under a UNIQUE alias, not the user-visible name: built-in names
    // (Anton, Inter, …) already have URL-based @font-face entries in buildFontsCss, and a
    // same-family collision lets the (Lambda-flaky) URL face shadow this data face. The alias
    // leads the stack; the real name follows as fallback.
    css += `@font-face { font-family: "CaptikCustomFontData"; src: url("${customFontDataUrl}"); font-display: block; }\n`;
    // Also register the binary under the user-VISIBLE name (e.g. "Bebas Neue") so a caption that
    // references it BY NAME resolves to the embedded face instead of a fallback in the export — the
    // Emphasis-font dropdown can select the global custom font, and per-line / Text-tab overrides
    // carry their own fontFamily. Skip built-in names: those already have a buildFontsCss face and
    // selecting them means "use the built-in" (this is exactly the alias collision warned about above).
    const safeName = customFontName.replace(/['"\\]/g, '').trim();
    if (safeName && !isBuiltinFontFamily(customFontName)) {
      css += `@font-face { font-family: "${safeName}"; src: url("${customFontDataUrl}"); font-display: block; }\n`;
    }
    css += `span:not([data-cfont-lock] *) { font-family: "CaptikCustomFontData", ${customFontStack(customFontName)} !important; }\n`;
  } else {
    css += `span:not([data-cfont-lock] *) { font-family: ${customFontStack(customFontName)} !important; }\n`;
  }
  return css;
}

const StylesAndFonts = ({ customFontName, customFontDataUrl }: { customFontName?: string; customFontDataUrl?: string }) => (
  <style dangerouslySetInnerHTML={{ __html: buildFontsCss() + buildCustomFontCss(customFontName, customFontDataUrl) }} />
);


function buildPhrases(words: TranscriptWord[], n = 5): TranscriptWord[][] {
  const out: TranscriptWord[][] = [];
  for (let i = 0; i < words.length; i += n) out.push(words.slice(i, i + n));
  return out;
}

export type CaptionStyleId =
  | 'captik_glow' | 'ali_abdaal' | 'captik_shadow' | 'captik'
  | 'clean_motion' | 'bubble'
  | 'hormozi' | 'boxed' | 'mrbeast' | 'mr_beast_2'
  | 'iman_gadzhi' | 'prism' | 'highlighted_word'
  | 'clean_glow' | 'captik_clean' | 'black_punch'
  | 'captik_word' | 'pixelated' | 'dynamic'
  | 'liquid_glass' | 'tabahi'
  | 'deep_glow' | 'seedha_saadha' | 'thora_cinematic'
  | 'delhi' | 'devin_jatho'
  | 'illusion'
  | 'editor_masala'
  | 'aura'
  | 'aura_helvetica'
  | 'big_reveal';

export interface KineticCaptionProps {
  videoSrc:         string;
  words:            TranscriptWord[];
  dominantColor:    string;
  accentColor:      string;
  bleepRanges:      BleepRange[];
  captionStyle:     CaptionStyleId;
  captionSegments?: string[][];
  captionTextColor?: string;
  isPro?:           boolean;
  captionBox?:           CaptionBoxConfig;
  segmentBoxOverrides?:  Record<string, CaptionBoxConfig>;
  segmentStyleOverrides?: Record<string, CaptionStyleId>;
  captionFontScale?: number;
  captionLines?:    'single' | 'double';   // 'single' = one clipped row (matches the preview default)
  noVideo?:         boolean;
  customFontName?:    string;  // overrides every style's font in the export
  customFontDataUrl?: string;  // data: URL of the font binary so Lambda's Chrome can load it
  // Reference-parity styling (Text tab). Locked templates ignore them.
  textOverrides?:     TextOverrides;
  emphasisStyle?:     EmphasisStyle;
  layoutMode?:        LayoutMode;
  /** Per-line typography overrides keyed by segment first-word id. */
  lineTextOverrides?: Record<string, Partial<TextOverrides>>;
  /** Per-template slot overrides (editor_masala / illusion / aura) — global. */
  templateSlots?:     TemplateSlotOverrides;
  /** Per-line slot overrides keyed by segment first-word id. */
  lineSlotOverrides?: Record<string, TemplateSlotOverrides>;
}

// Outer component: wraps the style branches in the [data-captik-tov] scope and
// injects the Text-tab override CSS — the same !important mechanism as the
// custom-font override, scaled by RS so export pixels match the preview. Per-line
// typography merges over the global overrides for whichever segment is on screen
// this frame (same LEAD/TAIL window the style branches use).
export function KineticCaptionComposition(props: KineticCaptionProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const { captionStyle = 'hormozi', textOverrides, emphasisStyle, captionFontScale = 1.0, lineTextOverrides, words, captionSegments } = props;
  const RS = width < height ? width / 270 : width / 640;
  const locked = isStyleLocked(captionStyle);

  let effective = textOverrides;
  if (!locked && lineTextOverrides && Object.keys(lineTextOverrides).length && captionSegments?.length) {
    const currentMs = (frame / fps) * 1000;
    const wordMap = new Map(words.map(w => [w.id, w]));
    for (const seg of captionSegments) {
      const sw = seg.map(id => wordMap.get(id)).filter((w): w is TranscriptWord => !!w);
      if (sw.length && currentMs >= sw[0].startMs - 80 && currentMs <= sw[sw.length - 1].endMs + 150) {
        const lineText = lineTextOverrides[seg[0]];
        if (lineText) effective = { ...textOverrides, ...lineText };
        break;
      }
    }
  }

  const tovCSS = (locked || !effective)
    ? ''
    : buildTextOverrideCSS(effective, emphasisStyle, n => Math.round(n * RS * captionFontScale * 10) / 10);
  return (
    <div data-captik-tov="" style={{ position: 'absolute', inset: 0 }}>
      {tovCSS && <style dangerouslySetInnerHTML={{ __html: tovCSS }} />}
      <KineticCaptionInner {...props} />
    </div>
  );
}

function KineticCaptionInner({
  videoSrc, words, dominantColor, accentColor, captionTextColor = '#ffffff',
  bleepRanges, captionStyle: captionStyleBase = 'hormozi', captionSegments, isPro = false,
  captionLines = 'single',
  captionBox = { xPercent: 50, yPercent: 85, widthPercent: 84 },
  segmentBoxOverrides = {},
  segmentStyleOverrides = {},
  captionFontScale = 1.0,
  noVideo = false,
  customFontName,
  customFontDataUrl,
  emphasisStyle,
  layoutMode = 'splash',
  templateSlots,
  lineSlotOverrides = {},
}: KineticCaptionProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  // Scale preview canvas → export resolution (270px wide for portrait, 640px for landscape)
  const RS = width < height ? width / 270 : width / 640;
  const sz = (n: number) => Math.round(n * RS * captionFontScale);
  const szBlur = (n: number) => Math.round(n * Math.pow(RS, 0.72) * captionFontScale);
  const ff = (w?: TranscriptWord) => w ? getFontFamily(w.text) : 'system-ui, sans-serif';

  // Hold Lambda frame capture until every bundled @font-face (and any custom font) has actually
  // loaded. Fonts load lazily — only when their text is first drawn — so a heavily-used face
  // (e.g. Open Sans) wins the race while a sparsely-used one (editor_masala's persona-A
  // InstrumentSerifItalic, drawn only on the occasional hero word) renders a fallback before it
  // loads, so the export doesn't match the preview. PRE-LOADING every family up front fixes it.
  // Mirrors the font wait CaptionExportComposition already does for the in-browser path.
  const [fontHandle] = useState(() => delayRender('Loading caption fonts'));
  useEffect(() => {
    let alive = true;
    const finish = () => { if (alive) continueRender(fontHandle); };
    if (typeof document === 'undefined' || !document.fonts) { finish(); return; }
    const families = fontFamiliesFromCss(buildFontsCss());
    if (customFontName) families.push(customFontName);
    if (customFontDataUrl) families.push('CaptikCustomFontData');   // the data-URL alias face
    // Load BOTH normal and italic of every family — InstrumentSerifItalic is registered as
    // font-style:italic, so a normal-only request would skip it and it would lose the race.
    Promise.all(families.flatMap(f => [
      document.fonts.load(`64px "${f}"`).catch(() => {}),
      document.fonts.load(`italic 64px "${f}"`).catch(() => {}),
    ]))
      .then(() => document.fonts.ready)
      .then(finish)
      .catch(finish);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontHandle]);


  const phraseMaxW    = Math.round(width * 0.88);
  // Mirrors the preview's captionLines toggle: 'single' = one non-wrapping (clipped) row,
  // 'double' = wrap. The preview defaults to 'single', so the export must too.
  const rowWrap: React.CSSProperties['flexWrap'] = captionLines === 'single' ? 'nowrap' : 'wrap';

  const isBleep = bleepRanges.some(r => currentMs >= r.startMs && currentMs <= r.endMs);
  const volume  = isBleep ? 0 : 1;

  const activeWord     = words.find(w => currentMs >= w.startMs && currentMs <= w.endMs);
  const wordStartFrame = activeWord ? Math.floor((activeWord.startMs / 1000) * fps) : 0;
  const relativeFrame  = Math.max(0, frame - wordStartFrame);

  // Segment-aware phrase lookup
  const wordMap = new Map(words.map(w => [w.id, w]));

  // Display window matches the preview (CaptionOverlay): caption shows LEAD ms before its
  // first word and clears TAIL ms after its last word — no bridging to the next segment,
  // so captions disappear during pauses and track the speech.
  const LEAD = 80;
  const TAIL = 150;
  // Resolve segments to word lists + raw time spans (drop segments whose words are gone).
  // Hoisted so currentPhrase can tell "segments exist and resolve" from "segments exist but
  // every one references dead word IDs" — the latter must NOT blank the screen. Shared with
  // CaptionOverlay via resolveSegments so preview and export stay byte-for-byte in agreement.
  const resolvedSegs = resolveSegments(captionSegments, words);

  const segWords: TranscriptWord[] | null = (() => {
    for (let i = 0; i < resolvedSegs.length; i++) {
      const cur = resolvedSegs[i], prev = resolvedSegs[i - 1], next = resolvedSegs[i + 1];
      // LEAD/TAIL grace extends into SILENCE only — clamp it at the neighbouring segments so a
      // finished caption hands off cleanly to the next instead of overlapping it (matches
      // CaptionOverlay).
      const winStart = Math.max(cur.startMs - LEAD, prev ? prev.endMs : -Infinity);
      const winEnd   = Math.min(cur.endMs + TAIL, next ? next.startMs : Infinity);
      if (currentMs >= winStart && currentMs <= winEnd) return cur.sw;
    }
    return null;
  })();

  const currentPhrase = (() => {
    if (segWords) return segWords;
    // Segments are authoritative ONLY when at least one resolves to live words: no active
    // segment = no caption (matches CaptionOverlay + the .ass export). Falling back to
    // buildPhrases then would invent phantom captions in the pauses. BUT if segments exist and
    // EVERY one references word IDs that are gone (e.g. after a remap/restore), don't blank the
    // screen — fall through to ad-hoc chunking so captions still show.
    if (resolvedSegs.length) return null;
    const phrases = buildPhrases(words);
    return phrases.find(p =>
      p.length > 0 && currentMs >= p[0].startMs - LEAD && currentMs <= p[p.length - 1].endMs + TAIL,
    ) ?? null;
  })();

  const currentSegIdx: number = (() => {
    if (!captionSegments) return -1;
    const activeId = activeWord?.id ?? (currentPhrase?.[0]?.id ?? null);
    if (!activeId) return -1;
    return captionSegments.findIndex(seg => seg.includes(activeId));
  })();

  const nextSegWords: TranscriptWord[] | null = (() => {
    if (!captionSegments || currentSegIdx < 0 || currentSegIdx >= captionSegments.length - 1) return null;
    return captionSegments[currentSegIdx + 1]
      .map(id => wordMap.get(id))
      .filter((w): w is TranscriptWord => !!w);
  })();

  // Word-level spring animation (pop-in for single-word and three-row styles)
  const entryScale   = activeWord ? spring({ frame: relativeFrame, fps, config: { stiffness: 400, damping: 22 } }) : 1;
  const entryOpacity = activeWord ? interpolate(relativeFrame, [0, 4], [0, 1], { extrapolateRight: 'clamp' }) : 0;
  // emphasisScale is 1 by default; kept as a multiplier slot for future per-word emphasis
  const emphasisScale = 1;

  // Phrase-level fade-in
  const phraseEntryFrame = currentPhrase ? Math.floor((currentPhrase[0].startMs / 1000) * fps) : 0;
  const phraseOpacity    = currentPhrase
    ? interpolate(Math.max(0, frame - phraseEntryFrame), [0, 6], [0, 1], { extrapolateRight: 'clamp' })
    : 0;

  const VIDEO = (
    <>
      {!noVideo && <OffthreadVideo src={videoSrc} style={{ width: '100%', height: '100%', objectFit: 'contain' }} volume={volume} />}
      <StylesAndFonts customFontName={customFontName} customFontDataUrl={customFontDataUrl} />
    </>
  );

  // Key matches page.tsx — first word ID of the segment, not a stringified index.
  // segmentBoxOverrides is keyed by first word ID, so both renderers must agree.
  const activeSegmentKey = currentSegIdx >= 0 ? (captionSegments?.[currentSegIdx]?.[0] ?? null) : null;
  const effectiveBox: CaptionBoxConfig = (activeSegmentKey ? segmentBoxOverrides?.[activeSegmentKey] : undefined)
    ?? captionBox;
  // Per-segment style override — falls back to the global captionStyle.
  const captionStyle: CaptionStyleId = (activeSegmentKey ? segmentStyleOverrides?.[activeSegmentKey] : undefined)
    ?? captionStyleBase;

  // Position wrapper shared by most styles.
  // NOTE: most style branches spread this into <AbsoluteFill>, which defaults to
  // top/left/right/bottom:0, height:100%, flexDirection:column. We only override
  // top/left/width/transform, so the leftover right/bottom/height made the caption
  // anchor against a full-height container — placing it differently from the preview
  // (which uses a plain positioned <div>). Explicitly neutralise those defaults so the
  // block is a thin auto-height box centred on (xPercent, yPercent), matching preview.
  const captionPos: React.CSSProperties = {
    position: 'absolute',
    top: `${effectiveBox.yPercent}%`,
    left: `${effectiveBox.xPercent}%`,
    right: 'auto',
    bottom: 'auto',
    height: 'auto',
    width: `${effectiveBox.widthPercent}%`,
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  };

  // ── helpers ───────────────────────────────────────────────────────────────

  const ctxRow = (ws: TranscriptWord[], style: React.CSSProperties) => (
    <div data-cap-row="" style={{ display: 'flex', gap: sz(5), flexWrap: 'wrap', justifyContent: 'center' }}>
      {ws.map(w => <span key={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...style }}>{w.text}</span>)}
    </div>
  );

  // isEmph: word has user-set emphasis color, scale > 1, or spotlight
  const isEmph = (w: TranscriptWord) =>
    !!(w.styleOverride?.color || (w.styleOverride?.scale && w.styleOverride.scale > 1) || w.styleOverride?.spotlight);

  // Spotlight: hero word takes the screen alone (per-word flag, or globally via
  // the Emphasis mode). Mirrors CaptionOverlay exactly.
  const isSpotlit = (w: TranscriptWord) =>
    !!(w.styleOverride?.spotlight || (emphasisStyle?.mode === 'spotlight' && isEmph(w)));
  const emphSizeMul = (emphasisStyle?.size ?? 1.4) / 1.4;
  const emphHex = emphasisStyle?.hex;

  // emphRow: captik / captik_shadow
  // Center-aligned block. Words reveal one-by-one as spoken; layout positions fixed from start.
  const emphRow = (
    phrase: TranscriptWord[],
    accentStyle: React.CSSProperties,
    contextStyle: React.CSSProperties,
    opts?: { layered?: boolean },
  ) => {
    const layered = opts?.layered ?? false;
    const revealOpacity = (w: TranscriptWord): number => {
      // captik / captik_glow / captik_shadow: words pop in instantly as spoken (no fade),
      // and the whole stack disappears with the phrase (hard cut, no fade-out).
      const startF = Math.floor((w.startMs / 1000) * fps);
      return frame >= startF ? 1 : 0;
    };
    const revealStyle = (w: TranscriptWord): React.CSSProperties => ({
      opacity: revealOpacity(w),
    });

    const outerPos: React.CSSProperties = {
      position: 'absolute',
      top: `${effectiveBox.yPercent}%`,
      left: `${effectiveBox.xPercent}%`,
      maxWidth: `${effectiveBox.widthPercent}%`,
      width: 'fit-content',
      transform: 'translate(-50%, -50%)',
      display: 'flex',
      justifyContent: 'center',
    };

    // No emphasis → progressive flat row
    if (!phrase.some(isEmph)) {
      return (
        <div style={outerPos}>
          <div data-cap-row="" style={{ display: 'flex', gap: sz(6), flexWrap: rowWrap, justifyContent: 'center', overflow: 'hidden' }}>
            {phrase.map(w => (
              <span key={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...contextStyle, ...revealStyle(w) }}>{w.text}</span>
            ))}
          </div>
        </div>
      );
    }

    // Spotlight: while a spotlit emphasized word is on screen it owns the screen —
    // hero word alone, context hidden. Mirrors CaptionOverlay.
    const spotlitNow = phrase.find(w => isSpotlit(w) && currentMs >= w.startMs);
    if (spotlitNow) {
      const emphColor = spotlitNow.styleOverride?.color ?? emphHex;
      const spotStyle: React.CSSProperties = emphColor
        ? { ...accentStyle, color: emphColor, WebkitTextFillColor: emphColor, backgroundImage: 'none' }
        : accentStyle;
      const spotSize = Math.round(Number(spotStyle.fontSize ?? sz(50)) * emphSizeMul);
      return (
        <div style={outerPos}>
          <div data-cap-row="" style={{ display: 'flex', justifyContent: 'center' }}>
            <span data-emph="" style={{ fontFamily: ff(spotlitNow), display: 'inline-block', ...spotStyle, fontSize: spotSize, ...revealStyle(spotlitNow) }}>
              {spotlitNow.text}
            </span>
          </div>
        </div>
      );
    }

    // Build sections — words reveal as spoken; layout positions fixed from start
    type Section = { pre: TranscriptWord[]; emph: TranscriptWord; trailing: TranscriptWord[] };
    const sections: Section[] = [];
    const emphIdxs = phrase.map((w, i) => isEmph(w) ? i : -1).filter(i => i >= 0);
    let cursor = 0;
    for (let si = 0; si < emphIdxs.length; si++) {
      const ei = emphIdxs[si];
      const nextEi = emphIdxs[si + 1] ?? phrase.length;
      sections.push({ pre: phrase.slice(cursor, ei), emph: phrase[ei], trailing: phrase.slice(ei + 1, nextEi) });
      cursor = nextEi;
    }

    // Flatten into role-tagged rows so layered mode can apply global z-ordering
    // (all pre behind, all emph middle, all trailing in front) + vertical overlap.
    // Center layout: every row centered, no overlap stagger (mirrors the preview).
    const centered = layoutMode === 'center';
    type RowRole = 'pre' | 'emph' | 'trailing';
    const Z: Record<RowRole, number> = { pre: 1, emph: 2, trailing: 3 };
    const align: Record<RowRole, React.CSSProperties['justifyContent']> = centered
      ? { pre: 'center', emph: 'center', trailing: 'center' }
      : { pre: 'flex-start', emph: 'center', trailing: 'flex-end' };
    const rows: { role: RowRole; key: string; content: React.ReactNode }[] = [];

    sections.forEach((sec, si) => {
      const emphColor = sec.emph.styleOverride?.color ?? emphHex ?? null;
      const sized: React.CSSProperties = emphSizeMul !== 1
        ? { ...accentStyle, fontSize: Math.round(Number(accentStyle.fontSize ?? sz(50)) * emphSizeMul) }
        : accentStyle;
      const finalAccent: React.CSSProperties = emphColor
        ? { ...sized, color: emphColor, WebkitTextFillColor: emphColor, backgroundImage: 'none' }
        : sized;
      if (sec.pre.length > 0) {
        rows.push({ role: 'pre', key: `pre${si}`, content: sec.pre.map(w => (
          <span key={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...contextStyle, ...revealStyle(w) }}>{w.text}</span>
        )) });
      }
      rows.push({ role: 'emph', key: `emph${si}`, content: (
        <span data-emph="" style={{ fontFamily: ff(sec.emph), display: 'inline-block', ...finalAccent, ...revealStyle(sec.emph) }}>{sec.emph.text}</span>
      ) });
      if (sec.trailing.length > 0) {
        rows.push({ role: 'trailing', key: `trail${si}`, content: sec.trailing.map(w => (
          <span key={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...contextStyle, ...revealStyle(w) }}>{w.text}</span>
        )) });
      }
    });

    return (
      <div style={outerPos}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: layered && !centered ? 0 : sz(2), width: 'fit-content' }}>
          {rows.map((r, idx) => (
            <div key={r.key} data-cap-row="" style={{
              display: 'flex', gap: sz(6), justifyContent: align[r.role],
              marginTop: layered && !centered && idx > 0 ? -sz(7) : 0,
              position:  layered && !centered ? 'relative' : undefined,
              zIndex:    layered && !centered ? Z[r.role] : undefined,
            }}>
              {r.content}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Phrase row: all words side-by-side, active vs inactive styling.
  // NO emphasis handling — templates using phraseRow are NOT emphasis-dependent.
  const phraseRow = (
    phrase: TranscriptWord[],
    getActive:   (w: TranscriptWord, i: number) => React.CSSProperties,
    getInactive: (w: TranscriptWord, i: number) => React.CSSProperties,
    wrapStyle?: React.CSSProperties,
    gap = sz(6),
  ) => (
    <AbsoluteFill style={{ ...captionPos, opacity: phraseOpacity }}>
      <div data-cap-row="" style={{ display: 'flex', gap, flexWrap: rowWrap, justifyContent: 'center', maxWidth: phraseMaxW, overflow: 'hidden', ...wrapStyle }}>
        {phrase.map((w, i) => {
          const active = currentMs >= w.startMs && currentMs <= w.endMs;
          const base = active ? getActive(w, i) : getInactive(w, i);
          return <span key={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...base }}>{w.text}</span>;
        })}
      </div>
    </AbsoluteFill>
  );

  // Single word pop (spring) — NO emphasis handling (caller passes the style explicitly).
  const singleWord = (style: React.CSSProperties, wrapStyle?: React.CSSProperties) => {
    if (!activeWord) return null;
    return (
      <AbsoluteFill style={captionPos}>
        <div data-cap-row="" style={{ display: 'flex', justifyContent: 'center', ...wrapStyle }}>
          <span style={{
            fontFamily: ff(activeWord),
            display: 'inline-block',
            transform: `scale(${entryScale * emphasisScale})`,
            opacity: entryOpacity,
            ...style,
          }}>
            {activeWord.text}
          </span>
        </div>
      </AbsoluteFill>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  STYLE BRANCHES — faithful match to CaptionOverlay.tsx
  // ═══════════════════════════════════════════════════════════════════════════

  // captik: no-emph → flat phrase; emph → big accent color | context small white
  if (captionStyle === 'captik') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {emphRow(currentPhrase,
          { color: accentColor, fontWeight: 900, fontSize: sz(50), textTransform: 'uppercase', lineHeight: 1, fontFamily: 'Inter, sans-serif' },
          { color: captionTextColor, fontWeight: 400, fontSize: sz(13), fontFamily: 'Inter, sans-serif', lineHeight: 1.2 },
        )}
      </AbsoluteFill>
    );
  }

  // ali_abdaal: phrase in white pill; words reveal progressively as spoken
  if (captionStyle === 'ali_abdaal') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const FADE_DL = Math.max(1, Math.round(fps * 0.1));
    const aaOpacity = (w: TranscriptWord) => {
      const sf = Math.floor((w.startMs / 1000) * fps);
      return interpolate(frame, [sf, sf + FADE_DL], [0.18, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    };
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        <AbsoluteFill style={{ ...captionPos, opacity: phraseOpacity }}>
          <div data-cap-row="" style={{ background: '#ffffff', borderRadius: sz(14), padding: `${sz(8)}px ${sz(18)}px`, display: 'flex', gap: sz(6), flexWrap: rowWrap, justifyContent: 'center', alignItems: 'baseline', overflow: 'hidden' }}>
            {currentPhrase.map(w => (
              <span key={w.id} style={{
                fontFamily: 'Poppins, sans-serif', display: 'inline-block',
                fontWeight: currentMs >= w.startMs ? 800 : 600, fontSize: sz(16),
                color: currentMs >= w.startMs ? '#000000' : '#1f2022',
                opacity: aaOpacity(w),
              }}>{w.text}</span>
            ))}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // captik_shadow: no-emph → full-size white→gray gradient reveal; emph → big accent gradient | ctx
  if (captionStyle === 'captik_shadow') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const ctxGrad: React.CSSProperties = {
      backgroundImage: `linear-gradient(to bottom, ${captionTextColor} 45%, #555555 100%)`,
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent',
      fontWeight: 800, fontSize: sz(15), fontFamily: 'Inter, sans-serif', lineHeight: 1.2,
    };
    const activeGrad: React.CSSProperties = {
      backgroundImage: `linear-gradient(to bottom, ${accentColor} 45%, #555555 100%)`,
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent',
      fontWeight: 900, fontSize: sz(48), lineHeight: 1, fontFamily: 'Inter, sans-serif',
      paddingLeft: sz(6), paddingRight: sz(6),
    };

    // No emphasis: reveal words one-by-one with the white→gray gradient at caption size.
    if (!currentPhrase.some(isEmph)) {
      const flatGrad: React.CSSProperties = {
        backgroundImage: `linear-gradient(to bottom, ${captionTextColor} 45%, #555555 100%)`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent',
        fontWeight: 800, fontSize: sz(20), fontFamily: 'Inter, sans-serif', lineHeight: 1.2,
      };
      const outerPos: React.CSSProperties = {
        position: 'absolute',
        top: `${effectiveBox.yPercent}%`, left: `${effectiveBox.xPercent}%`,
        maxWidth: `${effectiveBox.widthPercent}%`, width: 'fit-content',
        transform: 'translate(-50%, -50%)', display: 'flex', justifyContent: 'center',
      };
      const FADE_F = Math.max(1, Math.round(fps * 0.1));
      const revealOp = (w: TranscriptWord) => {
        const sf = Math.floor((w.startMs / 1000) * fps);
        return interpolate(frame, [sf, sf + FADE_F], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      };
      return (
        <AbsoluteFill style={{ background: '#000' }}>
          {VIDEO}
          <div style={outerPos}>
            <div data-cap-row="" style={{ display: 'flex', gap: sz(6), flexWrap: rowWrap, justifyContent: 'center', overflow: 'hidden' }}>
              {currentPhrase.map(w => (
                <span key={w.id} style={{ display: 'inline-block', ...flatGrad, opacity: revealOp(w) }}>{w.text}</span>
              ))}
            </div>
          </div>
        </AbsoluteFill>
      );
    }

    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {emphRow(currentPhrase, activeGrad, ctxGrad, { layered: true })}
      </AbsoluteFill>
    );
  }

  // captik_glow: progressive word-by-word reveal; tight contained glow on emph words.
  if (captionStyle === 'captik_glow') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;

    const buildGlow = (color: string) => [
      `0 0 ${szBlur(4)}px  ${hexToRgba(color, 1)}`,
      `0 0 ${szBlur(10)}px ${hexToRgba(color, 0.65)}`,
      `0 0 ${szBlur(22)}px ${hexToRgba(color, 0.32)}`,
      `0 0 ${szBlur(38)}px ${hexToRgba(color, 0.1)}`,
    ].join(', ');

    const accentSplash: React.CSSProperties = {
      color: accentColor, fontWeight: 900, fontSize: sz(50),
      textTransform: 'uppercase', lineHeight: 1, fontFamily: 'Inter, sans-serif',
      textShadow: buildGlow(accentColor),
    };
    const whiteCtx: React.CSSProperties = {
      color: captionTextColor, fontWeight: 700, fontSize: sz(20), fontFamily: 'Inter, sans-serif', lineHeight: 1.2,
      textShadow: buildGlow(captionTextColor),
    };

    const wordStyle = (w: TranscriptWord): React.CSSProperties => {
      if (!isEmph(w)) return whiteCtx;
      const overrideColor = w.styleOverride?.color ?? emphHex;
      const base = overrideColor
        ? { ...accentSplash, color: overrideColor, textShadow: buildGlow(overrideColor) }
        : accentSplash;
      return emphSizeMul !== 1
        ? { ...base, fontSize: Math.round(Number(base.fontSize ?? sz(50)) * emphSizeMul) }
        : base;
    };

    const revealOpacity = (w: TranscriptWord): number => {
      // captik / captik_glow / captik_shadow: words pop in instantly as spoken (no fade),
      // and the whole stack disappears with the phrase (hard cut, no fade-out).
      const startF = Math.floor((w.startMs / 1000) * fps);
      return frame >= startF ? 1 : 0;
    };
    const revealStyle = (w: TranscriptWord): React.CSSProperties => ({
      opacity: revealOpacity(w),
    });

    const outerPos: React.CSSProperties = {
      position: 'absolute',
      top: `${effectiveBox.yPercent}%`,
      left: `${effectiveBox.xPercent}%`,
      maxWidth: `${effectiveBox.widthPercent}%`,
      width: 'fit-content',
      transform: 'translate(-50%, -50%)',
      display: 'flex',
      justifyContent: 'center',
    };

    // No emph → progressive flat row
    if (!currentPhrase.some(isEmph)) {
      return (
        <AbsoluteFill style={{ background: '#000' }}>
          {VIDEO}
          <div style={outerPos}>
            <div data-cap-row="" style={{ display: 'flex', gap: sz(6), flexWrap: rowWrap, justifyContent: 'center', overflow: 'hidden' }}>
              {currentPhrase.map(w => (
                <span key={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...whiteCtx, ...revealStyle(w) }}>{w.text}</span>
              ))}
            </div>
          </div>
          </AbsoluteFill>
      );
    }

    // Spotlight — hero word alone with its glow (mirrors the preview).
    const glowSpotlit = currentPhrase.find(w => isSpotlit(w) && currentMs >= w.startMs);
    if (glowSpotlit) {
      return (
        <AbsoluteFill style={{ background: '#000' }}>
          {VIDEO}
          <div style={outerPos}>
            <div data-cap-row="" style={{ display: 'flex', justifyContent: 'center' }}>
              <span data-emph="" style={{ fontFamily: ff(glowSpotlit), display: 'inline-block', ...wordStyle(glowSpotlit), ...revealStyle(glowSpotlit) }}>
                {glowSpotlit.text}
              </span>
            </div>
          </div>
        </AbsoluteFill>
      );
    }

    // Build sections — words reveal as spoken; layout positions fixed from start
    type GlowSection = { pre: TranscriptWord[]; emph: TranscriptWord; trailing: TranscriptWord[] };
    const glowSections: GlowSection[] = [];
    const emphIdxs = currentPhrase.map((w, i) => isEmph(w) ? i : -1).filter(i => i >= 0);
    let cursor = 0;
    for (let si = 0; si < emphIdxs.length; si++) {
      const ei = emphIdxs[si];
      const nextEi = emphIdxs[si + 1] ?? currentPhrase.length;
      glowSections.push({ pre: currentPhrase.slice(cursor, ei), emph: currentPhrase[ei], trailing: currentPhrase.slice(ei + 1, nextEi) });
      cursor = nextEi;
    }
    const glowCentered = layoutMode === 'center';

    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        <div style={outerPos}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: sz(2), width: 'fit-content' }}>
            {glowSections.flatMap((sec, si) => {
              const nodes: React.ReactNode[] = [];
              if (sec.pre.length > 0) {
                nodes.push(
                  <div key={`pre${si}`} data-cap-row="" style={{ display: 'flex', gap: sz(6), justifyContent: glowCentered ? 'center' : 'flex-start' }}>
                    {sec.pre.map(w => (
                      <span key={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...whiteCtx, ...revealStyle(w) }}>{w.text}</span>
                    ))}
                  </div>
                );
              }
              nodes.push(
                <div key={`emph${si}`} data-cap-row="" style={{ display: 'flex', justifyContent: 'center' }}>
                  <span data-emph="" style={{ fontFamily: ff(sec.emph), display: 'inline-block', ...wordStyle(sec.emph), ...revealStyle(sec.emph) }}>{sec.emph.text}</span>
                </div>
              );
              if (sec.trailing.length > 0) {
                nodes.push(
                  <div key={`trail${si}`} data-cap-row="" style={{ display: 'flex', gap: sz(6), justifyContent: glowCentered ? 'center' : 'flex-end' }}>
                    {sec.trailing.map(w => (
                      <span key={w.id} style={{ fontFamily: ff(w), display: 'inline-block', ...whiteCtx, ...revealStyle(w) }}>{w.text}</span>
                    ))}
                  </div>
                );
              }
              return nodes;
            })}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // clean_motion: words slide up from below as spoken (opacity 0→1, translateY sz(14)→0)
  if (captionStyle === 'clean_motion') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const SLIDE_DL = Math.max(1, Math.round(fps * 0.2));
    const cmSlide = (w: TranscriptWord) => {
      const sf = Math.floor((w.startMs / 1000) * fps);
      const t = interpolate(frame, [sf, sf + SLIDE_DL], [0, 1], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        easing: Easing.out(Easing.quad),
      });
      return { opacity: t, ty: (1 - t) * sz(14) };
    };
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        <AbsoluteFill style={{ ...captionPos, opacity: phraseOpacity }}>
          <div data-cap-row="" style={{ display: 'flex', gap: sz(6), flexWrap: rowWrap, justifyContent: 'center', maxWidth: phraseMaxW, overflow: 'hidden' }}>
            {currentPhrase.map(w => {
              const { opacity, ty } = cmSlide(w);
              return (
                <span key={w.id} style={{
                  color: '#ffffff', fontWeight: 500, fontSize: sz(18),
                  fontFamily: 'Inter, sans-serif', display: 'inline-block',
                  opacity, transform: `translateY(${ty}px)`,
                }}>{w.text}</span>
              );
            })}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // bubble: SINGLE-LINE display — current phrase only; active word gets the bubble bg.
  if (captionStyle === 'bubble') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        <AbsoluteFill style={{ ...captionPos, opacity: phraseOpacity }}>
          <div data-cap-row="" style={{ display: 'flex', gap: sz(6), flexWrap: rowWrap, justifyContent: 'center', maxWidth: phraseMaxW, overflow: 'hidden' }}>
            {currentPhrase.map(w => {
              const active = currentMs >= w.startMs && currentMs <= w.endMs;
              return (
                <span key={w.id} style={{
                  display: 'inline-block', fontWeight: 700,
                  fontSize: sz(17),
                  fontFamily: 'Montserrat, sans-serif',
                  color: active ? '#000' : '#ffffff',
                  background: active ? (w.styleOverride?.color ?? '#48A680') : 'transparent',
                  padding: `${sz(2)}px ${sz(8)}px`,
                  borderRadius: sz(8),
                }}>{w.text}</span>
              );
            })}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // hormozi: lime gradient, Anton font, drop-shadow — uniform all words
  if (captionStyle === 'hormozi') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const limeGrad: React.CSSProperties = {
      backgroundImage: 'linear-gradient(to bottom, #77a748 0%, #8abe4c 25%, #97DE25 38%, #9FF747 60%, #a5fd4b 100%)',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent',
      fontFamily: 'Anton, sans-serif', fontWeight: 700, textTransform: 'uppercase',
      filter: 'drop-shadow(10px 10px 6px rgba(71,79,46,0.9))',
    };
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {phraseRow(currentPhrase,
          () => ({ ...limeGrad, fontSize: sz(20) }),
          () => ({ ...limeGrad, fontSize: sz(20) }),
        )}
      </AbsoluteFill>
    );
  }

  // boxed: segment in orange box, animated per-segment change
  if (captionStyle === 'boxed') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const boxScale = spring({ frame: Math.max(0, frame - phraseEntryFrame), fps, config: { stiffness: 500, damping: 22 } });
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        <AbsoluteFill style={{ ...captionPos, opacity: phraseOpacity }}>
          <div data-cap-row="" style={{
            padding: `${sz(7)}px ${sz(18)}px`,
            background: activeWord?.styleOverride?.color ?? '#f48601',
            borderRadius: sz(4),
            transform: `scale(${boxScale})`,
            fontFamily: 'Inter, sans-serif',
          }}>
            <span style={{ fontSize: sz(19), fontWeight: 700, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {currentPhrase.map(w => w.text).join(' ')}
            </span>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // mrbeast: LuckiestGuy, white, black outline — uniform all words
  if (captionStyle === 'mrbeast') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const oVal = sz(4);
    const outline = `black -${oVal}px -${oVal}px 0px, black ${oVal}px -${oVal}px 0px, black -${oVal}px ${oVal}px 0px, black ${oVal}px ${oVal}px 0px, black 0px ${oVal}px 0px, black ${oVal}px 0px 0px, black 0px -${oVal}px 0px, black -${oVal}px 0px 0px`;
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {phraseRow(currentPhrase,
          (w) => ({ color: w.styleOverride?.color ?? '#ffffff', fontWeight: 900, fontSize: sz(20), textTransform: 'uppercase', fontFamily: 'LuckiestGuy, "Luckiest Guy", cursive', textShadow: outline, WebkitTextStroke: '0.015em black' }),
          ()  => ({ color: '#ffffff', fontWeight: 900, fontSize: sz(20), textTransform: 'uppercase', fontFamily: 'LuckiestGuy, "Luckiest Guy", cursive', textShadow: outline, WebkitTextStroke: '0.015em black' }),
        )}
      </AbsoluteFill>
    );
  }

  // mr_beast_2: ENTIRE LINE comes uniformly (like Mr Beast 1) — gold Futura, no per-word emphasis.
  if (captionStyle === 'mr_beast_2') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const mrb2 = (w: TranscriptWord): React.CSSProperties => ({
      color: w.styleOverride?.color ?? '#FFD700', fontWeight: 900, fontSize: sz(20),
      textTransform: 'uppercase',
      fontFamily: 'Futura, "Trebuchet MS", "Century Gothic", sans-serif',
      textShadow: `0px ${sz(8)}px ${sz(2)}px rgba(0,0,0,0.85), 0px ${sz(10)}px ${sz(4)}px rgba(0,0,0,0.75), 0px -${sz(2)}px 0px rgba(0,0,0,1)`,
    });
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {phraseRow(currentPhrase, mrb2, mrb2)}
      </AbsoluteFill>
    );
  }

  // iman_gadzhi: FULL SEGMENT, uniform style. NO emphasis dependency. ALL CAPS Montserrat 600 white.
  if (captionStyle === 'iman_gadzhi') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        <AbsoluteFill style={{ ...captionPos, opacity: phraseOpacity }}>
          <div data-cap-row="" style={{ display: 'flex', gap: sz(6), flexWrap: rowWrap, justifyContent: 'center', maxWidth: phraseMaxW, overflow: 'hidden' }}>
            {currentPhrase.map(w => (
              <span key={w.id} style={{
                color: '#ffffff', fontWeight: 600, fontSize: sz(18),
                textTransform: 'uppercase', fontFamily: 'MonaSans, Montserrat, sans-serif',
                display: 'inline-block',
              }}>{w.text}</span>
            ))}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // highlighted_word: active orange #F5A623, inactive white, Montserrat
  if (captionStyle === 'highlighted_word') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {phraseRow(currentPhrase,
          ()  => ({ color: '#F5A623', fontWeight: 700, fontSize: sz(17), fontFamily: 'Montserrat, sans-serif' }),
          ()  => ({ color: '#ffffff',  fontWeight: 600, fontSize: sz(17), fontFamily: 'Montserrat, sans-serif' }),
        )}
      </AbsoluteFill>
    );
  }

  // clean_glow: ALL words white glow (uniform) — no per-word active/inactive split
  if (captionStyle === 'clean_glow') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const cgStyle: React.CSSProperties = {
      color: '#ffffff', fontWeight: 500, fontSize: sz(18),
      fontFamily: 'Inter, sans-serif',
      textShadow: '0px 0px 14px rgba(255,255,255,0.9)',
    };
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {phraseRow(currentPhrase, () => cgStyle, () => cgStyle)}
      </AbsoluteFill>
    );
  }

  // captik_clean: ALL words white with subtle shadow — uniform
  if (captionStyle === 'captik_clean') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const kcStyle: React.CSSProperties = {
      color: '#ffffff', fontWeight: 400, fontSize: sz(18),
      fontFamily: 'Inter, sans-serif',
      textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
    };
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {phraseRow(currentPhrase, () => kcStyle, () => kcStyle)}
      </AbsoluteFill>
    );
  }

  // black_punch: Anton, black text with a thick WHITE outline — phrase mode.
  // The old design (black fill + sub-pixel 0.3px gray stroke + an ALL-BLACK shadow) was
  // invisible on dark/busy footage and aliased at export. Now a resolution-scaled white ring
  // (same 8-direction idiom as mrbeast) makes the black letters read crisply on ANY background;
  // a faint dark outer halo keeps them separated even on a near-white video.
  if (captionStyle === 'black_punch') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const bpO = sz(3);
    const bpRing = `#fff -${bpO}px -${bpO}px 0px, #fff ${bpO}px -${bpO}px 0px, #fff -${bpO}px ${bpO}px 0px, #fff ${bpO}px ${bpO}px 0px, #fff 0px ${bpO}px 0px, #fff ${bpO}px 0px 0px, #fff 0px -${bpO}px 0px, #fff -${bpO}px 0px 0px`;
    const bpStyle: React.CSSProperties = {
      color: '#000000', fontWeight: 700, fontSize: sz(22),
      textTransform: 'uppercase',
      fontFamily: 'Anton, sans-serif',
      WebkitTextStroke: '0.045em #ffffff',
      textShadow: `${bpRing}, 0px 0px ${sz(2)}px rgba(0,0,0,0.45)`,
    };
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {phraseRow(currentPhrase, () => bpStyle, () => bpStyle)}
      </AbsoluteFill>
    );
  }

  // captik_word: PROGRESSIVE REVEAL — past + current visible (opacity 1), future dim.
  // No emphasis dependency; all words same size, all white. Builds phrase as it's spoken.
  if (captionStyle === 'captik_word') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const activeIdx = currentPhrase.findIndex(w => currentMs >= w.startMs && currentMs <= w.endMs);
    const spokenUpTo = activeIdx >= 0 ? activeIdx : -1;
    const FADE_KW = Math.max(1, Math.round(fps * 0.1));
    const kwOpacity = (w: TranscriptWord, i: number) => {
      if (i > spokenUpTo) return 0.18;
      const startF = Math.floor((w.startMs / 1000) * fps);
      return interpolate(frame, [startF, startF + FADE_KW], [0.18, 1], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      });
    };
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        <AbsoluteFill style={{ ...captionPos, opacity: phraseOpacity }}>
          <div data-cap-row="" style={{ display: 'flex', gap: sz(6), flexWrap: rowWrap, justifyContent: 'center', maxWidth: phraseMaxW, overflow: 'hidden' }}>
            {currentPhrase.map((w, i) => (
              <span key={w.id} style={{
                display: 'inline-block',
                color: w.styleOverride?.color ?? '#ffffff',
                fontWeight: 600, fontSize: sz(18), fontFamily: 'Inter, sans-serif',
                opacity: kwOpacity(w, i),
              }}>
                {w.text}
              </span>
            ))}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // liquid_glass: glass pill; words reveal PROGRESSIVELY as spoken (like ali_abdaal).
  // Spoken → white; unspoken → dim warm gray #918b7c.
  if (captionStyle === 'liquid_glass') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const FADE_LG = Math.max(1, Math.round(fps * 0.1));
    const lgOpacity = (w: TranscriptWord) => {
      const sf = Math.floor((w.startMs / 1000) * fps);
      return interpolate(frame, [sf, sf + FADE_LG], [0.45, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    };
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        <AbsoluteFill style={{ ...captionPos, opacity: phraseOpacity }}>
          <div data-cap-row="" style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: sz(36), padding: `${sz(8)}px ${sz(22)}px`, display: 'flex', gap: sz(6), flexWrap: rowWrap, justifyContent: 'center', alignItems: 'baseline', overflow: 'hidden' }}>
            {currentPhrase.map(w => (
              <span key={w.id} style={{
                fontFamily: 'Montserrat, sans-serif', display: 'inline-block',
                fontWeight: currentMs >= w.startMs ? 400 : 300, fontSize: sz(15),
                color: currentMs >= w.startMs ? '#ffffff' : '#918b7c',
                opacity: lgOpacity(w),
              }}>{w.text}</span>
            ))}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // tabahi: KomikaAxis/Comic Sans, uppercase, black outline, current + next dim
  if (captionStyle === 'tabahi') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const oVal = sz(4);
    const outline = `black -${oVal}px -${oVal}px 0px, black ${oVal}px -${oVal}px 0px, black -${oVal}px ${oVal}px 0px, black ${oVal}px ${oVal}px 0px, black 0px ${oVal}px 0px, black ${oVal}px 0px 0px, black 0px -${oVal}px 0px, black -${oVal}px 0px 0px`;
    const tStyle: React.CSSProperties = {
      color: '#ffffff', fontWeight: 900, fontSize: sz(20),
      fontFamily: 'KomikaAxis, "Comic Sans MS", cursive',
      textTransform: 'uppercase', textShadow: outline,
      WebkitTextStroke: '0.066em black',
    };
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        <AbsoluteFill style={{ ...captionPos, opacity: phraseOpacity }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: sz(4) }}>
            <div data-cap-row="" style={{ display: 'flex', gap: sz(5), flexWrap: rowWrap, justifyContent: 'center', overflow: 'hidden' }}>
              {currentPhrase.map(w => (
                <span key={w.id} style={{ display: 'inline-block', ...tStyle }}>{w.text}</span>
              ))}
            </div>
            {nextSegWords && nextSegWords.length > 0 && (
              <div data-cap-row="" style={{ display: 'flex', gap: sz(5), flexWrap: 'wrap', justifyContent: 'center', opacity: 0.75 }}>
                {nextSegWords.map(w => (
                  <span key={w.id} style={{ display: 'inline-block', ...tStyle, fontSize: sz(17) }}>{w.text}</span>
                ))}
              </div>
            )}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // deep_glow: TheBoldFont/Anton, magenta — single line, spoken=full glow, unspoken=dim
  if (captionStyle === 'deep_glow') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const magentaGlow = `0 0 ${szBlur(3)}px #FF00FF, 0 0 ${szBlur(6)}px #FF00FF, 0 0 ${szBlur(9)}px #FF00FF`;
    const magentaDim  = `0 0 ${szBlur(2)}px rgba(255,0,255,0.2)`;
    const FADE_DL = Math.max(1, Math.round(fps * 0.12));
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        <AbsoluteFill style={{ ...captionPos, opacity: phraseOpacity }}>
          <div data-cap-row="" style={{ display: 'flex', gap: sz(5), flexWrap: rowWrap, justifyContent: 'center', maxWidth: phraseMaxW, overflow: 'hidden' }}>
            {currentPhrase.map(w => {
              const sf = Math.floor((w.startMs / 1000) * fps);
              const spoken = frame >= sf;
              const op = interpolate(frame, [sf, sf + FADE_DL], [0.28, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              return (
                <span key={w.id} style={{
                  fontFamily: 'TheBoldFont, Anton, Impact, sans-serif', display: 'inline-block',
                  color: '#FF00FF', fontWeight: 900, fontSize: sz(20),
                  textTransform: 'uppercase',
                  textShadow: spoken ? magentaGlow : magentaDim,
                  opacity: spoken ? op : 0.28,
                }}>{w.text}</span>
              );
            })}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // seedha_saadha: progressive reveal, RubikBlack, uppercase, black outline
  if (captionStyle === 'seedha_saadha') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const oVal = sz(4);
    const outline = `black -${oVal}px -${oVal}px 0px, black ${oVal}px -${oVal}px 0px, black -${oVal}px ${oVal}px 0px, black ${oVal}px ${oVal}px 0px, black 0px ${oVal}px 0px, black ${oVal}px 0px 0px, black 0px -${oVal}px 0px, black -${oVal}px 0px 0px`;
    const FADE_DL = Math.max(1, Math.round(fps * 0.1));
    const ssOpacity = (w: TranscriptWord) => {
      const sf = Math.floor((w.startMs / 1000) * fps);
      return interpolate(frame, [sf, sf + FADE_DL], [0.18, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    };
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        <AbsoluteFill style={{ ...captionPos, opacity: phraseOpacity }}>
          <div data-cap-row="" style={{ display: 'flex', gap: sz(6), flexWrap: rowWrap, justifyContent: 'center', maxWidth: phraseMaxW, overflow: 'hidden' }}>
            {currentPhrase.map(w => (
              <span key={w.id} style={{
                color: '#ffffff', fontWeight: 900, fontSize: sz(22),
                fontFamily: 'RubikBlack, Rubik, sans-serif',
                textTransform: 'uppercase', textShadow: outline,
                WebkitTextStroke: '0.085em black',
                display: 'inline-block',
                opacity: ssOpacity(w),
              }}>{w.text}</span>
            ))}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // thora_cinematic: Montserrat 600, ALL CAPS, wide letterSpacing — uniform phrase
  if (captionStyle === 'thora_cinematic') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const tcStyle: React.CSSProperties = {
      color: '#ffffff', fontWeight: 600, fontSize: sz(16),
      fontFamily: 'Montserrat, sans-serif',
      textTransform: 'uppercase', letterSpacing: '0.28em',
    };
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {phraseRow(currentPhrase, () => tcStyle, () => tcStyle, undefined, sz(10))}
      </AbsoluteFill>
    );
  }

  // pixelated: single word, VPPixel/Courier, uppercase
  if (captionStyle === 'pixelated') {
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {/* font-locked: the pixel face IS the template — exempt from the custom-font override */}
        <div data-cfont-lock="" style={{ position: 'absolute', inset: 0 }}>
          {singleWord({
            color: activeWord?.styleOverride?.color ?? '#ffffff',
            fontWeight: 700, fontSize: sz(16),
            fontFamily: 'VPPixel, "Courier New", monospace',
            textTransform: 'uppercase', letterSpacing: '0.1em',
          })}
        </div>
      </AbsoluteFill>
    );
  }

  // delhi: PROGRESSIVE REVEAL with per-word font. Emphasized → italic serif; non-emph → sans.
  if (captionStyle === 'delhi') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const activeIdx = currentPhrase.findIndex(w => currentMs >= w.startMs && currentMs <= w.endMs);
    const spokenUpTo = activeIdx >= 0 ? activeIdx : -1;
    const FADE_DL = Math.max(1, Math.round(fps * 0.1));
    const delhiOpacity = (w: TranscriptWord, i: number) => {
      if (i > spokenUpTo) return 0.2;
      const startF = Math.floor((w.startMs / 1000) * fps);
      return interpolate(frame, [startF, startF + FADE_DL], [0.2, 1], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      });
    };
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        <AbsoluteFill style={{ ...captionPos, opacity: phraseOpacity }}>
          {/* font-locked: the serif-italic emphasis face IS the template */}
          <div data-cfont-lock="" style={{ display: 'flex', gap: sz(6), flexWrap: rowWrap, justifyContent: 'center', maxWidth: phraseMaxW, alignItems: 'baseline', overflow: 'hidden' }}>
            {currentPhrase.map((w, i) => {
              const isEmphWord = isEmph(w);
              return (
                <span key={w.id} style={{
                  fontFamily: isEmphWord
                    ? 'InstrumentSerifItalic, "Instrument Serif", serif'
                    : 'InstrumentSans, "Instrument Sans", sans-serif',
                  fontStyle: isEmphWord ? 'italic' : 'normal',
                  textShadow: isEmphWord ? `0 0 ${szBlur(18)}px rgba(255,255,255,0.7)` : 'none',
                  color: w.styleOverride?.color ?? '#ffffff',
                  fontWeight: 400, fontSize: sz(17), display: 'inline-block',
                  opacity: delhiOpacity(w, i),
                }}>
                  {w.text}
                </span>
              );
            })}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // prism: entire line at once, uniform purple glow, Montserrat uppercase
  if (captionStyle === 'prism') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const prismStyle = (w: TranscriptWord): React.CSSProperties => ({
      color: w.styleOverride?.color ?? '#A34EFF', fontWeight: 700, fontSize: sz(19),
      textTransform: 'uppercase', fontFamily: 'Montserrat, sans-serif',
      letterSpacing: '0.04em',
    });
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {phraseRow(currentPhrase, prismStyle, prismStyle)}
      </AbsoluteFill>
    );
  }

  // devin_jatho: ALL words same purple #A34EFF — uniform phrase, dark textShadow
  if (captionStyle === 'devin_jatho') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const djStyle: React.CSSProperties = {
      color: '#A34EFF', fontWeight: 700, fontSize: sz(19),
      fontFamily: 'Montserrat, sans-serif', textTransform: 'uppercase',
    };
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {phraseRow(currentPhrase, () => djStyle, () => djStyle)}
      </AbsoluteFill>
    );
  }

  // ── Illusion ──────────────────────────────────────────────────────────────
  // OBEYS THE DOTTED BOX. IllusionRow renders flow-based flexbox INSIDE the captionPos
  // wrapper (exactly like every other style), so the lockup centres within the box bounds
  // instead of fighting the parent with AbsoluteFill / position:absolute.
  if (captionStyle === 'illusion') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}</AbsoluteFill>;
    const illusionSlots = resolveIllusionSlots(
      templateSlots?.illusion, lineSlotOverrides[activeSegmentKey ?? currentPhrase[0].id]?.illusion);
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        <AbsoluteFill style={{ ...captionPos, opacity: phraseOpacity }}>
          <IllusionRow
            words={currentPhrase}
            effectiveBox={effectiveBox}
            contextFontSize={sz(15)}
            segmentSeed={currentPhrase[0].id}
            textColor={captionTextColor}
            fontScale={captionFontScale}
            slots={illusionSlots}
          />
        </AbsoluteFill>
        {!isPro && <Watermark />}
      </AbsoluteFill>
    );
  }

  // ── Editor Masala ─────────────────────────────────────────────────────────
  // OBEYS THE DOTTED BOX. Like Illusion, the heavy lifting lives in a flow-flexbox
  // child (EditorMasalaRow) rendered INSIDE the captionPos wrapper — no AbsoluteFill
  // or position:fixed inside the row, so the lockup centres within the box bounds.
  // Per-word motion is driven by Python-injected `engineData` (read optionally; the
  // row falls back to a deterministic seeded pick when the backend hasn't run).
  if (captionStyle === 'editor_masala') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    const emSlots = resolveEditorMasalaSlots(
      templateSlots?.editor_masala, lineSlotOverrides[activeSegmentKey ?? currentPhrase[0].id]?.editor_masala);
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {/* font-locked: the script-italic hero / persona faces ARE the template */}
        <AbsoluteFill data-cfont-lock="" style={{ ...captionPos, opacity: phraseOpacity }}>
          <EditorMasalaRow
            words={currentPhrase}
            contextFontSize={sz(15)}
            textColor={captionTextColor}
            fontScale={captionFontScale}
            slots={emSlots}
          />
        </AbsoluteFill>
        {!isPro && <Watermark />}
      </AbsoluteFill>
    );
  }

  // ── Aura (Editorial Overlap Engine) ─────────────────────────────────────────
  // OBEYS THE DOTTED BOX. SANDBOXED — AuraRow is only ever reached from this branch, so it
  // cannot touch any other template. Like Illusion / Editor Masala, the heavy lifting lives in
  // a flow-flexbox child rendered INSIDE the captionPos wrapper (no AbsoluteFill / position:fixed
  // inside the row), so the dotted box's ResizeObserver measures a normal DOM height.
  if (captionStyle === 'aura' || captionStyle === 'aura_helvetica') {
    if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
    // TRANSFORM-FREE positioner: a 0×0 flex box centred on (x, y). Unlike captionPos (which uses
    // translate(-50%,-50%)), this creates NO stacking context, so a highlighted word's
    // mixBlendMode:'difference' blends against the VIDEO instead of being isolated to transparency.
    // opacity is the only animatable here and is exactly 1 at steady state (no isolation then).
    const isHelv    = captionStyle === 'aura_helvetica';
    const auraLine  = lineSlotOverrides[activeSegmentKey ?? currentPhrase[0].id];
    const auraSlots = isHelv
      ? resolveSwissSlots(templateSlots?.aura_helvetica, auraLine?.aura_helvetica)
      : resolveAuraSlots(templateSlots?.aura, auraLine?.aura);
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {VIDEO}
        {/* font-locked: Playfair/TheBoldFont/Open Sans pairing IS the template (attr adds no
            stacking context, so the difference blend stays live) */}
        <div data-cfont-lock="" style={{
          position: 'absolute', top: `${effectiveBox.yPercent}%`, left: `${effectiveBox.xPercent}%`,
          width: 0, height: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: phraseOpacity,
        }}>
          <AuraRow
            words={currentPhrase}
            contextFontSize={sz(15)}
            segmentSeed={currentPhrase[0].id}
            textColor={captionTextColor}
            fontScale={captionFontScale}
            boxWidthPercent={effectiveBox.widthPercent}
            segmentIndex={currentSegIdx}
            splashSeed={captionSegments?.[0]?.[0] ?? currentPhrase[0].id}
            slots={auraSlots}
            flat={isHelv}
          />
        </div>
        {!isPro && <Watermark />}
      </AbsoluteFill>
    );
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  if (!currentPhrase) return <AbsoluteFill style={{ background: '#000' }}>{VIDEO}{!isPro && <Watermark />}</AbsoluteFill>;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {VIDEO}
      {phraseRow(currentPhrase,
        (w) => ({ color: w.styleOverride?.color ?? '#C8FF00', fontWeight: 800, fontSize: sz(20) }),
        ()  => ({ color: 'rgba(255,255,255,0.6)', fontWeight: 500, fontSize: sz(20) }),
      )}
      {!isPro && <Watermark />}
    </AbsoluteFill>
  );
}

// ─── IllusionRow ──────────────────────────────────────────────────────────────
// OBEYS THE DOTTED BOX. The parent renders this inside the captionPos wrapper, so this
// component only returns flow-based flexbox containers that expand naturally — no
// AbsoluteFill, no position:absolute, no vw/vh. Everything centres within the box.
//
// Condition 1 (no emph) — standard line, random 1A/1B:
//   1A Mixed entry: first word slides in from the RIGHT (X), the rest rise from BELOW (Y).
//   1B Continuous push: every word slides in from the RIGHT; justifyContent:flex-end means
//      each newly-spoken word naturally shoves the already-rendered ones to the LEFT.
// Condition 2 (has emph) — the Hemisphere Lockup:
//   A 3-tier column (top zone / emph word / bottom zone). preWords & postWords are split
//   across the two hemispheres (the assignment may swap, seeded) — they never share a
//   hemisphere. Each hemisphere gets a random justify. The emph word is 2.8× / 900 /
//   natural-case (no forced caps), slides bottom→top, and randomly applies modifier 2A
//   (opacity strobe) OR 2B (7px→0 gaussian blur).
// Entry motion everywhere flows through useVelocityBlur: an ease-out-exp position whose
// per-frame velocity drives a motion blur that resolves to 0px exactly as the word settles.

interface IllusionRowProps {
  words:           TranscriptWord[];
  effectiveBox:    CaptionBoxConfig;   // kept for API stability; positioning is owned by the parent captionPos wrapper
  contextFontSize: number;
  segmentSeed:     string;
  textColor?:      string;
  fontScale?:      number;
  slots:           ResolvedIllusionSlots;
}

/**
 * useVelocityBlur — eased position + velocity-driven motion blur.
 * Samples the ease-out-exp curve at `localFrame` and `localFrame - 1`; the per-frame
 * delta IS the velocity, so the returned blur naturally decays to 0px as motion stops.
 * Pure (no React state) — safe to call per-word inside a map.
 */
function useVelocityBlur(
  localFrame: number, startVal: number, endVal: number, duration: number, fps: number,
): { value: number; blur: number; filter: string } {
  const at = (f: number) =>
    interpolate(f, [0, duration], [startVal, endVal], {
      easing: Easing.out(Easing.exp), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
  const value    = at(localFrame);
  const velocity = Math.abs(value - at(localFrame - 1));        // px / frame
  // Normalise to a 30fps baseline so the blur looks identical at any fps, then clamp.
  const blur = Math.min(9, velocity * (fps / 30) * 0.22);
  return { value, blur, filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none' };
}

// useVelocityBlur is pure (no React state). Aliasing it lets the Editor Masala
// animation engine call it from helper functions / inside .map() without tripping
// the react-hooks/rules-of-hooks linter (which keys off the `use` prefix).
const velBlur = useVelocityBlur;

function IllusionRow({
  words, contextFontSize, segmentSeed,
  textColor = '#ffffff', fontScale = 1, slots,
}: IllusionRowProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  if (!words.length) return null;

  // Slot-resolved typography. baseColor falls back to the global caption text colour when not
  // overridden (preserves the pre-editable behaviour); font defaults to ILLUSION_FONT.
  const font = slots.font;
  const baseColor = slots.baseColor ?? textColor;

  const RS  = width < height ? width / 270 : width / 640;
  const sz  = (n: number) => Math.round(n * RS * fontScale);

  const CTX_FS   = contextFontSize;
  const ENTRY_F  = Math.max(1, Math.round(fps * 0.4));
  const SLIDE_PX = sz(16);
  const GAP      = sz(5);
  const EASE     = Easing.out(Easing.exp);

  const isE = (w: TranscriptWord) =>
    !!(w.styleOverride?.color || (w.styleOverride?.scale && w.styleOverride.scale > 1));
  const startF = (w: TranscriptWord) => Math.floor((w.startMs / 1000) * fps);
  const opAt   = (sf: number) =>
    interpolate(frame, [sf, sf + 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // In-animation override: when the user picks a non-signature entrance, EVERY word (context +
  // emph) does the same snappy uniform slide (or appears instantly) instead of the velocity-blur /
  // glitch. The hemisphere lockup, fonts, sizes and colours are untouched — only the entry motion.
  const inAnim   = slots.inAnimation;
  const override = inAnim !== 'default';
  const inPose   = (w: TranscriptWord, mag: number): React.CSSProperties => {
    const p = resolveInAnimPose(inAnim as Exclude<typeof inAnim, 'default'>, (frame - startF(w)) / fps, mag);
    return { opacity: p.opacity, transform: `translate(${p.dx.toFixed(2)}px, ${p.dy.toFixed(2)}px)`, filter: 'none' };
  };

  const emphIndex = words.findIndex(isE);
  const hasEmph   = emphIndex !== -1;

  // ── CONDITION 1: standard line (no emph) — fills the box, flow flexbox ─────
  if (!hasEmph) {
    const mixed = random(`${segmentSeed}:ls`) < 0.5;   // true → 1A mixed entry, false → 1B push

    if (mixed) {
      // 1A — first word enters from the RIGHT (X); the rest rise from BELOW (Y). All reserve space.
      return (
        <div style={{
          width: '100%', display: 'flex', flexWrap: 'wrap',
          justifyContent: 'center', alignItems: 'baseline', gap: GAP,
        }}>
          {words.map((w, i) => {
            const lf     = frame - startF(w);
            const active = lf >= 0;
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const vb = useVelocityBlur(lf, SLIDE_PX, 0, ENTRY_F, fps);
            const tx = i === 0 ? (active ? vb.value : SLIDE_PX) : 0;
            const ty = i === 0 ? 0 : (active ? vb.value : SLIDE_PX);
            const pose: React.CSSProperties = override ? inPose(w, SLIDE_PX) : {
              opacity: active ? opAt(startF(w)) : 0,
              transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`,
              filter: active ? vb.filter : 'none',
            };
            return (
              <span key={w.id} style={{
                display: 'inline-block', fontFamily: font, fontWeight: 700,
                fontSize: CTX_FS, color: baseColor, whiteSpace: 'nowrap',
                willChange: 'transform, filter', ...pose,
              }}>{w.text}</span>
            );
          })}
        </div>
      );
    }

    // 1B — continuous push: only spoken words sit in the flow so the line grows as it's
    // spoken. Always centred (never flex-end) so the line never jumps to the box's edge.
    const spoken = words.filter(w => frame >= startF(w));
    return (
      <div style={{
        width: '100%', display: 'flex', flexWrap: 'nowrap', overflow: 'hidden',
        justifyContent: 'center', alignItems: 'baseline', gap: GAP,
      }}>
        {spoken.map(w => {
          const lf = frame - startF(w);
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const vb = useVelocityBlur(lf, SLIDE_PX, 0, ENTRY_F, fps);
          const pose: React.CSSProperties = override ? inPose(w, SLIDE_PX) : {
            opacity: opAt(startF(w)),
            transform: `translateX(${vb.value.toFixed(2)}px)`,
            filter: vb.filter,
          };
          return (
            <span key={w.id} style={{
              display: 'inline-block', fontFamily: font, fontWeight: 700,
              fontSize: CTX_FS, color: baseColor, whiteSpace: 'nowrap',
              willChange: 'transform, filter', ...pose,
            }}>{w.text}</span>
          );
        })}
      </div>
    );
  }

  // ── CONDITION 2: the Hemisphere Lockup — flow flexbox, centred inside the box ──
  const preWords  = words.slice(0, emphIndex);
  const emphWord  = words[emphIndex];
  const postWords = words.slice(emphIndex + 1);
  const emphColor = emphWord.styleOverride?.color ?? slots.emphColor ?? baseColor;

  const emphFontSize = Math.round(contextFontSize * 2.8);
  // Positive clearance so the context hemispheres sit just CLEAR of the big word's glyphs.
  // The old negative "tuck" + the emph word's crushed lineHeight (0.75) pushed the context
  // rows down into the big word's letters (the reported overlap). With lineHeight:1 the emph
  // line box contains its glyphs, so a small positive gap keeps the lockup tight but clean.
  const tierGap      = `${Math.round(contextFontSize * 0.12)}px`;
  const zoneGap      = sz(2);   // hemisphere word gap — via sz() so preview & export stay proportional

  // Spatial hemisphere assignment — pre/post sets may swap; each hemisphere a random justify.
  const swap        = random(`${segmentSeed}:swap`) < 0.5;
  const topWords    = swap ? postWords : preWords;
  const bottomWords = swap ? preWords  : postWords;
  const topJustify  = random(`${segmentSeed}:tj`) < 0.5 ? 'flex-start' : 'flex-end';
  const botJustify  = random(`${segmentSeed}:bj`) < 0.5 ? 'flex-start' : 'flex-end';

  // Emph word: bottom→top slide with velocity blur, plus modifier 2A (strobe) or 2B (blur 7→0).
  const emphLF      = frame - startF(emphWord);
  const emphActive  = emphLF >= 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const emphVB      = useVelocityBlur(emphLF, sz(26), 0, Math.max(1, Math.round(fps * 0.5)), fps);
  // Glitch plan (slot-driven; defaults reproduce the original seeded coin-flip exactly).
  const { wantGlitch, useStrobe } = resolveGlitch(slots, {
    emphWordHasGlitchFlag: !!emphWord.styleOverride?.glitch,
    seedStrobe: random(`${segmentSeed}:em`),
  });
  // Modifier 2A — subtle glitch: toggle opacity every 2 frames across just the first 6
  // frames (two brief flickers, then solid).
  const emphOpacity = wantGlitch && useStrobe && emphActive && emphLF < 6
    ? (Math.floor(emphLF / 2) % 2 === 0 ? 0 : 1)
    : 1;
  // Modifier 2B — gaussian fade (7px→0) STACKED on top of the velocity motion blur.
  const gaussian    = interpolate(emphLF, [0, 15], [7, 0], { easing: EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const emphBlur    = (wantGlitch && !useStrobe)
    ? `blur(${(emphVB.blur + gaussian).toFixed(2)}px)`
    : emphVB.filter;

  // Non-emph hemisphere words animate with 1A logic: rise from BELOW + velocity blur.
  const zoneWord = (w: TranscriptWord) => {
    const lf     = frame - startF(w);
    const active = lf >= 0;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const vb = useVelocityBlur(lf, sz(10), 0, ENTRY_F, fps);
    const pose: React.CSSProperties = override ? inPose(w, SLIDE_PX) : {
      opacity: active ? opAt(startF(w)) : 0,
      transform: `translateY(${(active ? vb.value : sz(10)).toFixed(2)}px)`,
      filter: active ? vb.filter : 'none',
    };
    return (
      <span key={w.id} style={{
        display: 'inline-block', lineHeight: 0.8, fontWeight: 700,
        fontSize: `${contextFontSize}px`, fontFamily: font, color: baseColor,
        whiteSpace: 'nowrap', ...pose,
      }}>{w.text}</span>
    );
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', width: 'max-content',
    }}>
      {/* Tier 1 — top hemisphere: sits just above the big word with a small clearance gap */}
      {topWords.length > 0 && (
        <div style={{
          width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: topJustify,
          gap: zoneGap, marginBottom: tierGap, zIndex: 2,
        }}>
          {topWords.map(zoneWord)}
        </div>
      )}

      {/* Tier 2 — the emphasized word (lineHeight:1 so its line box contains the glyphs).
          A <span> (inline-block), NOT a div: caption text must be a span so the custom-font
          override CSS reaches it — the preview's hero is a span, a div here made the hero
          keep ILLUSION_FONT in exports while the preview showed the user's font. */}
      <div style={{ overflow: 'visible', zIndex: 1 }}>
        {emphActive && (
          <span style={{
            display: 'inline-block', fontFamily: font,
            fontWeight: 900,
            fontSize: `${emphFontSize}px`, lineHeight: 1, color: emphColor,
            textAlign: 'center',
            // override → clean uniform slide (no glitch/velocity); default → signature slide + glitch.
            ...(override
              ? inPose(emphWord, sz(26))
              : { transform: `translateY(${emphVB.value.toFixed(2)}px)`, opacity: emphOpacity, filter: emphBlur }),
          }}>
            {emphWord.text}
          </span>
        )}
      </div>

      {/* Tier 3 — bottom hemisphere: sits just below the big word with a small clearance gap */}
      {bottomWords.length > 0 && (
        <div style={{
          width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: botJustify,
          gap: zoneGap, marginTop: tierGap, zIndex: 2,
        }}>
          {bottomWords.map(zoneWord)}
        </div>
      )}
    </div>
  );
}

// ─── AuraRow — the Editorial Talking-Head engine ────────────────────────────────
// OBEYS THE DOTTED BOX. SANDBOXED — only ever rendered from `if (captionStyle === 'aura')`.
// Returns ONLY flow flexbox (no AbsoluteFill / position:fixed) so the dotted box's ResizeObserver
// measures a real DOM height.
//
// ROLE ENGINE (deterministic, character-aware — duplicated byte-for-byte in CaptionOverlay):
//   • CURSIVE  (Playfair Display italic, white, large)  = the flowing "feature" word = the longest
//     non-emphasis, non-structural, Latin word. The signature spring-punch.
//   • BOLDKEY  (TheBoldFont UPPERCASE, large)            = other content words. White, or YELLOW if
//     emphasised, or mixBlendMode:'difference' if HIGHLIGHTED (the trippy inverted-colour effect).
//   • SUPPORT  (Open Sans 700, small)                    = short / stop words. Several pack per row.
// Words are packed into ≤3 centred TIERS by a char-width estimator (no DOM/canvas measure — pure +
// identical in preview & export). The cursive tier laps up over its neighbour for the overlap look.
//
// difference-blend NOTE: mix-blend-mode is isolated by any ancestor with transform / filter /
// opacity<1. So highlighted words animate ONLY via non-isolating `position:relative; top` (never
// transform/opacity/filter) — that's the only way the blend reaches the video pixels behind.
// Emphasis = yellow by default (user override colour wins). No-emphasis entry = seeded blur vs slide.

// AURA_YELLOW is the role engine's default accent (the resolved accentColor slot defaults
// to it). The cursive/bold/support font defaults now live in kineticSlots.AURA_DEFAULTS.
const AURA_YELLOW  = '#F5D300';
const AURA_STOP = new Set<string>([
  'a','an','the','and','or','but','to','of','in','on','for','with','at','by','it','is','are','was',
  'were','be','as','that','this','you','your','i','we','he','she','they','my','me','so','if','do',
  'did','not','no','up','out','its','too','am','our','us','his','her','off','let','get','got',
]);
type AuraRole = 'CURSIVE' | 'BOLDKEY' | 'SUPPORT';
interface AuraSpec { role: AuraRole; emph: boolean; diff: boolean; color: string; }
const AURA_FACTOR: Record<AuraRole, number> = { CURSIVE: 1.0, BOLDKEY: 1.2, SUPPORT: 1.0 };

// KEEP combining marks (\p{M}): Indic matras (ा ि े ं …) are marks, not letters — stripping them made
// most Hindi words look ≤3 chars → wrongly "structural" → a flat all-SUPPORT native lockup. Counting
// them gives native words fair lengths (फीचर्स=6, हैं=3, जो=2) so the role engine produces the same
// hero/support structure for native script as for romanised text.
function auraClean(t: string): string { return t.replace(/[^\p{L}\p{N}\p{M}]/gu, ''); }
function auraStructural(t: string): boolean {
  if (/['’]/.test(t)) return true;   // contractions (you've, it's, don't) → SUPPORT, never the cursive feature
  const c = auraClean(t).toLowerCase();
  // Indic words use a LOWER threshold (≤2): romanisation lengthens words (हैं→hain, में→mein), so the
  // Latin ≤3 would demote native words whose romanised twins are heroes — breaking native↔roman parity.
  const limit = getFontFamily(t) !== 'system-ui, sans-serif' ? 2 : 3;
  return c.length <= limit || AURA_STOP.has(c) || AURA_STOP.has(t.toLowerCase());
}
function auraCharUnit(ch: string): number {
  if (/[mwMW@]/.test(ch))      return 0.92;
  if (/[A-Z0-9]/.test(ch))     return 0.66;
  if (/[ilIjt.,'!|]/.test(ch)) return 0.30;
  if (/[fr]/.test(ch))         return 0.42;
  if (/[a-z]/.test(ch))        return 0.54;
  if (/\s/.test(ch))           return 0.32;
  if (/\p{M}/u.test(ch))       return 0.18;   // combining marks (Indic matras) are zero/narrow width
  return 0.72;                                // Indic/other full letters (Noto Sans Devanagari ≈ 0.72em)
}
function auraEstWidth(text: string, fontPx: number, factor: number): number {
  let u = 0; for (const ch of text) u += auraCharUnit(ch);
  return u * fontPx * factor;
}
function auraIsEmph(w: TranscriptWord): boolean {
  return !!(w.styleOverride?.color || (w.styleOverride?.scale && w.styleOverride.scale > 1));
}

// Deterministic role assignment. Same inputs → same roles in preview and export.
function auraAssignRoles(words: TranscriptWord[]): AuraSpec[] {
  const n = words.length;
  const emphIndex = words.findIndex(auraIsEmph);
  // cursive = longest non-emph, non-structural word (tie-break latest index). Indic words CAN take
  // the role — the renderer swaps Playfair for the script's Noto stack with a synthetic italic, so a
  // native lockup keeps the same flowing white feature word as the romanised one.
  let cursiveIdx = -1, best = 3;
  for (let i = 0; i < n; i++) {
    if (i === emphIndex) continue;
    if (words[i].styleOverride?.highlight) continue;                         // a highlighted word is a difference BOLDKEY, never cursive
    if (auraStructural(words[i].text)) continue;
    const len = auraClean(words[i].text).length;
    if (len >= best) { best = len; cursiveIdx = i; }
  }
  const specs: AuraSpec[] = words.map((w, i) => {
    if (i === emphIndex)   return { role: 'BOLDKEY', emph: true,  diff: false, color: w.styleOverride?.color || AURA_YELLOW };
    if (i === cursiveIdx)  return { role: 'CURSIVE', emph: false, diff: false, color: '#FFFFFF' };
    if (auraStructural(w.text)) return { role: 'SUPPORT', emph: false, diff: false, color: '#FFFFFF' };
    return { role: 'BOLDKEY', emph: false, diff: false, color: '#FFFFFF' };
  });
  // Focal guard: if everything came out SUPPORT (all-short / all-Indic, where matras make cleanLen tiny),
  // promote the longest word to BOLDKEY so the cluster always has one hero.
  if (!specs.some(s => s.role !== 'SUPPORT')) {
    let li = 0; for (let i = 1; i < n; i++) if (auraClean(words[i].text).length > auraClean(words[li].text).length) li = i;
    specs[li] = { role: 'BOLDKEY', emph: false, diff: false, color: '#FFFFFF' };
  }
  // HIGHLIGHT (difference): manual via styleOverride.highlight; else auto-pick ONE prominent BOLDKEY
  // (clean length ≥ 6) so it's selective, not on every caption. Never the emphasis word.
  const manual = words.map((w, i) => (w.styleOverride?.highlight ? i : -1)).filter(i => i >= 0);
  if (manual.length) {
    for (const i of manual) if (specs[i].role === 'BOLDKEY' && !specs[i].emph) specs[i].diff = true;
  } else {
    let pick = -1, pl = 5;
    for (let i = 0; i < n; i++) {
      if (specs[i].role !== 'BOLDKEY' || specs[i].emph) continue;
      const len = auraClean(words[i].text).length;
      if (len > pl) { pl = len; pick = i; }
    }
    if (pick >= 0) specs[pick].diff = true;
  }
  return specs;
}

interface AuraTierItem { w: TranscriptWord; spec: AuraSpec; idx: number; fs: number; }
interface AuraTier { items: AuraTierItem[]; hasCursive: boolean; width: number; }

// Char-aware tier packer. Big words (CURSIVE/BOLDKEY) get their own tier; SUPPORT words pack into
// rows that fit boxPx; capped at 3 tiers (lone SUPPORT tiers merge into a neighbour); each tier
// fit-scales down if it would overflow the box.
function auraBuildTiers(words: TranscriptWord[], specs: AuraSpec[], boxPx: number, baseFs: number): AuraTier[] {
  const mul = (s: AuraSpec) => s.role === 'CURSIVE' ? 2.6 : s.role === 'BOLDKEY' ? (s.emph ? 2.0 : 1.9) : 0.95;
  // Indic glyphs read visually smaller than TheBoldFont caps at equal px (Devanagari body ≈ 0.55em vs
  // display-caps ≈ 0.75em) — bump them so a native hero carries the same weight as a romanised one.
  const scriptMul = (w: TranscriptWord) => getFontFamily(w.text) !== 'system-ui, sans-serif' ? 1.12 : 1;
  const gap = baseFs * 0.35;
  const rowW = (items: AuraTierItem[]) => {
    let w = 0;
    for (const it of items) w += auraEstWidth(it.spec.role === 'BOLDKEY' ? it.w.text.toUpperCase() : it.w.text, it.fs, AURA_FACTOR[it.spec.role]);
    return w + Math.max(0, items.length - 1) * gap;
  };
  const tiers: AuraTier[] = [];
  for (let i = 0; i < words.length; i++) {
    const spec = specs[i];
    const item: AuraTierItem = { w: words[i], spec, idx: i, fs: Math.round(mul(spec) * scriptMul(words[i]) * baseFs) };
    const last = tiers[tiers.length - 1];
    const isSupport = spec.role === 'SUPPORT';
    if (isSupport && last && last.items.every(it => it.spec.role === 'SUPPORT') && rowW([...last.items, item]) <= boxPx) {
      last.items.push(item);
    } else {
      tiers.push({ items: [item], hasCursive: spec.role === 'CURSIVE', width: 0 });
    }
  }
  // cap to 3 tiers — merge a lone SUPPORT tier into an adjacent tier (prefer next, else prev).
  let guard = 0;
  while (tiers.length > 3 && guard++ < 12) {
    let mi = tiers.findIndex((t, k) => t.items.every(it => it.spec.role === 'SUPPORT') && (tiers[k - 1] || tiers[k + 1]));
    if (mi === -1) mi = tiers.length - 1;                       // all big → fold the last into prev
    const tgt = mi + 1 < tiers.length ? mi + 1 : mi - 1;
    if (tgt < mi) tiers[tgt].items.push(...tiers[mi].items);
    else          tiers[tgt].items.unshift(...tiers[mi].items);
    tiers.splice(mi, 1);
  }
  // fit-scale each tier to the box.
  for (const t of tiers) {
    const w = rowW(t.items);
    if (w > boxPx) { const k = boxPx / w; for (const it of t.items) it.fs = Math.max(Math.round(baseFs * 1.0), Math.round(it.fs * k)); }
    t.hasCursive = t.items.some(it => it.spec.role === 'CURSIVE');
    t.width = rowW(t.items);
  }
  return tiers;
}

interface AuraRowProps {
  words:           TranscriptWord[];
  contextFontSize: number;
  segmentSeed:     string;
  textColor?:      string;
  fontScale?:      number;
  boxWidthPercent?: number;
  segmentIndex?:   number;   // ordinal of this segment in the video → splash alternates each segment
  splashSeed?:     string;   // video-stable seed → which way the FIRST segment leans
  slots:           ResolvedAuraSlots;
  flat?:           boolean;  // aura_helvetica ("Swiss") — one flat font, no italic/rotation, word-by-word
}

function AuraRow({
  words, contextFontSize, segmentSeed,
  fontScale = 1, boxWidthPercent = 84,
  segmentIndex = -1, splashSeed, slots, flat = false,
}: AuraRowProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  if (!words.length) return null;

  const RS = width < height ? width / 270 : width / 640;
  const sz = (n: number) => Math.round(n * RS * fontScale);
  const baseFs  = contextFontSize;
  const ENTRY_F = Math.max(1, Math.round(fps * 0.45));   // entry duration (snappier than the old 0.55)
  // Reveal the whole lockup, cascading in READING ORDER with a perceptible per-word stagger (NOT
  // word-by-word by speech — the editorial lockup is shown complete, matching the references).
  const segStartF = Math.floor((words[0].startMs / 1000) * fps);
  const idxOf     = new Map(words.map((w, i) => [w.id, i] as const));
  // Reveal timing — Swiss (flat) reveals each word WHEN IT'S SPOKEN (its own startMs); Aura keeps the
  // editorial reveal-together cascade (whole lockup at segment start, staggered by reading order).
  const startF    = (w: TranscriptWord) => flat
    ? Math.floor((w.startMs / 1000) * fps)
    : segStartF + Math.round((idxOf.get(w.id) ?? 0) * 0.11 * fps);
  // Box width from the FIXED composition width (not baseFs — baseFs scales with fontScale, the box
  // does not, so deriving boxPx from baseFs would overflow at fontScale > 1).
  const boxPx = width * (boxWidthPercent / 100) * 0.92;

  // In-animation override — see IllusionRow. Replaces the per-word focus-pull/slide/direct entry
  // with a single uniform snappy slide (or instant appear), keeping the staggered reading-order
  // reveal timing and the editorial lockup untouched. Difference-blend words still animate via
  // position (top/left) so the mix-blend stays live.
  const inAnim    = slots.inAnimation;
  const override  = inAnim !== 'default';
  const inMag     = Math.round(baseFs * 0.9);
  const inPoseOf  = (w: TranscriptWord) =>
    resolveInAnimPose(inAnim as Exclude<typeof inAnim, 'default'>, (frame - startF(w)) / fps, inMag);

  const specs = auraAssignRoles(words);
  const tiers = auraBuildTiers(words, specs, boxPx, baseFs);
  // ── Per-word entry — RANDOMISED per word (decoupled, on the leaf span) ───────
  // Each word gets a seeded-random entry (→ identical in preview & export): 0 = focus-pull
  // (gentle rise + blur→sharp), 1 = direct (quick fade, no motion), 2 = slide in from the right.
  // NO scale anywhere. Slow ease-out (no bounce), staggered in reading order (startF = per-word delay).
  const EASE_FN = Easing.bezier(0.16, 1, 0.3, 1);
  const prog = (w: TranscriptWord) => {
    const lf = frame - startF(w);
    return {
      // both eased with EASE_FN so they match the preview's CSS cubic-bezier transitions exactly.
      p: interpolate(lf, [0, ENTRY_F], [0, 1], { easing: EASE_FN, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      o: interpolate(lf, [0, Math.round(ENTRY_F * 0.6)], [0, 1], { easing: EASE_FN, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    };
  };
  const animOf = (w: TranscriptWord) => Math.floor(random(`${segmentSeed}a${idxOf.get(w.id) ?? 0}`) * 3);
  // Non-highlight words (support / bold / cursive). `lean` is the static transform suffix the word
  // keeps at rest (the cursive tilt / Indic skew); cursive=true softens the focus-pull blur/rise.
  const entry = (w: TranscriptWord, cursive: boolean, lean: string = cursive ? ' rotate(-3deg)' : ''): React.CSSProperties => {
    if (override) {   // uniform slide/instant entrance — keeps the word's static lean at rest
      const p = inPoseOf(w);
      return { opacity: p.opacity, transform: `translate3d(${Math.round(p.dx)}px, ${Math.round(p.dy)}px, 0)${lean}`, willChange: 'transform' };
    }
    const a = animOf(w);
    if (a === 1) {   // DIRECT — quick fade, no motion
      const lf = frame - startF(w);
      return {
        opacity: interpolate(lf, [0, Math.max(1, Math.round(fps * 0.18))], [0, 1], { easing: EASE_FN, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        transform: `translate3d(0,0,0)${lean}`, willChange: 'opacity',
      };
    }
    const { p, o } = prog(w);
    if (a === 2) {   // SLIDE in from the right
      return { opacity: o, transform: `translate3d(${Math.round((1 - p) * baseFs * 1.3)}px, 0, 0)${lean}`, willChange: 'transform' };
    }
    // Blur sharpens over its OWN short ~0.17s window (NOT the full ENTRY_F) so the word reads crisp
    // well before the caption swaps on fast speech; smaller magnitude than before, and matches the
    // preview's entrancePose blurDurMs. Motion/opacity keep the longer ENTRY_F via `p`.
    const bp   = interpolate(frame - startF(w), [0, Math.max(1, Math.round(fps * 0.17))], [0, 1], { easing: EASE_FN, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const blur = (1 - bp) * baseFs * (cursive ? 0.24 : 0.30);   // FOCUS — rise + fast blur→sharp
    return {
      opacity: o, transform: `translate3d(0, ${Math.round((1 - p) * baseFs * (cursive ? 0.35 : 0.5))}px, 0)${lean}`,
      filter: blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : 'none', willChange: 'transform, filter',
    };
  };
  // Highlighted (difference): NON-isolating — animate via position (top/left) ONLY so the mix-blend
  // stays live. Same random type, position-based: focus→top rise, direct→instant, slide→left slide.
  const diffPos = (w: TranscriptWord): React.CSSProperties => {
    if (override) {   // position-based (non-isolating) so the difference blend stays live
      const p = inPoseOf(w);
      return { position: 'relative', left: `${Math.round(p.dx)}px`, top: `${Math.round(p.dy)}px` };
    }
    const a = animOf(w);
    if (a === 1) return { position: 'relative' };
    const { p } = prog(w);
    if (a === 2) return { position: 'relative', left: `${Math.round((1 - p) * baseFs * 1.3)}px` };
    return { position: 'relative', top: `${Math.round((1 - p) * baseFs * 0.5)}px` };
  };
  const renderItem = (it: AuraTierItem): React.ReactNode => {
    const { w, spec, fs } = it;
    const indic = getFontFamily(w.text) !== 'system-ui, sans-serif';
    // Indic scripts need taller line boxes — matras stack above/below the headline (ें ी ू ृ), so the
    // Latin lineHeight:1 makes stacked tiers visually collide. 1.25/1.2 keeps native lockups clean.
    const lh = indic ? 1.25 : 1;

    if (spec.role === 'CURSIVE') {
      // Indic cursive: Noto has no italic face and synthetic italics differ across engines, so slant
      // DETERMINISTICALLY with skewX (fontStyle stays normal) + weight 600 for presence — preview ==
      // export guaranteed. Latin keeps true Playfair italics.
      return (
        <span key={w.id} style={{
          display: 'inline-block', fontFamily: indic ? getFontFamily(w.text) : slots.cursiveFont,
          fontStyle: (flat || indic) ? 'normal' : 'italic', fontWeight: flat ? 900 : (indic ? 600 : 500), fontSize: `${fs}px`, color: slots.baseColor,
          lineHeight: indic ? 1.2 : 0.95, whiteSpace: 'nowrap', textShadow: `0px ${sz(5)}px ${sz(12)}px rgba(0,0,0,0.7)`,
          ...entry(w, true, flat ? '' : (indic ? ' rotate(-3deg) skewX(-8deg)' : ' rotate(-3deg)')),
        }}>{w.text}</span>
      );
    }

    const isBold = spec.role === 'BOLDKEY';
    const fam = indic ? getFontFamily(w.text) : (isBold ? slots.boldFont : slots.supportFont);
    const tt: React.CSSProperties['textTransform'] = indic ? 'none' : (isBold ? 'uppercase' : 'none');
    // Slot colour: emphasised word → per-word override ?? accent; everything else → base.
    // (Reproduces the role engine's AURA_YELLOW / #FFFFFF defaults exactly.)
    const itemColor = spec.emph ? (w.styleOverride?.color ?? slots.accentColor) : slots.baseColor;

    if (spec.diff) {
      // difference blend — NON-isolating position entry (relative top/left doesn't isolate). Clean
      // inverted glyphs, NO stroke/edge sibling.
      return (
        <span key={w.id} style={{
          ...diffPos(w),
          fontFamily: fam, fontWeight: 900, textTransform: tt, fontSize: `${fs}px`, lineHeight: lh,
          color: slots.baseColor, mixBlendMode: 'difference', display: 'inline-block', whiteSpace: 'nowrap',
        }}>{w.text}</span>
      );
    }

    return (
      <span key={w.id} style={{
        display: 'inline-block', fontFamily: fam, fontWeight: isBold ? 900 : 700, textTransform: tt,
        fontSize: `${fs}px`, color: itemColor, lineHeight: lh, whiteSpace: 'nowrap',
        textShadow: isBold ? `0px ${sz(3)}px ${sz(8)}px rgba(0,0,0,0.55)` : `0px ${sz(2)}px ${sz(5)}px rgba(0,0,0,0.5)`,
        ...entry(w, false),
      }}>{w.text}</span>
    );
  };

  const cursiveFs = tiers.flatMap(t => t.items).find(it => it.spec.role === 'CURSIVE')?.fs ?? baseFs;
  // Editorial "splash": lean each tier horizontally along a seeded diagonal (NOT centred) so the
  // cluster reads off-balance like the references. position:relative+left is non-isolating (a
  // transform / z-index here would re-isolate the difference blend). Bounded so a tier never leaves
  // the box — wide rows barely move, short/cursive words lean the most (matches the refs).
  const N = tiers.length;
  // Splash direction ALTERNATES segment-to-segment (guaranteed variety, not luck-of-the-seed): the
  // video's first segment leans a seeded way, every following segment flips. Falls back to per-segment
  // seeded random when there's no segment ordering (ad-hoc buildPhrases path). Mirrored in CaptionOverlay.
  const splashDir = segmentIndex >= 0
    ? (segmentIndex % 2 === 0 ? 1 : -1) * (random(`${splashSeed ?? segmentSeed}:splashstart`) > 0.5 ? 1 : -1)
    : (random(`${segmentSeed}splash`) > 0.5 ? 1 : -1);
  const leanStep = Math.round(baseFs * 1.6);

  return (
    <div style={{
      position: 'relative', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', width: 'max-content',
    }}>
      {tiers.map((t, ti) => {
        const maxLean = Math.max(0, (boxPx - t.width) / 2);
        const leanX = Math.round(Math.max(-maxLean, Math.min(maxLean, splashDir * (ti - (N - 1) / 2) * leanStep)));
        // half-lap when either lapping tier holds Indic glyphs — Devanagari matras above the headline
        // collide under the full Latin lap.
        const indicLap = ti > 0 && [t, tiers[ti - 1]].some(tt2 =>
          tt2.items.some(it2 => getFontFamily(it2.w.text) !== 'system-ui, sans-serif'));
        return (
          <div key={ti} style={{
            position: 'relative', left: `${leanX}px`,
            display: 'flex', flexDirection: 'row', flexWrap: 'nowrap',
            alignItems: 'baseline', justifyContent: 'center', gap: `${Math.round(baseFs * 0.3)}px`,
            // the cursive tier laps up over the tier above (later in DOM → paints on top); NO z-index
            // (a stacking context here would isolate the mixBlendMode:'difference' from the video).
            marginTop: t.hasCursive && ti > 0 ? `${-Math.round(cursiveFs * (indicLap ? 0.16 : 0.32))}px` : 0,
          }}>
            {t.items.map(renderItem)}
          </div>
        );
      })}
    </div>
  );
}

// ─── Editor Masala ─────────────────────────────────────────────────────────────
// "Deterministic Editor Simulation": a Python NLP backend (analyze_and_animate_segment)
// tags each word with engineData {animation, energy, isHero}. This renderer reads that
// data OPTIONALLY through a sandboxed intersection type — the shared TranscriptWord
// interface is never mutated — and executes the chosen per-word animation. When
// engineData is absent (backend not run / live preview), a deterministic seeded pick
// keeps the motion intentional rather than static.
//
// OBEYS THE DOTTED BOX: the parent renders this inside the captionPos wrapper, so this
// component returns ONLY flow-based flexbox (position:relative / flex / width:100%). No
// AbsoluteFill, no position:fixed. The single absolutely-positioned element (the optional
// cinematic background hero) lives INSIDE this relative + isolated container, so it stays
// boxed and paints strictly behind the text.
//
// LAMBDA ANTI-JITTER: every interpolated pixel distance is Math.round()ed, motion uses
// translate3d() for GPU compositing, and every animated span declares will-change.

type EditorMasalaAnim =
  | 'zoom_punch' | 'slide_blur'
  | 'scale_bounce' | 'fade_up' | 'soft_glow';

interface EditorMasalaEngineData {
  animation?:    EditorMasalaAnim;
  energy?:       'LOW' | 'MED' | 'HIGH';
  isHero?:       boolean;
  isEmphasized?: boolean;
  fontWeight?:   number;
}

// Sandboxed read-only view of a word that MAY carry Python engineData. The global
// TranscriptWord interface is deliberately left untouched (architecture constraint #1).
type EngineWord = TranscriptWord & { engineData?: EditorMasalaEngineData };

const EDITOR_MASALA_LATIN_FONT = "'Montserrat', system-ui, sans-serif";

// Script-aware font: defer to getFontFamily for Indic/Arabic (Sarvam native scripts),
// upgrade plain Latin/transliterated text to Montserrat for the editorial look.
function editorMasalaFont(text: string): string {
  const f = getFontFamily(text);
  return f === 'system-ui, sans-serif' ? EDITOR_MASALA_LATIN_FONT : f;
}

interface AnimResult {
  transform:   string;
  opacity:     number;
  filter:      string;
  textShadow?: string;
}

const EM_HIDDEN: AnimResult = { transform: 'translate3d(0,0,0)', opacity: 0, filter: 'none' };

interface AnimCtx {
  lf:     number;                  // local frame (frames since the word started)
  fps:    number;
  sz:     (n: number) => number;   // px scaler (preview → export resolution)
  color:  string;                  // resolved word colour (for glow shadows)
  entryF: number;                  // entry duration in frames
}

// The Animation Switch Engine. Pure: spring() / interpolate() / velBlur() are stateless,
// so this is safe to call inside .map(). Every px distance is rounded; motion is translate3d.
function editorMasalaAnim(anim: EditorMasalaAnim, c: AnimCtx): AnimResult {
  const { lf, fps, sz, color, entryF } = c;
  const EXP = Easing.out(Easing.exp);
  const op  = interpolate(lf, [0, 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  switch (anim) {
    case 'slide_blur': {
      const vb = velBlur(lf, sz(10), 0, entryF, fps);   // sz(10) (was 12) → shorter slide, lighter velocity-blur, matches preview
      return { transform: `translate3d(0, ${Math.round(vb.value)}px, 0)`, opacity: op, filter: vb.filter };
    }

    case 'fade_up': {
      const vb     = velBlur(lf, sz(10), 0, Math.round(entryF * 1.4), fps);
      const opSlow = interpolate(lf, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { transform: `translate3d(0, ${Math.round(vb.value)}px, 0)`, opacity: opSlow, filter: vb.filter };
    }

    case 'zoom_punch': {
      const s      = spring({ frame: lf, fps, config: { stiffness: 540, damping: 17, mass: 0.7 } });
      const scale  = 0.42 + 0.58 * s;                      // punch in 0.42 → ~1 (slight overshoot)
      const vb     = velBlur(lf, sz(8), 0, entryF, fps);
      const burst  = interpolate(lf, [0, 4], [3.2, 0], { easing: EXP, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const blurPx = Math.max(vb.blur, burst);
      return {
        transform: `translate3d(0, ${Math.round(vb.value)}px, 0) scale(${scale.toFixed(3)})`,
        opacity: op,
        filter: blurPx > 0.05 ? `blur(${blurPx.toFixed(2)}px)` : 'none',
      };
    }

    case 'scale_bounce': {
      const s     = spring({ frame: lf, fps, config: { stiffness: 260, damping: 9, mass: 0.9 } });
      const scale = 0.7 + 0.3 * s;                          // bouncy settle to ~1
      return { transform: `translate3d(0,0,0) scale(${scale.toFixed(3)})`, opacity: op, filter: 'none' };
    }

    case 'soft_glow': {
      const opSlow = interpolate(lf, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const vb     = velBlur(lf, sz(6), 0, Math.round(entryF * 1.5), fps);
      const glow   = Math.round(interpolate(lf, [0, 24], [18, 5], { easing: EXP, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
      return {
        transform: `translate3d(0, ${Math.round(vb.value)}px, 0)`,
        opacity: opSlow,
        filter: 'none',
        textShadow: `0 0 ${glow}px ${color}, 0 0 ${glow * 2}px ${color}`,
      };
    }

    default:
      // Unknown/removed animation (e.g. stale engineData) → plain fade-in, never hidden.
      return { transform: 'translate3d(0,0,0)', opacity: op, filter: 'none' };
  }
}

// Client fallback hero pick: when no word is explicitly emphasised and no Python engineData
// is present, deterministically choose the "hero" (longest significant word) so the signature
// lockup still appears. SCOPED to editor_masala — it never mutates words or styleOverride, so
// no other template is affected. Kept byte-identical to the CaptionOverlay copy (preview==export).
const EM_STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of',
  'in', 'on', 'for', 'with', 'at', 'by', 'it', 'this', 'that', 'you', 'your', 'they', 'have',
  'has', 'had', 'will', 'would', 'what', 'when', 'where', 'why', 'how', 'from', 'just', 'not',
  'about', 'into',
  'hai', 'hain', 'tha', 'thi', 'ki', 'ka', 'ke', 'ko', 'se', 'mein', 'par', 'aur', 'ya',
  'nahi', 'kya', 'jo', 'woh', 'yeh', 'bhi', 'toh', 'kar', 'raha', 'rahe', 'mera', 'tera',
  'aap', 'hum',
  'ahe', 'ani', 'pan', 'mi', 'tu', 'kay',
  'naan', 'nee', 'avan', 'aval', 'adi', 'idi', 'oru', 'illa', 'enna',
  'nenu', 'nuvvu', 'oka', 'ledu', 'emi',
  'ami', 'tumi', 'eta', 'ekta', 'nei', 'ache',
]);
function pickEditorMasalaHero(ws: { text: string }[]): number {
  let bestIdx = -1, bestLen = 3;   // require normalised length >= 4 to qualify
  for (let i = 0; i < ws.length; i++) {
    const n = (ws[i].text || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    if (n.length > bestLen && !EM_STOPWORDS.has(n)) { bestLen = n.length; bestIdx = i; }
  }
  return bestIdx;
}

interface EditorMasalaRowProps {
  words:           TranscriptWord[];
  contextFontSize: number;
  textColor?:      string;
  fontScale?:      number;
  slots:           ResolvedEditorMasalaSlots;
}

function EditorMasalaRow({
  words, contextFontSize, textColor = '#ffffff', fontScale = 1, slots,
}: EditorMasalaRowProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  if (!words.length) return null;

  const RS = width < height ? width / 270 : width / 640;
  const sz = (n: number) => Math.round(n * RS * fontScale);

  // Script-aware context font: keep the script's Noto stack for Indic/Arabic, swap the Latin
  // default (Montserrat) for the user's slot font. Mirrors editorMasalaFont but slot-driven.
  const ctxFont = (t: string): string => {
    const f = getFontFamily(t);
    return f === 'system-ui, sans-serif' ? slots.contextFont : f;
  };

  const CTX_FS  = contextFontSize;
  const ENTRY_F = Math.max(1, Math.round(fps * 0.4));
  const zoneGap = sz(2);   // tight hemisphere word gap (like Illusion)
  // Positive clearance so the context hemispheres sit just clear of the hero's glyphs (matches
  // the Illusion fix — was a negative tuck + crushed heroLine that pushed context over the letters).
  const tierGap     = `${Math.round(contextFontSize * 0.12)}px`;

  const ws = words as EngineWord[];

  const startF = (w: TranscriptWord) => Math.floor((w.startMs / 1000) * fps);

  // In-animation override — see IllusionRow. Replaces the signature slide-blur with a uniform
  // snappy slide (or instant appear) for every word; the 3-tier hemisphere lockup is untouched.
  const inAnim   = slots.inAnimation;
  const override = inAnim !== 'default';
  const inResult = (w: TranscriptWord, mag: number): AnimResult => {
    const p = resolveInAnimPose(inAnim as Exclude<typeof inAnim, 'default'>, (frame - startF(w)) / fps, mag);
    return { transform: `translate3d(${Math.round(p.dx)}px, ${Math.round(p.dy)}px, 0)`, opacity: p.opacity, filter: 'none' };
  };

  // ── Find the Hero word (Python data extraction unchanged) ───────────────────
  const isHeroWord = (w: EngineWord) =>
    !!(w.engineData?.isEmphasized || w.engineData?.isHero
       || w.styleOverride?.color || (w.styleOverride?.scale && w.styleOverride.scale > 1));

  let emphIndex = ws.findIndex(isHeroWord);
  if (emphIndex === -1) emphIndex = pickEditorMasalaHero(ws);
  // Anti-collapse guarantee: if Python flagged no hero AND no significant word qualified,
  // force the single LONGEST word so the 3-tier lockup never collapses to a flat line.
  if (emphIndex === -1) emphIndex = ws.reduce((b, w, i, a) => w.text.length > a[b].text.length ? i : b, 0);
  const heroWord = ws[emphIndex];

  // ── Hero visual persona (seeded) ────────────────────────────────────────────
  // A = Elegant Script (250%, serif italic, lowercase, white, 600).
  // B = Glowing Punch  (200%, base sans, uppercase, white/yellow, 900, heavy glow).
  // persona / swap / diagonal via the SAME salted djb2 hash as the plugin's _ng_emHash (over the
  // caption's word text), so the native AE insert makes the SAME choices as this export/preview.
  const emHash = (wl: { text: string }[], salt: string): number => {
    let s = salt; for (const w of wl) s += w.text;
    let h = 5381; for (let j = 0; j < s.length; j++) h = ((h * 33) ^ s.charCodeAt(j)) & 0x7fffffff;
    return h;
  };
  // personaMode 'A'/'B' pins the persona; 'auto' keeps the seeded djb2 coin-flip (default).
  const persona: 'A' | 'B' =
    slots.personaMode === 'A' ? 'A' :
    slots.personaMode === 'B' ? 'B' :
    (emHash(ws, '') % 2 === 0 ? 'A' : 'B');
  // Indic/Arabic hero text has no Latin serif-italic glyphs and no letter case → fall back to
  // the script-aware sans and drop italic/transform for those.
  const heroIndic = getFontFamily(heroWord.text) !== 'system-ui, sans-serif';
  const heroFS    = Math.round(CTX_FS * (persona === 'A' ? 2.5 : 2.2));
  const heroFont  = heroIndic ? editorMasalaFont(heroWord.text)
                  : persona === 'A' ? slots.heroAFont
                  : slots.heroBFont;
  const heroStyle: React.CSSProperties['fontStyle'] = persona === 'A' && !heroIndic ? 'italic' : 'normal';
  const heroCase: React.CSSProperties['textTransform'] =
    heroIndic ? 'none' : persona === 'A' ? 'lowercase' : 'uppercase';
  const heroWeight = persona === 'A' ? 600 : 900;
  const heroLine   = 1;                                    // lineHeight:1 contains the glyphs (was 0.75 → overlap)
  const heroColor  = persona === 'A'
    ? slots.heroAColor
    : (heroWord.styleOverride?.color ?? slots.heroBColor);  // Persona B → gold default
  // Persona B (the "glowing punch") glows; persona A (elegant script) stays clean → the glow appears
  // RANDOMLY with the random persona. sz()-scaled so preview == export; persona is the SAME djb2 pick
  // as the native plugin, so the native insert glows on the SAME captions.
  const heroGlow = persona === 'B'
    ? `0 0 ${sz(15)}px rgba(255,255,255,0.4), 0 0 ${sz(30)}px rgba(255,255,255,0.2)`
    : undefined;

  // ── Hemisphere split + seeded swap ──────────────────────────────────────────
  const preWords  = ws.slice(0, emphIndex);
  const postWords = ws.slice(emphIndex + 1);
  const swap        = emHash(ws, 'hemi') % 2 === 0;       // assign pre/post to top/bottom
  const topWords    = swap ? postWords : preWords;
  const bottomWords = swap ? preWords  : postWords;

  // ── Center-cluster diagonal stagger (THE wall-slam fix) ─────────────────────
  // The old layout used justifyContent:flex-start/flex-end on width:100% tiers, which
  // slammed the context words into the dotted box's left/right walls. Tiers are now
  // auto-width and centred by the parent (alignItems:center); a small BOUNDED translateX
  // gives the signature diagonal offset without ever reaching the box edges. The seed
  // flips the diagonal (top-left+bottom-right  ↔  top-right+bottom-left).
  const offset       = Math.round(contextFontSize * 1.5);
  const diagFlip     = emHash(ws, 'diag') % 2 === 0;
  const topOffset    = diagFlip ?  offset : -offset;
  const bottomOffset = diagFlip ? -offset :  offset;

  // ── Seeded macro-decisions (identical every render → preview == export) ──────

  // ── Per-word renderer — executes the Python-assigned animation via useVelocityBlur ──
  // (translate3d + rounded px + will-change → Lambda anti-jitter)
  const renderWord = (w: EngineWord, role: 'context' | 'hero'): React.ReactNode => {
    const lf     = frame - startF(w);
    const active = lf >= 0;

    const isHero = role === 'hero';
    // Every word does the SAME short ease-out slide (matches the native plugin) — no per-word variety,
    // no scale-pop. engineData/fallback intentionally bypassed for editor_masala.
    const anim: EditorMasalaAnim = 'slide_blur';
    const color = isHero ? heroColor : (slots.contextColor ?? textColor);

    const a = !active
      ? EM_HIDDEN
      : override
        ? inResult(w, isHero ? sz(24) : sz(14))
        : editorMasalaAnim(anim, { lf, fps, sz, color, entryF: ENTRY_F });

    // Spoken words persist at full opacity (no dim/replace) so the highlight never "moves".
    const opacity = active ? a.opacity : 0;

    return (
      <span key={w.id} style={{
        display: 'inline-block',
        fontFamily:    isHero ? heroFont   : ctxFont(w.text),
        fontStyle:     isHero ? heroStyle  : 'normal',
        fontWeight:    isHero ? heroWeight : 600,
        fontSize:      isHero ? heroFS     : CTX_FS,
        lineHeight:    isHero ? heroLine   : 0.8,          // hero box contains glyphs; context stays tight
        textTransform: isHero ? heroCase   : 'none',
        color,
        whiteSpace: 'nowrap',
        opacity,
        transform: a.transform,                            // translate3d(...) — GPU, sub-pixel-safe
        filter: a.filter,
        textShadow: isHero ? (heroGlow ?? a.textShadow) : a.textShadow,
        willChange: 'transform, filter, opacity',
      }}>{w.text}</span>
    );
  };

  // ── 3-TIER STAGGERED HEMISPHERE LOCKUP ──────────────────────────────────────
  return (
    <div style={{
      position: 'relative', isolation: 'isolate', width: '100%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>

      {/* Tier 1 — Top hemisphere: auto-width, centred by the parent, then nudged diagonally via
          translateX and tucked DOWN onto the hero. NO width:100% + flex-align (the old wall-slam). */}
      {topWords.length > 0 && (
        <div style={{
          position: 'relative', zIndex: 2, maxWidth: '100%', boxSizing: 'border-box',
          display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'center',
          gap: zoneGap, marginBottom: tierGap,
          transform: `translate3d(${topOffset}px, 0, 0)`, willChange: 'transform',
        }}>
          {topWords.map(w => renderWord(w, 'context'))}
        </div>
      )}

      {/* Tier 2 — the persona-styled Hero word (lineHeight:1 so its box contains the glyphs) */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', justifyContent: 'center', overflow: 'visible' }}>
        {renderWord(heroWord, 'hero')}
      </div>

      {/* Tier 3 — Bottom hemisphere: auto-width, centred, nudged the OPPOSITE diagonal via
          translateX and tucked UP onto the hero. */}
      {bottomWords.length > 0 && (
        <div style={{
          position: 'relative', zIndex: 2, maxWidth: '100%', boxSizing: 'border-box',
          display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center',
          gap: zoneGap, marginTop: tierGap,
          transform: `translate3d(${bottomOffset}px, 0, 0)`, willChange: 'transform',
        }}>
          {bottomWords.map(w => renderWord(w, 'context'))}
        </div>
      )}
    </div>
  );
}

