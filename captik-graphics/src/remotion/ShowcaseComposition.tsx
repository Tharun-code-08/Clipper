import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { MomentVisual, type Brand } from '@/components/showcase/MomentVisual';
import { MomentScene } from '@/components/showcase/MomentScene';
import type { Scene } from '@/lib/showcase/sceneSpec';
import { flashAt, pushAt } from '@/lib/autopilot/motionGrammar';
import { shotAt, type InsertShot } from '@/lib/autopilot/shotPlan';
import { chunkPose, type MechWord } from '@/lib/autopilot/captionMechanicPose';
import type { CaptionMechanicSpec } from '@/lib/autopilot/captionMechanics';
import type { Cut } from '@/lib/autopilot/autoCut';
import type { MomentKind } from '@/lib/autopilot/scriptPlan';

/**
 * THE EDIT, AS ONE COMPONENT.
 *
 * This is what the Player shows in the browser AND what Lambda renders to a file. One
 * component, so the two cannot drift — the failure this codebase has already paid for twice
 * (two renderers with independently-tuned sizes; the export rendering a different overlay
 * than the preview). If it looks right here it renders right, by construction.
 *
 * The CUT is expressed as Sequences: one per kept range, each playing the source from
 * `trimBefore`. Remotion then owns the seeking, which is also why this survives being
 * rendered out of order on Lambda — a hand-rolled player that seeks a <video> element cannot.
 */

export interface ShowcaseMoment {
  atMs: number;
  kind: MomentKind;
  anchor: string;
  items: string[];
  placement: 'behind' | 'inset' | 'full';
  scale: number;
  holdMs: number;
  /** The animation the MODEL wrote for this moment. When present it is rendered instead of
   *  the built-in visual for the kind — that is the difference between an edit that was
   *  designed and one that was picked from a menu of six. */
  scene?: Scene | null;
}

export interface ShowcaseProps {
  videoSrc: string;
  cuts: Cut[];
  inserts: InsertShot[];
  moments: ShowcaseMoment[];
  chunks: MechWord[][];
  mechanic: CaptionMechanicSpec;
  brand: Brand;
  beats: number[];
  focusPush: number;
  /** '' for the shipped style — the speaker is never colour graded. */
  footageFilter: string;
  /**
   * A FRAME OF THE CLIP, STANDING IN FOR THE CLIP.
   *
   * The self-review renders on the server, and `videoSrc` is a blob: URL minted in the
   * browser — nothing outside that tab can resolve it. So the client hands over one real
   * decoded frame and the review renders the REAL composition over it: exact graphics,
   * exact footage, no in-browser rasteriser to disagree with what finally ships.
   *
   * Only ever set by the review path. A normal preview or export leaves it undefined and
   * plays the video.
   */
  stillSrc?: string;
  /** Measured band the graphic can occupy without covering the speaker, as fractions of
   *  frame height. A fixed slab put a promoted number across the presenter's head. */
  clearBand?: { topFrac: number; heightFrac: number };
  timelineMs: number;
}

/** A brand colour at a given strength. Roles stay roles; only the opacity is local. */
function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const pctStyle = (r: readonly [number, number, number, number]): React.CSSProperties => ({
  position: 'absolute', left: `${r[0]}%`, top: `${r[1]}%`, width: `${r[2]}%`, height: `${r[3]}%`,
});

export const ShowcaseComposition: React.FC<ShowcaseProps> = ({
  videoSrc, cuts, inserts: allInserts, moments, chunks, mechanic, brand, beats,
  focusPush, footageFilter, timelineMs, clearBand, stillSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const tMs = (frame / fps) * 1000;

  const f = (ms: number) => Math.round((ms / 1000) * fps);

  /**
   * A CUTAWAY WITH NOTHING TO CUT TO IS NOT A CUTAWAY.
   *
   * An insert whose b-roll lookup found nothing used to fall back to `videoSrc`, so the
   * "cutaway" played the footage already on screen — in a split layout that rendered the
   * speaker TWICE, one panel stacked on the other with the graphic across the seam. Skipping
   * only the DRAW left the other half of the split empty and the shot still squeezed into a
   * panel, so they are dropped here instead: no clip, no shot change, the take just continues.
   */
  const inserts = allInserts.filter((s) => s.broll?.url);

  const pose = shotAt(inserts, tMs);

  // A FLASH PUNCTUATES A DELIBERATE VISUAL CHANGE — and an auto-cut seam is not one.
  //
  // Those seams are removed pauses. The entire point of trimming dead air is that the join
  // is INVISIBLE; announcing each one with two frames of white does the opposite, and on a
  // clip cut six times the picture strobes. Measured in the browser: seeking to 13.4s landed
  // 100ms after a trim seam and 99.9% of the frame was white.
  //
  // What earns a flash is a hard cut INTO or OUT OF a cutaway — a genuinely different shot
  // appearing. A wipe does not, because the wipe is already the transition.
  //
  // ...and a flash never lands on a graphic that is arriving. Rendered: a cutaway ended 141ms
  // after a "list" moment opened, so the first item of the list rose into two frames of pure
  // white. Two frames of white are how you punctuate a shot change; on an entrance they just
  // blow out the thing the viewer was meant to read. The shot change still happens — it simply
  // is not announced when the graphic is doing the announcing.
  const GRAPHIC_GUARD_MS = 220;
  const flashMs = inserts.flatMap((s) => [
    ...(s.enter === 'cut' ? [s.atMs] : []),
    ...(s.exit === 'cut' ? [s.atMs + s.durMs] : []),
  ]).filter((ms) => !moments.some((m) => Math.abs(m.atMs - ms) < GRAPHIC_GUARD_MS));
  const flash = flashAt(flashMs, tMs);

  /**
   * THE PUNCH-IN RESETS ON EVERY CUT, AND NEVER STOPS MOVING.
   *
   * Accumulating across every beat and holding meant the push saturated at the ceiling — the
   * old comment here said so outright: "the back half of a long edit sits at maximum push".
   * A framing that reaches its limit and freezes is the same as no push at all, which is what
   * a long clip actually looked like.
   *
   * So each SHOT starts at its own framing and pushes in from there, and underneath the beat
   * bursts there is a slow drift across the shot, so the frame is always creeping even in the
   * stretches between beats. Both are scaled by the focus's appetite for push.
   */
  const shotStart = cuts.reduce((s, c) => (c.tlInMs <= tMs && c.tlInMs > s ? c.tlInMs : s), 0);
  const bursts = pushAt(beats.filter((b) => b >= shotStart), tMs);
  const drift = 1 + 0.06 * Math.min(1, (tMs - shotStart) / 15_000);
  const push = (1 + (bursts - 1) * focusPush) * (1 + (drift - 1) * focusPush);

  const active = (() => {
    for (let i = moments.length - 1; i >= 0; i--) {
      const m = moments[i];
      if (tMs >= m.atMs && tMs < m.atMs + m.holdMs) return { m, t: tMs - m.atMs };
    }
    return null;
  })();
  const full = active?.m.placement === 'full';
  const sceneUp = Boolean(active?.m.scene);

  /**
   * A PAGE GOES BEHIND THE FOOTAGE, NOT OVER IT.
   *
   * When a reference's background IS its design — a near-white sheet with type on it —
   * covering it with full-bleed footage keeps only the type and loses the thing that made the
   * reference recognisable. So the page is painted first and the speaker sits in a window ON
   * it, which is what an editor does with a page-style reference.
   */
  const plate = active?.m.scene?.plate;
  const pageColor =
    plate === 'ground' ? brand.ground
    : plate === 'support' ? brand.support
    : plate === 'ink' ? brand.ink
    : plate === 'accent' ? brand.accent
    : null;
  const win = pageColor ? active?.m.scene?.videoRect ?? null : null;

  /**
   * A DESIGN WITH NO CARD IN IT GETS NO SUBJECT IN IT.
   *
   * When the reference is a full-screen typographic composition there is no window, no panel,
   * nothing that holds a picture — so the speaker is taken off screen for the moment and the
   * graphic owns the frame alone. The video element stays MOUNTED at zero opacity rather than
   * unmounted: it is the audio track, and the voice has to keep running under the graphic.
   */
  const hideSubject = Boolean(pageColor) && active?.m.scene?.footage === 'none';

  /**
   * IS THIS A PAGE EDIT?
   *
   * Asked of the WHOLE plan, not of the moment on screen, because the thing it governs — the
   * wipe slab — brackets a cutaway and so runs OUTSIDE any moment's window. Measured on a real
   * render: three dark runs, up to 0.74s each, where a near-black accent slab swept the full
   * frame of a near-white page. On a page design the transition is the cut and the graphic's
   * own entrance; a full-frame slab is a beat borrowed from a different kind of edit.
   */
  // Where the graphic owns the frame outright — a cutaway there would cover the design.
  const hiddenWindows: Array<[number, number]> = moments
    .filter((m) => m.scene?.footage === 'none')
    .map((m) => [m.atMs, m.atMs + m.holdMs]);

  const pageEdit = moments.some((m) => m.scene?.plate && m.scene.plate !== 'none');

  const caption = (() => {
    for (const c of chunks) {
      if (!c.length) continue;
      if (tMs >= c[0].startMs - mechanic.enterMs - 40 && tMs < c[c.length - 1].endMs) {
        const p = chunkPose(c, mechanic, tMs);
        if (!p.visible) continue;

        // If the visual on screen already SAYS this, the caption is repeating it. A rendered
        // frame had "6K" at hero scale with "6K AS A DEAL" captioned underneath — the eye
        // reads the number twice and neither lands. The graphic wins; it is the louder,
        // more deliberate statement, and the reference styles clear the line for exactly
        // this reason.
        if (active) {
          const anchorTokens = active.m.anchor.toLowerCase().split(/\s+/)
            .map((t) => t.replace(/[^a-z0-9]/gi, '')).filter((t) => t.length > 1);
          const said = p.words.map((w) => w.text.toLowerCase().replace(/[^a-z0-9]/gi, ''));
          if (anchorTokens.some((t) => said.includes(t))) return null;
        }
        return p;
      }
    }
    return null;
  })();

  // sizePct is CAP HEIGHT as a percentage of frame height. Cap height is ~0.72 of font size
  // in a bold grotesque, so the divisor is 0.72 — not the 1.7 guess, which made captions
  // ~18% too large and pushed four words onto three lines that filled half the frame.
  // A full-frame moment shrinks the line further so it does not sit on top of the graphic.
  let capSize = ((mechanic.sizePct / 100) * height) / 0.72 * (full || sceneUp ? 0.72 : 1);

  // A single long word at caption size runs off the frame — "INFLUENCER" was clipped by the
  // right edge on a real render. Flex-wrap cannot help: the word itself is wider than the
  // box. So the line shrinks to fit its longest word. 0.58em per character is measured for a
  // bold grotesque in caps; the 0.62 floor stops one long word making the whole line tiny.
  if (caption) {
    const boxPx = width * 0.88;
    const longest = Math.max(1, ...caption.words.map((w) => w.text.length));
    const fits = boxPx / (longest * 0.72);   // 0.72: romanised words run long and were clipping
    capSize = Math.max(capSize * 0.62, Math.min(capSize, fits));
  }

  // When the graphic owns the frame the caption gets out of its way: same reason the
  // measured mechanics put a caption low when the speaker owns the frame.
  // A model-authored scene composes the upper frame deliberately, so the caption drops below
  // it exactly as it does for a full-frame moment — otherwise the line lands across the
  // mechanism the model just laid out.
  const capY = full || sceneUp ? Math.max(mechanic.yPct, 76) : mechanic.yPct;

  return (
    <AbsoluteFill style={{ background: brand.ground }}>
      {/* The reference's own page, under everything. */}
      {pageColor && <AbsoluteFill style={{ background: pageColor }} />}
      {/* 1 — the speaker. Each kept range is its own Sequence reading from its own source
             offset, which IS the cut. No seeking, no drift. */}
      {cuts.map((c, i) => (
        <Sequence key={i} from={f(c.tlInMs)} durationInFrames={Math.max(1, f(c.srcOutMs - c.srcInMs))}>
          <AbsoluteFill style={{
            // On a page, the footage is a window ON it rather than the whole frame.
            ...(win
              ? {
                  left: `${win.x - win.w / 2}%`, top: `${win.y - win.h / 2}%`,
                  width: `${win.w}%`, height: `${win.h}%`,
                }
              : pctStyle(pose.mainRect)),
            transform: `scale(${(push * (full && !win ? 0.88 : 1)).toFixed(4)})`,
            transformOrigin: '50% 42%',
            overflow: 'hidden',
            // Still mounted, still audible, no longer seen.
            ...(hideSubject ? { opacity: 0 } : {}),
          }}>
            {stillSrc ? (
              <Img
                src={stillSrc}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  filter: [footageFilter, pose.blurPx ? `blur(${(pose.blurPx * width / 1080).toFixed(2)}px)` : '']
                    .filter(Boolean).join(' ') || undefined,
                }}
              />
            ) : (
              <OffthreadVideo
                src={videoSrc}
                trimBefore={f(c.srcInMs)}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  filter: [footageFilter, pose.blurPx ? `blur(${(pose.blurPx * width / 1080).toFixed(2)}px)` : '']
                    .filter(Boolean).join(' ') || undefined,
                }}
              />
            )}
          </AbsoluteFill>
        </Sequence>
      ))}

      {/* 2 — the cutaway: library b-roll, or the speaker's own footage from another moment.
             ONE SEQUENCE PER CUTAWAY, WITH A FIXED OFFSET INTO THE SOURCE.
             It used to be a single video whose trimBefore was recomputed every frame from the
             insert's running position — which asks Remotion to SEEK on every frame instead of
             playing, and a seek per frame is what the stutter at every cutaway was. Wrapped in
             a Sequence with a constant offset, the clip simply plays, exactly like the speaker's
             own footage above, which never stuttered for precisely this reason. */}
      {inserts.map((s, i) => {
        if (hiddenWindows.some(([a, b]) => s.atMs < b && a < s.atMs + s.durMs)) return null;
        // Layout is fixed for the whole insert, so its rect is read once rather than per frame.
        const at = shotAt(inserts, s.atMs + s.durMs / 2);

        return (
          <Sequence key={`ins-${i}`} from={f(s.atMs)} durationInFrames={Math.max(1, f(s.durMs))}>
            <AbsoluteFill style={{ ...pctStyle(at.rect), overflow: 'hidden' }}>
              <OffthreadVideo
                src={at.brollUrl ?? videoSrc}
                // A b-roll clip plays from its head; a self-insert from its point in the take.
                trimBefore={f(at.brollUrl ? 0 : s.srcMs)}
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* 2b — the wipe slab. It belongs ABOVE the picture and BELOW the graphics: a wipe
             transitions the SHOT, not the titles. Drawn on top of everything it became a
             full-height accent wall that clipped the captions and half the scene for a
             whole second — the measured 1s wipe is long enough that being caught mid-sweep
             is the common case, not the rare one. */}
      {/* A wipe covers a change of SHOT, so it is the size of the picture it is covering, and
          it is made of whatever the design is made of. In the accent it swept a near-black
          slab across a near-white page and the screen read as going black — but banning it on
          page edits left those videos with no shot transitions at ALL, which is the opposite
          mistake. On a page it sweeps in the PAGE's own colour: the page arriving over the
          footage, which is exactly what the transition means. */}
      {pose.wipe > 0 && !hideSubject && (
        <AbsoluteFill style={{
          ...(win
            ? {
                left: `${win.x - win.w / 2}%`, top: `${win.y - win.h / 2}%`,
                width: `${win.w}%`, height: `${win.h}%`,
              }
            : {}),
          // The ACCENT, always. It reads as the screen dying only when the accent is a
          // near-black on a near-white page — which was a palette bug (the accent was being
          // contrast-fitted against the footage instead of the page it sits on) and is fixed
          // upstream. The accent now clears 3:1 against the plate by construction, so this is
          // a deliberate coloured sweep rather than a blackout. Sweeping in the PAGE colour
          // instead just moved the problem: on a dark reference it was a black wipe again.
          /**
           * A TRAVELLING EDGE, NOT A WALL — and an edge has a falloff.
           *
           * Filling from the left edge to the sweep position meant that at the halfway point
           * half the picture was solid accent, and on a one-second wipe halfway is where you
           * are most of the time: a rendered frame came out ~90% orange with the video nowhere
           * to be seen. Narrowing it to a band helped and still read as a hard slab crossing
           * the shot, because both its edges were hard. This is the leading edge of a
           * transition: opaque at the front, gone by the back, ten percent of the frame wide.
           */
          background: `linear-gradient(90deg, ${withAlpha(brand.accent, 0)} 0%, ${withAlpha(brand.accent, 0.55)} 55%, ${brand.accent} 100%)`,
          clipPath: (() => {
            const p = pose.wipe * 100;
            const BAND = 10;
            return `inset(0 ${Math.max(0, 100 - p)}% 0 ${Math.max(0, p - BAND)}%)`;
          })(),
        }} />
      )}

      {/* 3 — the moment visual. A full-frame moment gets a SCRIM, not a dimmed video: fading
             the footage to 35% over a light ground produced a washed-out frame (measured mean
             luminance 217/255) where nothing read. A solid ground behind the graphic makes it
             a card, which is what "takes the frame" is supposed to mean. */}
      {active && full && (
        <AbsoluteFill style={{
          background: brand.ground,
          // 0.88 is right when the graphic REPLACES the shot — it makes a card. With the
          // speaker still playing underneath it just drowns them: rendered, a comparison sat
          // over a near-black wash with the presenter a ghost behind it. Enough to lift the
          // type off the picture, not enough to throw the picture away.
          opacity: hideSubject ? 0.88 : 0.42,
        }} />
      )}
      {active && (
        <AbsoluteFill style={{
          // A model-authored scene addresses the whole frame in its own coordinates; the
          // clear band only constrains the built-in fallback, which has no idea where the
          // speaker is.
          top: active.m.scene || full ? 0 : `${(clearBand?.topFrac ?? 0.04) * 100}%`,
          height: active.m.scene || full ? '100%' : `${(clearBand?.heightFrac ?? 0.46) * 100}%`,
          transform: active.m.scene ? undefined : `scale(${active.m.scale})`,
          transformOrigin: '50% 30%',
        }}>
          {active.m.scene ? (
            // The model's own animation. Its coordinates are the WHOLE frame, so it is not
            // squeezed into the clear band — placing elements is its job, and the band only
            // exists to keep the built-in fallback off the speaker's head.
            <MomentScene
              scene={active.m.scene} t={active.t} holdMs={active.m.holdMs}
              brand={brand} w={width} h={height}
            />
          ) : (
            <MomentVisual
              kind={active.m.kind} anchor={active.m.anchor} items={active.m.items}
              t={active.t} brand={brand}
              w={width} h={full ? height : height * (clearBand?.heightFrac ?? 0.46)}
            />
          )}
        </AbsoluteFill>
      )}

      {/* 4 — captions, through the measured mechanic */}
      {caption && (
        <div style={{
          position: 'absolute', left: '6%', right: '6%',
          top: `${capY}%`, transform: 'translateY(-50%)',
          display: 'flex', flexWrap: 'wrap', gap: capSize * 0.22,
          justifyContent: mechanic.align === 'center' ? 'center' : 'flex-start',
          fontFamily: brand.body, fontWeight: 800, fontSize: capSize, lineHeight: 1.12,
          overflowWrap: 'anywhere', maxWidth: '100%',
          textTransform: mechanic.case === 'upper' ? 'uppercase' : 'none',
          ...(mechanic.backing === 'box'
            ? { background: `${brand.ground}dd`, padding: `${capSize * 0.18}px ${capSize * 0.3}px` }
            : {}),
        }}>
          {caption.words.map((w, i) => (
            <span key={i} style={{
              color: w.accent ? brand.accent : w.dim ? `${brand.ink}55` : brand.ink,
              fontStyle: w.italic ? 'italic' : 'normal',
              /**
               * The PICKED word grows by FONT SIZE; only the entrance pop is a transform.
               *
               * `transform: scale()` reserves no layout space, so once the active word was
               * genuinely bigger it grew straight over its neighbours — rendered, "O CAPTURE
               * TECH." collided into "OCAPTURETECH.". Font size reflows the line, which is what
               * a word getting bigger is supposed to do to the words beside it.
               */
              fontSize: w.scale !== 1 ? capSize * w.scale : undefined,
              transform: `scale(${(0.86 + 0.14 * w.enter).toFixed(3)})`,
              display: 'inline-block', position: 'relative',
              textShadow: mechanic.backing === 'none' ? '0 2px 10px rgba(0,0,0,.7)' : 'none',
              ...(w.chip ? { background: brand.accent, color: brand.ground, padding: `0 ${capSize * 0.16}px` } : {}),
            }}>
              {w.text}
              {w.underline > 0 && (
                <span style={{
                  position: 'absolute', left: 0, bottom: -capSize * 0.14,
                  height: Math.max(2, capSize * 0.09), width: `${w.underline * 100}%`,
                  background: brand.accent,
                }} />
              )}
            </span>
          ))}
        </div>
      )}
      {caption?.promoted && (
        <AbsoluteFill style={{ display: 'grid', placeItems: 'center' }}>
          <span style={{
            fontFamily: brand.hero, fontSize: capSize * caption.promoted.scale,
            color: brand.ink, textShadow: '0 6px 26px rgba(0,0,0,.6)',
          }}>{caption.promoted.text}</span>
        </AbsoluteFill>
      )}

      {/* 5 — the beat flash */}
      {flash > 0 && <AbsoluteFill style={{ background: '#fff', opacity: flash }} />}

      {/* Guard: a plan longer than the media would render black tail frames. */}
      {tMs > timelineMs && <AbsoluteFill style={{ background: brand.ground }} />}
    </AbsoluteFill>
  );
};
