'use client';

// Right-panel "Templates" tab — Built-in Templates | My Presets, search,
// Save Preset, and an expanded card for the active template with its quick
// controls (Layout Splash|Center + Emphasis for the hero family, Primary
// colour for accent-driven templates, Remove Style to reset customizations).

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Search, Save, Trash2 } from 'lucide-react';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import type { EmphasisStyle, LayoutMode } from '@/types/transcript';
import { CAPTION_STYLES, STYLE_CATEGORIES, styleCategory } from '@/lib/captionStyles';
import { isHeroTemplate, isStyleLocked } from '@/lib/styleResolve';
import { listPresets, savePreset, deletePreset, type StylePreset } from '@/lib/presetStore';
import { Segmented, ColorField } from './controls';
import BrandKitPanel, { type BrandKitControls } from './BrandKitPanel';
import Tooltip from '@/components/ui/Tooltip';

// ── One-time "new templates" tip ──────────────────────────────────────────────
// Existing projects keep whatever template they were saved with, so the two new
// hand-drawn looks would never appear on their own — the user has to APPLY one
// once. This points that out exactly once per browser, then never again.
// Cross-tab invalidation + a stable no-op unsubscribe.
const HANDDRAWN_TIP_KEY = 'captik_handdrawn_tip_seen';
function subscribeStorage(cb: () => void) {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
}

export interface TemplatesTabProps {
  captionStyle: CaptionStyleId;
  onStyleChange: (id: string) => void;
  /** Captions selected in the timeline — when >0 a template click styles ONLY those. */
  selectedCount?: number;
  accentColor: string;
  onAccentColorChange: (c: string) => void;
  emphasisStyle: EmphasisStyle;
  onEmphasisStyle: (patch: Partial<EmphasisStyle>) => void;
  layoutMode: LayoutMode;
  onLayoutMode: (m: LayoutMode) => void;
  /** Capture the current full look for "Save Preset". */
  buildPresetPayload: () => Omit<StylePreset, 'id' | 'savedAt' | 'name'>;
  /** Apply a saved preset to the editor. */
  onApplyPreset: (p: StylePreset) => void;
  /** Reset the active template's customizations (accent/emphasis/layout). */
  onRemoveStyleCustomizations: () => void;
  hasStyleCustomizations: boolean;
  /** Brand Kit section — omitted where the editor doesn't offer it. */
  brandKit?: BrandKitControls;
}

export default function TemplatesTab(p: TemplatesTabProps) {
  const [view, setView] = useState<'builtin' | 'presets' | 'brandkit'>('builtin');
  const [query, setQuery] = useState('');
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [savingName, setSavingName] = useState<string | null>(null);

  // SSR snapshot returns `true` (seen) so the tip never flashes in before hydration.
  const tipSeenStored = useSyncExternalStore(
    subscribeStorage,
    () => { try { return localStorage.getItem(HANDDRAWN_TIP_KEY) === '1'; } catch { return true; } },
    () => true,
  );
  const [tipDismissed, setTipDismissed] = useState(false);
  const dismissTip = () => {
    setTipDismissed(true);
    try { localStorage.setItem(HANDDRAWN_TIP_KEY, '1'); } catch { /* private mode — tip just returns next visit */ }
  };
  // Hide it the moment they act on it (either new template applied), not only on ✕.
  const onHandDrawn = p.captionStyle === 'scribble' || p.captionStyle === 'archives';
  const showTip = !tipSeenStored && !tipDismissed && !onHandDrawn && view === 'builtin' && !query.trim();

  useEffect(() => { listPresets().then(setPresets); }, []);

  const styles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CAPTION_STYLES;
    return CAPTION_STYLES.filter(s =>
      s.name.toLowerCase().includes(q) || s.tags?.some(t => t.toLowerCase().includes(q)));
  }, [query]);

  const handleSavePreset = async () => {
    const name = (savingName ?? '').trim() || `My Style ${presets.length + 1}`;
    const saved = await savePreset({ ...p.buildPresetPayload(), name });
    if (saved) setPresets(prev => [saved, ...prev]);
    setSavingName(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* View switch + search + save preset */}
      <div className="p-2.5 space-y-2 shrink-0">
        <Segmented size="sm"
          options={[
            { id: 'builtin' as const, label: 'Built-in' },
            { id: 'presets' as const, label: 'My Presets' },
            ...(p.brandKit ? [{ id: 'brandkit' as const, label: 'Brand Kit' }] : []),
          ]}
          value={view} onChange={setView}
        />
        {view !== 'brandkit' && (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 flex items-center bg-white/[0.04] rounded-xl border border-white/[0.07] px-2.5 min-w-0">
            <Search className="w-3 h-3 text-zinc-600 shrink-0" />
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Find a template..."
              className="flex-1 bg-transparent text-[11px] text-white placeholder:text-zinc-600 py-2 px-2 outline-none min-w-0"
            />
          </div>
          <Tooltip label="Save your current style, colours & effects to reuse on any project">
          <button
            onClick={() => setSavingName('')}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-white/[0.08] text-[10.5px] font-semibold text-zinc-300 hover:bg-white/[0.05] hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <Save className="w-3 h-3" /> Save Preset
          </button>
          </Tooltip>
        </div>
        )}
        {view !== 'brandkit' && savingName !== null && (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus value={savingName} onChange={e => setSavingName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setSavingName(null); }}
              placeholder="Preset name…"
              className="flex-1 bg-white/[0.06] border border-amber-400/30 rounded-xl text-[11px] text-white placeholder:text-zinc-600 py-2 px-3 outline-none min-w-0"
            />
            <button onClick={handleSavePreset}
              className="px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-[10.5px] font-bold text-amber-300 cursor-pointer">Save</button>
            <button onClick={() => setSavingName(null)}
              className="px-2 py-2 rounded-xl text-[10.5px] text-zinc-500 hover:text-zinc-300 cursor-pointer">✕</button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-2">
        {(p.selectedCount ?? 0) > 0 && view === 'builtin' && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-3 py-2 mt-1.5">
            <p className="text-[10.5px] text-amber-200 leading-relaxed">
              <span className="font-bold">{p.selectedCount === 1 ? '1 caption' : `${p.selectedCount} captions`} selected</span>
              {' '}— a template applies to just {p.selectedCount === 1 ? 'that caption' : 'those captions'}.
              Clear the selection to change the whole video.
            </p>
          </div>
        )}
        {showTip && (
          <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2.5 mt-1.5 flex items-start gap-2.5">
            <span className="text-[13px] leading-none pt-[1px]">✏️</span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-amber-200">Two new hand-drawn templates</p>
              <p className="text-[10.5px] text-zinc-400 mt-0.5 leading-relaxed">
                <span className="text-zinc-200">Scribble</span> and <span className="text-zinc-200">Archives</span> are
                below. Your existing captions keep the template they were made with — tap one once to apply it.
              </p>
              <button
                onClick={() => { p.onStyleChange('archives'); dismissTip(); }}
                className="mt-2 text-[10.5px] font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2 cursor-pointer"
              >
                Try Archives now
              </button>
            </div>
            <button onClick={dismissTip} title="Dismiss"
              className="text-[11px] text-zinc-500 hover:text-zinc-300 leading-none cursor-pointer px-1 py-0.5 shrink-0">✕</button>
          </div>
        )}
        {view === 'brandkit' && p.brandKit ? (
          <BrandKitPanel captionStyle={p.captionStyle} {...p.brandKit} />
        ) : view === 'builtin' ? (
          STYLE_CATEGORIES.map(cat => {
            const inCat = styles.filter(s => styleCategory(s.id) === cat.key);
            if (!inCat.length) return null;
            return (
              <div key={cat.key} className="space-y-2">
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1 pt-1.5">{cat.label}</div>
                {inCat.map(s => {
          const isActive = p.captionStyle === s.id;
          const hero = isHeroTemplate(s.id);
          const locked = isStyleLocked(s.id);
          return (
            <div key={s.id}
              className={`rounded-xl overflow-hidden border transition-all duration-150 ${
                isActive
                  ? 'border-amber-400/70 shadow-[0_0_0_1px_rgba(245,158,11,0.3),0_0_20px_rgba(245,158,11,0.14)]'
                  : 'border-white/[0.07] hover:border-white/[0.2]'
              }`}>
              {/* Header */}
              <button onClick={() => p.onStyleChange(s.id)}
                className="w-full flex items-center justify-between px-3 py-2 bg-black/[0.25] cursor-pointer group">
                <span className={`text-[11px] font-semibold flex items-center gap-1.5 ${isActive ? 'text-amber-300' : 'text-zinc-300 group-hover:text-white'}`}>
                  {s.name}
                  {s.badge && (
                    <span className="text-[8px] font-bold text-white/90 bg-gradient-to-br from-orange-500 to-orange-600 px-1.5 py-[2.5px] rounded-full leading-none">{s.badge}</span>
                  )}
                </span>
                {isActive && (
                  <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-[9px] text-white font-bold">✓</span>
                )}
              </button>

              {/* Preview */}
              <button onClick={() => p.onStyleChange(s.id)}
                className="relative w-full overflow-hidden flex items-center justify-center cursor-pointer"
                style={{ height: 84, background: s.previewBg ?? 'linear-gradient(160deg,#0f0f16 0%,#09090f 100%)' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,rgba(0,0,0,0.28) 0%,transparent 38%,transparent 62%,rgba(0,0,0,0.18) 100%)', pointerEvents: 'none', zIndex: 1 }} />
                {!s.renderPreview && (
                  <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 60%, ${String(s.textStyle.color ?? '#fff')}26 0%, transparent 68%)` }} />
                )}
                <div style={{ position: 'relative', textAlign: 'center', maxWidth: '94%', zIndex: 2 }}>
                  {s.renderPreview ? s.renderPreview() : (
                    <span style={{ ...s.textStyle as React.CSSProperties, lineHeight: 1.2, fontSize: Math.min(Number(s.textStyle.fontSize ?? 18), 24) }}>
                      {s.previewText}
                    </span>
                  )}
                </div>
                {!!s.tags?.length && (
                  <div className="absolute bottom-1.5 left-1.5 flex gap-1 z-10">
                    {s.tags.slice(0, 2).map(t => (
                      <span key={t} className="text-[8px] font-semibold text-zinc-400 bg-black/60 px-1.5 py-[2.5px] rounded leading-none">{t}</span>
                    ))}
                  </div>
                )}
              </button>

              {/* Expanded quick controls for the active template */}
              {isActive && !locked && (
                <div className="px-3 py-3 space-y-3 bg-black/[0.18] border-t border-white/[0.05]">
                  {hero && (
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 space-y-2">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Layout</span>
                      <Segmented size="sm"
                        options={[
                          { id: 'splash', label: '▤ Splash', title: 'Big word with context rows above and below' },
                          { id: 'center', label: '☰ Center', title: 'Context words centered with the big word' },
                        ]}
                        value={p.layoutMode} onChange={p.onLayoutMode}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Colors</span>
                    <ColorField label="Primary" compact hex={p.accentColor}
                      onHex={p.onAccentColorChange}
                      onReset={() => p.onAccentColorChange('#06b6d4')}
                      showReset={p.accentColor.toLowerCase() !== '#06b6d4'} />
                  </div>

                  {hero && (
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 space-y-2">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Emphasis</span>
                      <Segmented size="sm"
                        options={[
                          { id: 'emphasize', label: 'Emphasize', title: 'Highlighted words get the emphasis colour & size' },
                          { id: 'spotlight', label: 'Spotlight', title: 'Highlighted words take over the whole frame' },
                        ]}
                        value={p.emphasisStyle.mode ?? 'emphasize'}
                        onChange={mode => p.onEmphasisStyle({ mode })}
                      />
                      <ColorField label="Color" compact hex={p.emphasisStyle.hex ?? p.accentColor}
                        onHex={h => p.onEmphasisStyle({ hex: h })}
                        onReset={() => p.onEmphasisStyle({ hex: undefined })}
                        showReset={!!p.emphasisStyle.hex} />
                    </div>
                  )}

                  {p.hasStyleCustomizations && (
                    <Tooltip label="Clear your tweaks and return to the template's original look" className="w-full">
                    <button
                      onClick={p.onRemoveStyleCustomizations}
                      className="w-full py-2 rounded-lg bg-emerald-500/85 hover:bg-emerald-500 text-[11px] font-bold text-white transition-colors cursor-pointer"
                    >Remove Style</button>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          );
                })}
              </div>
            );
          })
        ) : (
          /* ── My Presets ── */
          presets.length === 0 ? (
            <div className="text-center py-10 px-4">
              <p className="text-[12px] text-zinc-500 font-medium">No presets yet</p>
              <p className="text-[10.5px] text-zinc-600 mt-1.5 leading-relaxed">
                Style your captions, then hit <span className="text-zinc-400 font-semibold">Save Preset</span> to reuse the look on any project.
              </p>
            </div>
          ) : presets
            .filter(pr => !query.trim() || pr.name.toLowerCase().includes(query.trim().toLowerCase()))
            .map(pr => {
              const tpl = CAPTION_STYLES.find(s => s.id === pr.styleId);
              return (
                <div key={pr.id} className="rounded-xl border border-white/[0.07] hover:border-white/[0.18] overflow-hidden transition-colors">
                  <button onClick={() => p.onApplyPreset(pr)} className="w-full text-left cursor-pointer group">
                    <div className="flex items-center justify-between px-3 py-2 bg-black/[0.25]">
                      <span className="text-[11px] font-semibold text-zinc-200 group-hover:text-white truncate">{pr.name}</span>
                      <span className="text-[9px] text-zinc-600 shrink-0">{tpl?.name ?? pr.styleId}</span>
                    </div>
                    <div className="relative w-full overflow-hidden flex items-center justify-center"
                      style={{ height: 64, background: tpl?.previewBg ?? 'linear-gradient(160deg,#0f0f16 0%,#09090f 100%)' }}>
                      <div style={{ position: 'relative', textAlign: 'center', maxWidth: '94%' }}>
                        {tpl?.renderPreview ? tpl.renderPreview() : tpl ? (
                          <span style={{ ...tpl.textStyle as React.CSSProperties, lineHeight: 1.2, fontSize: Math.min(Number(tpl.textStyle.fontSize ?? 18), 20) }}>
                            {tpl.previewText}
                          </span>
                        ) : null}
                      </div>
                      <span className="absolute bottom-1.5 right-1.5 w-3 h-3 rounded-full border border-white/30" style={{ background: pr.accentColor }} title={`Accent ${pr.accentColor}`} />
                    </div>
                  </button>
                  <div className="flex items-center justify-end px-2 py-1 bg-black/[0.18] border-t border-white/[0.05]">
                    <Tooltip label="Delete this preset">
                    <button
                      onClick={() => { deletePreset(pr.id); setPresets(prev => prev.filter(x => x.id !== pr.id)); }}
                      aria-label="Delete preset"
                      className="p-1 rounded text-zinc-600 hover:text-red-400 transition-colors cursor-pointer">
                      <Trash2 className="w-3 h-3" />
                    </button>
                    </Tooltip>
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
