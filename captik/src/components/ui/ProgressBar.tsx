'use client';

// Shared amber-on-zinc progress primitive — usage meters, upload/transcribe/render
// progress. Determinate when `value` is given (0–100), indeterminate shimmer otherwise.

interface ProgressBarProps {
  /** 0–100; omit for an indeterminate shimmer. */
  value?:     number;
  /** Bar height in px. */
  height?:    number;
  /** Override the fill colour (defaults to amber-500). */
  color?:     string;
  className?: string;
}

export default function ProgressBar({ value, height = 4, color = '#f59e0b', className = '' }: ProgressBarProps) {
  const determinate = typeof value === 'number' && Number.isFinite(value);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(value!) : undefined}
      className={`relative w-full overflow-hidden rounded-full bg-white/[0.07] ${className}`}
      style={{ height }}
    >
      {determinate ? (
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.max(0, value!))}%`, background: color }}
        />
      ) : (
        // captik-indeterminate keyframes live in globals.css
        <div
          className="absolute inset-y-0 w-1/3 rounded-full"
          style={{ background: color, animation: 'captik-indeterminate 1.2s ease-in-out infinite' }}
        />
      )}
    </div>
  );
}
