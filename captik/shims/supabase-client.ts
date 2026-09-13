// Stand-in for captik-app's src/lib/supabase/client.ts. The clipper runs locally with no captik.in
// account, so Captik's editor sees a signed-out session: the Fonts panel keeps custom fonts in the
// browser (IndexedDB) instead of syncing them to a Supabase bucket, and credits fall back to defaults.
const signedOut = { data: { user: null, session: null }, error: null };
const unavailable = { data: null, error: { message: 'Not available in Captik Clipper (no captik.in account)' } };

const bucket = {
  upload: async () => unavailable,
  download: async () => unavailable,
  remove: async () => unavailable,
  list: async () => ({ data: [], error: null }),
  createSignedUrl: async () => unavailable,
  getPublicUrl: () => ({ data: { publicUrl: '' } }),
};

const query = {
  select: () => query,
  eq: () => query,
  order: () => query,
  limit: () => query,
  single: async () => unavailable,
  maybeSingle: async () => ({ data: null, error: null }),
  then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
};

export function createClient() {
  return {
    auth: {
      getUser: async () => signedOut,
      getSession: async () => signedOut,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    storage: { from: () => bucket },
    from: () => query,
    rpc: async () => unavailable,
  };
}
