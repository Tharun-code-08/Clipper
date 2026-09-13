'use client';

import { useEffect, useRef, useState } from 'react';
import { WatermarkLockup } from '@/remotion/WatermarkLockup';

/**
 * Live-editor twin of src/remotion/Watermark.tsx — free-tier sessions see the exact
 * animated bug their export will carry (WYSIWYG honesty; sells the ₹9 removal better
 * than any banner). Renders the SAME <WatermarkLockup> as the Remotion export, driven
 * by a rAF clock instead of useCurrentFrame, so preview ↔ export are pixel-identical.
 */
export default function PreviewWatermark({ canvasW, canvasH }: { canvasW: number; canvasH: number }) {
  const RS = canvasW < canvasH ? canvasW / 270 : canvasW / 640;
  const sz = (n: number) => Math.round(n * RS);

  const [t, setT] = useState(0);
  const start = useRef<number | null>(null);
  // Update pacing (CAPTIK-APP-1E "Maximum update depth exceeded"): a bare 60fps
  // rAF→setState loop queues updates FASTER than a weak phone can render them, and the
  // pile-up trips React's nested-update limit. Two guards: (a) cap the clock at 20fps —
  // imperceptible for this lockup, whose fastest motion is the 0.45s pop-in — and
  // (b) never queue a new t before the previous one reached a render (renderedT), so a
  // stalled device gets FEWER updates instead of a queue.
  const lastT     = useRef(0);
  const renderedT = useRef(0);
  renderedT.current = t;
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (start.current === null) start.current = now;
      const next = (now - start.current) / 1000;
      if (next - lastT.current >= 0.05 && renderedT.current === lastT.current) {
        lastT.current = next;
        setT(next);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <WatermarkLockup t={t} sz={sz} gradId="captik-wm-preview" />;
}
