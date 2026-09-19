'use client';

// Right-panel "Text" tab — global caption typography & effects, mirroring the
// reference workflow: Fonts / Format / Position / Color (solid|gradient) /
// Emphasis (emphasize|spotlight) / Spacing / Effects (shadow|stroke|background).
//
// Every control is a sparse override: reset (↺) returns to the template's own
// value. The three kinetic templates (editor_masala / illusion / aura) own
// their typography — the tab is disabled for them.

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type {
  TextOverrides, EmphasisStyle, ShadowConfig, GradientStop,
  TemplateSlotOverrides, IllusionSlots, EditorMasalaSlots, AuraSlots, ScribbleSlots, ArchivesSlots, BlockbusterSlots, CaptionInAnimation, InterlockSlots, JournalSlots } from '@/types/transcript';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import { BASE_FONT_PX, isStyleLocked, isHeroTemplate } from '@/lib/styleResolve';
import { hasTitleSize } from '@/lib/captionStyles';
import {
  resolveIllusionSlots, resolveEditorMasalaSlots, resolveAuraSlots, resolveSwissSlots, SLOT_FONT_CHOICES, IN_ANIMATION_CHOICES,
  resolveScribbleSlots, resolveArchivesSlots, resolveBlockbusterSlots, BOIL_AMOUNT_CHOICES, BB_LEVEL_CHOICES,
  resolveInterlockSlots, IL_CAPS_SIZE_CHOICES, IL_TRACKING_CHOICES, IL_CAPS_REVEAL_CHOICES,
  resolveJournalSlots, JN_ENTRANCE_CHOICES, JN_EXIT_LEAD_CHOICES, JN_WEIGHT_CHOICES, JN_EXIT_ORDER_CHOICES, JN_SWEEP_CHOICES } from '@/lib/kineticSlots';
import FontsPanel, { type FontSelection } from '../FontsPanel';
import { EMPHASIS_FONT_CHOICES } from '@/lib/emphasisFonts';
import {
  Section, SliderRow, Segmented, ColorField, NumField, ToggleRow,
  GradientStopEditor, CasingButtons, AlignButtons, FaceSelect, ResetBtn,
} from './controls';

const DEFAULT_STOPS: GradientStop[] = [
  { pos: 0, hex: '#b8860b' },
  { pos: 0.45, hex: '#ffd700' },
  { pos: 0.55, hex: '#fff8dc' },
  { pos: 1, hex: '#b8860b' },
];


export interface TextTabProps {
  captionStyle: CaptionStyleId;
  textOverrides: TextOverrides;
  onTextOverrides: (patch: Partial<TextOverrides>) => void;
  emphasisStyle: EmphasisStyle;
  onEmphasisStyle: (patch: Partial<EmphasisStyle>) => void;
  captionTextColor: string;
  onCaptionTextColorChange: (c: string) => void;
  accentColor: string;
  captionFontScale: number;
  onCaptionFontScaleChange: (v: number) => void;
  /** Big Reveal only: the title's independent font scale + setter. */
  emphFontScale?: number;
  onEmphFontScaleChange?: (v: number) => void;
  captionXPercent: number;
  captionYPercent: number;
  onPositionChange: (x: number, y: number) => void;
  /** Captions selected in the timeline — when >0 these fields move ONLY those captions. */
  positionScopeCount?: number;
  /** "Keep captions off faces" toggle + its analysis state (shown under Position). */
  faceAware?: FaceAwareControl;
  selectedFont: string | null;
  onFontSelect: (sel: FontSelection | null) => void;
  /** Per-template slot overrides (editor_masala/illusion/aura) + patch callback. */
  templateSlots: TemplateSlotOverrides;
  onTemplateSlot: (patch: TemplateSlotOverrides) => void;
}

export default function TextTab(p: TextTabProps) {
  const locked = isStyleLocked(p.captionStyle);
  const ov = p.textOverrides;
  const patch = p.onTextOverrides;
  const [fontListOpen, setFontListOpen] = useState(false);
  const [radiusLinked, setRadiusLinked] = useState(typeof (ov.background?.radius ?? 24) === 'number');

  const sizePx = Math.round(p.captionFontScale * BASE_FONT_PX);
  const colorMode = ov.color?.mode === 'gradient' ? 'gradient' : 'solid';
  const grad = ov.color?.mode === 'gradient' ? ov.color : null;
  const isHero = isHeroTemplate(p.captionStyle);

  const bg = ov.background;
  const patchBg = (b: Partial<NonNullable<TextOverrides['background']>>) =>
    patch({ background: { hex: '#000000', opacity: 100, radius: 24, padW: 48, padH: 24, ...bg, ...b } });

  if (locked) {
    // editor_masala / illusion / aura build their look from MULTIPLE fonts/colours per
    // tier or persona, so the flat controls above can't drive them. Show a dedicated
    // per-slot editor (fonts / colours / motion) plus the shared Size + Position.
    return (
      <TemplateSlotsEditor
        captionStyle={p.captionStyle}
        slots={p.templateSlots}
        onSlot={p.onTemplateSlot}
        captionFontScale={p.captionFontScale}
        onCaptionFontScaleChange={p.onCaptionFontScaleChange}
        captionXPercent={p.captionXPercent}
        captionYPercent={p.captionYPercent}
        onPositionChange={p.onPositionChange}
        positionScopeCount={p.positionScopeCount ?? 0}
        faceAware={p.faceAware}
      />
    );
  }

  return (
    <div className="p-3 space-y-1">

      {/* ── FONTS ─────────────────────────────────────────────── */}
      <Section label="Fonts">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">Font Family</span>
            <button
              onClick={() => setFontListOpen(o => !o)}
              className="flex-1 flex items-center justify-between bg-white/[0.06] border border-white/[0.08] rounded-md px-2.5 py-1.5 cursor-pointer hover:border-white/[0.16] min-w-0"
            >
              <span className="text-[11px] text-white font-semibold truncate"
                style={{ fontFamily: p.selectedFont ? `'${p.selectedFont}', sans-serif` : undefined }}>
                {p.selectedFont ?? 'Template default'}
              </span>
              <ChevronDown className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform ${fontListOpen ? 'rotate-180' : ''}`} />
            </button>
            <ResetBtn show={!!p.selectedFont} onClick={() => { p.onFontSelect(null); setFontListOpen(false); }} />
          </div>

          {fontListOpen && (
            <div className="rounded-xl border border-white/[0.08] bg-black/30 max-h-[300px] overflow-y-auto">
              <FontsPanel selectedFont={p.selectedFont} onFontSelect={sel => { p.onFontSelect(sel); }} />
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">Font Face</span>
            <FaceSelect face={ov.fontFace} onChange={f => patch({ fontFace: f })} />
            <ResetBtn show={!!ov.fontFace} onClick={() => patch({ fontFace: undefined })} />
          </div>

          {hasTitleSize(p.captionStyle) ? (
            // Big Reveal / The Big Red draw a big TITLE alongside the caption — size them
            // separately (the title carries its own emphFontScale).
            <>
              <SliderRow
                label="Title size" value={Math.round(46 * (p.emphFontScale ?? 1))} min={20} max={160} step={2}
                onChange={v => p.onEmphFontScaleChange?.(v / 46)}
                display={v => `${v}px`} defaultValue={46}
              />
              <SliderRow
                label="Caption size" value={sizePx} min={12} max={96} step={1}
                onChange={v => p.onCaptionFontScaleChange(v / BASE_FONT_PX)}
                display={v => `${v}px`} defaultValue={BASE_FONT_PX}
              />
            </>
          ) : (
            <SliderRow
              label="Size" value={sizePx} min={12} max={96} step={1}
              onChange={v => p.onCaptionFontScaleChange(v / BASE_FONT_PX)}
              display={v => `${v}px`} defaultValue={BASE_FONT_PX}
            />
          )}
          <ScopeHint count={p.positionScopeCount ?? 0} verb="Resizes" />
        </div>
      </Section>

      {/* ── FORMAT ────────────────────────────────────────────── */}
      <Section label="Format">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">Styles</span>
            <CasingButtons
              casing={ov.casing} underline={ov.underline}
              onCasing={c => patch({ casing: c })}
              onUnderline={u => patch({ underline: u || undefined })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">Text Alignment</span>
            <AlignButtons align={ov.align} onAlign={a => patch({ align: a })} />
          </div>
        </div>
      </Section>

      {/* ── POSITION ──────────────────────────────────────────── */}
      <Section label="Position">
        <div className="flex items-center gap-2">
          <NumField label="X" value={Math.round(p.captionXPercent * 10) / 10} unit="%" min={0} max={100}
            onChange={v => p.onPositionChange(v, p.captionYPercent)}
            onReset={() => p.onPositionChange(50, p.captionYPercent)} showReset={p.captionXPercent !== 50} />
          <NumField label="Y" value={Math.round(p.captionYPercent * 10) / 10} unit="%" min={0} max={100}
            onChange={v => p.onPositionChange(p.captionXPercent, v)}
            onReset={() => p.onPositionChange(p.captionXPercent, 85)} showReset={p.captionYPercent !== 85} />
        </div>
        <ScopeHint count={p.positionScopeCount ?? 0} />
        {p.faceAware && <FaceAwareToggle control={p.faceAware} />}
      </Section>

      {/* ── COLOR ─────────────────────────────────────────────── */}
      <Section label="Color">
        <div className="space-y-3">
          <Segmented
            options={[
              { id: 'solid',    label: '◐ Solid',    title: 'One flat text colour' },
              { id: 'gradient', label: '◑ Gradient', title: 'Blend between colours (exports via HD render)' },
            ]}
            value={colorMode}
            onChange={m => {
              if (m === 'solid') patch({ color: undefined });
              else patch({ color: { mode: 'gradient', stops: grad?.stops ?? DEFAULT_STOPS, angle: grad?.angle ?? 90, level: grad?.level ?? 'word' } });
            }}
          />
          {colorMode === 'solid' ? (
            <ColorField
              label="Color" hex={p.captionTextColor}
              onHex={p.onCaptionTextColorChange}
              onReset={() => p.onCaptionTextColorChange('#ffffff')}
              showReset={p.captionTextColor.toLowerCase() !== '#ffffff'}
            />
          ) : grad && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-400">Stops</span>
                <button
                  onClick={() => patch({ color: { ...grad, stops: DEFAULT_STOPS } })}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 cursor-pointer"
                >↺ Reset</button>
              </div>
              <GradientStopEditor stops={grad.stops} onChange={stops => patch({ color: { ...grad, stops } })} />
              <SliderRow label="Angle" value={grad.angle} min={0} max={360} step={1}
                onChange={a => patch({ color: { ...grad, angle: a } })} display={v => `${v}`} defaultValue={90} />
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">Level</span>
                <div className="flex-1">
                  <Segmented size="sm"
                    options={[
                      { id: 'word', label: 'Word', title: 'Each word gets one colour from the gradient' },
                      { id: 'char', label: 'Char', title: 'The gradient flows smoothly across every letter' },
                    ]}
                    value={grad.level}
                    onChange={level => patch({ color: { ...grad, level } })}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── EMPHASIS ──────────────────────────────────────────── */}
      <Section label="Emphasis" defaultOpen={false}>
        <div className="space-y-3">
          <Segmented
            options={[
              { id: 'emphasize', label: 'Emphasize', title: 'Emphasized words get this colour, size and font' },
              { id: 'spotlight', label: 'Spotlight', title: isHero ? 'Feature emphasized words full-frame' : 'Spotlight needs a Captik hero template — pick one in Templates' },
            ]}
            value={p.emphasisStyle.mode ?? 'emphasize'}
            onChange={mode => p.onEmphasisStyle({ mode })}
            disabledOptions={isHero ? [] : ['spotlight']}
          />
          <ColorField
            label="Color" hex={p.emphasisStyle.hex ?? p.accentColor}
            onHex={h => p.onEmphasisStyle({ hex: h })}
            onReset={() => p.onEmphasisStyle({ hex: undefined })}
            showReset={!!p.emphasisStyle.hex}
          />
          <SliderRow
            label="Size" value={p.emphasisStyle.size ?? 1.4} min={1} max={3} step={0.1}
            onChange={v => p.onEmphasisStyle({ size: v })}
            display={v => `${v.toFixed(1)}×`} defaultValue={1.4}
          />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">Font</span>
            <div className="relative flex-1 min-w-0">
              <select
                value={p.emphasisStyle.fontFamily ?? '__default'}
                onChange={e => p.onEmphasisStyle({ fontFamily: e.target.value === '__default' ? undefined : e.target.value })}
                className="w-full appearance-none bg-white/[0.06] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-[11px] text-white outline-none cursor-pointer hover:border-white/[0.16]"
              >
                <option value="__default" className="bg-zinc-900">Same as text</option>
                {[...(p.selectedFont && !EMPHASIS_FONT_CHOICES.includes(p.selectedFont) ? [p.selectedFont] : []), ...EMPHASIS_FONT_CHOICES].map(f => (
                  <option key={f} value={f} className="bg-zinc-900">{f}</option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <ResetBtn show={!!p.emphasisStyle.fontFamily} onClick={() => p.onEmphasisStyle({ fontFamily: undefined })} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">Font Face</span>
            <FaceSelect face={p.emphasisStyle.fontFace} onChange={f => p.onEmphasisStyle({ fontFace: f })} />
            <ResetBtn show={!!p.emphasisStyle.fontFace} onClick={() => p.onEmphasisStyle({ fontFace: undefined })} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">Styles</span>
            <CasingButtons
              casing={p.emphasisStyle.casing} underline={p.emphasisStyle.underline}
              onCasing={c => p.onEmphasisStyle({ casing: c })}
              onUnderline={u => p.onEmphasisStyle({ underline: u || undefined })}
            />
          </div>
        </div>
      </Section>

      {/* ── SPACING ───────────────────────────────────────────── */}
      <Section label="Spacing" defaultOpen={false}>
        <div className="space-y-3">
          <SliderRow label="Letter Spacing" value={ov.letterSpacing ?? 0} min={-2} max={12} step={0.5}
            onChange={v => patch({ letterSpacing: v === 0 ? undefined : v })}
            display={v => `${v}`} defaultValue={0} />
          <SliderRow label="Word Spacing" value={ov.wordSpacing ?? 6} min={0} max={30} step={1}
            onChange={v => patch({ wordSpacing: v === 6 ? undefined : v })}
            display={v => `${v}`} defaultValue={6} />
          <SliderRow label="Line Spacing" value={ov.lineSpacing ?? 1.0} min={0.7} max={2} step={0.05}
            onChange={v => patch({ lineSpacing: v })}
            display={v => v.toFixed(2).replace(/0$/, '')} defaultValue={1.0} />
          {(typeof ov.wordSpacing === 'number' || typeof ov.lineSpacing === 'number') && (
            <p className="text-[9.5px] text-zinc-600 leading-snug">Word &amp; line spacing export via HD render.</p>
          )}
        </div>
      </Section>

      {/* ── EFFECTS ───────────────────────────────────────────── */}
      <Section label="Effects" defaultOpen={false}>
        <div className="space-y-2">

          {/* Drop Shadow */}
          <ToggleRow label="Drop Shadow" on={!!ov.shadow}
            onChange={on => patch({ shadow: on ? { hex: '#000000', opacity: 100, x: 5, y: 5, blur: 10 } : undefined })} />
          {ov.shadow && (
            <div className="space-y-2.5 pb-2">
              <ColorField label="Color" hex={ov.shadow.hex} opacity={ov.shadow.opacity}
                onHex={hex => patch({ shadow: { ...ov.shadow!, hex } })}
                onOpacity={opacity => patch({ shadow: { ...ov.shadow!, opacity } })} />
              <SliderRow label="Position X" value={ov.shadow.x} min={-20} max={20} step={1}
                onChange={x => patch({ shadow: { ...ov.shadow!, x } })} defaultValue={5} />
              <SliderRow label="Position Y" value={ov.shadow.y} min={-20} max={20} step={1}
                onChange={y => patch({ shadow: { ...ov.shadow!, y } })} defaultValue={5} />
              <SliderRow label="Blur" value={ov.shadow.blur} min={0} max={40} step={1}
                onChange={blur => patch({ shadow: { ...ov.shadow!, blur } })} defaultValue={10} />
            </div>
          )}

          {/* Text Stroke */}
          <ToggleRow label="Text Stroke" on={!!ov.stroke}
            onChange={on => patch({ stroke: on ? { hex: '#000000', opacity: 100, width: 1 } : undefined })} />
          {ov.stroke && (
            <div className="space-y-2.5 pb-2">
              <ColorField label="Color" hex={ov.stroke.hex} opacity={ov.stroke.opacity}
                onHex={hex => patch({ stroke: { ...ov.stroke!, hex } })}
                onOpacity={opacity => patch({ stroke: { ...ov.stroke!, opacity } })} />
              <SliderRow label="Width" value={ov.stroke.width} min={0.5} max={8} step={0.5}
                onChange={width => patch({ stroke: { ...ov.stroke!, width } })} defaultValue={1} />
            </div>
          )}

          {/* Background */}
          <ToggleRow label="Background" on={!!bg}
            onChange={on => patch({ background: on ? { hex: '#000000', opacity: 100, radius: 24, padW: 48, padH: 24 } : undefined })} />
          {bg && (
            <div className="space-y-2.5 pb-1">
              <ColorField label="Color" hex={bg.hex} opacity={bg.opacity}
                onHex={hex => patchBg({ hex })} onOpacity={opacity => patchBg({ opacity })} />

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-400">Border Radius</span>
                <button
                  onClick={() => {
                    const linked = !radiusLinked;
                    setRadiusLinked(linked);
                    if (linked && typeof bg.radius !== 'number') patchBg({ radius: bg.radius.tl });
                    if (!linked && typeof bg.radius === 'number') patchBg({ radius: { tl: bg.radius, tr: bg.radius, br: bg.radius, bl: bg.radius } });
                  }}
                  className={`text-[10px] px-2 py-1 rounded-lg border flex items-center gap-1 cursor-pointer transition-colors ${
                    radiusLinked ? 'text-amber-300 border-amber-400/30 bg-amber-400/10' : 'text-zinc-400 border-white/[0.1] hover:text-zinc-200'}`}
                >⛓ {radiusLinked ? 'Linked' : 'Per corner'}</button>
              </div>
              {radiusLinked || typeof bg.radius === 'number' ? (
                <SliderRow label="Radius" value={typeof bg.radius === 'number' ? bg.radius : bg.radius.tl}
                  min={0} max={60} step={1} onChange={radius => patchBg({ radius })} defaultValue={24} />
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {(['tl', 'tr', 'bl', 'br'] as const).map(c => (
                    <NumField key={c} label={c.toUpperCase()} unit="px"
                      value={typeof bg.radius === 'number' ? bg.radius : bg.radius[c]} min={0} max={60}
                      onChange={v => patchBg({ radius: { ...(typeof bg.radius === 'number' ? { tl: bg.radius, tr: bg.radius, br: bg.radius, bl: bg.radius } : bg.radius), [c]: v } })} />
                  ))}
                </div>
              )}

              <span className="text-[11px] text-zinc-400 block pt-1">Background Size</span>
              <div className="flex items-center gap-2">
                <NumField label="Width" value={bg.padW} unit="px" min={0} max={200}
                  onChange={padW => patchBg({ padW })}
                  onReset={() => patchBg({ padW: 48 })} showReset={bg.padW !== 48} />
                <NumField label="Height" value={bg.padH} unit="px" min={0} max={120}
                  onChange={padH => patchBg({ padH })}
                  onReset={() => patchBg({ padH: 24 })} showReset={bg.padH !== 24} />
              </div>

              {/* Background drop shadow (multi-layer) */}
              <ToggleRow label="Drop Shadow" on={!!bg.shadows?.length}
                onChange={on => patchBg({ shadows: on ? [{ hex: '#000000', opacity: 25, x: 0, y: 4, blur: 12 }] : undefined })} />
              {!!bg.shadows?.length && (
                <div className="space-y-3">
                  {bg.shadows.map((s, i) => {
                    const update = (ps: Partial<ShadowConfig>) =>
                      patchBg({ shadows: bg.shadows!.map((x, j) => (j === i ? { ...x, ...ps } : x)) });
                    return (
                      <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[9.5px] font-bold text-zinc-600 uppercase tracking-widest">Shadow Layer {i + 1}</span>
                          {bg.shadows!.length > 1 && (
                            <button onClick={() => patchBg({ shadows: bg.shadows!.filter((_, j) => j !== i) })}
                              className="text-[10px] text-zinc-600 hover:text-red-400 cursor-pointer">Remove</button>
                          )}
                        </div>
                        <ColorField hex={s.hex} opacity={s.opacity}
                          onHex={hex => update({ hex })} onOpacity={opacity => update({ opacity })} />
                        <div className="flex items-center gap-1.5">
                          <NumField label="X" value={s.x} unit="px" min={-40} max={40} onChange={x => update({ x })} />
                          <NumField label="Y" value={s.y} unit="px" min={-40} max={40} onChange={y => update({ y })} />
                          <NumField label="Blur" value={s.blur} unit="px" min={0} max={60} onChange={blur => update({ blur })} />
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => patchBg({ shadows: [...(bg.shadows ?? []), { hex: '#000000', opacity: 25, x: 0, y: 4, blur: 12 }] })}
                    className="w-full py-2 rounded-lg border border-white/[0.08] text-[11px] font-semibold text-zinc-300 hover:bg-white/[0.04] transition-colors cursor-pointer"
                  >+ Add Shadow Layer</button>
                </div>
              )}

              {/* Background outline */}
              <ToggleRow label="Outline" on={!!bg.outline}
                onChange={on => patchBg({ outline: on ? { hex: '#000000', opacity: 100, width: 2, offset: 0 } : undefined })} />
              {bg.outline && (
                <div className="space-y-2.5">
                  <ColorField label="Color" hex={bg.outline.hex} opacity={bg.outline.opacity}
                    onHex={hex => patchBg({ outline: { ...bg.outline!, hex } })}
                    onOpacity={opacity => patchBg({ outline: { ...bg.outline!, opacity } })} />
                  <div className="flex items-center gap-2">
                    <NumField label="Stroke Width" value={bg.outline.width} unit="px" min={0} max={20}
                      onChange={width => patchBg({ outline: { ...bg.outline!, width } })} />
                    <NumField label="Offset" value={bg.outline.offset} unit="px" min={0} max={20}
                      onChange={offset => patchBg({ outline: { ...bg.outline!, offset } })} />
                  </div>
                </div>
              )}

              <p className="text-[9.5px] text-zinc-600 leading-snug pt-1">Backgrounds export via HD render.</p>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

// ── Per-template slot editor (editor_masala / illusion / aura) ───────────────────
// These templates own a multi-font / multi-colour / motion design, so they get
// dedicated per-slot controls instead of the flat Text controls. Values flow through
// kineticSlots resolvers → preview (CaptionOverlay) + export (KineticCaptionComposition).

function SlotFontRow({ label, value, onChange }: {
  label: string; value?: string; onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">{label}</span>
      <div className="relative flex-1 min-w-0">
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? undefined : e.target.value)}
          className="w-full appearance-none bg-white/[0.06] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-[11px] text-white outline-none cursor-pointer hover:border-white/[0.16]"
        >
          {SLOT_FONT_CHOICES.map(c => (
            <option key={c.label} value={c.value} className="bg-zinc-900" style={{ fontFamily: c.value || undefined }}>{c.label}</option>
          ))}
        </select>
        <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
      <ResetBtn show={value !== undefined} onClick={() => onChange(undefined)} />
    </div>
  );
}

function SlotSelectRow<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">{label}</span>
      <div className="relative flex-1 min-w-0">
        <select
          value={value}
          onChange={e => onChange(e.target.value as T)}
          className="w-full appearance-none bg-white/[0.06] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-[11px] text-white outline-none cursor-pointer hover:border-white/[0.16]"
        >
          {options.map(o => <option key={o.value} value={o.value} className="bg-zinc-900">{o.label}</option>)}
        </select>
        <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
}

function IllusionSlotControls({ slots, onSlot }: { slots: TemplateSlotOverrides; onSlot: (p: TemplateSlotOverrides) => void }) {
  const ov = slots.illusion ?? {};
  const r  = resolveIllusionSlots(ov);
  const patch = (p: IllusionSlots) => onSlot({ illusion: p });
  return (
    <div className="space-y-2.5">
      <SlotFontRow label="Font" value={ov.font} onChange={v => patch({ font: v })} />
      <ColorField label="Word color" hex={r.baseColor ?? '#ffffff'}
        onHex={h => patch({ baseColor: h })} onReset={() => patch({ baseColor: undefined })} showReset={ov.baseColor !== undefined} />
      <ColorField label="Glitch word" hex={r.emphColor ?? r.baseColor ?? '#ffffff'}
        onHex={h => patch({ emphColor: h })} onReset={() => patch({ emphColor: undefined })} showReset={ov.emphColor !== undefined} />
      <SlotSelectRow label="Glitch" value={r.glitchTarget === 'off' ? 'off' : 'auto'}
        options={[{ value: 'auto', label: 'On (hero word)' }, { value: 'off', label: 'Off' }]}
        onChange={v => patch({ glitchTarget: v })} />
      <SlotSelectRow label="Glitch style" value={r.glitchStyle}
        options={[{ value: 'random', label: 'Random' }, { value: 'flicker', label: 'Flicker' }, { value: 'blur', label: 'Blur' }]}
        onChange={v => patch({ glitchStyle: v })} />
      <SlotSelectRow<CaptionInAnimation> label="In animation" value={r.inAnimation}
        options={IN_ANIMATION_CHOICES}
        onChange={v => patch({ inAnimation: v === 'default' ? undefined : v })} />
      <p className="text-[9.5px] text-zinc-600 leading-snug">The glitch lands on the emphasised (hero) word — emphasise a word in the timeline to choose which.</p>
      <p className="text-[9.5px] text-zinc-600 leading-snug">In animation controls how words fly in. Pick <span className="text-zinc-400">No animation</span> or a slide when the signature entrance runs long on short captions.</p>
    </div>
  );
}

function EditorMasalaSlotControls({ slots, onSlot }: { slots: TemplateSlotOverrides; onSlot: (p: TemplateSlotOverrides) => void }) {
  const ov = slots.editor_masala ?? {};
  const r  = resolveEditorMasalaSlots(ov);
  const patch = (p: EditorMasalaSlots) => onSlot({ editor_masala: p });
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">Persona</span>
        <div className="flex-1">
          <Segmented size="sm"
            options={[
              { id: 'auto', label: 'Auto', title: 'Alternate the two personas per caption (default)' },
              { id: 'A', label: 'Script', title: 'Always the elegant serif-script persona' },
              { id: 'B', label: 'Punch', title: 'Always the bold glowing-punch persona' },
            ]}
            value={r.personaMode}
            onChange={m => patch({ personaMode: m as EditorMasalaSlots['personaMode'] })}
          />
        </div>
      </div>
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Context rows</p>
      <SlotFontRow label="Font" value={ov.contextFont} onChange={v => patch({ contextFont: v })} />
      <ColorField label="Color" hex={r.contextColor ?? '#ffffff'}
        onHex={h => patch({ contextColor: h })} onReset={() => patch({ contextColor: undefined })} showReset={ov.contextColor !== undefined} />
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Script hero (A)</p>
      <SlotFontRow label="Font" value={ov.heroAFont} onChange={v => patch({ heroAFont: v })} />
      <ColorField label="Color" hex={r.heroAColor}
        onHex={h => patch({ heroAColor: h })} onReset={() => patch({ heroAColor: undefined })} showReset={ov.heroAColor !== undefined} />
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Punch hero (B)</p>
      <SlotFontRow label="Font" value={ov.heroBFont} onChange={v => patch({ heroBFont: v })} />
      <ColorField label="Color" hex={r.heroBColor}
        onHex={h => patch({ heroBColor: h })} onReset={() => patch({ heroBColor: undefined })} showReset={ov.heroBColor !== undefined} />
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Motion</p>
      <SlotSelectRow<CaptionInAnimation> label="In animation" value={r.inAnimation}
        options={IN_ANIMATION_CHOICES}
        onChange={v => patch({ inAnimation: v === 'default' ? undefined : v })} />
      <p className="text-[9.5px] text-zinc-600 leading-snug">Pick <span className="text-zinc-400">No animation</span> or a slide when the signature entrance runs long on short captions.</p>
    </div>
  );
}

function AuraSlotControls({ slots, onSlot, swiss = false }: { slots: TemplateSlotOverrides; onSlot: (p: TemplateSlotOverrides) => void; swiss?: boolean }) {
  // "Swiss" shares this editor but stores under its own `aura_helvetica` key (Helvetica defaults),
  // so its font/colour/animation edits are independent of Aura's.
  const ov = (swiss ? slots.aura_helvetica : slots.aura) ?? {};
  const r  = swiss ? resolveSwissSlots(ov) : resolveAuraSlots(ov);
  const patch = (p: AuraSlots) => onSlot(swiss ? { aura_helvetica: p } : { aura: p });
  return (
    <div className="space-y-2.5">
      <SlotFontRow label="Feature font" value={ov.cursiveFont} onChange={v => patch({ cursiveFont: v })} />
      <SlotFontRow label="Key font" value={ov.boldFont} onChange={v => patch({ boldFont: v })} />
      <SlotFontRow label="Support font" value={ov.supportFont} onChange={v => patch({ supportFont: v })} />
      <ColorField label="Word color" hex={r.baseColor}
        onHex={h => patch({ baseColor: h })} onReset={() => patch({ baseColor: undefined })} showReset={ov.baseColor !== undefined} />
      <ColorField label="Accent" hex={r.accentColor}
        onHex={h => patch({ accentColor: h })} onReset={() => patch({ accentColor: undefined })} showReset={ov.accentColor !== undefined} />
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Motion</p>
      <SlotSelectRow<CaptionInAnimation> label="In animation" value={r.inAnimation}
        options={IN_ANIMATION_CHOICES}
        onChange={v => patch({ inAnimation: v === 'default' ? undefined : v })} />
      <p className="text-[9.5px] text-zinc-600 leading-snug">Pick <span className="text-zinc-400">No animation</span> or a slide when the signature entrance runs long on short captions.</p>
    </div>
  );
}

function SlotToggleRow({ label, value, onChange, hint }: {
  label: string; value: boolean; onChange: (v: boolean) => void; hint?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-zinc-400 w-[88px] shrink-0">{label}</span>
      <div className="flex-1">
        <Segmented size="sm"
          options={[{ id: 'on', label: 'On', title: hint }, { id: 'off', label: 'Off', title: hint }]}
          value={value ? 'on' : 'off'}
          onChange={m => onChange(m === 'on')}
        />
      </div>
    </div>
  );
}

function ScribbleSlotControls({ slots, onSlot }: { slots: TemplateSlotOverrides; onSlot: (p: TemplateSlotOverrides) => void }) {
  const ov = slots.scribble ?? {};
  const r  = resolveScribbleSlots(ov);
  const patch = (p: ScribbleSlots) => onSlot({ scribble: p });
  return (
    <div className="space-y-2.5">
      <SlotFontRow label="Font" value={ov.font} onChange={v => patch({ font: v })} />
      <ColorField label="Word color" hex={r.noteColor}
        onHex={h => patch({ noteColor: h })} onReset={() => patch({ noteColor: undefined })} showReset={ov.noteColor !== undefined} />
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Highlighter</p>
      <ColorField label="Marker" hex={r.markerColor}
        onHex={h => patch({ markerColor: h })} onReset={() => patch({ markerColor: undefined })} showReset={ov.markerColor !== undefined} />
      <ColorField label="Ink on it" hex={r.inkColor}
        onHex={h => patch({ inkColor: h })} onReset={() => patch({ inkColor: undefined })} showReset={ov.inkColor !== undefined} />
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Pen circle</p>
      <ColorField label="Pen" hex={r.penColor}
        onHex={h => patch({ penColor: h })} onReset={() => patch({ penColor: undefined })} showReset={ov.penColor !== undefined} />
      <p className="text-[9.5px] text-zinc-600 leading-snug">A few strong words get the marker automatically — <span className="text-zinc-400">highlight</span> words in the timeline to choose them yourself. The pen circle follows the word you <span className="text-zinc-400">emphasise</span>.</p>
    </div>
  );
}

function ArchivesSlotControls({ slots, onSlot }: { slots: TemplateSlotOverrides; onSlot: (p: TemplateSlotOverrides) => void }) {
  const ov = slots.archives ?? {};
  const r  = resolveArchivesSlots(ov);
  const patch = (p: ArchivesSlots) => onSlot({ archives: p });
  return (
    <div className="space-y-2.5">
      <SlotFontRow label="Font" value={ov.font} onChange={v => patch({ font: v })} />
      <ColorField label="Ink" hex={r.inkColor}
        onHex={h => patch({ inkColor: h })} onReset={() => patch({ inkColor: undefined })} showReset={ov.inkColor !== undefined} />
      <ColorField label="Emphasis" hex={r.emphColor ?? r.inkColor}
        onHex={h => patch({ emphColor: h })} onReset={() => patch({ emphColor: undefined })} showReset={ov.emphColor !== undefined} />
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Hand-drawn marks</p>
      <SlotToggleRow label="Underline" value={r.showUnderline}
        onChange={v => patch({ showUnderline: v })} hint="The hand underline under the emphasised word" />
      <SlotToggleRow label="Scrawl-in" value={r.showScrawl}
        onChange={v => patch({ showScrawl: v })} hint="The quick scribble that precedes each word" />
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Motion</p>
      <SlotSelectRow label="Boil" value={r.boilAmount}
        options={BOIL_AMOUNT_CHOICES} onChange={v => patch({ boilAmount: v })} />
      <SlotSelectRow<CaptionInAnimation> label="In animation" value={r.inAnimation}
        options={IN_ANIMATION_CHOICES}
        onChange={v => patch({ inAnimation: v === 'default' ? undefined : v })} />
      <p className="text-[9.5px] text-zinc-600 leading-snug"><span className="text-zinc-400">Boil</span> is how hard the letters redraw themselves each frame. The underline follows the word you <span className="text-zinc-400">emphasise</span> in the timeline — with none set, the line stays plain.</p>
    </div>
  );
}

function JournalSlotControls({ slots, onSlot }: { slots: TemplateSlotOverrides; onSlot: (p: TemplateSlotOverrides) => void }) {
  const ov = slots.journal ?? {};
  const r  = resolveJournalSlots(ov);
  const patch = (p: JournalSlots) => onSlot({ journal: p });
  return (
    <div className="space-y-2.5">
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest">The hand</p>
      <SlotFontRow label="Font" value={ov.font} onChange={v => patch({ font: v })} />
      <ColorField label="Colour" hex={r.color}
        onHex={h => patch({ color: h })} onReset={() => patch({ color: undefined })} showReset={ov.color !== undefined} />
      <SlotSelectRow label="Weight" value={r.weight}
        options={JN_WEIGHT_CHOICES} onChange={v => patch({ weight: v })} />
      <SlotToggleRow label="Uppercase" value={r.uppercase}
        onChange={v => patch({ uppercase: v })} hint="Set the line in caps" />

      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Coming in</p>
      <SlotSelectRow label="Focus" value={r.entrance}
        options={JN_ENTRANCE_CHOICES} onChange={v => patch({ entrance: v })} />
      <p className="text-[9.5px] text-zinc-600 leading-snug">Each word arrives on the beat it is spoken, blurred and a touch small, then resolves and grows into place.</p>

      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Going out</p>
      <ColorField label="Turns to" hex={r.exitColor}
        onHex={h => patch({ exitColor: h })} onReset={() => patch({ exitColor: undefined })} showReset={ov.exitColor !== undefined} />
      <SlotSelectRow label="Leaves" value={r.exitOrder}
        options={JN_EXIT_ORDER_CHOICES} onChange={v => patch({ exitOrder: v })} />
      {r.exitOrder === 'sequence' && (
        <SlotSelectRow label="Word spacing" value={r.sweep}
          options={JN_SWEEP_CHOICES} onChange={v => patch({ sweep: v })} />
      )}
      <SlotSelectRow label="How slowly" value={r.exitLead}
        options={JN_EXIT_LEAD_CHOICES} onChange={v => patch({ exitLead: v })} />
      <p className="text-[9.5px] text-zinc-600 leading-snug">Word by word, each word leaves behind the one to its left &mdash; <span className="text-zinc-400">Word spacing</span> sets how far behind. The line eases to <span className="text-zinc-400">Turns to</span> and then fades — the colour always finishes arriving before the fade starts, so you see it.</p>

      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Finish</p>
      <SlotSelectRow label="Drop shadow" value={r.shadowAmount}
        options={BB_LEVEL_CHOICES} onChange={v => patch({ shadowAmount: v })} />
    </div>
  );
}

function InterlockSlotControls({ slots, onSlot }: { slots: TemplateSlotOverrides; onSlot: (p: TemplateSlotOverrides) => void }) {
  const ov = slots.interlock ?? {};
  const r  = resolveInterlockSlots(ov);
  const patch = (p: InterlockSlots) => onSlot({ interlock: p });
  return (
    <div className="space-y-2.5">
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest">The emphasised word</p>
      <SlotFontRow label="Font" value={ov.heroFont} onChange={v => patch({ heroFont: v })} />
      <ColorField label="Colour" hex={r.heroColor}
        onHex={h => patch({ heroColor: h })} onReset={() => patch({ heroColor: undefined })} showReset={ov.heroColor !== undefined} />
      <SlotSelectRow label="Arrives" value={r.inAnimation}
        options={IN_ANIMATION_CHOICES} onChange={v => patch({ inAnimation: v })} />

      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">The rest of the line</p>
      <SlotFontRow label="Font" value={ov.capsFont} onChange={v => patch({ capsFont: v })} />
      <ColorField label="Colour" hex={r.capsColor}
        onHex={h => patch({ capsColor: h })} onReset={() => patch({ capsColor: undefined })} showReset={ov.capsColor !== undefined} />
      <SlotSelectRow label="Size" value={r.capsSize}
        options={IL_CAPS_SIZE_CHOICES} onChange={v => patch({ capsSize: v })} />
      <SlotSelectRow label="Tracking" value={r.tracking}
        options={IL_TRACKING_CHOICES} onChange={v => patch({ tracking: v })} />
      <SlotSelectRow label="Comes up" value={r.capsReveal}
        options={IL_CAPS_REVEAL_CHOICES} onChange={v => patch({ capsReveal: v })} />
      <SlotToggleRow label="Uppercase" value={r.uppercase}
        onChange={v => patch({ uppercase: v })} hint="Set the small words as caps" />

      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Finish</p>
      <SlotToggleRow label="Fill the gaps" value={r.nest}
        onChange={v => patch({ nest: v })} hint="The small words flow into the spaces the big word's tall letters leave — turn off to keep them clear of it" />
      <SlotSelectRow label="Drop shadow" value={r.shadowAmount}
        options={BB_LEVEL_CHOICES} onChange={v => patch({ shadowAmount: v })} />
      <p className="text-[9.5px] text-zinc-600 leading-snug">Emphasise a word and it becomes the <span className="text-zinc-400">large italic</span>, with the rest of the line placed in the space its letterforms leave. With <span className="text-zinc-400">no emphasis</span> the line sets as a plain caption.</p>
    </div>
  );
}

function BlockbusterSlotControls({ slots, onSlot }: { slots: TemplateSlotOverrides; onSlot: (p: TemplateSlotOverrides) => void }) {
  const ov = slots.blockbuster ?? {};
  const r  = resolveBlockbusterSlots(ov);
  const patch = (p: BlockbusterSlots) => onSlot({ blockbuster: p });
  return (
    <div className="space-y-2.5">
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest">Tier 1 — the loud voice</p>
      <SlotFontRow label="Font" value={ov.condFont} onChange={v => patch({ condFont: v })} />
      <ColorField label="Colour" hex={r.redColor}
        onHex={h => patch({ redColor: h })} onReset={() => patch({ redColor: undefined })} showReset={ov.redColor !== undefined} />
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Tier 2 — the script</p>
      <SlotFontRow label="Font" value={ov.scriptFont} onChange={v => patch({ scriptFont: v })} />
      <ColorField label="Colour" hex={r.scriptColor}
        onHex={h => patch({ scriptColor: h })} onReset={() => patch({ scriptColor: undefined })} showReset={ov.scriptColor !== undefined} />
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Finish</p>
      <SlotSelectRow label="Glow" value={r.glowAmount}
        options={BB_LEVEL_CHOICES} onChange={v => patch({ glowAmount: v })} />
      <SlotSelectRow label="Drop shadow" value={r.shadowAmount}
        options={BB_LEVEL_CHOICES} onChange={v => patch({ shadowAmount: v })} />
      <SlotToggleRow label="Overlap tiers" value={r.overlap}
        onChange={v => patch({ overlap: v })} hint="The script rises into the red band instead of sitting clear of it" />
      <p className="text-[9.5px] text-zinc-600 uppercase tracking-widest pt-1">Motion</p>
      <SlotToggleRow label="Tracking" value={r.tracking}
        onChange={v => patch({ tracking: v })} hint="The line opens out slowly while it holds" />
      <p className="text-[9.5px] text-zinc-600 leading-snug">The split is <span className="text-zinc-400">positional</span> — the line runs in tier 1 until it would get too wide, then finishes in the script. There is deliberately <span className="text-zinc-400">no emphasis</span> here: the change of voice is the emphasis.</p>
    </div>
  );
}

/** Tells the user which captions the Position/Size controls will change — they follow the
 *  timeline selection (like the on-canvas drag/resize) and are global only when nothing is
 *  selected. Without this the controls read as global and silently changed every caption.
 *  `verb` is the control's action ("Moves" / "Resizes"). */
function ScopeHint({ count, verb = 'Moves' }: { count: number; verb?: string }) {
  const verbAll = verb.toLowerCase().replace(/s$/, '');
  return (
    <p className="text-[10px] text-zinc-500 mt-1.5 leading-tight">
      {count > 0
        ? `${verb} the ${count === 1 ? 'selected caption' : `${count} selected captions`} only — deselect in the timeline to ${verbAll} all.`
        : `${verb} all captions — select caption(s) in the timeline to ${verbAll} just those.`}
    </p>
  );
}

/** State + setter for the "Keep captions off faces" toggle. */
export interface FaceAwareControl {
  on:         boolean;
  onChange:   (on: boolean) => void;
  status:     'idle' | 'analyzing' | 'ready' | 'error' | 'unsupported';
  /** 0–1 while analysing. */
  progress:   number;
  /** Captions currently moved automatically. */
  movedCount: number;
  /** Captions that DO cover a face but have nowhere clear to go (the subject fills the frame). */
  blockedCount: number;
}

/** Position-section toggle: moves a caption vertically only when it would cover the speaker's face. */
function FaceAwareToggle({ control: c }: { control: FaceAwareControl }) {
  const hint = !c.on
    ? 'Moves a caption up or down only when it would cover the speaker’s face. Captions you place yourself stay put.'
    : c.status === 'unsupported' ? 'Finding faces needs desktop Google Chrome.'
    : c.status === 'error'       ? 'Couldn’t find faces in this clip — try a clear, well-lit video.'
    : c.status === 'ready'
      ? (c.movedCount > 0
        ? `${c.movedCount} caption${c.movedCount === 1 ? '' : 's'} moved off faces. Drag one to place it yourself.`
        : c.blockedCount > 0
          ? `${c.blockedCount} caption${c.blockedCount === 1 ? '' : 's'} can’t clear the face here — left where you put them.`
          : 'No caption covers a face.')
    : `Finding faces… ${Math.round(c.progress * 100)}%`;
  return (
    <div className="mt-2.5 pt-2 border-t border-white/[0.05]" data-face-aware={c.status}>
      <ToggleRow label="Keep captions off faces" on={c.on} onChange={c.onChange} />
      <p className={`text-[10px] mt-0.5 leading-tight ${c.on && (c.status === 'error' || c.status === 'unsupported') ? 'text-amber-300/90' : 'text-zinc-500'}`}>
        {hint}
      </p>
    </div>
  );
}

function TemplateSlotsEditor({
  captionStyle, slots, onSlot,
  captionFontScale, onCaptionFontScaleChange,
  captionXPercent, captionYPercent, onPositionChange, positionScopeCount = 0, faceAware,
}: {
  captionStyle: CaptionStyleId;
  slots: TemplateSlotOverrides;
  onSlot: (p: TemplateSlotOverrides) => void;
  captionFontScale: number;
  onCaptionFontScaleChange: (v: number) => void;
  captionXPercent: number;
  captionYPercent: number;
  onPositionChange: (x: number, y: number) => void;
  positionScopeCount?: number;
  faceAware?: FaceAwareControl;
}) {
  const sizePx = Math.round(captionFontScale * BASE_FONT_PX);
  return (
    <div className="p-3 space-y-1">
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5">
        <p className="text-[11px] text-amber-200 font-semibold">Editable template</p>
        <p className="text-[10.5px] text-zinc-400 mt-0.5 leading-relaxed">
          Tune this template&apos;s fonts &amp; colours{captionStyle === 'illusion' ? ' & glitch' : captionStyle === 'editor_masala' ? ' & persona' : captionStyle === 'archives' ? ' & hand-drawn marks' : captionStyle === 'scribble' ? ' & pen marks' : captionStyle === 'blockbuster' ? ' & the two voices' : captionStyle === 'interlock' ? ' & how the words fill the gaps' : captionStyle === 'journal' ? ' & how the line arrives and leaves' : ''}. Size &amp; position are below.
        </p>
      </div>

      <Section label="Template">
        {captionStyle === 'illusion'      && <IllusionSlotControls slots={slots} onSlot={onSlot} />}
        {captionStyle === 'editor_masala' && <EditorMasalaSlotControls slots={slots} onSlot={onSlot} />}
        {captionStyle === 'aura'          && <AuraSlotControls slots={slots} onSlot={onSlot} />}
        {captionStyle === 'aura_helvetica' && <AuraSlotControls slots={slots} onSlot={onSlot} swiss />}
        {captionStyle === 'scribble'      && <ScribbleSlotControls slots={slots} onSlot={onSlot} />}
        {captionStyle === 'archives'      && <ArchivesSlotControls slots={slots} onSlot={onSlot} />}
        {captionStyle === 'blockbuster'   && <BlockbusterSlotControls slots={slots} onSlot={onSlot} />}
        {captionStyle === 'interlock'     && <InterlockSlotControls slots={slots} onSlot={onSlot} />}
        {captionStyle === 'journal'       && <JournalSlotControls slots={slots} onSlot={onSlot} />}
      </Section>

      <Section label="Size">
        <SliderRow
          label="Size" value={sizePx} min={12} max={96} step={1}
          onChange={v => onCaptionFontScaleChange(v / BASE_FONT_PX)}
          display={v => `${v}px`} defaultValue={BASE_FONT_PX}
        />
        <ScopeHint count={positionScopeCount} verb="Resizes" />
      </Section>

      <Section label="Position">
        <div className="flex items-center gap-2">
          <NumField label="X" value={Math.round(captionXPercent * 10) / 10} unit="%" min={0} max={100}
            onChange={v => onPositionChange(v, captionYPercent)}
            onReset={() => onPositionChange(50, captionYPercent)} showReset={captionXPercent !== 50} />
          <NumField label="Y" value={Math.round(captionYPercent * 10) / 10} unit="%" min={0} max={100}
            onChange={v => onPositionChange(captionXPercent, v)}
            onReset={() => onPositionChange(captionXPercent, 85)} showReset={captionYPercent !== 85} />
        </div>
        <ScopeHint count={positionScopeCount} />
        {faceAware && <FaceAwareToggle control={faceAware} />}
      </Section>
    </div>
  );
}
