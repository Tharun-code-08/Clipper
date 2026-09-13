'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Trash2, Check, Type, Search, Loader2, Lock } from 'lucide-react';
import { saveFont, getFont, listFonts, deleteFont, type StoredFont } from '@/lib/fontStore';
import { useCustomFonts, type CustomFont } from '@/hooks/useCustomFonts';
import Tooltip from '@/components/ui/Tooltip';
import { useCredits } from '@/hooks/useCredits';
import { getFontLimit } from '@/lib/tiers';

// ── Built-in fonts (shipped in public/fonts) ──────────────────────────────────
// `name` MUST match the @font-face family registered in globals.css (preview) and
// buildFontsCss() (Lambda export) so the override resolves to a loaded font.
// file = the bundled TTF under public/fonts — selecting a built-in fetches its bytes so the
// export embeds a data-URL @font-face like Google/custom fonts (URL-based @font-face is flaky
// on Lambda; see the InstrumentSerifItalic embed precedent).
const BUILTIN_FONTS: { name: string; label: string; file: string }[] = [
  { name: 'Inter',             label: 'Inter',           file: 'Inter.ttf'                        },
  { name: 'Anton',             label: 'Anton',           file: 'Anton-Regular.ttf'                },
  { name: 'Poppins',           label: 'Poppins',         file: 'Poppins-Medium.ttf'               },
  { name: 'Montserrat',        label: 'Montserrat',      file: 'Montserrat-Bold.ttf'              },
  { name: 'LuckiestGuy',       label: 'Luckiest Guy',    file: 'LuckiestGuy-Regular.ttf'          },
  { name: 'TimesNewRomanBold', label: 'Times New Roman', file: 'Times-New-Roman-Bold.ttf'         },
];

// ── Curated Google Fonts list ─────────────────────────────────────────────────
// weight = the specific weight to fetch (chosen for caption legibility)
export const GOOGLE_FONTS: { name: string; weight: number; category: 'display' | 'sans' | 'serif' | 'mono' | 'hand' }[] = [
  // Display / Impact
  { name: 'Bebas Neue',       weight: 400, category: 'display' },
  { name: 'Oswald',           weight: 700, category: 'display' },
  { name: 'Righteous',        weight: 400, category: 'display' },
  { name: 'Bungee',           weight: 400, category: 'display' },
  { name: 'Lilita One',       weight: 400, category: 'display' },
  { name: 'Russo One',        weight: 400, category: 'display' },
  { name: 'Archivo Black',    weight: 400, category: 'display' },
  { name: 'Syne',             weight: 800, category: 'display' },
  { name: 'Teko',             weight: 700, category: 'display' },
  { name: 'Audiowide',        weight: 400, category: 'display' },
  { name: 'Fredoka One',      weight: 400, category: 'display' },
  { name: 'Exo 2',            weight: 700, category: 'display' },
  // Sans-serif
  { name: 'Roboto',           weight: 700, category: 'sans'    },
  { name: 'Open Sans',        weight: 700, category: 'sans'    },
  { name: 'Lato',             weight: 700, category: 'sans'    },
  { name: 'Raleway',          weight: 800, category: 'sans'    },
  { name: 'Nunito',           weight: 800, category: 'sans'    },
  { name: 'Outfit',           weight: 700, category: 'sans'    },
  { name: 'Plus Jakarta Sans',weight: 700, category: 'sans'    },
  { name: 'DM Sans',          weight: 700, category: 'sans'    },
  { name: 'Barlow',           weight: 700, category: 'sans'    },
  { name: 'Cabin',            weight: 700, category: 'sans'    },
  { name: 'Ubuntu',           weight: 700, category: 'sans'    },
  { name: 'Figtree',          weight: 700, category: 'sans'    },
  { name: 'Mulish',           weight: 700, category: 'sans'    },
  { name: 'Chivo',            weight: 900, category: 'sans'    },
  { name: 'Source Sans 3',    weight: 700, category: 'sans'    },
  // Serif
  { name: 'Playfair Display', weight: 700, category: 'serif'   },
  { name: 'Merriweather',     weight: 700, category: 'serif'   },
  { name: 'PT Serif',         weight: 700, category: 'serif'   },
  { name: 'Libre Baskerville',weight: 700, category: 'serif'   },
  // Monospace
  { name: 'Space Mono',       weight: 700, category: 'mono'    },
  { name: 'Inconsolata',      weight: 700, category: 'mono'    },
  { name: 'Share Tech Mono',  weight: 400, category: 'mono'    },
  // Handwriting
  { name: 'Dancing Script',   weight: 700, category: 'hand'    },
  { name: 'Caveat',           weight: 700, category: 'hand'    },
  { name: 'Pacifico',         weight: 400, category: 'hand'    },
  { name: 'Permanent Marker', weight: 400, category: 'hand'    },
  { name: 'Kalam',            weight: 700, category: 'hand'    },
];

const GF_CATEGORIES: { id: string; label: string }[] = [
  { id: 'all',     label: 'All'      },
  { id: 'display', label: 'Display'  },
  { id: 'sans',    label: 'Sans'     },
  { id: 'serif',   label: 'Serif'    },
  { id: 'mono',    label: 'Mono'     },
  { id: 'hand',    label: 'Script'   },
];

export interface FontSelection {
  name: string;          // CSS / PostScript family name
  data?: Uint8Array;     // binary — present for custom + Google fonts
  isCustom: boolean;
}

interface FontsPanelProps {
  selectedFont: string | null;
  onFontSelect: (sel: FontSelection | null) => void;
}

// Build the Google Fonts CSS preview URL for ALL curated fonts in one request
function buildGoogleFontsCssUrl(): string {
  const families = GOOGLE_FONTS.map(f =>
    f.weight === 400
      ? encodeURIComponent(f.name)
      : `${encodeURIComponent(f.name)}:wght@${f.weight}`,
  ).join('|');
  return `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
}

// IDB key for a cached Google font
const gfKey = (name: string, weight: number) => `gf:${name}:${weight}`;

export default function FontsPanel({ selectedFont, onFontSelect }: FontsPanelProps) {
  const [customFonts,    setCustomFonts]    = useState<StoredFont[]>([]);
  const [uploading,      setUploading]      = useState(false);
  const [uploadErr,      setUploadErr]      = useState('');
  const [namePrompt,     setNamePrompt]     = useState<{ file: File; data: Uint8Array } | null>(null);
  const [fontName,       setFontName]       = useState('');
  const [gfSearch,       setGfSearch]       = useState('');
  const [gfCategory,     setGfCategory]     = useState('all');
  const [downloadingGf,  setDownloadingGf]  = useState<string | null>(null); // font name being downloaded
  const [gfError,        setGfError]        = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewLinkRef = useRef<HTMLLinkElement | null>(null);

  // Cloud-synced custom fonts via Supabase + IndexedDB cache
  const {
    fonts:           cloudFonts,
    loading:         cloudLoading,
    refresh:         refreshCloudFonts,
    downloadFont:    downloadCloudFont,
    deleteCustomFont: deleteCloudFont,
  } = useCustomFonts();

  // Credits / quota info
  const { credits } = useCredits();
  const plan       = credits?.plan ?? 'free';
  const fontLimit  = getFontLimit(plan);
  const isFree     = plan === 'free';

  // Load legacy IDB fonts (not cf: or gf: prefixed — pre-cloud uploads)
  useEffect(() => {
    listFonts().then(fonts => setCustomFonts(fonts.filter(f => !f.id.startsWith('gf:') && !f.id.startsWith('cf:'))));
  }, []);

  // Inject a single Google Fonts CSS link for all curated fonts (preview only)
  useEffect(() => {
    if (previewLinkRef.current) return; // already injected
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = buildGoogleFontsCssUrl();
    document.head.appendChild(link);
    previewLinkRef.current = link;
    return () => {
      if (previewLinkRef.current) {
        document.head.removeChild(previewLinkRef.current);
        previewLinkRef.current = null;
      }
    };
  }, []);

  // Filtered Google Fonts list
  const filteredGf = GOOGLE_FONTS.filter(f => {
    const matchCat = gfCategory === 'all' || f.category === gfCategory;
    const matchSearch = !gfSearch || f.name.toLowerCase().includes(gfSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleGfSelect = useCallback(async (f: typeof GOOGLE_FONTS[0]) => {
    if (selectedFont === f.name) {
      onFontSelect(null);
      return;
    }
    setGfError('');

    // Check IDB cache first
    const cached = await getFont(gfKey(f.name, f.weight));
    if (cached?.data) {
      onFontSelect({ name: f.name, data: cached.data, isCustom: false });
      return;
    }

    // Download TTF from proxy
    setDownloadingGf(f.name);
    try {
      const res = await fetch(`/api/google-font-proxy?family=${encodeURIComponent(f.name)}&weight=${f.weight}`);
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(error || `HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      const data = new Uint8Array(buf);

      const stored: StoredFont = {
        id:          gfKey(f.name, f.weight),
        name:        f.name,
        displayName: f.name,
        fileName:    `${f.name.replace(/ /g, '')}-${f.weight}.ttf`,
        data,
        storedAt:    Date.now(),
      };
      await saveFont(stored);
      onFontSelect({ name: f.name, data, isCustom: false });
    } catch (err) {
      setGfError(`Could not download "${f.name}": ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloadingGf(null);
    }
  }, [selectedFont, onFontSelect]);

  // ── File upload handlers ──────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext ?? '')) {
      setUploadErr('Only .ttf, .otf, .woff, .woff2 files are supported.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadErr('Font file must be under 5 MB.');
      return;
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const defaultName = file.name.replace(/\.(ttf|otf)$/i, '').replace(/[-_]/g, ' ');
    setFontName(defaultName);
    setNamePrompt({ file, data });
    setUploadErr('');
  };

  const confirmUpload = async () => {
    if (!namePrompt || !fontName.trim()) return;
    setUploading(true);
    setUploadErr('');
    try {
      // Upload to Supabase Storage + register in Postgres
      const fd = new FormData();
      fd.append('file',     namePrompt.file);
      fd.append('fontName', fontName.trim());
      const res = await fetch('/api/font-upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');

      // Cache in IDB using the cloud font id
      const cloudId = json.fontId ? `cf:${json.fontId}` : `local:${Date.now()}`;
      const idbFont: StoredFont = {
        id:          cloudId,
        name:        json.fontFamily ?? fontName.trim(),
        displayName: json.fontName   ?? fontName.trim(),
        fileName:    namePrompt.file.name,
        supabaseKey: json.key,
        data:        namePrompt.data,
        storedAt:    Date.now(),
      };
      await saveFont(idbFont);

      // Register with DOM so live preview works immediately
      try {
        const ff = new FontFace(idbFont.name, idbFont.data.buffer as ArrayBuffer);
        await ff.load();
        document.fonts.add(ff);
      } catch { /* non-fatal */ }

      await refreshCloudFonts();
      setCustomFonts((await listFonts()).filter(f => !f.id.startsWith('gf:') && !f.id.startsWith('cf:')));
      setNamePrompt(null);
      setFontName('');
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const font = customFonts.find(f => f.id === id);
    await deleteFont(id);
    if (font?.supabaseKey) {
      fetch(`/api/font-upload?key=${encodeURIComponent(font.supabaseKey)}`, { method: 'DELETE' }).catch(() => {});
    }
    setCustomFonts((await listFonts()).filter(f => !f.id.startsWith('gf:') && !f.id.startsWith('cf:')));
    if (selectedFont === font?.name) onFontSelect(null);
  };

  const handleCloudFontSelect = useCallback(async (cf: CustomFont) => {
    if (selectedFont === cf.fontFamily) { onFontSelect(null); return; }
    try {
      const data = await downloadCloudFont(cf);
      // Register in DOM for live preview
      try {
        const existing = [...document.fonts].find(f => f.family === cf.fontFamily);
        if (!existing || existing.status !== 'loaded') {
          const ff = new FontFace(cf.fontFamily, data.buffer as ArrayBuffer);
          await ff.load();
          document.fonts.add(ff);
        }
      } catch { /* non-fatal */ }
      onFontSelect({ name: cf.fontFamily, data, isCustom: true });
    } catch (err) {
      console.error('[FontsPanel] cloud font select', err);
    }
  }, [selectedFont, onFontSelect, downloadCloudFont]);

  const selectBuiltin = async (f: { name: string; file: string }) => {
    if (selectedFont === f.name) { onFontSelect(null); return; }
    // attach the font bytes so the export embeds a data-URL @font-face (reliable on Lambda);
    // falls back to name-only — the export then resolves it from buildFontsCss like before.
    try {
      const res = await fetch(`/fonts/${f.file}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = new Uint8Array(await res.arrayBuffer());
      onFontSelect({ name: f.name, data, isCustom: false });
    } catch {
      onFontSelect({ name: f.name, isCustom: false });
    }
  };

  return (
    <div className="flex flex-col gap-0">

      {/* ── Built-in ─────────────────────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-1">
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Built-in</p>
        <div className="flex flex-col gap-1">
          {BUILTIN_FONTS.map(f => (
            <button
              key={f.name}
              onClick={() => selectBuiltin(f)}
              className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                selectedFont === f.name
                  ? 'border-amber-400/50 bg-amber-400/[0.08] text-white'
                  : 'border-white/[0.07] bg-white/[0.02] text-zinc-300 hover:border-white/[0.15] hover:bg-white/[0.05]'
              }`}
            >
              <span className="text-[14px] font-medium" style={{ fontFamily: `'${f.name}', sans-serif` }}>{f.label}</span>
              {selectedFont === f.name && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Google Fonts ─────────────────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 border-t border-white/[0.05] mt-2">
        <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Google Fonts</p>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
          <input
            value={gfSearch}
            onChange={e => setGfSearch(e.target.value)}
            placeholder="Search fonts…"
            className="w-full bg-white/[0.05] border border-white/[0.09] rounded-lg pl-7 pr-2.5 py-1.5 text-[12px] text-zinc-300 focus:outline-none focus:border-amber-400/40 placeholder:text-zinc-600"
          />
        </div>

        {/* Category filter */}
        <div className="flex gap-1 flex-wrap mb-2">
          {GF_CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setGfCategory(c.id)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                gfCategory === c.id
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                  : 'bg-white/[0.04] text-zinc-500 border border-white/[0.07] hover:text-zinc-300 hover:bg-white/[0.07]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Error message */}
        {gfError && (
          <p className="text-[11px] text-red-400 mb-2 leading-snug">{gfError}</p>
        )}

        {/* Font list */}
        <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto pr-0.5">
          {filteredGf.map(f => {
            const isSelected = selectedFont === f.name;
            const isLoading  = downloadingGf === f.name;
            return (
              <button
                key={f.name}
                onClick={() => !isLoading && handleGfSelect(f)}
                disabled={isLoading}
                className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-amber-400/50 bg-amber-400/[0.08]'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.05]'
                } disabled:cursor-wait`}
              >
                <span
                  style={{ fontFamily: `'${f.name}', sans-serif`, fontWeight: f.weight }}
                  className="text-[14px] text-zinc-200 truncate"
                >
                  {f.name}
                </span>
                <span className="shrink-0 ml-2">
                  {isLoading
                    ? <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                    : isSelected
                      ? <Check className="w-3.5 h-3.5 text-amber-400" />
                      : null
                  }
                </span>
              </button>
            );
          })}
          {filteredGf.length === 0 && (
            <p className="text-[11px] text-zinc-700 text-center py-3">No fonts match</p>
          )}
        </div>
      </div>

      {/* ── Custom fonts ─────────────────────────────────────────────────────── */}
      <div className="relative px-3 pt-3 pb-2 border-t border-white/[0.05] mt-1">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Custom fonts</p>
          {!isFree && fontLimit > 0 && (
            <span className="text-[10px] text-zinc-600">
              {cloudFonts.length}/{fontLimit}
            </span>
          )}
        </div>

        {/* Paywall overlay for free users */}
        {isFree && (
          <div className="rounded-xl border border-white/[0.07] bg-[#0d0d12] p-4 mb-2 flex flex-col items-center gap-2 text-center">
            <div className="w-8 h-8 rounded-xl bg-[#C8FF00]/[0.08] border border-[#C8FF00]/20 flex items-center justify-center">
              <Lock className="w-4 h-4 text-[#C8FF00]" />
            </div>
            <p className="text-[12px] font-semibold text-white">Custom fonts are a paid feature</p>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Upgrade to Starter (₹499/mo) for 10 custom fonts, or Pro for 30.
            </p>
          </div>
        )}

        {!isFree && (
          <>
            {/* Cloud-synced fonts */}
            {cloudLoading ? (
              <div className="flex items-center gap-2 py-2 text-zinc-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-[11px]">Loading fonts…</span>
              </div>
            ) : cloudFonts.length > 0 ? (
              <div className="flex flex-col gap-1 mb-2">
                {cloudFonts.map(cf => (
                  <div
                    key={cf.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                      selectedFont === cf.fontFamily
                        ? 'border-amber-400/50 bg-amber-400/[0.08]'
                        : 'border-white/[0.07] bg-white/[0.02]'
                    }`}
                  >
                    <button
                      onClick={() => handleCloudFontSelect(cf)}
                      className="flex-1 text-left min-w-0 cursor-pointer"
                    >
                      <span className="text-[13px] font-medium text-zinc-200 truncate block">{cf.fontName}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-zinc-600 truncate">{cf.fontFamily}</span>
                        <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                          cf.cached
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-zinc-800 text-zinc-500'
                        }`}>
                          {cf.cached ? 'cached' : 'cloud'}
                        </span>
                      </div>
                    </button>
                    {selectedFont === cf.fontFamily && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    <Tooltip label="Delete this font from your account">
                    <button
                      onClick={() => { deleteCloudFont(cf); if (selectedFont === cf.fontFamily) onFontSelect(null); }}
                      aria-label="Delete font"
                      className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    </Tooltip>
                  </div>
                ))}
              </div>
            ) : customFonts.length === 0 ? (
              <p className="text-[11px] text-zinc-700 leading-relaxed mb-2">
                Upload a .ttf, .otf, .woff, or .woff2 to use any font in your captions.
              </p>
            ) : null}

            {/* Legacy IDB-only fonts (uploaded before cloud sync) */}
            {customFonts.length > 0 && (
              <div className="flex flex-col gap-1 mb-2">
                {customFonts.map(f => (
                  <div
                    key={f.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                      selectedFont === f.name
                        ? 'border-amber-400/50 bg-amber-400/[0.08]'
                        : 'border-white/[0.07] bg-white/[0.02]'
                    }`}
                  >
                    <button
                      onClick={() => {
                        if (selectedFont === f.name) { onFontSelect(null); }
                        else { onFontSelect({ name: f.name, data: f.data, isCustom: true }); }
                      }}
                      className="flex-1 text-left min-w-0 cursor-pointer"
                    >
                      <span className="text-[13px] font-medium text-zinc-200 truncate block">{f.displayName}</span>
                      <span className="text-[10px] text-zinc-600 truncate block">{f.fileName}</span>
                    </button>
                    {selectedFont === f.name && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    <Tooltip label="Remove this font from this device">
                    <button
                      onClick={() => handleDelete(f.id)}
                      aria-label="Delete font"
                      className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    </Tooltip>
                  </div>
                ))}
              </div>
            )}

            {namePrompt && (
              <div className="rounded-xl border border-white/[0.1] bg-white/[0.03] p-3 mb-2 flex flex-col gap-2">
                <p className="text-[11px] text-zinc-400 leading-tight">Font display name:</p>
                <input
                  autoFocus
                  value={fontName}
                  onChange={e => setFontName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmUpload(); if (e.key === 'Escape') { setNamePrompt(null); setFontName(''); } }}
                  className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400/50 placeholder:text-zinc-600"
                  placeholder="e.g. My Custom Font"
                />
                <div className="flex gap-2">
                  <button
                    onClick={confirmUpload}
                    disabled={uploading || !fontName.trim()}
                    className="flex-1 py-1.5 rounded-lg bg-amber-500/90 text-xs font-bold text-white hover:bg-amber-400 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {uploading ? 'Uploading…' : 'Save Font'}
                  </button>
                  <button
                    onClick={() => { setNamePrompt(null); setFontName(''); }}
                    className="px-3 py-1.5 rounded-lg border border-white/[0.1] text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {uploadErr && (
              <p className="text-[11px] text-red-400 mb-2 leading-snug">{uploadErr}</p>
            )}

            {cloudFonts.length < fontLimit && (
              <Tooltip label="Use any font you own — it syncs to your account and works in exports (max 5 MB)" className="w-full">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-white/[0.12] text-[11px] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.22] transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload .ttf / .otf / .woff / .woff2
              </button>
              </Tooltip>
            )}
            <input ref={fileInputRef} type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleFileChange} className="hidden" />
          </>
        )}
      </div>

      {/* ── Active font badge ─────────────────────────────────────────────────── */}
      {selectedFont && (
        <div className="mx-3 mb-3 px-3 py-2 rounded-xl bg-amber-500/[0.06] border border-amber-400/20 flex items-start gap-2">
          <Type className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-300 leading-snug">
            <span className="font-semibold">{selectedFont}</span> will override the style&apos;s default font in captions and export.
          </p>
        </div>
      )}
    </div>
  );
}
