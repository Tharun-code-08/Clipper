// THE EDIT LAYER — cutaways, split-screen, wipes and rack-focus.
//
// Everything before this module decorated a single held shot: a border, a caption, a stat
// card, for the whole clip. Measured against the reference reels that is the entire gap.
// They cut away for a third of their runtime (grit 3.60→6.53s = 29%), wipe a second source
// up from the bottom behind a lit divider (neon 4.27s), run full-screen colour wipes
// (vinyl, ~1000ms, twice) and defocus the picture to let captions carry a stretch on their
// own (kai 6.05→7.80s). None of it was expressible, so every style collapsed into the one
// thing that was.
//
// THE INSERT SOURCE IS THE CLIP ITSELF. B-roll needs no external asset: an insert is
// another moment of the same footage, which is what a creator cutting their own talking
// head actually does. That makes the whole layer buildable with no new media.
//
// Pure(time), exactly like chunkPose / motionPose / bespokePose: one evaluator answers
// "what does the picture look like at tMs", so the live preview and both export
// compositions can never drift.

export type ShotLayout = 'full' | 'split-top' | 'split-bottom';
export type ShotEdge = 'cut' | 'wipe';

export interface InsertShot {
  /** When the insert appears on the EDITED timeline. */
  atMs: number;
  durMs: number;
  /** Where in the SOURCE the insert reads from — another moment of the same clip. */
  srcMs: number;
  layout: ShotLayout;
  enter: ShotEdge;
  exit: ShotEdge;
  /** When set, the insert shows a B-ROLL clip instead of the speaker's own footage.
   *  A self-insert is always honest but says nothing; b-roll lets the cutaway show the
   *  thing being talked about. Left undefined when the line names nothing imageable. */
  broll?: { id: string; url: string; durMs: number };
}

export interface ShotPose {
  /** Is an insert on screen at all? */
  active: boolean;
  /** Source time the insert layer should display (it plays forward while up). */
  srcMs: number;
  layout: ShotLayout;
  /** Insert layer rect, % of frame [x,y,w,h]. */
  rect: [number, number, number, number];
  /** Where the SPEAKER sits while the insert is up (full-frame when no insert). */
  mainRect: [number, number, number, number];
  /** 0..1 coverage of the transition slab sweeping the frame. */
  wipe: number;
  /** Rack-focus blur on the picture, in px at a 1080-wide render. */
  blurPx: number;
  /** B-roll clip url when this insert shows library footage; null for a self-insert.
   *  When set, `srcMs` is a time INSIDE that clip (wrapped), not a time in the speaker's. */
  brollUrl: string | null;
}

const FULL: [number, number, number, number] = [0, 0, 100, 100];
const TOP: [number, number, number, number] = [0, 0, 100, 45];
const BOTTOM: [number, number, number, number] = [0, 45, 100, 55];

/** Measured off the references: transitions are ~1s, NOT sub-second (vinyl in ≈13.25-14.13s,
 *  out ≈16.43-17.43s). A 300ms wipe reads as a glitch; a 1000ms one reads as an edit. */
export const WIPE_MS = 1000;
/** Rack focus: kai holds a near-total defocus for ~1.75s with captions over the wash. */
export const DEFOCUS_MAX_PX = 14;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Layout → [insert rect, speaker rect]. A split keeps the talking head on screen. */
function rectsFor(layout: ShotLayout): [ShotPose['rect'], ShotPose['mainRect']] {
  if (layout === 'split-bottom') return [BOTTOM, TOP];
  if (layout === 'split-top') return [TOP, BOTTOM];
  return [FULL, FULL];
}

/**
 * What the picture is doing at tMs.
 *
 * The wipe belongs to the BOUNDARY, not to the insert: it ramps up over the last half of
 * the outgoing frame and back down over the first half of the incoming one, so the slab
 * covers the cut itself rather than appearing after it.
 */
export function shotAt(shots: readonly InsertShot[], tMs: number): ShotPose {
  const idle: ShotPose = {
    active: false, srcMs: 0, layout: 'full', rect: FULL, mainRect: FULL, wipe: 0, blurPx: 0,
    brollUrl: null,
  };
  if (!shots.length) return idle;

  for (const s of shots) {
    const end = s.atMs + s.durMs;
    const half = WIPE_MS / 2;

    // Entering: the slab sweeps in over the half-wipe BEFORE the insert starts.
    if (s.enter === 'wipe' && tMs >= s.atMs - half && tMs < s.atMs) {
      return { ...idle, wipe: clamp01((tMs - (s.atMs - half)) / half) };
    }
    // Leaving: and back out over the half-wipe AFTER it ends.
    if (s.exit === 'wipe' && tMs >= end && tMs < end + half) {
      return { ...idle, wipe: 1 - clamp01((tMs - end) / half) };
    }

    if (tMs >= s.atMs && tMs < end) {
      const [rect, mainRect] = rectsFor(s.layout);
      const rel = tMs - s.atMs;
      // The slab clears off the incoming frame over the first half-wipe.
      const inWipe = s.enter === 'wipe' ? 1 - clamp01(rel / half) : 0;
      // …and starts covering the outgoing one over the last half-wipe.
      const outWipe = s.exit === 'wipe' ? clamp01((rel - (s.durMs - half)) / half) : 0;
      // A self-insert reads forward from its point in the speaker's own footage; a b-roll
      // insert reads forward from the head of its clip, wrapping if the insert outlasts it.
      const srcMs = s.broll
        ? (s.broll.durMs > 0 ? rel % s.broll.durMs : 0)
        : s.srcMs + rel;
      return {
        active: true,
        srcMs,
        layout: s.layout,
        rect,
        mainRect,
        wipe: Math.max(inWipe, outWipe),
        blurPx: 0,
        brollUrl: s.broll?.url ?? null,
      };
    }
  }
  return idle;
}

/** Rack focus: a pure blur ramp on the picture over [atMs, atMs+durMs], eased at both ends. */
export function defocusAt(
  windows: readonly { atMs: number; durMs: number }[],
  tMs: number,
): number {
  for (const w of windows) {
    if (tMs < w.atMs || tMs >= w.atMs + w.durMs) continue;
    const rel = (tMs - w.atMs) / w.durMs;
    const RAMP = 0.22;                       // in/out over the first & last ~22%
    const k = rel < RAMP ? rel / RAMP : rel > 1 - RAMP ? (1 - rel) / RAMP : 1;
    return Math.round(DEFOCUS_MAX_PX * clamp01(k) * 10) / 10;
  }
  return 0;
}

/**
 * Choose insert shots for a run.
 *
 * Rules taken from the measured references, not invented:
 *  · an insert covers 20-35% of runtime — grit's is 29%, magazine's ~41%, vinyl runs two
 *  · inserts last 2-5s; anything shorter reads as a mistake
 *  · the source moment is pulled from FAR away in the clip (>=4s) so it reads as another
 *    shot rather than a stutter of the same instant
 *  · never open on one: the speaker establishes first (references all do)
 *  · alternate full cutaway and split so the clip does not repeat one device
 */
export function planInserts(
  durationMs: number,
  cuts: readonly number[] = [],
  opts: { maxCoverage?: number } = {},
): InsertShot[] {
  const MIN_OPEN = 2200;                       // establish the speaker first
  const MIN_DUR = 2000, MAX_DUR = 5000;
  const maxCoverage = opts.maxCoverage ?? 0.32;
  if (durationMs < MIN_OPEN + MIN_DUR + 1200) return [];

  // Prefer landing inserts ON the director's own cuts; fall back to even spacing.
  const usable = cuts
    .map((c) => Math.round(c * 1000))
    .filter((ms) => ms >= MIN_OPEN && ms <= durationMs - MIN_DUR - 800)
    .sort((a, b) => a - b);
  const anchors = usable.length
    ? usable
    : [Math.round(durationMs * 0.34), Math.round(durationMs * 0.66)];

  const out: InsertShot[] = [];
  let covered = 0;
  let i = 0;
  for (const at of anchors) {
    if (covered / durationMs >= maxCoverage) break;
    // No overlap and real air between inserts.
    const prev = out[out.length - 1];
    if (prev && at < prev.atMs + prev.durMs + 1500) continue;
    const room = durationMs - 600 - at;
    const durMs = Math.min(MAX_DUR, Math.max(MIN_DUR, Math.min(room, 3200)));
    if (durMs < MIN_DUR) continue;

    // Pull the source from the far half of the clip so it reads as a different shot.
    const srcMs = at < durationMs / 2
      ? Math.min(durationMs - durMs, at + Math.max(4000, durationMs * 0.4))
      : Math.max(0, at - Math.max(4000, durationMs * 0.4));

    out.push({
      atMs: at,
      durMs,
      srcMs: Math.max(0, Math.round(srcMs)),
      layout: i % 2 === 0 ? 'full' : 'split-bottom',
      // The full cutaway is the loud one and earns the wipe; the split cuts cleanly.
      enter: i % 2 === 0 ? 'wipe' : 'cut',
      exit: i % 2 === 0 ? 'wipe' : 'cut',
    });
    covered += durMs;
    i++;
  }
  return out;
}

/**
 * Give each insert a b-roll clip where the speech supports one.
 *
 * Takes a resolver rather than importing the library, so the shot model stays independent
 * of the catalogue (and stays trivially testable with no fixtures). `resolve` is handed the
 * shot's own time window and returns a clip or null — null leaves a self-insert, which is
 * the right answer whenever the line names nothing imageable.
 *
 * A SPLIT keeps the speaker on screen beside the insert, so b-roll there has to hold its
 * own next to a face; full cutaways get first refusal on the library for that reason.
 */
export function attachBroll(
  shots: readonly InsertShot[],
  resolve: (shot: InsertShot) => { id: string; url: string; durMs: number } | null,
): InsertShot[] {
  const used = new Set<string>();
  return shots.map((s) => {
    const clip = resolve(s);
    if (!clip || used.has(clip.id)) return s;
    used.add(clip.id);
    return { ...s, broll: clip };
  });
}
