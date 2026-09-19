'use client';

// Portal tooltip: wrap any control and give it one brief line of copy (plus an
// optional keyboard-shortcut hint). The bubble renders at document.body with
// position:fixed so it escapes overflow:auto panels, clamps to the viewport
// and flips sides when there's no room. Appears after a short hover delay,
// styled to the zinc/amber theme. Falls back gracefully on touch (no hover =
// no tooltip) — mobile discoverability lives in the Help guide instead.
//
// NOTE: not for the CEP plugin panel — Tailwind classes don't load there; the
// panel has its own inline-styled PanelTooltip.

import { useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

// SSR guard for the portal: false on the server / hydration pass, true after.
const emptySubscribe = () => () => {};
const useMounted = () => useSyncExternalStore(emptySubscribe, () => true, () => false);

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  /** One brief line — longer labels wrap at ~260px. */
  label:     string;
  side?:     Side;
  /** Optional shortcut hint rendered as a small key cap, e.g. "Ctrl+Z". */
  shortcut?: string;
  /** Extra classes for the wrapper (it renders inline-flex). */
  className?: string;
  children:  React.ReactNode;
}

const GAP    = 6; // px between trigger and bubble
const MARGIN = 8; // min distance from the viewport edge

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function Tooltip({ label, side = 'bottom', shortcut, className = '', children }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos]   = useState<{ x: number; y: number; side: Side } | null>(null);
  const mounted   = useMounted();
  const wrapRef   = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const timer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const enter = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(true), 300);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
    setPos(null);
  };

  // Two-pass placement: the bubble renders hidden, we measure it, then clamp
  // to the viewport and flip to the opposite side when there's no room.
  useLayoutEffect(() => {
    if (!show) return;
    const wrap = wrapRef.current, bubble = bubbleRef.current;
    if (!wrap || !bubble) return;
    const t = wrap.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;

    let s = side;
    if (s === 'bottom' && t.bottom + GAP + b.height > vh - MARGIN && t.top - GAP - b.height > MARGIN) s = 'top';
    else if (s === 'top' && t.top - GAP - b.height < MARGIN && t.bottom + GAP + b.height < vh - MARGIN) s = 'bottom';
    else if (s === 'right' && t.right + GAP + b.width > vw - MARGIN && t.left - GAP - b.width > MARGIN) s = 'left';
    else if (s === 'left' && t.left - GAP - b.width < MARGIN && t.right + GAP + b.width < vw - MARGIN) s = 'right';

    let x: number, y: number;
    if (s === 'top' || s === 'bottom') {
      x = clamp(t.left + t.width / 2 - b.width / 2, MARGIN, vw - b.width - MARGIN);
      y = s === 'bottom' ? t.bottom + GAP : t.top - GAP - b.height;
    } else {
      y = clamp(t.top + t.height / 2 - b.height / 2, MARGIN, vh - b.height - MARGIN);
      x = s === 'right' ? t.right + GAP : t.left - GAP - b.width;
    }
    setPos({ x, y, side: s });
  }, [show, label, shortcut, side]);

  // The anchor moves under a fixed bubble on scroll/resize — just hide.
  useEffect(() => {
    if (!show) return;
    const hide = () => leave();
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [show]);

  const placed   = pos !== null;
  const animSide = pos?.side ?? side;
  const offY     = animSide === 'bottom' ? -3 : animSide === 'top' ? 3 : 0;
  const offX     = animSide === 'right' ? -3 : animSide === 'left' ? 3 : 0;

  return (
    <span
      ref={wrapRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
    >
      {children}
      {mounted && createPortal(
        <AnimatePresence>
          {show && (
            <motion.span
              ref={bubbleRef}
              role="tooltip"
              initial={{ opacity: 0, y: offY, x: offX }}
              animate={{ opacity: placed ? 1 : 0, y: 0, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={{ position: 'fixed', left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: placed ? 'visible' : 'hidden' }}
              className={`pointer-events-none z-[200] inline-flex items-center rounded-lg border border-white/[0.1] bg-[#18181d] px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 shadow-xl shadow-black/50 ${
                label.length > 32 ? 'max-w-[260px] whitespace-normal' : 'whitespace-nowrap'
              }`}
            >
              {label}
              {shortcut && (
                <kbd className="ml-1.5 shrink-0 rounded border border-white/15 bg-white/[0.06] px-1 py-px font-sans text-[9.5px] font-semibold text-zinc-400">
                  {shortcut}
                </kbd>
              )}
            </motion.span>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}
