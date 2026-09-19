// THE single source of truth for scene / overlay graphics templates.
//
// Everything downstream is DERIVED from this file: the picker grid, the category sections, the
// auto-generated settings panel, the export font-warm set, and the renderer itself. There is no
// second list of ids anywhere — which is the whole point. The caption system has ~8 parallel
// hand-maintained lists and they have already drifted (`devin_jatho` ships a renderer branch, an
// .ass case, a canvas case and a plugin spec, but no picker entry, so it is unreachable).
//
// To add a template: write src/lib/graphics/templates/<name>.tsx, import it here, add it to
// GRAPHICS_TEMPLATES. That is the entire checklist. `npx vitest run` will tell you if the
// template violates any invariant.

import {
  EL_ON, EL_S, EL_X, EL_Y,
  type ElementStyle, type GraphicsBox, type GraphicsCategory, type GraphicsInstance,
  type GraphicsTemplate, type ParamDef, type ParamValue, type ResolvedParams,
} from '@/types/graphics';
import { GRAPHICS_FONT_IDS, fontFamilyName } from './fonts';

import { iosNotification } from './templates/iosNotification';
import { subscribeButton } from './templates/subscribeButton';
import { hookTitleCard } from './templates/hookTitleCard';
import { countdown } from './templates/countdown';
import { progressBar } from './templates/progressBar';
import { terminalTyping } from './templates/terminalTyping';
import { barChart } from './templates/barChart';
import { popUpBubble } from './templates/popUpBubble';
import { notificationStack } from './templates/notificationStack';
import { alarmToggle } from './templates/alarmToggle';
import { emojiButton } from './templates/emojiButton';
import { clickButton } from './templates/clickButton';
import { phoneMessages } from './templates/phoneMessages';
import { stickyNotes } from './templates/stickyNotes';
import { heartCrush } from './templates/heartCrush';
import { likeBadge } from './templates/likeBadge';
import { locationPin } from './templates/locationPin';
import { spotifyPlayer } from './templates/spotifyPlayer';
import { instagramStory } from './templates/instagramStory';
import { onOffToggle } from './templates/onOffToggle';
import { viewCart } from './templates/viewCart';
import { instagramProfile } from './templates/instagramProfile';
import { quoteCard } from './templates/quoteCard';
import { weddingAnnounce } from './templates/weddingAnnounce';
import { photoStrip } from './templates/photoStrip';
import { phoneFan } from './templates/phoneFan';
import { vinylPlayer } from './templates/vinylPlayer';
import { statReveal } from './templates/statReveal';
import { appList } from './templates/appList';
import { wordCycler } from './templates/wordCycler';
import { scatterText } from './templates/scatterText';
import { wiggleTitle } from './templates/wiggleTitle';
import { gravityWord } from './templates/gravityWord';
import { imageShuffle } from './templates/imageShuffle';
import { storyStack } from './templates/storyStack';
import { bookShelf } from './templates/bookShelf';
import { browserReveal } from './templates/browserReveal';
import { spillWord } from './templates/spillWord';
import { energyText } from './templates/energyText';
import { comicBurst } from './templates/comicBurst';
import { squiggleColumn } from './templates/squiggleColumn';
import { funnelPath } from './templates/funnelPath';
import { textBlob } from './templates/textBlob';
import { yearZoom } from './templates/yearZoom';
import { wordRing } from './templates/wordRing';
import { stretchRows } from './templates/stretchRows';
import { extendStack } from './templates/extendStack';
import { bounceBlocks } from './templates/bounceBlocks';
import { systemReadout } from './templates/systemReadout';
import { growthCurve } from './templates/growthCurve';
import { splitFlap } from './templates/splitFlap';
import { neonSign } from './templates/neonSign';
import { letterPins } from './templates/letterPins';
import { editorialTitle } from './templates/editorialTitle';
import { glyphHeadline } from './templates/glyphHeadline';
import { wordPile } from './templates/wordPile';
import { voiceCard } from './templates/voiceCard';
import { lineSwap } from './templates/lineSwap';
import { appHub } from './templates/appHub';
import { timeLapse } from './templates/timeLapse';
import { noteCard } from './templates/noteCard';
import { channelCard } from './templates/channelCard';
import { envelopeLetter } from './templates/envelopeLetter';
import { lockScreen } from './templates/lockScreen';
import { diaryPage } from './templates/diaryPage';
import { posterReveal } from './templates/posterReveal';
import { countdownBar } from './templates/countdownBar';
import { iconGlow } from './templates/iconGlow';
import { heartbeatLine } from './templates/heartbeatLine';
import { warningPulse } from './templates/warningPulse';
import { neonBadge } from './templates/neonBadge';
import { nodeFlow } from './templates/nodeFlow';
import { updateToast } from './templates/updateToast';
import { morphBlob } from './templates/morphBlob';
import { letterReveal } from './templates/letterReveal';
import { decodeText } from './templates/decodeText';
import { logoMorph } from './templates/logoMorph';
import { stickerBounce } from './templates/stickerBounce';
import { appLaunch } from './templates/appLaunch';
import { emojiRain } from './templates/emojiRain';
import { heroReveal } from './templates/heroReveal';
import { storyCards } from './templates/storyCards';
import { sceneZoom } from './templates/sceneZoom';
import { emphasisLines } from './templates/emphasisLines';
import { storyBeats } from './templates/storyBeats';
import { musicVisualizer } from './templates/musicVisualizer';
import { dockSpill } from './templates/dockSpill';
import { clockWords } from './templates/clockWords';
import { laptopOpen } from './templates/laptopOpen';
import { typewriterPage } from './templates/typewriterPage';
import { routeMap } from './templates/routeMap';
import { portfolioCard } from './templates/portfolioCard';
import { starChart } from './templates/starChart';
import { articlePage } from './templates/articlePage';
import { retroPhone } from './templates/retroPhone';
import { retroDesktop } from './templates/retroDesktop';
import { journeyCurve } from './templates/journeyCurve';
import { gainersLosers } from './templates/gainersLosers';
import { stackedBars } from './templates/stackedBars';
import { vennCircles } from './templates/vennCircles';
import { productDashboard } from './templates/productDashboard';
import { docSheet } from './templates/docSheet';
import { moodPicker } from './templates/moodPicker';
import { ringCountdown } from './templates/ringCountdown';
import { calendarMonth } from './templates/calendarMonth';
import { pencilDraw } from './templates/pencilDraw';
import { securityScan } from './templates/securityScan';
import { festivalPoster } from './templates/festivalPoster';
import { folderGallery } from './templates/folderGallery';
import { objectStorm } from './templates/objectStorm';
import { nightDrive } from './templates/nightDrive';
import { winRateGauge } from './templates/winRateGauge';
import { wordAssemble } from './templates/wordAssemble';
import { optionStack } from './templates/optionStack';
import { compareChart } from './templates/compareChart';
import { calendarPad } from './templates/calendarPad';
import { amountTicker } from './templates/amountTicker';
import { hackerDesk } from './templates/hackerDesk';
import { serviceCards } from './templates/serviceCards';
import { adSpendCard } from './templates/adSpendCard';
import { yearHorizon } from './templates/yearHorizon';
import { dailyDigest } from './templates/dailyDigest';
import { trendBars } from './templates/trendBars';
import { branchGrow } from './templates/branchGrow';
import { calendarDrop } from './templates/calendarDrop';
import { cardForge } from './templates/cardForge';
import { paperClone } from './templates/paperClone';
import { flightCard } from './templates/flightCard';
import { beadWord } from './templates/beadWord';
import { checkList } from './templates/checkList';
import { pixelWave } from './templates/pixelWave';
import { emojiList } from './templates/emojiList';
import { dotGather } from './templates/dotGather';
import { miniChart } from './templates/miniChart';
import { systemTree } from './templates/systemTree';
import { chatThread } from './templates/chatThread';
import { platformScene } from './templates/platformScene';
import { photoBooth } from './templates/photoBooth';
import { stickyScatter } from './templates/stickyScatter';
import { wealthCounter } from './templates/wealthCounter';
import { lowerThirdLuxe } from './templates/lowerThirdLuxe';
import { chapterCard } from './templates/chapterCard';
import { luxeQuote } from './templates/luxeQuote';
import { markerAnnotate } from './templates/markerAnnotate';
import { glassList } from './templates/glassList';
import { impactStat } from './templates/impactStat';
import { wordSlam } from './templates/wordSlam';
import { checkCrossList } from './templates/checkCrossList';
import { bigArrow } from './templates/bigArrow';
import { frameworkBoxes } from './templates/frameworkBoxes';
import { beforeAfter } from './templates/beforeAfter';
import { versusClash } from './templates/versusClash';
import { moneyStack } from './templates/moneyStack';
import { offerStack } from './templates/offerStack';
import { paperNote } from './templates/paperNote';
import { bookCard } from './templates/bookCard';
import { citationCard } from './templates/citationCard';
import { highlightText } from './templates/highlightText';
import { sketchGraph } from './templates/sketchGraph';
import { habitTracker } from './templates/habitTracker';
import { prosCons } from './templates/prosCons';
import { dotMap } from './templates/dotMap';
import { timelineYears } from './templates/timelineYears';
import { statGrid } from './templates/statGrid';
import { receiptRoll } from './templates/receiptRoll';
import { pollBars } from './templates/pollBars';
import { focusRing } from './templates/focusRing';
import { candleChart } from './templates/candleChart';
import { compareTable } from './templates/compareTable';
import { letterboxTitle } from './templates/letterboxTitle';
import { stampVerdict } from './templates/stampVerdict';
import { numberLadder } from './templates/numberLadder';
import { warningBanner } from './templates/warningBanner';
import { quotePunch } from './templates/quotePunch';
import { countdownSlam } from './templates/countdownSlam';
import { calloutBar } from './templates/calloutBar';
import { commentPop } from './templates/commentPop';
import { reactionRise } from './templates/reactionRise';
import { subscriberCount } from './templates/subscriberCount';
import { ratingCard } from './templates/ratingCard';
import { searchType } from './templates/searchType';
import { engageRow } from './templates/engageRow';
import { polaroidStack } from './templates/polaroidStack';
import { notebookList } from './templates/notebookList';
import { mindMap } from './templates/mindMap';
import { pieSketch } from './templates/pieSketch';
import { calendarFlip } from './templates/calendarFlip';
import { donutPercent } from './templates/donutPercent';
import { tickerTape } from './templates/tickerTape';
import { podcastWave } from './templates/podcastWave';
import { funnelChart } from './templates/funnelChart';
import { outlineFill } from './templates/outlineFill';
import { splitReveal } from './templates/splitReveal';
import { subtitleChip } from './templates/subtitleChip';
import { newsStrap } from './templates/newsStrap';
import { bracketTitle } from './templates/bracketTitle';
import { speedLines } from './templates/speedLines';
import { emberRise } from './templates/emberRise';
import { lightSweep } from './templates/lightSweep';
import { zoomFrame } from './templates/zoomFrame';
import { linkPill } from './templates/linkPill';
import { filmBurn } from './templates/filmBurn';
import { definitionCard } from './templates/definitionCard';
import { quizCard } from './templates/quizCard';
import { didYouKnow } from './templates/didYouKnow';
import { formulaCard } from './templates/formulaCard';
import { keyboardKeys } from './templates/keyboardKeys';
import { humanGrid } from './templates/humanGrid';
import { progressSteps } from './templates/progressSteps';
import { chartRace } from './templates/chartRace';
import { locationTag } from './templates/locationTag';
import { dateStamp } from './templates/dateStamp';
import { archivalFrame } from './templates/archivalFrame';
import { creditsRoll } from './templates/creditsRoll';
import { discountBadge } from './templates/discountBadge';
import { trophyRank } from './templates/trophyRank';
import { vhsGlitch } from './templates/vhsGlitch';
import { spotlightReveal } from './templates/spotlightReveal';
import { waitForIt } from './templates/waitForIt';
import { wrappedStats } from './templates/wrappedStats';
import { povCard } from './templates/povCard';
import { screenshotThis } from './templates/screenshotThis';
import { dmPop } from './templates/dmPop';
import { auraPoints } from './templates/auraPoints';
import { streakFlame } from './templates/streakFlame';
import { bentoRecap } from './templates/bentoRecap';
import { coreMemory } from './templates/coreMemory';
import { chromeWave } from './templates/chromeWave';
import { zoomPunch } from './templates/zoomPunch';
import { cashFlow } from './templates/cashFlow';
import { sceneChaosHook } from './templates/sceneChaosHook';
import { sceneMeetLine } from './templates/sceneMeetLine';
import { sceneUiResolve } from './templates/sceneUiResolve';
import { sceneStatRow } from './templates/sceneStatRow';
import { scenePhoneStyles } from './templates/scenePhoneStyles';
import { sceneSlamLine } from './templates/sceneSlamLine';
import { sceneToastCascade } from './templates/sceneToastCascade';
import { sceneEndcard } from './templates/sceneEndcard';
import { sceneWordFlash } from './templates/sceneWordFlash';
import { sceneWordRotator } from './templates/sceneWordRotator';
import { sceneCardMosaic } from './templates/sceneCardMosaic';
import { sceneCtaClick } from './templates/sceneCtaClick';

// NOTE: `./malloy` is deliberately NOT imported here. It is 1399 templates and ~17MB of the
// bundle, and it is pulled in on demand by loadImportedTemplates() below. A static import
// anywhere in the app would silently undo the split, so there must be exactly one — the dynamic
// one. registry.spec.ts asserts that.

const AUTHORED_TEMPLATES = [
  // SCENES (2026-08-11) — fullBleed, frame-owning shots with hand-choreographed interiors.
  // A film is composed from these, not from overlays: overlays are stickers for a creator's
  // footage, scenes are the shots of a film. See sceneKit.tsx for why.
  sceneChaosHook,
  sceneMeetLine,
  sceneUiResolve,
  sceneStatRow,
  scenePhoneStyles,
  sceneSlamLine,
  sceneToastCascade,
  sceneEndcard,
  // Teaser language (2026-08-11) — decoded from a high-impact SaaS promo: giant word rhythm
  // over flipping grounds, the audience rotator, proof mosaics, and a close that ends on a click.
  sceneWordFlash,
  sceneWordRotator,
  sceneCardMosaic,
  sceneCtaClick,
  // Luxe signature set (2026-07-29) — the dark-luxury documentary staples.
  wealthCounter,
  lowerThirdLuxe,
  chapterCard,
  luxeQuote,
  markerAnnotate,
  glassList,
  // Creator wave (2026-07-29) — three house languages: PUNCH (Hormozi-school slams),
  // PAPER (Abdaal-school cream cards + hand-drawn strokes), DOCU (luxe extensions).
  impactStat,
  moneyStack,
  offerStack,
  statGrid,
  receiptRoll,
  wordSlam,
  versusClash,
  beforeAfter,
  checkCrossList,
  frameworkBoxes,
  bigArrow,
  paperNote,
  bookCard,
  citationCard,
  highlightText,
  sketchGraph,
  habitTracker,
  prosCons,
  dotMap,
  timelineYears,
  pollBars,
  focusRing,
  // MAX expansion (2026-07-29) — full-coverage professional set: money/data,
  // social proof, education-paper, kinetic titles, cinema and FX overlays.
  candleChart,
  numberLadder,
  tickerTape,
  compareTable,
  donutPercent,
  funnelChart,
  mindMap,
  pieSketch,
  stampVerdict,
  warningBanner,
  quotePunch,
  countdownSlam,
  calloutBar,
  commentPop,
  reactionRise,
  subscriberCount,
  ratingCard,
  polaroidStack,
  searchType,
  podcastWave,
  engageRow,
  linkPill,
  notebookList,
  calendarFlip,
  letterboxTitle,
  outlineFill,
  splitReveal,
  subtitleChip,
  bracketTitle,
  newsStrap,
  speedLines,
  emberRise,
  lightSweep,
  zoomFrame,
  filmBurn,
  // Wave 4 (2026-07-30) — education (PAPER), documentary chrome (DOCU location/date/
  // archival/credits), data stories, PUNCH stickers, and two fullBleed frame FX. All born
  // under the aspect contract: backdrop declared, fullBleed FX sized off min(w,h).
  definitionCard,
  quizCard,
  didYouKnow,
  formulaCard,
  keyboardKeys,
  humanGrid,
  progressSteps,
  chartRace,
  locationTag,
  dateStamp,
  archivalFrame,
  creditsRoll,
  discountBadge,
  trophyRank,
  vhsGlitch,
  spotlightReveal,
  // FOMO wave (2026-07-31) — trend-native, emotionally-loaded hero templates built on the
  // juice toolkit (lib/graphics/juice.ts): nothing sits still, impacts land with flash +
  // shake + chroma pop, glows breathe. badge 'Hot'.
  waitForIt,
  wrappedStats,
  povCard,
  screenshotThis,
  dmPop,
  auraPoints,
  streakFlame,
  bentoRecap,
  coreMemory,
  chromeWave,
  zoomPunch,
  cashFlow,
  iosNotification,
  notificationStack,
  phoneMessages,
  heartCrush,
  likeBadge,
  locationPin,
  spotifyPlayer,
  instagramStory,
  instagramProfile,
  storyStack,
  quoteCard,
  photoStrip,
  imageShuffle,
  phoneFan,
  vinylPlayer,
  popUpBubble,
  alarmToggle,
  stickyNotes,
  onOffToggle,
  appList,
  bookShelf,
  browserReveal,
  systemReadout,
  voiceCard,
  appHub,
  noteCard,
  lockScreen,
  envelopeLetter,
  diaryPage,
  nodeFlow,
  appLaunch,
  musicVisualizer,
  dockSpill,
  laptopOpen,
  typewriterPage,
  retroPhone,
  retroDesktop,
  productDashboard,
  docSheet,
  moodPicker,
  securityScan,
  folderGallery,
  optionStack,
  subscribeButton,
  emojiButton,
  clickButton,
  viewCart,
  channelCard,
  hookTitleCard,
  wordCycler,
  spillWord,
  energyText,
  comicBurst,
  squiggleColumn,
  funnelPath,
  textBlob,
  yearZoom,
  wordRing,
  stretchRows,
  extendStack,
  bounceBlocks,
  neonSign,
  letterPins,
  editorialTitle,
  glyphHeadline,
  wordPile,
  lineSwap,
  posterReveal,
  letterReveal,
  logoMorph,
  stickerBounce,
  decodeText,
  heroReveal,
  storyCards,
  emphasisLines,
  storyBeats,
  clockWords,
  articlePage,
  vennCircles,
  festivalPoster,
  wordAssemble,
  scatterText,
  wiggleTitle,
  gravityWord,
  weddingAnnounce,
  countdown,
  progressBar,
  terminalTyping,
  barChart,
  iconGlow,
  morphBlob,
  emojiRain,
  sceneZoom,
  pencilDraw,
  objectStorm,
  nightDrive,
  warningPulse,
  neonBadge,
  heartbeatLine,
  updateToast,
  statReveal,
  growthCurve,
  splitFlap,
  timeLapse,
  countdownBar,
  routeMap,
  portfolioCard,
  starChart,
  journeyCurve,
  gainersLosers,
  stackedBars,
  ringCountdown,
  calendarMonth,
  winRateGauge,
  compareChart,
  calendarPad,
  amountTicker,
  hackerDesk,
  serviceCards,
  adSpendCard,
  yearHorizon,
  dailyDigest,
  trendBars,
  branchGrow,
  calendarDrop,
  cardForge,
  paperClone,
  flightCard,
  beadWord,
  checkList,
  pixelWave,
  emojiList,
  dotGather,
  miniChart,
  systemTree,
  chatThread,
  platformScene,
  photoBooth,
  stickyScatter,
] as const satisfies readonly GraphicsTemplate[];

/** Everything the picker offers: the hand-authored set first (they are the curated ones), then
 *  the adapted imports. Imported templates carry source:'malloy' and a 'Studio' badge, so both
 *  the UI and the invariants can tell them apart without a second list to keep in sync. */
const REGISTRY: GraphicsTemplate[] = [...(AUTHORED_TEMPLATES as readonly GraphicsTemplate[])];

/** Everything the picker offers: the hand-authored set first (they are the curated ones), then
 *  the adapted imports. Imported templates carry source:'malloy' and a 'Studio' badge, so both
 *  the UI and the invariants can tell them apart without a second list to keep in sync.
 *
 *  GROWS AT RUNTIME. It starts as the authored set alone and the imports are appended when
 *  loadImportedTemplates() resolves — the array IDENTITY never changes, so anything holding a
 *  reference sees them appear. React callers must not treat it as immutable: subscribe through
 *  useImportedTemplates() (or read importedTemplatesVersion()) to re-render when it grows. */
export const GRAPHICS_TEMPLATES: readonly GraphicsTemplate[] = REGISTRY;

export type GraphicsTemplateId = (typeof AUTHORED_TEMPLATES)[number]['id'];

const BY_ID = new Map<string, GraphicsTemplate>(REGISTRY.map((t) => [t.id, t]));

// ── the imported library, loaded on demand ───────────────────────────────────
// Bundling all 1399 imports into the main chunk cost ~6% render wall-clock on EVERY export,
// including the overwhelming majority that use no imported template at all. They live in their
// own chunk now and are fetched only when something actually references one.

/** Imported ids are prefixed by the importer and authored ids never are, so a project can be
 *  asked whether it needs the chunk WITHOUT the chunk being present. registry.spec.ts asserts
 *  both halves of that (every import prefixed, no authored template prefixed). */
export const IMPORTED_ID_PREFIX = 'ml_';
export const isImportedTemplateId = (id: string): boolean => id.startsWith(IMPORTED_ID_PREFIX);

/** Does this project reference the imported library at all? */
export function needsImportedTemplates(graphics: readonly { templateId: string }[] | undefined): boolean {
  return (graphics ?? []).some((g) => isImportedTemplateId(g.templateId));
}

let importedLoaded = false;
let importedPromise: Promise<void> | null = null;
let importedVersion = 0;
const importedListeners = new Set<() => void>();

/** True once the imported library is in memory — i.e. getGraphicsTemplate('ml_…') will resolve. */
export const importedTemplatesReady = (): boolean => importedLoaded;

/** Bumps once when the imports land. A stable snapshot value for useSyncExternalStore. */
export const importedTemplatesVersion = (): number => importedVersion;

export function subscribeImportedTemplates(fn: () => void): () => void {
  importedListeners.add(fn);
  return () => { importedListeners.delete(fn); };
}

/** Pull in the imported library and merge it into the registry. Idempotent, and concurrent
 *  callers share one in-flight import — every surface can call it without coordinating.
 *
 *  Rejects only if the chunk itself fails to load. Callers that render should catch and carry on
 *  with the authored set: a missing chunk must degrade to "that graphic draws nothing", exactly
 *  as a retired template id already does, never to a failed export. */
export function loadImportedTemplates(): Promise<void> {
  if (importedLoaded) return Promise.resolve();
  importedPromise ??= import('./malloy').then((m) => {
    if (importedLoaded) return;
    for (const t of m.MALLOY_TEMPLATES) {
      REGISTRY.push(t);
      BY_ID.set(t.id, t);
    }
    importedLoaded = true;
    importedVersion++;
    for (const fn of importedListeners) fn();
  });
  return importedPromise;
}

/** Look up a template. Returns undefined for a retired id — a saved project referencing one must
 *  render as nothing, never throw. */
export function getGraphicsTemplate(id: string): GraphicsTemplate | undefined {
  return BY_ID.get(id);
}

/** Picker sections, in display order. This only NAMES the categories — a template's category
 *  lives on the template, so a card can never go missing by being left out of a list here.
 *  registry.spec.ts asserts both directions: no orphan category, no empty section. Add a section
 *  here in the same commit as the first template that uses it, never ahead of one. */
export const GRAPHICS_CATEGORIES: readonly { key: GraphicsCategory; label: string }[] = [
  { key: 'title',  label: 'Titles & Typography' },
  { key: 'money',  label: 'Money & Wealth' },
  { key: 'notify', label: 'Notifications' },
  { key: 'device', label: 'Phones & Screens' },
  { key: 'social', label: 'Social' },
  { key: 'story',  label: 'Story & Chapters' },
  { key: 'chart',  label: 'Charts & Data' },
  { key: 'cta',    label: 'Buttons & CTA' },
  { key: 'fx',     label: 'FX & Ambience' },
];

/** Templates grouped into the ordered sections above, skipping empty ones. */
export function graphicsByCategory(): { key: GraphicsCategory; label: string; templates: GraphicsTemplate[] }[] {
  return GRAPHICS_CATEGORIES
    .map((c) => ({ ...c, templates: GRAPHICS_TEMPLATES.filter((t) => t.category === c.key) }))
    .filter((s) => s.templates.length > 0);
}

/** The whole library as a compact catalog an AI can CHOOSE from — one line per template:
 *  `id | name | category | tags | default seconds`. ~7KB for all 139, cheap enough to ship in a
 *  vision prompt. Used by /api/reference-plan so a reference's look maps onto REAL, measured,
 *  fully-editable templates instead of only text overlays. */
/** The library the AI reference-matcher chooses from — AUTHORED templates only.
 *
 *  Imported templates are excluded deliberately, on both cost and quality grounds: this string
 *  is pasted into every /api/reference-plan prompt, and 1400 more rows would take it from ~14KB
 *  to well over 100KB per call. Worse, the matcher picks by TAGS describing what a template
 *  LOOKS like, which our templates carry and imports do not (they arrive with generic
 *  provenance tags) — so including them would pay more per request for worse matches.
 *  Imports remain fully available to a human in the picker, search and gallery. */
export function graphicsCatalogForAi(): string {
  return GRAPHICS_TEMPLATES
    .filter((t) => !t.source)
    .map((t) => `${t.id} | ${t.name} | ${t.category} | ${(t.tags ?? []).join(',')} | ${(t.defaultDurationMs / 1000).toFixed(1)}s`)
    .join('\n');
}

export function defaultParams(t: GraphicsTemplate): ResolvedParams {
  const out: ResolvedParams = {};
  for (const def of t.params) out[def.key] = def.default;
  return out;
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX3 = /^#[0-9a-fA-F]{3}$/;

/** Coerce ONE override to a safe value for its ParamDef, or return undefined to fall back to the
 *  default. This is both a UX guard (a slider can't be dragged out of range) and the trust
 *  boundary for the render payload — `graphics` arrives from the client and is handed to a
 *  headless browser, so nothing unvalidated reaches a template. */
function coerce(def: ParamDef, raw: ParamValue): ParamValue | undefined {
  switch (def.type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) return undefined;
      return Math.min(def.max, Math.max(def.min, n));
    }
    case 'boolean':
      return typeof raw === 'boolean' ? raw : undefined;
    case 'color': {
      if (typeof raw !== 'string') return undefined;
      const v = raw.trim();
      if (HEX6.test(v)) return v;
      // Expand #abc so downstream helpers only ever see the long form.
      if (HEX3.test(v)) return `#${v.slice(1).split('').map((c) => c + c).join('')}`;
      return undefined;
    }
    case 'font':
      return typeof raw === 'string' && GRAPHICS_FONT_IDS.includes(raw) ? raw : undefined;
    case 'select':
      return typeof raw === 'string' && def.options.some((o) => o.value === raw) ? raw : undefined;
    case 'text': {
      if (typeof raw !== 'string') return undefined;
      return def.maxLength != null ? raw.slice(0, def.maxLength) : raw;
    }
    case 'image': {
      if (typeof raw !== 'string') return undefined;
      const v = raw.trim();
      if (v === '') return v;
      // A blob: URL is tab-scoped and will NOT resolve in the Lambda renderer, which loads the
      // page from an S3 site. Dropping it here means a stale one degrades to the placeholder
      // instead of rendering a broken image in a paid export.
      return v.startsWith('data:image/') || v.startsWith('https://') ? v : undefined;
    }
  }
}

/** Template defaults with the instance's sparse overrides applied, clamped and validated.
 *  The settings panel and the renderer BOTH call this, so what the user sees is what renders. */
export function resolveParams(t: GraphicsTemplate, overrides?: Record<string, ParamValue>): ResolvedParams {
  const out: ResolvedParams = {};
  for (const def of t.params) {
    const raw = overrides?.[def.key];
    const ok = raw === undefined ? undefined : coerce(def, raw);
    out[def.key] = ok === undefined ? def.default : ok;
  }
  return out;
}

/** Build the per-element transform accessor handed to render().
 *
 *  Emits the CSS `translate` / `scale` PROPERTIES, not a `transform` string, so a user's nudge
 *  COMPOSES with whatever `transform` the template is animating with rather than clobbering it.
 *  An unknown key returns {} so a template can call el() for something it never declared without
 *  crashing (it just gets no user offset). */
/** `unitScale` converts the user's design-px nudges into the render's px space. Normal templates
 *  render in design px (scale 1 — the overlay's CSS transform does the mapping); fullBleed
 *  templates render in REAL canvas px, so the overlay passes canvas-min-dim / design-min-dim.
 *  Without it a fullBleed nudge would be a different physical distance in the preview and the
 *  export, which use different canvas resolutions. */
export function elementStyler(t: GraphicsTemplate, params: ResolvedParams, unitScale = 1): (key: string) => ElementStyle {
  return (key: string) => {
    const show = params[key + EL_ON];
    if (show === false) return { display: 'none' };
    // Number(toFixed) keeps integers clean ('12px', not '12.00px') and clamps scaled sub-pixels.
    const x = Number((Number(params[key + EL_X] ?? 0) * unitScale).toFixed(2));
    const y = Number((Number(params[key + EL_Y] ?? 0) * unitScale).toFixed(2));
    const s = Number(params[key + EL_S] ?? 1);
    const out: ElementStyle = {};
    if (x || y) out.translate = `${x}px ${y}px`;
    if (s !== 1) out.scale = String(s);
    return out;
  };
}

/** Whether a param's control should be shown, given the currently resolved values. Visibility
 *  only — a hidden param is still resolved and still passed to render(). */
export function isParamVisible(def: ParamDef, values: ResolvedParams): boolean {
  if (!def.showIf) return true;
  return values[def.showIf.key] === def.showIf.equals;
}

/** Every @font-face family the placed graphics can paint with — the EXPORT font-warm set.
 *  Mirrors referencedFontFamilies() in src/lib/fontFamilies.ts. Without this, a graphic using a
 *  sparsely-used face flashes a fallback on the first export frames. */
export function graphicsFontFamilies(graphics: readonly GraphicsInstance[] | undefined): string[] {
  const out = new Set<string>();
  for (const g of graphics ?? []) {
    const t = getGraphicsTemplate(g.templateId);
    if (!t) continue;
    for (const id of t.fonts) {
      const fam = fontFamilyName(id);
      if (fam) out.add(fam);
    }
    const resolved = resolveParams(t, g.params);
    for (const def of t.params) {
      if (def.type !== 'font') continue;
      const fam = fontFamilyName(String(resolved[def.key]));
      if (fam) out.add(fam);
    }
  }
  return Array.from(out);
}

/** Every image the given graphics will actually draw — the user's photos, resolved and validated
 *  through the SAME path the renderer uses, so this can never list a source the render won't ask
 *  for (or miss one it will).
 *
 *  Templates place photos with a plain <img>, which — unlike Remotion's <Img> — does NOT hold up
 *  frame capture. Left alone, a paid export paints an empty box for the first frames a photo is
 *  on screen. The Lambda composition preloads this list before releasing the render, so the later
 *  <img> resolves from cache on the frame it appears. */
export function graphicsImageSources(graphics: readonly GraphicsInstance[] | undefined): string[] {
  const out = new Set<string>();
  for (const g of graphics ?? []) {
    const t = getGraphicsTemplate(g.templateId);
    if (!t) continue;
    const resolved = resolveParams(t, g.params);
    for (const def of t.params) {
      if (def.type !== 'image') continue;
      const v = resolved[def.key];
      if (typeof v === 'string' && v !== '') out.add(v);
    }
  }
  return Array.from(out);
}

/** Instance aspect presets the Arrange panel offers. `value` is drawn-canvas w/h. */
export const GRAPHIC_ASPECT_PRESETS = [
  { value: 16 / 9, label: 'Wide 16:9' },
  { value: 4 / 3, label: 'Landscape 4:3' },
  { value: 1, label: 'Square 1:1' },
  { value: 4 / 5, label: 'Portrait 4:5' },
  { value: 9 / 16, label: 'Tall 9:16' },
] as const;

/** How far an instance aspect may deviate from the template's design aspect (ratio, either
 *  direction). Templates re-lay out from width/height fractions, which holds up to a point —
 *  beyond it a strap squeezed into a square is broken by construction, so those presets are
 *  simply not offered. registry.spec.ts renders every template at every OFFERED preset. */
export const GRAPHIC_ASPECT_BAND = 2.4;

/** The presets this template can actually wear. fullBleed templates get none — they ARE the
 *  frame. Everything else gets the presets within the band of its design aspect. */
export function aspectPresetsFor(t: GraphicsTemplate): { value: number; label: string }[] {
  if (t.fullBleed) return [];
  const da = t.design.w / t.design.h;
  return GRAPHIC_ASPECT_PRESETS.filter(({ value }) => {
    const r = value / da;
    return Math.max(r, 1 / r) <= GRAPHIC_ASPECT_BAND;
  });
}

/** One resolved sound cue on the SOURCE clock. */
export interface GraphicsSfxCue { ms: number; id: string; gain: number }

/** Every sound cue the placed graphics want, on the source clock, sorted. Hidden and
 *  sound-muted instances contribute nothing; cues are clamped inside their clip window so a
 *  trimmed clip never fires a sound after its graphic is gone. Every playback surface
 *  (preview WebAudio, Lambda <Audio> sequences) derives from THIS ONE list. */
export function graphicsSfxCues(graphics: readonly GraphicsInstance[] | undefined): GraphicsSfxCue[] {
  const out: GraphicsSfxCue[] = [];
  for (const g of graphics ?? []) {
    if (g.hidden || g.sfxOff) continue;
    const t = getGraphicsTemplate(g.templateId);
    if (!t?.sfx) continue;
    for (const c of t.sfx(resolveParams(t, g.params))) {
      if (!Number.isFinite(c.atMs) || c.atMs < 0 || c.atMs > g.durationMs) continue;
      out.push({ ms: g.startMs + c.atMs, id: c.id, gain: c.gain ?? 1 });
    }
  }
  return out.sort((a, b) => a.ms - b.ms);
}

const clampPct = (v: number) => Math.min(100, Math.max(0, v));

export function clampBox(b: GraphicsBox): GraphicsBox {
  return {
    xPercent: clampPct(b.xPercent),
    yPercent: clampPct(b.yPercent),
    widthPercent: Math.min(100, Math.max(5, b.widthPercent)),
  };
}

let seq = 0;

/** A fresh placed instance at `atMs`, using the template's own defaults. `params` starts EMPTY —
 *  overrides are sparse, so retuning a template default later improves this project rather than
 *  being frozen out of it.
 *
 *  `canvasAspect` (canvas W / H) makes the default placement FIT THE FRAME: defaultBox widths are
 *  tuned against a 9:16 canvas, so a 900×1600 portrait card at width 80 dropped on a 16:9 video
 *  would be ~2.5 frames tall. The width is capped so the graphic's height lands within ~82% of
 *  the frame, and the centre is pulled up/down until the whole graphic is on screen. */
export function newGraphicInstance(templateId: string, atMs: number, canvasAspect?: number): GraphicsInstance | null {
  const t = getGraphicsTemplate(templateId);
  if (!t) return null;
  seq += 1;
  const box = { ...t.defaultBox };
  if (canvasAspect && Number.isFinite(canvasAspect) && canvasAspect > 0 && !t.fullBleed) {
    // height as % of canvas = widthPercent × canvasAspect × (design h / design w)
    const maxW = (82 * t.design.w) / (t.design.h * canvasAspect);
    box.widthPercent = Math.max(5, Math.min(box.widthPercent, Math.round(maxW)));
    const hPct = box.widthPercent * canvasAspect * (t.design.h / t.design.w);
    if (hPct < 100) {
      box.yPercent = Math.min(100 - hPct / 2, Math.max(hPct / 2, box.yPercent));
    }
  }
  return {
    id: `g_${Date.now().toString(36)}${seq.toString(36)}`,
    templateId,
    startMs: Math.max(0, Math.round(atMs)),
    durationMs: t.defaultDurationMs,
    box,
    params: {},
  };
}
