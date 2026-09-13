'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { saveFont, getFont, deleteFont, type StoredFont } from '@/lib/fontStore';

export interface CustomFont {
  id:         string;
  fontName:   string;  // display name
  fontFamily: string;  // CSS-safe, no spaces
  filePath:   string;  // key in user_fonts bucket
  fileSize:   number;
  cached:     boolean;
}

/** IDB key prefix for Supabase-backed custom fonts */
const idbKey = (id: string) => `cf:${id}`;

export interface UseCustomFontsResult {
  fonts:            CustomFont[];
  loading:          boolean;
  refresh:          () => Promise<void>;
  downloadFont:     (font: CustomFont) => Promise<Uint8Array>;
  registerFontInDOM:(font: CustomFont) => Promise<void>;
  preloadAllFonts:  () => Promise<void>;
  deleteCustomFont: (font: CustomFont) => Promise<void>;
}

export function useCustomFonts(): UseCustomFontsResult {
  const [fonts,   setFonts]   = useState<CustomFont[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from('user_custom_fonts')
      .select('id, font_name, font_family, file_path, file_size')
      .order('created_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    const result: CustomFont[] = await Promise.all(
      data.map(async (f) => {
        const cached = await getFont(idbKey(f.id));
        return {
          id:         f.id,
          fontName:   f.font_name,
          fontFamily: f.font_family,
          filePath:   f.file_path,
          fileSize:   f.file_size,
          cached:     !!cached?.data,
        };
      }),
    );

    setFonts(result);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const downloadFont = useCallback(async (font: CustomFont): Promise<Uint8Array> => {
    const cached = await getFont(idbKey(font.id));
    if (cached?.data) return cached.data;

    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from('user_fonts')
      .download(font.filePath);

    if (error || !data) throw new Error(error?.message ?? 'Font download failed');

    const buf = new Uint8Array(await data.arrayBuffer());

    const stored: StoredFont = {
      id:          idbKey(font.id),
      name:        font.fontFamily,
      displayName: font.fontName,
      fileName:    font.filePath.split('/').pop() ?? font.fontName,
      data:        buf,
      storedAt:    Date.now(),
    };
    await saveFont(stored);
    setFonts(prev => prev.map(f => f.id === font.id ? { ...f, cached: true } : f));

    return buf;
  }, []);

  const registerFontInDOM = useCallback(async (font: CustomFont): Promise<void> => {
    // Skip if already registered
    const existing = [...document.fonts].find(f => f.family === font.fontFamily);
    if (existing?.status === 'loaded') return;

    const data = await downloadFont(font);
    const ff   = new FontFace(font.fontFamily, data.buffer as ArrayBuffer);
    await ff.load();
    document.fonts.add(ff);
  }, [downloadFont]);

  const preloadAllFonts = useCallback(async (): Promise<void> => {
    await Promise.allSettled(fonts.map(f => downloadFont(f)));
  }, [fonts, downloadFont]);

  const deleteCustomFont = useCallback(async (font: CustomFont): Promise<void> => {
    await fetch(`/api/font-upload?key=${encodeURIComponent(font.filePath)}`, { method: 'DELETE' });
    await fetch(`/api/fonts/validate?id=${encodeURIComponent(font.id)}`, { method: 'DELETE' });
    await deleteFont(idbKey(font.id));
    setFonts(prev => prev.filter(f => f.id !== font.id));
  }, []);

  return { fonts, loading, refresh, downloadFont, registerFontInDOM, preloadAllFonts, deleteCustomFont };
}
