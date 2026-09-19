'use client';

// Right panel — reference-parity styling: Text (typography/effects) | Templates
// (built-ins + My Presets). The old Fonts/Colors/Appearance tabs folded into
// these two: font picker lives in Text → Font Family, accent colour in the
// active template card, position/size in Text → Position/Size.

import { useState } from 'react';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import type { TextOverrides, EmphasisStyle, LayoutMode, TemplateSlotOverrides } from '@/types/transcript';
import type { StylePreset } from '@/lib/presetStore';
import type { FontSelection } from './FontsPanel';
import TextTab from './panel/TextTab';
import TemplatesTab from './panel/TemplatesTab';
import Tooltip from '@/components/ui/Tooltip';

type RightTab = 'text' | 'templates';

interface RightPanelProps {
  captionStyle:             CaptionStyleId;
  onStyleChange:            (id: string) => void;
  /** Captions selected in the timeline — when >0 a template click styles ONLY those. */
  styleScopeCount?:         number;
  captionYPercent:          number;
  onCaptionYPercentChange:  (v: number) => void;
  captionXPercent:          number;
  onPositionChange:         (x: number, y: number) => void;
  /** Captions selected in the timeline — when >0 the Position fields move ONLY those. */
  positionScopeCount?:      number;
  captionFontScale:         number;
  onCaptionFontScaleChange: (v: number) => void;
  /** Big Reveal only: independent title font scale + setter. */
  emphFontScale?:           number;
  onEmphFontScaleChange?:   (v: number) => void;
  captionLines:             'single' | 'double';
  onCaptionLinesChange:     (v: 'single' | 'double') => void;
  accentColor:              string;
  onAccentColorChange:      (c: string) => void;
  captionTextColor:         string;
  onCaptionTextColorChange: (c: string) => void;
  selectedFont?:            string | null;
  onFontSelect?:            (sel: FontSelection | null) => void;
  textOverrides:            TextOverrides;
  onTextOverrides:          (patch: Partial<TextOverrides>) => void;
  emphasisStyle:            EmphasisStyle;
  onEmphasisStyle:          (patch: Partial<EmphasisStyle>) => void;
  templateSlots:            TemplateSlotOverrides;
  onTemplateSlot:           (patch: TemplateSlotOverrides) => void;
  layoutMode:               LayoutMode;
  onLayoutMode:             (m: LayoutMode) => void;
  buildPresetPayload:       () => Omit<StylePreset, 'id' | 'savedAt' | 'name'>;
  onApplyPreset:            (p: StylePreset) => void;
  onRemoveStyleCustomizations: () => void;
  hasStyleCustomizations:   boolean;
  /** Active template variant id (null = the template's stock look). */
  templateVariantId?:       string | null;
  onVariantChange?:         (variantId: string | null) => void;
  mobile?:                  boolean;
}

export default function RightPanel(p: RightPanelProps) {
  const [tab, setTab] = useState<RightTab>('templates');

  const TABS: { id: RightTab; label: string; hint: string }[] = [
    { id: 'text',      label: 'Text',      hint: 'Fonts, size, position, colours & effects' },
    { id: 'templates', label: 'Templates', hint: 'Ready-made caption styles & your presets' },
  ];

  return (
    <aside
      data-tour="templates"
      className={`flex flex-col h-full bg-[#111114] ${p.mobile ? 'w-full' : 'shrink-0 border-l border-white/[0.06]'}`}
      style={p.mobile ? undefined : { width: 248 }}
    >
      {/* ── Tab bar ──────────────────────────────────────────────── */}
      <div className="flex shrink-0 border-b border-white/[0.07] bg-[#0d0d10]">
        {TABS.map(t => (
          <Tooltip key={t.id} label={t.hint} className="flex-1">
          <button
            onClick={() => setTab(t.id)}
            className={`w-full py-3 text-[11px] font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer relative ${
              tab === t.id ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-amber-400 rounded-full" />
            )}
          </button>
          </Tooltip>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'text' && (
          <TextTab
            captionStyle={p.captionStyle}
            textOverrides={p.textOverrides}
            onTextOverrides={p.onTextOverrides}
            emphasisStyle={p.emphasisStyle}
            onEmphasisStyle={p.onEmphasisStyle}
            captionTextColor={p.captionTextColor}
            onCaptionTextColorChange={p.onCaptionTextColorChange}
            accentColor={p.accentColor}
            captionFontScale={p.captionFontScale}
            onCaptionFontScaleChange={p.onCaptionFontScaleChange}
            emphFontScale={p.emphFontScale}
            onEmphFontScaleChange={p.onEmphFontScaleChange}
            captionXPercent={p.captionXPercent}
            captionYPercent={p.captionYPercent}
            onPositionChange={p.onPositionChange}
            positionScopeCount={p.positionScopeCount ?? 0}
            selectedFont={p.selectedFont ?? null}
            onFontSelect={sel => p.onFontSelect?.(sel)}
            templateSlots={p.templateSlots}
            onTemplateSlot={p.onTemplateSlot}
          />
        )}

        {tab === 'templates' && (
          <TemplatesTab
            captionStyle={p.captionStyle}
            onStyleChange={p.onStyleChange}
            selectedCount={p.styleScopeCount ?? 0}
            accentColor={p.accentColor}
            onAccentColorChange={p.onAccentColorChange}
            emphasisStyle={p.emphasisStyle}
            onEmphasisStyle={p.onEmphasisStyle}
            layoutMode={p.layoutMode}
            onLayoutMode={p.onLayoutMode}
            buildPresetPayload={p.buildPresetPayload}
            onApplyPreset={p.onApplyPreset}
            onRemoveStyleCustomizations={p.onRemoveStyleCustomizations}
            hasStyleCustomizations={p.hasStyleCustomizations}
            templateVariantId={p.templateVariantId ?? null}
            onVariantChange={p.onVariantChange}
          />
        )}
      </div>
    </aside>
  );
}
