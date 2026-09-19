// Where the vendored Captik code lives, shared by the server, the Remotion bundle, the editor build and
// scripts/sync-captik.mjs. Both trees mirror a captik-app `src/` file-for-file; nothing in them is edited here.
//   captik/           production master: caption templates, KineticCaption composition, editor components, fonts
//   captik-graphics/  the premium editor line: the motion-graphics system (1,641 templates), its export
//                     composition, and the b-roll library
import path from 'node:path';

export const CAPTIK_DIR = import.meta.dirname;
export const CAPTIK_SRC = path.join(CAPTIK_DIR, 'src');
export const CAPTIK_PUBLIC = path.join(CAPTIK_DIR, 'public');
export const CAPTIK_FONTS = path.join(CAPTIK_PUBLIC, 'fonts');

export const GRAPHICS_DIR = path.resolve(CAPTIK_DIR, '..', 'captik-graphics');
export const GRAPHICS_SRC = path.join(GRAPHICS_DIR, 'src');

// Account-bound modules (captik.in's Supabase session) swapped for local stand-ins, by import specifier.
export const SHIMS = {
  '@/lib/supabase/client': path.join(CAPTIK_DIR, 'shims', 'supabase-client.ts'),
};

// Files of the premium tree that must never be copied, replaced by a local stand-in wherever they are imported.
// sfxBank.ts is licensed audio (Epidemic Sound and other packs); the stand-in voices every cue license-free.
export const GRAPHICS_FILE_SHIMS = {
  'lib/graphics/sfxBank.ts': path.join(GRAPHICS_DIR, 'shims', 'sfxBank.ts'),
};
