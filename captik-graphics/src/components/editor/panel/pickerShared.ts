'use client';

// Shared machinery for ANIMATED picker grids (graphics templates, caption templates).
// One clock + one IntersectionObserver for a whole grid — never one per card.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** Beat of stillness at the end of a card's loop, so you see the settled pose and not just motion. */
export const LOOP_HOLD_MS = 700;
export const PICKER_FPS = 24;

/** ONE clock for an entire picker grid.
 *
 *  The reverted editor-suite branch drove one rAF + setState PER CARD, which at 50 cards is ~3000
 *  React updates a second. This is the deliberate opposite: a single rAF, throttled to 24fps, and
 *  only the cards actually scrolled into view consume it (see `useOnScreen`). With 139 templates
 *  that difference is the whole reason the picker stays usable. */
export function usePickerClock(running: boolean): number {
  const [t, setT] = useState(0);
  const raf = useRef(0);
  const last = useRef(0);
  useEffect(() => {
    if (!running) return undefined;
    const start = performance.now();
    // Reset the throttle so the FIRST tick always fires: without this, re-enabling the clock
    // (hover picker moving between tiles) served the previous run's stale `t` for up to a full
    // throttle window — one frame of a wrong pose, or a wrong cycleKey remount.
    last.current = 0;
    const tick = (now: number) => {
      raf.current = requestAnimationFrame(tick);
      if (now - last.current < 1000 / PICKER_FPS) return;
      last.current = now;
      setT(now - start);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [running]);
  return running ? t : 0;
}

/** Which cards are on screen, via ONE shared IntersectionObserver rather than one per card.
 *  Returns a ref-callback cards register with and the set of visible ids. Cards carry their id
 *  in `data-tpl`.
 *
 *  Ordering matters here and cost an hour: ref callbacks run BEFORE effects on first mount, so an
 *  observer created in the effect misses every card that registered during that first commit —
 *  the previews silently never start. Hence the node set, which the effect observes on creation.
 *  Root is the VIEWPORT, not the grid: the grid does not scroll, its `overflow-y-auto` ancestor
 *  does, and a null root already clips against intersecting ancestors. */
export function useOnScreen() {
  const [visible, setVisible] = useState<ReadonlySet<string>>(new Set());
  const obs = useRef<IntersectionObserver | null>(null);
  const nodes = useRef(new Set<HTMLElement>());

  useEffect(() => {
    const o = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const e of entries) {
            const id = (e.target as HTMLElement).dataset.tpl;
            if (!id) continue;
            if (e.isIntersecting && !next.has(id)) { next.add(id); changed = true; }
            else if (!e.isIntersecting && next.has(id)) { next.delete(id); changed = true; }
          }
          return changed ? next : prev;
        });
      },
      // A generous margin so a card is already playing by the time it scrolls in.
      { rootMargin: '140px 0px' },
    );
    obs.current = o;
    for (const n of nodes.current) o.observe(n);
    return () => { o.disconnect(); obs.current = null; };
  }, []);

  const register = useCallback((node: HTMLElement | null) => {
    if (!node) return undefined;
    nodes.current.add(node);
    obs.current?.observe(node);
    return () => {
      nodes.current.delete(node);
      obs.current?.unobserve(node);
      const id = node.dataset.tpl;
      if (id) setVisible((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev); next.delete(id); return next;
      });
    };
  }, []);

  return { visible, register };
}

/** Respect the platform's reduced-motion request: picker previews render their settled pose. */
const subscribeReducedMotion = (cb: () => void) => {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}
