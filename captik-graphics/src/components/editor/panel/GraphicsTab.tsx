'use client';

// Graphics tab — the scene/overlay template browser and inspector.
//
// Three zones: the picker grid, the list of graphics placed on this project, and the
// auto-generated settings for whichever one is selected. All three are derived from the registry,
// so a new template file appears here with no edits to this file.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Eye, EyeOff, Plus, Trash2, Search, Play, Pause, Sparkles } from 'lucide-react';
import { GRAPHIC_DRAG_MIME, graphicDurMime } from '@/lib/graphics/timelineDrag';
import type { GraphicsCategory, GraphicsInstance, GraphicsTemplate, ParamValue } from '@/types/graphics';
import { useImportedTemplates } from '@/lib/graphics/useImportedTemplates';
import {
  GRAPHICS_TEMPLATES, GRAPHICS_CATEGORIES, graphicsByCategory, getGraphicsTemplate, defaultParams,
  resolveParams, elementStyler, aspectPresetsFor,
} from '@/lib/graphics/registry';
import { withSampleImages } from '@/lib/graphics/sampleImages';
import { CINEMA_CAMERAS, CINEMA_GRADES, CINEMA_LOOKS, cinemaOf } from '@/lib/graphics/cinema';
import Tooltip from '@/components/ui/Tooltip';
import GraphicsParamsPanel from './GraphicsParamsPanel';
import { Section, NumField } from './controls';
import { usePickerClock, useOnScreen, usePrefersReducedMotion, LOOP_HOLD_MS } from './pickerShared';
import { SelectRow, SliderRow, ToggleRow } from './controls';

const GFX_PREVIEWS_KEY = 'captik_gfx_previews';

/** Thumbnail viewport. The panel is 248px wide with px-3, so two of these plus the gap fill it
 *  exactly. Every template is fit-scaled into this same box regardless of its design aspect, which
 *  is what lets a 900x1325 story stack and a 820x850 photo deck sit in one tidy grid. */
const THUMB_W = 104;
const THUMB_H = 138;

function TemplateCard({
  tpl, clockMs, live, onScreen, onAdd, register,
}: {
  tpl: GraphicsTemplate;
  clockMs: number;
  live: boolean;
  /** Rendering a template is real work; with 1600+ in the library, mounting every card's preview
   *  at once locks the tab. Off-screen cards draw an empty tile until they scroll in. */
  onScreen: boolean;
  onAdd: () => void;
  register: (n: HTMLElement | null) => void;
}) {
  // Fit-to-box, never crop: the whole graphic is the point of the thumbnail.
  const scale = Math.min(THUMB_W / tpl.design.w, THUMB_H / tpl.design.h);
  // Sample photos fill the card's empty image slots so the preview SELLS the photo capability;
  // a placed instance still starts empty (the drawn placeholder prompts the user's own photo).
  const params = useMemo(() => withSampleImages(tpl, defaultParams(tpl)), [tpl]);
  const el = useMemo(() => elementStyler(tpl, params), [tpl, params]);

  // Each card loops on ITS OWN duration, so a 3s template is not stuck waiting on a 10s one.
  // Frozen at 55% when not animating — past the entrance, before any exit.
  const cycle = tpl.defaultDurationMs + LOOP_HOLD_MS;
  const timeMs = live
    ? Math.min(clockMs % cycle, tpl.defaultDurationMs)
    : tpl.defaultDurationMs * 0.55;

  return (
    <button
      ref={register}
      data-tpl={tpl.id}
      onClick={onAdd}
      draggable
      onDragStart={(e) => {
        // The timeline reads BOTH: the id to place, and the duration so it can show how much room
        // the clip will take before it is dropped.
        e.dataTransfer.setData(GRAPHIC_DRAG_MIME, tpl.id);
        e.dataTransfer.setData(graphicDurMime(tpl.defaultDurationMs), '');
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={`Add ${tpl.name} — click to drop at the playhead, or drag onto the timeline`}
      className="group relative rounded-lg overflow-hidden bg-[#0d0d10] border border-white/[0.07] hover:border-amber-400/50 transition-colors cursor-grab active:cursor-grabbing text-left"
      style={{ width: THUMB_W }}
    >
      <div className="relative overflow-hidden" style={{ width: THUMB_W, height: THUMB_H }}>
        <div
          style={{
            position: 'absolute',
            left: (THUMB_W - tpl.design.w * scale) / 2,
            top: (THUMB_H - tpl.design.h * scale) / 2,
            width: tpl.design.w, height: tpl.design.h,
            transform: `scale(${scale})`, transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        >
          {onScreen && tpl.render({
            params, el, timeMs,
            durationMs: tpl.defaultDurationMs,
            width: tpl.design.w, height: tpl.design.h,
            seed: `card_${tpl.id}`,
          })}
        </div>
      </div>
      <div className="flex items-center gap-1 px-1.5 py-1 border-t border-white/[0.06]">
        <span className="text-[10px] font-semibold text-zinc-300 truncate">{tpl.name}</span>
        {tpl.badge && (
          <span className="text-[8px] font-bold uppercase tracking-wider text-amber-300 bg-amber-400/15 border border-amber-400/25 rounded px-1 shrink-0">
            {tpl.badge}
          </span>
        )}
        <Plus className="w-3 h-3 text-zinc-600 group-hover:text-amber-300 ml-auto shrink-0" />
      </div>
    </button>
  );
}

/** The browser: one category at a time, chosen by the chip row, rather than every category
 *  stacked into one endless scroll. With 139 templates the stacked version means scrolling past
 *  four categories to reach the fifth. A search box cuts across the categories — with this many
 *  templates, "notification" should be one keystroke away, not a chip-hunt. */
function Picker({ onAdd }: { onAdd: (id: string) => void }) {
  const [cat, setCat] = useState<GraphicsCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [animate, setAnimate] = useState(() => {
    try { return localStorage.getItem(GFX_PREVIEWS_KEY) !== 'off'; } catch { return true; }
  });
  const reducedMotion = usePrefersReducedMotion();
  const { visible, register } = useOnScreen();
  // Gate the clock on visible.size too: with the section collapsed or scrolled away there is
  // nothing to animate, and without the gate all 139 cards re-render at 24fps for nothing
  // (the React Compiler is NOT enabled in this app — every tick re-invokes every tpl.render).
  const playing = animate && !reducedMotion;
  const clockMs = usePickerClock(playing && visible.size > 0);

  // The picker is the one surface that genuinely wants ALL of it, so opening this tab is what
  // pays for the imported chunk. Until it lands the grid shows the authored set and the counts
  // read low — which is why the header says so rather than quietly under-reporting the library.
  const importsReady = useImportedTemplates(true);

  const sections = graphicsByCategory();
  const counts = new Map(sections.map((s) => [s.key, s.templates.length]));
  const catLabel = new Map(GRAPHICS_CATEGORIES.map((c) => [c.key, c.label]));
  const q = query.trim().toLowerCase();
  const shown = (cat === 'all'
    ? GRAPHICS_TEMPLATES
    : GRAPHICS_TEMPLATES.filter((t) => t.category === cat)
  ).filter((t) => !q
    || t.name.toLowerCase().includes(q)
    || t.id.includes(q)
    || (catLabel.get(t.category) ?? '').toLowerCase().includes(q)
    || t.tags?.some((tag) => tag.toLowerCase().includes(q)));

  const chips: { key: GraphicsCategory | 'all'; label: string; n: number }[] = [
    { key: 'all', label: importsReady ? 'All' : 'All (loading…)', n: GRAPHICS_TEMPLATES.length },
    ...GRAPHICS_CATEGORIES
      .filter((c) => (counts.get(c.key) ?? 0) > 0)
      .map((c) => ({ key: c.key as GraphicsCategory | 'all', label: c.label, n: counts.get(c.key) ?? 0 })),
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <div className="flex-1 flex items-center bg-white/[0.04] rounded-xl border border-white/[0.07] px-2.5 min-w-0">
          <Search className="w-3 h-3 text-zinc-600 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a graphic..."
            className="flex-1 bg-transparent text-[11px] text-white placeholder:text-zinc-600 py-2 px-2 outline-none min-w-0"
          />
        </div>
        {!reducedMotion && (
          <Tooltip label={animate ? 'Pause the live previews' : 'Play the live previews'}>
            <button
              onClick={() => setAnimate((prev) => {
                try { localStorage.setItem(GFX_PREVIEWS_KEY, prev ? 'off' : 'on'); } catch { /* private mode */ }
                return !prev;
              })}
              aria-label={animate ? 'Pause graphic previews' : 'Play graphic previews'}
              className={`p-2 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                animate
                  ? 'border-white/[0.08] text-zinc-400 hover:bg-white/[0.05] hover:text-white'
                  : 'border-amber-400/40 bg-amber-500/15 text-amber-300'
              }`}
            >
              {animate ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </button>
          </Tooltip>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            className={`text-[10px] font-semibold rounded-full px-2 py-1 border cursor-pointer transition-colors ${
              cat === c.key
                ? 'bg-amber-400/15 border-amber-400/40 text-amber-200'
                : 'bg-white/[0.03] border-white/[0.07] text-zinc-400 hover:text-zinc-200 hover:border-white/[0.16]'
            }`}
          >
            {c.label}
            <span className="ml-1 text-zinc-600">{c.n}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-8 px-3">
          <p className="text-[11.5px] text-zinc-500 font-medium">Nothing matches “{query.trim()}”</p>
          <p className="text-[10.5px] text-zinc-600 mt-1">Try a shorter word, or clear the search to browse all {GRAPHICS_TEMPLATES.length}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,104px)] justify-center gap-2">
          {shown.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              clockMs={clockMs}
              live={playing && visible.has(tpl.id)}
              onScreen={visible.has(tpl.id)}
              register={register}
              onAdd={() => onAdd(tpl.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GraphicsTab({
  graphics, selectedId, onSelect, onAdd, onPatch, onParam, onResetParam, onRemove, onDuplicate,
  canvasAspect,
}: {
  graphics: GraphicsInstance[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (templateId: string) => void;
  onPatch: (id: string, patch: Partial<GraphicsInstance>, undoable?: boolean) => void;
  onParam: (id: string, key: string, v: ParamValue) => void;
  onResetParam: (id: string, key: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  /** Video canvas W/H — lets the Aspect control re-fit the graphic to the frame on change. */
  canvasAspect?: number;
}) {
  const [browsing, setBrowsing] = useState(true);
  const selected = graphics.find((g) => g.id === selectedId) ?? null;
  const selectedTpl = selected ? getGraphicsTemplate(selected.templateId) : undefined;

  // Selecting a graphic injects Timing + a params panel ABOVE the picker, shoving the grid the
  // user was browsing down by hundreds of px. Follow the content: bring the top of the tab into
  // view so the selection's settings are what the user is looking at.
  const topRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedId]);

  return (
    <div ref={topRef} className="px-3 pb-6 scroll-mt-2">
      {/* ── Empty state — the picker is below, say so ────────────── */}
      {graphics.length === 0 && (
        <div className="mt-3 mb-1 px-3 py-3 rounded-xl bg-white/[0.02] border border-dashed border-white/[0.09] flex items-start gap-2.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-300/80 shrink-0 mt-[1px]" />
          <p className="text-[10.5px] text-zinc-500 leading-relaxed">
            Nothing on this video yet. <span className="text-zinc-400">Click a card below</span> to drop
            it at the playhead, or <span className="text-zinc-400">drag it onto the timeline</span>.
          </p>
        </div>
      )}

      {/* ── Placed graphics ─────────────────────────────────────── */}
      {graphics.length > 0 && (
        <Section label={`On this video (${graphics.length})`}>
          <div className="flex flex-col gap-1">
            {graphics.map((g) => {
              const tpl = getGraphicsTemplate(g.templateId);
              const active = g.id === selectedId;
              return (
                <div
                  key={g.id}
                  onClick={() => onSelect(active ? null : g.id)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                    active ? 'bg-amber-400/10 border-amber-400/30' : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.14]'
                  }`}
                >
                  <span className={`text-[11px] truncate flex-1 ${active ? 'text-amber-200' : 'text-zinc-300'}`}>
                    {tpl?.name ?? 'Unavailable template'}
                  </span>
                  <span className="text-[10px] text-zinc-600 font-mono shrink-0">{(g.startMs / 1000).toFixed(1)}s</span>
                  <Tooltip label={g.hidden ? 'Show' : 'Hide in preview'}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onPatch(g.id, { hidden: !g.hidden }, true); }}
                      className="w-5 h-5 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-200 cursor-pointer shrink-0"
                    >
                      {g.hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </Tooltip>
                  <Tooltip label="Duplicate">
                    <button
                      onClick={(e) => { e.stopPropagation(); onDuplicate(g.id); }}
                      className="w-5 h-5 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-200 cursor-pointer shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </Tooltip>
                  <Tooltip label="Remove">
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemove(g.id); }}
                      className="w-5 h-5 flex items-center justify-center rounded text-zinc-600 hover:text-red-400 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Selected graphic: timing + its generated settings ───── */}
      {selected && selectedTpl && (
        <>
          <Section label="Timing">
            <div className="flex items-center gap-2">
              <NumField
                label="Start" unit="s" step={0.1} min={0}
                value={Number((selected.startMs / 1000).toFixed(2))}
                onChange={(v) => onPatch(selected.id, { startMs: Math.max(0, Math.round(v * 1000)) }, true)}
              />
              <NumField
                label="Length" unit="s" step={0.1} min={0.3} max={60}
                value={Number((selected.durationMs / 1000).toFixed(2))}
                onChange={(v) => onPatch(selected.id, { durationMs: Math.max(300, Math.round(v * 1000)) }, true)}
              />
            </div>
          </Section>

          <Section label="Arrange">
            <div className="flex flex-col gap-2.5">
              {/* Aspect: the template RE-LAYS OUT for the chosen shape (render() gets the
                  reshaped canvas — never a stretch). Only presets within the band of the
                  design aspect are offered; a strap can't become a square. */}
              {(() => {
                const presets = aspectPresetsFor(selectedTpl);
                if (!presets.length) return null;
                const cur = selected.aspect;
                const match = cur ? presets.find((pr) => Math.abs(pr.value - cur) < 0.001) : undefined;
                return (
                  <div data-aspect-row>
                    <SelectRow
                      label="Aspect"
                      value={match ? String(match.value) : ''}
                      options={[
                        { value: '', label: 'Original' },
                        ...presets.map((pr) => ({ value: String(pr.value), label: pr.label })),
                      ]}
                      onChange={(v) => {
                        const aspect = v ? Number(v) : undefined;
                        const patch: Partial<GraphicsInstance> = { aspect };
                        // Re-fit to the frame: the new shape may overflow at the current width,
                        // and the old centre may leave it half off-screen. Same 82%-of-frame
                        // rule as initial placement.
                        if (canvasAspect && canvasAspect > 0) {
                          const a = aspect ?? selectedTpl.design.w / selectedTpl.design.h;
                          const box = { ...selected.box };
                          box.widthPercent = Math.max(5, Math.min(box.widthPercent, Math.round((82 * a) / canvasAspect)));
                          const hPct = (box.widthPercent * canvasAspect) / a;
                          if (hPct < 100) {
                            box.yPercent = Math.min(100 - hPct / 2, Math.max(hPct / 2, box.yPercent));
                          }
                          patch.box = box;
                        }
                        onPatch(selected.id, patch, true);
                      }}
                    />
                  </div>
                );
              })()}
              {/* A fullBleed graphic IS the frame: no plate to toggle, nothing to rotate. */}
              {!selectedTpl.fullBleed && (
                <ToggleRow
                  label="Background"
                  on={selected.backdrop ?? selectedTpl.backdrop !== false}
                  onChange={(v) => onPatch(selected.id, { backdrop: v }, true)}
                />
              )}
              {selectedTpl.sfx && (
                <ToggleRow
                  label="Sound effects"
                  on={!selected.sfxOff}
                  onChange={(v) => onPatch(selected.id, { sfxOff: v ? undefined : true }, true)}
                />
              )}
              <SliderRow
                label="Opacity" min={0.1} max={1} step={0.05}
                value={selected.opacity ?? 1}
                display={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onPatch(selected.id, { opacity: v >= 1 ? undefined : v })}
              />
              {!selectedTpl.fullBleed && (
                <SliderRow
                  label="Rotation" min={-45} max={45} step={1}
                  value={selected.rotationDeg ?? 0}
                  display={(v) => `${v}°`}
                  onChange={(v) => onPatch(selected.id, { rotationDeg: v === 0 ? undefined : v })}
                />
              )}
            </div>
          </Section>

          {/* ── Cinema: the scene-finishing stack (lib/graphics/cinema.ts). Applied by the ONE
              renderer, so what you set here is what exports. ─────────────────────────────── */}
          <Section label="Cinema">
            {(() => {
              const cine = cinemaOf(selected.cinema);
              const set = (patch: Partial<typeof cine>, undoable?: boolean) =>
                onPatch(selected.id, { cinema: { ...selected.cinema, ...patch } }, undoable);
              return (
                <div className="flex flex-col gap-2.5">
                  {/* One-click looks first: the finished result, not eight sliders to assemble. */}
                  <div className="flex flex-wrap gap-1">
                    {CINEMA_LOOKS.map((lk) => (
                      <button
                        key={lk.value}
                        title={lk.hint}
                        onClick={() => onPatch(selected.id, { cinema: { ...lk.settings } }, true)}
                        className="text-[10px] font-semibold rounded-full px-2 py-1 border cursor-pointer transition-colors bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:text-amber-200 hover:border-amber-400/40"
                      >
                        {lk.label}
                      </button>
                    ))}
                  </div>
                  <SelectRow
                    label="Grade"
                    value={cine.grade}
                    options={CINEMA_GRADES.map((g) => ({ value: g.value, label: g.label }))}
                    onChange={(v) => set({ grade: v }, true)}
                  />
                  <SliderRow
                    label="Bloom" min={0} max={1} step={0.05} value={cine.bloom}
                    display={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => set({ bloom: v })}
                  />
                  <SliderRow
                    label="Colour split" min={0} max={1} step={0.05} value={cine.split}
                    display={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => set({ split: v })}
                  />
                  <SliderRow
                    label="Film grain" min={0} max={1} step={0.05} value={cine.grain}
                    display={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => set({ grain: v })}
                  />
                  <SliderRow
                    label="Vignette" min={0} max={1} step={0.05} value={cine.vignette}
                    display={(v) => (v <= 0 ? 'Off' : `${Math.round(v * 100)}%`)}
                    onChange={(v) => set({ vignette: v })}
                  />
                  <SliderRow
                    label="Defocus" min={0} max={1} step={0.05} value={cine.focus}
                    display={(v) => (v <= 0 ? 'Sharp' : `${Math.round(v * 100)}%`)}
                    onChange={(v) => set({ focus: v })}
                  />
                  {/* Raylight's signature: lean a flat thing back into the frame by exact angle. */}
                  <SliderRow
                    label="Tilt X" min={-34} max={34} step={1} value={cine.tiltX}
                    display={(v) => `${v}°`}
                    onChange={(v) => set({ tiltX: v })}
                  />
                  <SliderRow
                    label="Tilt Y" min={-34} max={34} step={1} value={cine.tiltY}
                    display={(v) => `${v}°`}
                    onChange={(v) => set({ tiltY: v })}
                  />
                  <SelectRow
                    label="Camera"
                    value={cine.camera}
                    options={CINEMA_CAMERAS.map((c) => ({ value: c.value, label: c.label }))}
                    onChange={(v) => set({ camera: v }, true)}
                  />
                  {cine.camera !== 'none' && (
                    <SliderRow
                      label="Move amount" min={0.1} max={1.5} step={0.05} value={cine.camAmt}
                      display={(v) => `${v.toFixed(2)}x`}
                      onChange={(v) => set({ camAmt: v })}
                    />
                  )}
                </div>
              );
            })()}
          </Section>

          <GraphicsParamsPanel
            template={selectedTpl}
            values={resolveParams(selectedTpl, selected.params)}
            overrides={selected.params}
            onChange={(k, v) => onParam(selected.id, k, v)}
            onReset={(k) => onResetParam(selected.id, k)}
          />
        </>
      )}

      {/* ── Picker (controlled: adding a graphic keeps it open) ──── */}
      <Section
        label={`Add a graphic (${GRAPHICS_TEMPLATES.length})`}
        open={browsing}
        onOpenChange={setBrowsing}
      >
        <Picker onAdd={(id) => { onAdd(id); setBrowsing(true); }} />
      </Section>
    </div>
  );
}
