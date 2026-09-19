// Scene / overlay motion-graphics templates — the data contract.
//
// A "graphics template" is a short (3-8s) animated scene that sits OVER the user's video: an iOS
// notification, a subscribe button, a progress bar, a terminal typing out. It is NOT a caption
// style — captions live in CaptionOverlay.tsx and are unrelated to everything in this file.
//
// THE ONE RULE: a template's motion must be a PURE FUNCTION of `timeMs`.
// CSS @keyframes / transition / animation only advance on the BROWSER WALL CLOCK. They animate in
// the 60fps preview but render as a STATIC frame in the Remotion export, because every export
// frame is an independent DOM snapshot and nothing ticks between them. This is the same trap
// documented at CaptionOverlay.tsx:107-112, and it is machine-enforced here by the banned-API grep
// in src/lib/graphics/registry.spec.ts.
//
// Corollary rules, all enforced by that spec file:
//   - No hooks. `render` is invoked as `tpl.render({...})`, never as `<tpl.render/>`, so hooks
//     are structurally impossible and there is no Remotion context to read from.
//   - Remotion's PURE helpers are fine and encouraged: interpolate(), spring({frame,fps}),
//     Easing, random(seed), AbsoluteFill. They work outside a render context (verified against
//     remotion@4.0.470). useCurrentFrame(), useVideoConfig(), Sequence, Series and staticFile()
//     require that context and are BANNED.
//   - No Math.random() / Date.now() / new Date() — they would differ between the preview and each
//     export frame. Use the `seed` argument with remotion's random().

import type { ReactElement } from 'react';
import type { GraphicsFontId } from '@/lib/graphics/fonts';

export type ParamValue = number | string | boolean;
export type ResolvedParams = Record<string, ParamValue>;

interface ParamBase {
  /** Identifier used in `params`. Must match /^[a-zA-Z][a-zA-Z0-9_]*$/ and be unique per template. */
  key: string;
  /** Shown next to the control in the settings panel. */
  label: string;
  /** Panel section header. Defaults to 'Settings'. Declaration order decides section order. */
  group?: string;
  /** Optional one-line hint under the control. */
  help?: string;
  /** Hide this control unless another param currently equals `equals`. VISIBILITY ONLY — the value
   *  is still resolved and still passed to render(), so a hidden param never becomes undefined. */
  showIf?: { key: string; equals: ParamValue };
}

/** One editable knob. Mirrors the reference tool's `sceneParams`, plus a real `select` type. */
export type ParamDef =
  | (ParamBase & { type: 'number'; default: number; min: number; max: number; step: number; unit?: string })
  | (ParamBase & { type: 'color'; default: string })
  | (ParamBase & { type: 'text'; default: string; maxLength?: number; multiline?: boolean })
  | (ParamBase & { type: 'font'; default: GraphicsFontId })
  | (ParamBase & { type: 'image'; default: string })
  | (ParamBase & { type: 'boolean'; default: boolean })
  | (ParamBase & { type: 'select'; default: string; options: readonly { value: string; label: string }[] });

export type ParamType = ParamDef['type'];

/** A named, individually adjustable piece of a template — the notification's icon, a chart's
 *  title, one bar. Declaring elements gives the user per-element nudge/scale/hide control on
 *  EVERY template for free: defineGraphicsTemplate expands each one into real ParamDefs, so the
 *  generated settings panel, resolveParams and persistence all pick them up with no extra work.
 *
 *  The template applies them by spreading `el('<key>')` into the element's style. That helper
 *  returns the CSS `translate` / `scale` PROPERTIES rather than a `transform` string, so a user's
 *  nudge composes with whatever `transform` the template is using for its animation instead of
 *  overwriting it. (Same trick the caption system uses for its per-word gizmo.) */
export interface GraphicsElement {
  key: string;
  label: string;
  /** Offer a hide toggle for this element. Default true. */
  hideable?: boolean;
}

/** Per-element nudge/scale, as composable CSS properties. */
export interface ElementStyle {
  translate?: string;
  scale?: string;
  display?: 'none';
}

/** Everything a template's render() receives. All pure inputs — no context, no hooks, no clock. */
export interface GraphicsRenderArgs<P extends ResolvedParams = ResolvedParams> {
  /** Template defaults with the user's overrides applied, clamped and validated. Never partial. */
  params: P;
  /** Per-element user transform. Spread into the element's style; composes with `transform`.
   *  Returns `display:'none'` when the user has hidden that element. */
  el: (key: string) => ElementStyle;
  /** Milliseconds since this instance's startMs, clamped to [0, durationMs]. THE ONLY CLOCK. */
  timeMs: number;
  /** This instance's total on-screen duration in ms. Use it for exit animations. */
  durationMs: number;
  /** The canvas to draw in. For normal templates: always exactly template.design.w / .h.
   *  For fullBleed templates: the REAL video frame in canvas px — any size, any aspect ratio. */
  width: number;
  height: number;
  /** Stable per placed instance. Pass to remotion's random(). NEVER call Math.random(). */
  seed: string;
}

export type GraphicsCategory =
  | 'notify'   // notifications, alerts, toasts, lock screens
  | 'social'   // social profiles, players, likes, photo cards
  | 'device'   // phone/laptop/browser mockups and app UI
  | 'title'    // typographic titles, hooks, logo reveals
  | 'story'    // chapters, sequences, documents, lists that narrate
  | 'money'    // wealth counters, finance stats, portfolio cards
  | 'chart'    // charts, graphs, calendars, timers, diagrams
  | 'cta'      // buttons, subscribe, cart
  | 'fx';      // ambience, particles, scenes, annotations

/** Centre-x / centre-y / width, all as a percentage of the canvas. Same shape as CaptionBoxConfig
 *  so a graphic positions exactly like a caption block does. */
export interface GraphicsBox {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
}

/** A template as stored in the registry. Authors do not write this by hand — they call
 *  defineGraphicsTemplate(), which infers the params type and returns this erased shape. */
export interface GraphicsTemplate {
  id: string;
  name: string;
  category: GraphicsCategory;
  tags: readonly string[];
  badge?: string;
  /** The design canvas, in design px. Everything scales, so this is purely authoring ergonomics:
   *  at ~900 wide, a widthPercent-88 box on a 1080p export lands near 1:1, so radii, blurs and
   *  border widths read at their intuitive values. Avoid 1px hairlines — at preview scale (~0.3)
   *  they disappear. Use 2+ design px. */
  design: { w: number; h: number };
  /** Default for GraphicsInstance.backdrop — does a fresh placement get the shared dark plate
   *  behind it? Declare FALSE when the template paints its own full-canvas container (the plate
   *  would only peek out as dark corner nubs where the radii differ) or when it is designed to
   *  float transparently over footage (typography, stamps, arrows, FX). Leave unset (true) only
   *  for bare content that needs a card behind it to read over video. The Arrange → Background
   *  toggle still overrides per instance either way. */
  backdrop?: boolean;
  /** Pin this template to the WHOLE video frame. The instance box is ignored: render() receives
   *  the REAL canvas size — any aspect ratio — instead of the design canvas, and the instance has
   *  no move/resize/rotate and never a backdrop. For frame-wide effects (letterbox bars, film
   *  burns, particle weather, screen glitches) that must hug the actual frame edges rather than
   *  live inside a fixed-aspect sticker. A fullBleed render() MUST size everything from the
   *  width/height arguments — typically off Math.min(width, height) — and never assume design.w/h. */
  fullBleed?: boolean;
  defaultDurationMs: number;
  defaultBox: GraphicsBox;
  /** Fonts this template always needs. Drives the EXPORT font-warm gate so the first frames never
   *  paint a fallback face. Fonts referenced only through a `font` param are picked up separately. */
  fonts: readonly GraphicsFontId[];
  /** Individually adjustable pieces. Expanded into nudge/scale/hide params automatically. */
  elements: readonly GraphicsElement[];
  params: readonly ParamDef[];
  render: (a: GraphicsRenderArgs) => ReactElement | null;
  /** 'malloy' = adapted from the imported Remotion library rather than authored here. Those
   *  templates are sealed compositions: they legitimately use the Remotion frame hooks (through
   *  our shim) and expose no per-element controls, so the AUTHORING invariants in registry.spec
   *  scope themselves to our own templates and check imported ones differently. */
  source?: 'malloy';
  /** Sound cues synced to this template's MOTION BEATS (a slam cue lands when the slam lands, so
   *  it must be computed from the same params — p.delay, p.slamAt…). atMs is template-local ms;
   *  ids come from the synthesized bank (lib/graphics/sfxBank). PURE function — registry.spec
   *  calls it twice and compares. Preview plays cues via WebAudio; exports mix them into the
   *  rendered audio; the Arrange → Sound toggle mutes per instance. */
  sfx?: (params: ResolvedParams) => readonly { atMs: number; id: string; gain?: number }[];
}

/** Suffixes appended to an element key to form its auto-generated param keys. */
export const EL_X = '_x';
export const EL_Y = '_y';
export const EL_S = '_scale';
export const EL_ON = '_show';
/** Panel section the auto-generated element controls land in. */
export const EL_GROUP = 'Position & scale';

/** One placed graphic inside a project.
 *
 *  TIMES ARE SOURCE-CLOCK MILLISECONDS — the same clock as TranscriptWord.startMs and the
 *  `currentTimeMs` that CaptionOverlay receives. Not output time, not frames. */
export interface GraphicsInstance {
  /** 'g_<base36>'. Doubles as the render seed, so it must stay stable for the life of the instance. */
  id: string;
  /** Plain string, deliberately NOT the id union: a saved project may reference a retired template,
   *  and that must render as "nothing" rather than fail to type-check on load. */
  templateId: string;
  startMs: number;
  durationMs: number;
  box: GraphicsBox;
  rotationDeg?: number;
  /** 0..1, default 1. Multiplies whatever the template itself draws. */
  opacity?: number;
  /** Drawn-canvas aspect (w/h) override; undefined = the template's own design aspect. The
   *  template RE-LAYS OUT for the new shape — render() receives the reshaped canvas — it is
   *  never stretched. Offered values come from aspectPresetsFor(); meaningless on fullBleed. */
  aspect?: number;
  /** The shared dark plate behind the graphic. `undefined` = the TEMPLATE's own default
   *  (GraphicsTemplate.backdrop, true when the template doesn't declare one); an explicit
   *  boolean is the user's Arrange → Background override. Never true for fullBleed templates. */
  backdrop?: boolean;
  /** SPARSE — only the params the user actually changed. Everything else resolves from the
   *  template's CURRENT defaults, so retuning a default improves existing projects instead of
   *  being frozen into them. */
  params: Record<string, ParamValue>;
  /** Ascending paint order. Defaults to array index. */
  z?: number;
  /** Preview-only mute. Hidden graphics are skipped on every surface, including exports. */
  hidden?: boolean;
  /** Mute this instance's sound cues (Arrange → Sound). Undefined = sounds ON. */
  sfxOff?: boolean;
  /** Cinema finish + camera for this instance (Arrange → Cinema). Undefined = the tasteful
   *  defaults in lib/graphics/cinema.ts, which every graphic gets for free. */
  cinema?: CinemaSettings;
}

/** The scene-finishing stack, per placed graphic. Reference: raylight.app — bloom, colour grade,
 *  colour split, grain, vignette, depth of field, 3D tilt and a camera move are what separate a
 *  filmed-looking scene from a rendered one. Applied by GraphicsOverlay to EVERY template. */
export interface CinemaSettings {
  /** Colour-grade preset id — see CINEMA_GRADES. */
  grade?: string;
  /** Lens bloom: bright areas bleed light. 0..1. */
  bloom?: number;
  /** Film grain over the graphic. 0..1. */
  grain?: number;
  /** Chromatic aberration on edges. 0..1. */
  split?: number;
  /** Vignette framing. 0..1 (0 = off; a small chip should not have dark corners). */
  vignette?: number;
  /** 3D tilt in degrees — Raylight's signature "lean a flat thing back into the frame". */
  tiltX?: number;
  tiltY?: number;
  /** Camera move over the clip — see CINEMA_CAMERAS. */
  camera?: string;
  /** Camera move amount multiplier. */
  camAmt?: number;
  /** Standing defocus (depth of field). 0..1. */
  focus?: number;
}
