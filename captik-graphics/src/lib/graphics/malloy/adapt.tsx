// Turns an imported Remotion composition into a Captik graphics template.
//
// The imported component keeps its own code untouched; everything it needs from the outside —
// the clock, the canvas, its props — is supplied here. Our `render` stays a plain function
// because it RETURNS an element: React renders that element, and the component's hooks run
// inside the provider below, which is legal and keeps our no-hooks-in-render rule intact.

import type { ComponentType, ReactElement } from 'react';
import type { GraphicsCategory, GraphicsElement, ParamDef, ResolvedParams } from '@/types/graphics';
import type { GraphicsFontId } from '../fonts';
import { MALLOY_FPS, MalloyFrameContext } from './remotionShim';

/** A LIST param is stored as one line per item, fields separated by ` | `. This is the same
 *  idiom our own multi-row templates use (storyCards, compareTable), so it needs no new UI —
 *  and it is why an imported chart's rows are editable rather than frozen at their defaults. */
export interface MalloyListSpec {
  key: string;
  /** Object keys in column order; empty = an array of primitives (one value per line). */
  fields: string[];
  /** Which fields are numeric, so "12" comes back as 12 rather than "12". */
  numeric?: string[];
}

function parseList(raw: string, spec: MalloyListSpec): unknown[] {
  const lines = String(raw).split('\n').map((l) => l.trim()).filter(Boolean);
  if (!spec.fields.length) return lines;
  return lines.map((line) => {
    const cells = line.split('|').map((c) => c.trim());
    const out: Record<string, unknown> = {};
    spec.fields.forEach((f, i) => {
      const cell = cells[i] ?? '';
      out[f] = spec.numeric?.includes(f) ? (Number(cell) || 0) : cell;
    });
    return out;
  });
}

export interface MalloyAdaptArgs {
  id: string;
  name: string;
  category: GraphicsCategory;
  tags: readonly string[];
  /** The imported component, exactly as authored. */
  Comp: ComponentType<Record<string, unknown>>;
  /** Its composition size — the design canvas we scale from. */
  design: { w: number; h: number };
  defaultDurationMs: number;
  defaultBox: { xPercent: number; yPercent: number; widthPercent: number };
  /** Generated from the template's own zod schema. */
  params: ParamDef[];
  /** Params that must be rebuilt into arrays before the component sees them. */
  lists?: MalloyListSpec[];
  /** Props the schema does not expose (or that we deliberately do not surface) — passed through
   *  verbatim so the component still gets everything it destructures. */
  fixedProps?: Record<string, unknown>;
  fonts?: readonly GraphicsFontId[];
  elements?: readonly GraphicsElement[];
  /** Sound cues, DERIVED rather than hand-placed (scripts/gen_malloy_sfx.mjs): the timings come
   *  from the template's own motion anchors and the palette from what it depicts. Constant per
   *  template — imported compositions have no param that moves a beat — so it ignores `params`
   *  and stays trivially pure, which registry.spec checks. */
  sfx?: () => readonly { atMs: number; id: string; gain?: number }[];
}

/** Build the GraphicsTemplate. Deliberately NOT defineGraphicsTemplate(): that helper expands
 *  per-element nudge/scale/hide controls, which assume a template we authored and can position
 *  from the inside. An imported composition is one sealed picture — it gets the instance-level
 *  controls (position, scale, aspect, cinema, sound) instead. */
export function adaptMalloyTemplate(a: MalloyAdaptArgs) {
  const { Comp } = a;

  return {
    id: a.id,
    name: a.name,
    category: a.category,
    tags: a.tags,
    badge: 'Studio',
    design: a.design,
    // Imported compositions paint their own full-canvas background, so the shared plate would
    // only ever peek out behind them as a border.
    backdrop: false,
    defaultDurationMs: a.defaultDurationMs,
    defaultBox: a.defaultBox,
    fonts: a.fonts ?? [],
    elements: a.elements ?? [{ key: 'scene', label: 'Scene', hideable: false }],
    params: a.params,
    source: 'malloy' as const,
    ...(a.sfx ? { sfx: a.sfx } : {}),

    render: ({ params, timeMs, durationMs, width, height, el }: {
      params: ResolvedParams;
      timeMs: number;
      durationMs: number;
      width: number;
      height: number;
      el: (k: string) => Record<string, unknown>;
    }): ReactElement => {
      // Rebuild list params into the arrays the component destructures.
      const props: Record<string, unknown> = { ...a.fixedProps, ...params };
      for (const spec of a.lists ?? []) {
        if (typeof props[spec.key] === 'string') props[spec.key] = parseList(props[spec.key] as string, spec);
      }

      const ctx = {
        frame: (timeMs / 1000) * MALLOY_FPS,
        fps: MALLOY_FPS,
        width,
        height,
        durationInFrames: Math.max(1, Math.round((durationMs / 1000) * MALLOY_FPS)),
      };

      return (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', ...el('scene') }}>
          <MalloyFrameContext.Provider value={ctx}>
            <Comp {...props} />
          </MalloyFrameContext.Provider>
        </div>
      );
    },
  };
}
