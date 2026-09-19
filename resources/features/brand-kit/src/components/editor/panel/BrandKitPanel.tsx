'use client';

// Right panel → Templates → "Brand Kit". A creator keeps their identity here — up to four colours, a
// font and a logo — and applies it to the open project in one click. Kits are local (IndexedDB, see
// brandKitStore.ts) and shared across projects; HOW a kit lands on a template lives in lib/brandKit.ts.

import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import type { CaptionStyleId } from '@/remotion/KineticCaptionComposition';
import { CAPTION_STYLES } from '@/lib/captionStyles';
import {
  BRAND_COLOR_ROLES, BRAND_COLOR_ROLE_LABELS, TEMPLATE_FIXED_COLOUR_NOTES,
  brandLogoMime, createBrandKit, normalizeHex, rolesUsedByTemplate, svgIntrinsicSize, validateBrandLogoFile,
  type AppliedBrandKit, type BrandColorRole, type BrandKit, type BrandKitNote,
} from '@/lib/brandKit';
import {
  BRAND_LOGO_OPACITY, BRAND_LOGO_POSITIONS, BRAND_LOGO_SIZE, sanitizeBrandLogo, type BrandLogoPosition,
} from '@/lib/brandLogo';
import { BrandLogoOverlay } from '@/remotion/BrandLogoOverlay';
import { deleteBrandKit, listBrandKits, saveBrandKit } from '@/lib/brandKitStore';
import FontsPanel from '../FontsPanel';
import { ColorField, ResetBtn, SliderRow } from './controls';
import Tooltip from '@/components/ui/Tooltip';

/** What the editor page hands down: the applied kit plus the two actions on the project. */
export interface BrandKitControls {
  applied: AppliedBrandKit | null;
  onApply: (kit: BrandKit) => void;
  onRemove: () => void;
}

export interface BrandKitPanelProps extends BrandKitControls {
  captionStyle: CaptionStyleId;
}

const POSITION_LABELS: Record<BrandLogoPosition, string> = {
  'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right',
};

function noteText(note: BrandKitNote, templateName: string): string {
  switch (note.kind) {
    case 'font-locked':    return `${templateName} is drawn in its own typeface, so the kit font isn't applied here.`;
    case 'fixed-colours':  return note.text;
    case 'legibility':     return `Kept ${templateName}'s own ${note.label.toLowerCase()} colour so the caption stays readable.`;
  }
}

/** Register an uploaded face so kit cards (and the preview) can show it by name. */
function registerKitFont(kit: BrandKit) {
  const f = kit.font;
  if (!f?.data || typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  if ([...document.fonts].some(ff => ff.family === f.name && ff.status === 'loaded')) return;
  try {
    const face = new FontFace(f.name, f.data.slice().buffer as ArrayBuffer);
    face.load().then(loaded => document.fonts.add(loaded)).catch(() => {});
  } catch { /* non-fatal — the card just shows a fallback face */ }
}

const readDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result ?? ''));
  fr.onerror = () => reject(new Error('Could not read that file.'));
  fr.readAsDataURL(file);
});

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('That image could not be decoded.'));
  img.src = src;
});

/**
 * Turn an uploaded file into what a kit stores: an inline data URL plus its aspect ratio.
 *
 * SVG is converted to PNG. The in-browser exporter rasterises an <img> through its own
 * html-in-canvas path, and vector sources are exactly where that differs from the browser's
 * compositor — a PNG is drawn identically by the preview, Lambda's Chromium and the web renderer.
 * The SVG's intrinsic size is read from its own markup (Chrome reports a placeholder size for an
 * SVG with only a viewBox), so the rasterised logo keeps its true proportions.
 */
async function prepareLogo(file: File): Promise<{ dataUrl: string; aspect: number }> {
  const mime = brandLogoMime(file) ?? 'image/png';
  const raw = await readDataUrl(file);
  const isSvg = mime === 'image/svg+xml';
  let src = raw.startsWith(`data:${mime}`) ? raw : raw.replace(/^data:[^;,]*/, `data:${mime}`);

  if (!isSvg) {
    const img = await loadImage(src);
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('That image could not be decoded.');
    return { dataUrl: src, aspect: img.naturalWidth / img.naturalHeight };
  }

  const text = await file.text();
  const size = svgIntrinsicSize(text) ?? { w: 1024, h: 1024 };
  // Give the SVG explicit pixel dimensions so the canvas rasterises it at full size, not at the
  // browser's 300x150 placeholder.
  const sized = /\swidth\s*=/.test(text) && /\sheight\s*=/.test(text)
    ? text
    : text.replace(/<svg\b/i, `<svg width="${size.w}" height="${size.h}"`);
  src = `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(sized)))}`;
  const img = await loadImage(src);

  for (const longEdge of [1024, 512]) {
    const scale = Math.min(1, longEdge / Math.max(size.w, size.h));
    const cw = Math.max(1, Math.round(size.w * scale));
    const ch = Math.max(1, Math.round(size.h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(img, 0, 0, cw, ch);
    try {
      const png = canvas.toDataURL('image/png');
      if (sanitizeBrandLogo({ src: png, aspect: cw / ch })) return { dataUrl: png, aspect: cw / ch };
    } catch { break; }   // a tainted canvas (exotic SVG) — fall back to the SVG itself
  }
  if (sanitizeBrandLogo({ src, aspect: size.w / size.h })) return { dataUrl: src, aspect: size.w / size.h };
  throw new Error('That logo is too large to use — try a simpler or smaller file.');
}

export default function BrandKitPanel(p: BrandKitPanelProps) {
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [draft, setDraft] = useState<BrandKit | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    listBrandKits().then(list => {
      if (!alive) return;
      list.forEach(registerKitFont);
      setKits(list);
    });
    return () => { alive = false; };
  }, []);

  const templateName = CAPTION_STYLES.find(s => s.id === p.captionStyle)?.name ?? p.captionStyle;
  const uses = rolesUsedByTemplate(p.captionStyle);
  const appliedNotes = p.applied?.notes ?? [];
  const fixedNote = TEMPLATE_FIXED_COLOUR_NOTES[p.captionStyle];

  const handleSave = async (kit: BrandKit) => {
    const saved = await saveBrandKit(kit);
    if (!saved) { setError('Couldn’t save the kit on this device — storage is full or blocked.'); return; }
    registerKitFont(saved);
    setKits(prev => [saved, ...prev.filter(k => k.id !== saved.id)]);
    setDraft(null);
    setError('');
    // Editing the kit that's on the project keeps the project in step with it.
    if (p.applied?.kit.id === saved.id) p.onApply(saved);
  };

  const handleDelete = async (kit: BrandKit) => {
    await deleteBrandKit(kit.id);
    setKits(prev => prev.filter(k => k.id !== kit.id));
    // The project keeps its own copy of an applied kit, so deleting from the library leaves it alone.
  };

  if (draft) {
    return <BrandKitEditor draft={draft} onChange={setDraft} onSave={handleSave} onCancel={() => { setDraft(null); setError(''); }} error={error} />;
  }

  return (
    <div className="space-y-2">
      {p.applied && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] px-3 py-2.5 space-y-1.5" data-testid="brandkit-applied">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-emerald-200 truncate">
              <Check className="w-3 h-3 inline-block mr-1 -mt-0.5" />{p.applied.kit.name} applied
            </p>
            <Tooltip label="Put back the colours, font and logo this project had before the kit">
              <button onClick={p.onRemove}
                className="text-[10.5px] font-semibold text-zinc-300 hover:text-white underline underline-offset-2 cursor-pointer shrink-0">
                Remove kit
              </button>
            </Tooltip>
          </div>
          <p className="text-[10px] text-zinc-400">
            {uses.length
              ? <>{templateName} uses {uses.map(r => BRAND_COLOR_ROLE_LABELS[r].toLowerCase()).join(' · ')}</>
              : <>{templateName} keeps its own colours</>}
          </p>
          {appliedNotes.map((n, i) => (
            <p key={i} className="text-[10.5px] text-zinc-400 leading-relaxed">{noteText(n, templateName)}</p>
          ))}
        </div>
      )}

      {!p.applied && fixedNote && (
        <p className="text-[10.5px] text-zinc-500 leading-relaxed px-1 pt-1">{fixedNote}</p>
      )}

      <button
        onClick={() => { setDraft(createBrandKit({ name: `Brand kit ${kits.length + 1}` })); setError(''); }}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-white/[0.14] text-[10.5px] font-semibold text-zinc-300 hover:text-white hover:border-white/[0.28] transition-colors cursor-pointer"
      >
        <Plus className="w-3 h-3" /> New brand kit
      </button>

      {error && <p className="text-[10.5px] text-red-300 px-1">{error}</p>}

      {kits.length === 0 ? (
        <div className="text-center py-8 px-4">
          <p className="text-[12px] text-zinc-500 font-medium">No brand kits yet</p>
          <p className="text-[10.5px] text-zinc-600 mt-1.5 leading-relaxed">
            Save your colours, font and logo once — then apply them to any project in a click.
          </p>
        </div>
      ) : kits.map(kit => {
        const isApplied = p.applied?.kit.id === kit.id;
        const logo = kit.logo && sanitizeBrandLogo({ src: kit.logo.dataUrl, aspect: kit.logo.aspect, position: kit.logo.position, sizePct: kit.logo.sizePct, opacity: kit.logo.opacity });
        return (
          <div key={kit.id} className={`rounded-xl border overflow-hidden transition-colors ${
            isApplied
              ? 'border-amber-400/70 shadow-[0_0_0_1px_rgba(245,158,11,0.3),0_0_20px_rgba(245,158,11,0.14)]'
              : 'border-white/[0.07] hover:border-white/[0.18]'}`}>
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-black/[0.25]">
              <span className="text-[11px] font-semibold text-zinc-200 truncate">{kit.name}</span>
              {isApplied && <span className="text-[9px] font-bold text-emerald-300 shrink-0">APPLIED</span>}
            </div>
            <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ background: 'linear-gradient(160deg,#0f0f16 0%,#09090f 100%)' }}>
              <div className="flex gap-1 shrink-0">
                {BRAND_COLOR_ROLES.filter(r => kit.colors[r]).map(r => (
                  <Tooltip key={r} label={`${BRAND_COLOR_ROLE_LABELS[r]} ${kit.colors[r]}`}>
                    <span className="block w-4 h-4 rounded-full border border-white/20" style={{ background: kit.colors[r] }} />
                  </Tooltip>
                ))}
                {BRAND_COLOR_ROLES.every(r => !kit.colors[r]) && <span className="text-[10px] text-zinc-600">No colours</span>}
              </div>
              <span className="flex-1 min-w-0 text-[12px] text-zinc-300 truncate"
                style={kit.font ? { fontFamily: `'${kit.font.name}', sans-serif` } : undefined}>
                {kit.font?.name ?? 'Template font'}
              </span>
              <div className="relative rounded-md overflow-hidden border border-white/[0.08] bg-[#0b0b0f] shrink-0" style={{ width: 27, height: 48 }}>
                {logo && <BrandLogoOverlay logo={logo} frameWidth={27} frameHeight={48} />}
              </div>
            </div>
            <div className="flex items-center gap-1 px-2 py-1.5 bg-black/[0.18] border-t border-white/[0.05]">
              <Tooltip label={`Apply this kit to ${templateName}`} className="flex-1">
                <button onClick={() => p.onApply(kit)}
                  className="w-full py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-[10.5px] font-bold text-amber-300 hover:bg-amber-500/30 transition-colors cursor-pointer">
                  {isApplied ? 'Re-apply' : 'Apply kit'}
                </button>
              </Tooltip>
              <Tooltip label="Edit this kit">
                <button onClick={() => { setDraft(kit); setError(''); }} aria-label="Edit kit"
                  className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer">
                  <Pencil className="w-3 h-3" />
                </button>
              </Tooltip>
              <Tooltip label="Delete this kit">
                <button onClick={() => handleDelete(kit)} aria-label="Delete kit"
                  className="p-1.5 rounded text-zinc-600 hover:text-red-400 transition-colors cursor-pointer">
                  <Trash2 className="w-3 h-3" />
                </button>
              </Tooltip>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────

function BrandKitEditor({ draft, onChange, onSave, onCancel, error }: {
  draft: BrandKit;
  onChange: (k: BrandKit) => void;
  onSave: (k: BrandKit) => void;
  onCancel: () => void;
  error: string;
}) {
  const [fontOpen, setFontOpen] = useState(false);
  const [logoErr, setLogoErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setColor = (role: BrandColorRole, hex: string | null) => {
    const colors = { ...draft.colors };
    const clean = hex && normalizeHex(hex);
    if (clean) colors[role] = clean; else delete colors[role];
    onChange({ ...draft, colors });
  };
  const patchLogo = (patch: Partial<NonNullable<BrandKit['logo']>>) => {
    if (!draft.logo) return;
    onChange({ ...draft, logo: { ...draft.logo, ...patch } });
  };

  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const invalid = validateBrandLogoFile(file);
    if (invalid) { setLogoErr(invalid); return; }
    setBusy(true);
    setLogoErr('');
    try {
      const { dataUrl, aspect } = await prepareLogo(file);
      onChange({
        ...draft,
        logo: {
          dataUrl, aspect, fileName: file.name,
          position: draft.logo?.position ?? 'top-right',
          sizePct: draft.logo?.sizePct ?? BRAND_LOGO_SIZE.default,
          opacity: draft.logo?.opacity ?? BRAND_LOGO_OPACITY.default,
        },
      });
    } catch (err) {
      setLogoErr(err instanceof Error ? err.message : 'Could not read that image.');
    } finally {
      setBusy(false);
    }
  };

  const previewLogo = draft.logo && sanitizeBrandLogo({
    src: draft.logo.dataUrl, aspect: draft.logo.aspect, position: draft.logo.position,
    sizePct: draft.logo.sizePct, opacity: draft.logo.opacity,
  });

  return (
    <div className="space-y-3">
      <input
        value={draft.name}
        onChange={e => onChange({ ...draft, name: e.target.value.slice(0, 60) })}
        placeholder="Kit name"
        aria-label="Kit name"
        className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl text-[11px] text-white placeholder:text-zinc-600 py-2 px-3 outline-none focus:border-amber-400/40"
      />

      <div className="space-y-2">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Colours</span>
        {BRAND_COLOR_ROLES.map(role => (
          draft.colors[role] ? (
            <ColorField
              key={role} compact label={BRAND_COLOR_ROLE_LABELS[role]} hex={draft.colors[role]!}
              onHex={h => setColor(role, h)}
              onReset={() => setColor(role, null)} showReset
            />
          ) : (
            <button key={role} onClick={() => setColor(role, DEFAULT_ROLE_COLOR[role])}
              className="w-full flex items-center gap-2 py-1.5 px-2 rounded-xl border border-dashed border-white/[0.12] text-[10.5px] text-zinc-500 hover:text-zinc-200 hover:border-white/[0.24] transition-colors cursor-pointer">
              <Plus className="w-3 h-3" /> Add {BRAND_COLOR_ROLE_LABELS[role].toLowerCase()} colour
            </button>
          )
        ))}
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Font</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setFontOpen(o => !o)}
            className="flex-1 min-w-0 flex items-center justify-between bg-white/[0.06] border border-white/[0.08] rounded-md px-2.5 py-1.5 cursor-pointer hover:border-white/[0.16]">
            <span className="text-[11px] text-white font-semibold truncate"
              style={draft.font ? { fontFamily: `'${draft.font.name}', sans-serif` } : undefined}>
              {draft.font?.name ?? 'Template default'}
            </span>
          </button>
          <ResetBtn show={!!draft.font} onClick={() => onChange({ ...draft, font: null })} title="Use each template's own font" />
        </div>
        {fontOpen && (
          <div className="rounded-xl border border-white/[0.08] bg-black/30 max-h-[260px] overflow-y-auto">
            <FontsPanel
              selectedFont={draft.font?.name ?? null}
              onFontSelect={sel => onChange({ ...draft, font: sel ? { name: sel.name, isCustom: sel.isCustom, data: sel.data } : null })}
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Logo</span>
        <input ref={fileRef} type="file" className="hidden" onChange={onLogoFile}
          accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" />
        <div className="flex items-start gap-2.5">
          <div className="relative rounded-lg overflow-hidden border border-white/[0.08] bg-[#0b0b0f] shrink-0" style={{ width: 54, height: 96 }}>
            {previewLogo && <BrandLogoOverlay logo={previewLogo} frameWidth={54} frameHeight={96} />}
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-white/[0.1] text-[10.5px] font-semibold text-zinc-200 hover:bg-white/[0.05] transition-colors cursor-pointer disabled:opacity-50">
              <Upload className="w-3 h-3" /> {busy ? 'Reading…' : draft.logo ? 'Replace logo' : 'Upload logo'}
            </button>
            {draft.logo && (
              <button onClick={() => onChange({ ...draft, logo: null })}
                className="w-full py-1.5 rounded-lg text-[10.5px] text-zinc-500 hover:text-red-300 transition-colors cursor-pointer">
                Remove logo
              </button>
            )}
            <p className="text-[10px] text-zinc-600 leading-relaxed">PNG, JPG, WebP or SVG · up to 1 MB · stays on this device</p>
          </div>
        </div>
        {logoErr && <p className="text-[10.5px] text-red-300">{logoErr}</p>}

        {draft.logo && (
          <div className="space-y-2 pt-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400 w-[64px] shrink-0">Corner</span>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                {BRAND_LOGO_POSITIONS.map(pos => (
                  <Tooltip key={pos} label={POSITION_LABELS[pos]}>
                    <button
                      onClick={() => patchLogo({ position: pos })}
                      aria-label={POSITION_LABELS[pos]}
                      aria-pressed={draft.logo!.position === pos}
                      className={`w-6 h-6 rounded-md flex p-1 transition-colors cursor-pointer ${
                        draft.logo!.position === pos ? 'bg-amber-500/25 border border-amber-400/40' : 'border border-transparent hover:bg-white/[0.06]'
                      } ${pos.endsWith('right') ? 'justify-end' : 'justify-start'} ${pos.startsWith('bottom') ? 'items-end' : 'items-start'}`}
                    >
                      <span className={`block w-2 h-2 rounded-[2px] ${draft.logo!.position === pos ? 'bg-amber-300' : 'bg-zinc-600'}`} />
                    </button>
                  </Tooltip>
                ))}
              </div>
            </div>
            <SliderRow
              label="Size" value={Math.round(draft.logo.sizePct)} min={BRAND_LOGO_SIZE.min} max={BRAND_LOGO_SIZE.max} step={1}
              onChange={v => patchLogo({ sizePct: v })} display={v => `${v}%`} defaultValue={BRAND_LOGO_SIZE.default}
            />
            <SliderRow
              label="Opacity" value={Math.round(draft.logo.opacity * 100)} min={10} max={100} step={5}
              onChange={v => patchLogo({ opacity: v / 100 })} display={v => `${v}%`}
              defaultValue={Math.round(BRAND_LOGO_OPACITY.default * 100)}
            />
          </div>
        )}
      </div>

      {error && <p className="text-[10.5px] text-red-300">{error}</p>}

      <div className="flex items-center gap-1.5 pt-1">
        <button onClick={() => onSave({ ...draft, name: draft.name.trim() || 'My brand kit' })}
          className="flex-1 py-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-[10.5px] font-bold text-amber-300 hover:bg-amber-500/30 transition-colors cursor-pointer">
          Save kit
        </button>
        <button onClick={onCancel}
          className="px-3 py-2 rounded-xl text-[10.5px] font-semibold text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Sensible starting swatches so a new row opens on something visible, not black. */
const DEFAULT_ROLE_COLOR: Record<BrandColorRole, string> = {
  text: '#ffffff',
  highlight: '#ff5a1f',
  secondary: '#7c3aed',
  box: '#14213d',
};
