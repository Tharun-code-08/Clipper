import { useCallback, useRef, useState } from 'react';
import { continueRender, delayRender } from 'remotion';

/**
 * Hold frame capture until the Brand Kit logo <img> has decoded, so the first exported frames can't
 * be captured with the logo missing. Returns the release callback to hand BrandLogoOverlay's
 * `onSettled`. Idempotent; a no-op when there is no logo. A logo that fails to load also releases
 * (the frame renders without it) — a broken logo must never hang or fail an export.
 */
export function useBrandLogoGate(active: boolean): () => void {
  const [handle] = useState(() =>
    active ? delayRender('Decoding brand logo', { timeoutInMilliseconds: 30_000 }) : null);
  const released = useRef(false);
  return useCallback(() => {
    if (handle === null || released.current) return;
    released.current = true;
    continueRender(handle);
  }, [handle]);
}
