import type { ReactElement } from 'react';
import {
  EL_GROUP, EL_ON, EL_S, EL_X, EL_Y,
  type GraphicsBox, type GraphicsCategory, type GraphicsElement, type GraphicsRenderArgs,
  type GraphicsTemplate, type ParamDef,
} from '@/types/graphics';
import type { GraphicsFontId } from './fonts';
import type { SfxId } from './sfxIds';

type ValueOf<D extends ParamDef> =
  D extends { type: 'number' } ? number :
  D extends { type: 'boolean' } ? boolean :
  string;

/** The `params` object shape inferred from a template's declared ParamDef[]. This is what gives
 *  `render` full autocomplete — `p.dark` is a boolean, `p.radius` is a number, and a typo is a
 *  compile error rather than an undefined at render time. */
export type ParamsOf<D extends readonly ParamDef[]> = {
  [K in D[number] as K['key']]: ValueOf<K>;
};

/** Expand one declared element into its nudge / scale / hide controls.
 *  Offsets are in DESIGN px (the template's own coordinate space), so a nudge means the same
 *  thing regardless of how large the graphic is scaled on the canvas. */
function elementParams(e: GraphicsElement): ParamDef[] {
  const out: ParamDef[] = [
    { type: 'number', key: e.key + EL_X, label: `${e.label} — X`, group: EL_GROUP, default: 0, min: -400, max: 400, step: 1, unit: 'px' },
    { type: 'number', key: e.key + EL_Y, label: `${e.label} — Y`, group: EL_GROUP, default: 0, min: -400, max: 400, step: 1, unit: 'px' },
    { type: 'number', key: e.key + EL_S, label: `${e.label} — Scale`, group: EL_GROUP, default: 1, min: 0.1, max: 3, step: 0.05 },
  ];
  if (e.hideable !== false) {
    out.push({ type: 'boolean', key: e.key + EL_ON, label: `Show ${e.label.toLowerCase()}`, group: EL_GROUP, default: true });
  }
  return out;
}

/** Declare a graphics template.
 *
 *  The `const` type parameter means the author writes a plain array literal — no `as const`, no
 *  duplicated param-type interface — and still gets exact key/type inference inside render().
 *
 *  `render` is a PLAIN FUNCTION, not a component. The registry invokes it as `tpl.render({...})`,
 *  never as `<tpl.render/>`. That is deliberate and load-bearing:
 *    - hooks become structurally impossible, so motion can only come from `timeMs`;
 *    - it sidesteps the react-hooks/static-components lint rule;
 *    - it lets registry.spec.ts call render() twice and deep-compare the output to prove purity.
 *
 *  Declared `elements` are expanded into per-element X / Y / Scale / Show params here, so every
 *  template is editable down to the individual element with no per-template UI or param work.
 */
export function defineGraphicsTemplate<const D extends readonly ParamDef[]>(t: {
  id: string;
  name: string;
  category: GraphicsCategory;
  tags?: readonly string[];
  badge?: string;
  design: { w: number; h: number };
  /** Instance default for the shared dark plate — see GraphicsTemplate.backdrop. */
  backdrop?: boolean;
  /** Pin to the whole video frame at any aspect — see GraphicsTemplate.fullBleed. */
  fullBleed?: boolean;
  defaultDurationMs: number;
  defaultBox: GraphicsBox;
  fonts: readonly GraphicsFontId[];
  elements: readonly GraphicsElement[];
  params: D;
  render: (a: GraphicsRenderArgs<ParamsOf<D>>) => ReactElement | null;
  /** Sound cues synced to the template's motion beats — see GraphicsTemplate.sfx. */
  sfx?: (p: ParamsOf<D>) => readonly { atMs: number; id: SfxId; gain?: number }[];
}): GraphicsTemplate {
  const expanded: ParamDef[] = [...t.params, ...t.elements.flatMap(elementParams)];
  return { tags: [], ...t, params: expanded } as unknown as GraphicsTemplate;
}
