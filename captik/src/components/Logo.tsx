/**
 * Captik logo mark — a dark tile holding a karaoke caption line: the word being
 * spoken lit in amber, the rest of the line dimmed. It's the product in one
 * glyph (word-level captions, highlight follows the voice) and stays legible
 * down to favicon size, where the amber pill carries the mark.
 * Single source of truth: nav, editor top bar, sidebar, footer, auth screens.
 * (Static assets — src/app/icon.svg, favicon, OG image — mirror this drawing.)
 */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  const radius = Math.round(size * 0.3);
  return (
    <span
      className={`captik-logo-mark relative inline-flex items-center justify-center bg-[#141418] border border-white/[0.09] shadow-lg shadow-amber-500/15 ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
      aria-hidden
    >
      <svg className="captik-logo-glyph" width={size * 0.78} height={size * 0.78} viewBox="0 0 24 24" fill="none">
        {/* caption line 1 — active word lit amber */}
        <rect x="3.4" y="6.1" width="10.4" height="5.4" rx="2.7" fill="url(#captik-lit)" />
        <rect x="15.8" y="6.1" width="4.8" height="5.4" rx="2.4" fill="white" fillOpacity="0.34" />
        {/* caption line 2 — not yet spoken */}
        <rect x="3.4" y="13.6" width="6.6" height="5.4" rx="2.7" fill="white" fillOpacity="0.34" />
        <rect x="12" y="13.6" width="8.6" height="5.4" rx="2.7" fill="white" fillOpacity="0.16" />
        <defs>
          <linearGradient id="captik-lit" x1="3.4" y1="6.1" x2="13.8" y2="11.5" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FCD34D" />
            <stop offset="1" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
}

/** Mark + wordmark, the standard lockup. */
export function Logo({
  size = 28,
  text = 'text-[15px]',
  className = '',
}: {
  size?: number;
  text?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className={`font-bold text-white tracking-tight ${text}`}>Captik</span>
    </span>
  );
}
