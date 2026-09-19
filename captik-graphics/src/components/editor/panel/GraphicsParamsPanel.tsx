'use client';

// The settings panel for a placed graphic — generated entirely from the template's ParamDef[].
//
// This is the payoff of the whole registry design: adding a knob to a template changes the panel
// with ZERO edits here. There is no per-template UI code anywhere in the app, which is exactly
// what the caption system lacks (every caption style hand-maintains its own controls, and adding
// one means touching ~20 files).

import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import type { GraphicsTemplate, ParamDef, ParamValue, ResolvedParams } from '@/types/graphics';
import { isParamVisible } from '@/lib/graphics/registry';
import { GRAPHICS_FONTS, fontStack } from '@/lib/graphics/fonts';
import { fileToImageParam, ImageTooLargeError } from '@/lib/graphics/imageParam';
import { Section, SliderRow, ColorField, ToggleRow, TextRow, SelectRow, ResetBtn } from './controls';

const FONT_OPTIONS = GRAPHICS_FONTS.map((f) => ({ value: f.id as string, label: f.label }));

function ImageRow({ label, value, isDefault, onChange, onReset }: {
  label: string; value: string; isDefault: boolean;
  onChange: (v: string) => void; onReset: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setErr(null);
    try {
      onChange(await fileToImageParam(file));
    } catch (e) {
      setErr(e instanceof ImageTooLargeError ? e.message : 'Could not read that image.');
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">{label}</span>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="w-7 h-7 rounded-md object-cover border border-white/[0.12] shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-md border border-dashed border-white/[0.14] shrink-0" />
          )}
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-[11px] text-zinc-300 hover:border-white/[0.16] cursor-pointer"
          >
            <ImagePlus className="w-3 h-3" />
            {value ? 'Replace' : 'Upload'}
          </button>
          {value && (
            <button
              onClick={() => onChange('')}
              aria-label="Remove image"
              className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <ResetBtn show={!isDefault} onClick={onReset} />
      </div>
      {err && <span className="text-[10.5px] text-red-400 pl-[96px]">{err}</span>}
      <input
        ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
      />
    </div>
  );
}

function Control({ def, value, isDefault, onChange, onReset }: {
  def: ParamDef; value: ParamValue; isDefault: boolean;
  onChange: (v: ParamValue) => void; onReset: () => void;
}) {
  switch (def.type) {
    case 'number':
      return (
        <SliderRow
          label={def.label} value={value as number}
          min={def.min} max={def.max} step={def.step}
          defaultValue={def.default}
          display={def.unit ? (v) => `${v}${def.unit === 'ms' || def.unit === '%' ? def.unit : ''}` : undefined}
          onChange={onChange}
        />
      );
    case 'color':
      return (
        <ColorField
          label={def.label} hex={value as string}
          onHex={onChange} onReset={onReset} showReset={!isDefault}
        />
      );
    case 'boolean':
      return <ToggleRow label={def.label} on={value as boolean} onChange={onChange} />;
    case 'text':
      return (
        <TextRow
          label={def.label} value={value as string}
          multiline={def.multiline} maxLength={def.maxLength}
          onChange={onChange} onReset={onReset} showReset={!isDefault}
        />
      );
    case 'select':
      return (
        <SelectRow
          label={def.label} value={value as string} options={def.options}
          onChange={onChange} onReset={onReset} showReset={!isDefault}
        />
      );
    case 'font':
      return (
        <SelectRow
          label={def.label} value={value as string} options={FONT_OPTIONS}
          onChange={onChange} onReset={onReset} showReset={!isDefault}
          optionStyle={(id) => ({ fontFamily: fontStack(id) })}
        />
      );
    case 'image':
      return (
        <ImageRow
          label={def.label} value={value as string} isDefault={isDefault}
          onChange={onChange} onReset={onReset}
        />
      );
  }
}

export default function GraphicsParamsPanel({ template, values, overrides, onChange, onReset }: {
  template: GraphicsTemplate;
  /** Fully resolved values — the SAME object the renderer gets, so the panel can never show
   *  something different from what is on the canvas. */
  values: ResolvedParams;
  /** The sparse override map, only used to decide whether to offer a reset. */
  overrides: Record<string, ParamValue>;
  onChange: (key: string, v: ParamValue) => void;
  onReset: (key: string) => void;
}) {
  // Group in declaration order — the template author controls the panel layout by ordering params.
  const groups: { name: string; defs: ParamDef[] }[] = [];
  for (const def of template.params) {
    if (!isParamVisible(def, values)) continue;
    const name = def.group ?? 'Settings';
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.defs.push(def);
    else {
      const existing = groups.find((g) => g.name === name);
      if (existing) existing.defs.push(def);
      else groups.push({ name, defs: [def] });
    }
  }

  return (
    <div>
      {groups.map((g) => (
        <Section key={g.name} label={g.name}>
          <div className="flex flex-col gap-2.5">
            {g.defs.map((def) => (
              <div key={def.key}>
                <Control
                  def={def}
                  value={values[def.key]}
                  isDefault={overrides[def.key] === undefined}
                  onChange={(v) => onChange(def.key, v)}
                  onReset={() => onReset(def.key)}
                />
                {def.help && <p className="text-[10.5px] text-zinc-600 leading-snug mt-1 pl-[96px]">{def.help}</p>}
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}
