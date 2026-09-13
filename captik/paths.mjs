// Where the vendored Captik code lives, shared by the server, the Remotion bundle, the editor build and
// scripts/sync-captik.mjs. captik/src mirrors captik-app/src file-for-file; nothing in it is edited here.
import path from 'node:path';

export const CAPTIK_DIR = import.meta.dirname;
export const CAPTIK_SRC = path.join(CAPTIK_DIR, 'src');
export const CAPTIK_PUBLIC = path.join(CAPTIK_DIR, 'public');
export const CAPTIK_FONTS = path.join(CAPTIK_PUBLIC, 'fonts');

// Account-bound modules (captik.in's Supabase session) swapped for local stand-ins. Everything else is Captik's own file.
export const SHIMS = {
  '@/lib/supabase/client': path.join(CAPTIK_DIR, 'shims', 'supabase-client.ts'),
};
