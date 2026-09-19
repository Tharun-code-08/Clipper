'use client';

// React access to the on-demand imported library (see loadImportedTemplates in registry.ts).
//
// GRAPHICS_TEMPLATES grows when the chunk lands, but it grows by MUTATION — the array identity
// is deliberately stable so non-React holders see the imports appear. React cannot notice that
// on its own, so components read the version through useSyncExternalStore and re-render when it
// ticks. Every surface that draws or lists templates goes through here.

import { useEffect, useSyncExternalStore } from 'react';
import {
  importedTemplatesReady,
  importedTemplatesVersion,
  loadImportedTemplates,
  needsImportedTemplates,
  subscribeImportedTemplates,
} from './registry';

/** Depend on the imported library, loading it if `want`.
 *
 *  A picker always wants it. A canvas wants it only when the project actually places an imported
 *  graphic — that is the whole point of the split, so pass the narrowest `want` you can.
 *
 *  Returns whether the library is in memory. Callers should render REGARDLESS: an unresolved
 *  template draws nothing, exactly as a retired id already does, so the frame before the chunk
 *  lands is missing a graphic rather than broken.
 *
 *  USE THE RETURN VALUE as a dependency of any useMemo that reads GRAPHICS_TEMPLATES. The array
 *  grows by mutation, so its identity never changes and a memo keyed only on filters will serve
 *  the authored-only list forever — the gallery shipped exactly that bug for one commit. */
export function useImportedTemplates(want: boolean): boolean {
  const version = useSyncExternalStore(
    subscribeImportedTemplates,
    importedTemplatesVersion,
    importedTemplatesVersion,
  );
  useEffect(() => {
    // Failure is not fatal here: the chunk missing means those graphics draw nothing, which the
    // renderer already handles. Surfaces that must not ship a half-drawn frame (the export
    // compositions) hold their own delayRender until this resolves.
    if (want && !importedTemplatesReady()) void loadImportedTemplates().catch(() => {});
  }, [want]);
  return version > 0 || importedTemplatesReady();
}

/** The common case: a surface drawing whatever graphics a project happens to have. */
export function useImportedTemplatesFor(
  graphics: readonly { templateId: string }[] | undefined,
): boolean {
  return useImportedTemplates(needsImportedTemplates(graphics));
}
