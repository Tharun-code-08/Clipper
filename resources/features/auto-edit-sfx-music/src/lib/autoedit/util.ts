// ─────────────────────────────────────────────────────────────────────────────
// Auto-Edit — tiny shared helpers (isomorphic; safe on client + server).
// ─────────────────────────────────────────────────────────────────────────────

/** Round to 2 decimal places (Auto-Edit UI times are seconds, 2dp). */
export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Round seconds to the millisecond (cut boundaries — the detector works in integer ms). */
export function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Monotonic counter so ids stay unique within a session without Math.random()
// (which is intentionally avoided elsewhere in this codebase). The prefix keeps
// keep/cut ids visually distinct in devtools.
let _seq = 0;
export function uid(prefix: string): string {
  _seq += 1;
  return `${prefix}_${_seq.toString(36)}`;
}
