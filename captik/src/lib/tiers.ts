export type PlanId = 'free' | 'starter' | 'editor' | 'pro' | 'premiere';

export interface Tier {
  id:            PlanId;
  name:          string;
  priceMonthly:  number;           // in paise
  /** Yearly mandate price in paise (≈12% off 12× monthly); 0 = not sold yearly */
  priceYearly:   number;
  customFonts:   number;
  /** Exports render without the Captik watermark */
  watermarkFree: boolean;
}

export const TIERS: Record<PlanId, Tier> = {
  // Free: unlimited watermarked exports + 2 STT minutes per rolling 30 days, no SRT download
  free:     { id: 'free',     name: 'Free',     priceMonthly: 0,      priceYearly: 0,       customFonts: 0,  watermarkFree: false },
  // Starter (₹299/mo): unlimited watermark-free exports, 60 STT min, SRT, Premiere/AE plugin burn-ins (₹3,157/yr ≈ 12% off)
  starter:  { id: 'starter',  name: 'Starter',  priceMonthly: 29900,  priceYearly: 315700,  customFonts: 5,  watermarkFree: true  },
  // Editor (₹499/mo): 3 h STT + 4K export (plugin burn-ins now start at Starter; was "Creator" pre-007)
  editor:   { id: 'editor',   name: 'Editor',   priceMonthly: 49900,  priceYearly: 526900,  customFonts: 10, watermarkFree: true  },
  // Pro (₹999/mo): 8 h STT + full plugin incl. SRT-to-sequence
  pro:      { id: 'pro',      name: 'Pro',      priceMonthly: 99900,  priceYearly: 1054900, customFonts: 30, watermarkFree: true  },
  // Grandfathered legacy plan — no longer sold on the landing page
  premiere: { id: 'premiere', name: 'Premiere', priceMonthly: 149900, priceYearly: 0,       customFonts: 30, watermarkFree: true  },
};

/** Marketing label for the yearly mandate (each yearly price is ≈12% off 12× monthly). */
export const YEARLY_DISCOUNT_PERCENT = 12;

// One-time / top-up prices (in paise)
export const ICEBREAKER_PRICE_PAISE  = 900;   // ₹9 — first-export PERMANENT per-project watermark unlock (once per user + UPI VPA)
// ₹99 export_pass removed entirely — superseded by the per-project ₹9 unlock + the ₹59 week pass.
// ₹299 one-time "month of Starter" — mirrors the Starter monthly price but bills ONCE
// (plain UPI order, no Autopay mandate). Recurring subs abandon ~92% at the mandate
// step; the one-time UPI flow completes ~75%. Grants Starter for 30 days via
// plan_expires_at, then the daily expiry sweep drops it back to free.
export const STARTER_MONTH_PRICE_PAISE = 29900;

// ₹499 one-time "month of Editor" — the Editor-tier twin of STARTER_MONTH. Same
// no-Autopay rationale: the launch data showed ~43% of fresh subscribers cancel the
// UPI Autopay mandate within hours (keeping the month they paid for), i.e. they want a
// one-time purchase, not a subscription. So Editor (which had NO one-time option, forcing
// the mandate) gets a pay-once path too. Grants the Editor PLAN for 30 days via
// plan_expires_at (full Editor STT — resolved by plan, not plan_source), dropped back to
// free by the daily expiry sweep. Mirrors the Editor monthly price so "pay once" == "1 mo".
export const EDITOR_MONTH_PRICE_PAISE = 49900;

// ₹59 one-time "Week Pass" — 7 days of Starter for users who are interested but can't
// commit to ₹299/mo. Plain UPI order, no Autopay mandate (so it dodges the ~92% mandate
// abandonment too). Grants the Starter PLAN — UNLIMITED watermark-free exports, SRT, 1080p
// (so once paid, NOTHING is watermarked for the 7 days) — with one tighter limit: a smaller
// transcription pool, keyed off plan_source. The STT pool is the sole margin lever (render is
// cheap): COGS ≈ 12 min × ₹1.5/min STT + a few cheap 1080p renders, comfortably under ₹59.
export const WEEK_PASS_PRICE_PAISE = 5900;
export const WEEK_PASS_DAYS        = 7;
export const WEEK_PASS_STT_SECONDS = 12 * 60;   // 12 transcription min / pass (vs Starter's 60)
/** Sentinel stored in user_credits.plan_source for a Week Pass grant. */
export const WEEK_PASS_SOURCE = 'week_pass';

// Canonical copy for the one-time "pay once" month pass (Starter/Editor). The pass and the
// monthly subscription grant the SAME plan for 30 days — the ONLY difference is the auto-renew
// mandate. That sameness (same price, same plan) is exactly what confused users, so every
// surface (landing, account, paywall) describes the one-time option with this one phrase.
export const ONE_TIME_MONTH_TAGLINE = 'One-time · 30 days · no auto-renew';

// Transcription allowance per rolling 30-day window, metered server-side.
// 0 = unmetered (grandfathered Premiere only).
/**
 * Plan ordering: free < starter < editor < pro < premiere. This is what tells an UPGRADE from a
 * renewal or a downgrade — which decides whether a purchase actually adds anything (create-order
 * refuses one that does not) and whether the transcription pool should be reset
 * (grantSubscriptionPlan resets on a rank increase only).
 */
export const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, editor: 2, pro: 3, premiere: 4 };

export function planRank(plan: string | null | undefined): number {
  return PLAN_RANK[plan ?? 'free'] ?? 0;
}

export const STT_LIMITS: Record<PlanId, number> = {
  free:     2 * 60,    // tightened 15→2 min (2026-06-17): free-tier STT was the bulk of Sarvam spend / multi-account farming
  starter:  60 * 60,
  editor:   180 * 60,
  pro:      480 * 60,
  premiere: 0,
};
export const FREE_STT_SECONDS = STT_LIMITS.free;

/**
 * Effective STT allowance in seconds. A Week Pass grants the Starter PLAN but a
 * smaller transcription pool — resolved by plan_source, NOT plan, so a genuine
 * Starter subscriber (plan_source null/'subscription') keeps the full 60 min while a
 * ₹59 Week Pass holder (plan_source='week_pass') gets WEEK_PASS_STT_SECONDS. Single
 * source of truth shared by /api/stt, /api/plugin/stt and the client usage display.
 * 0 = unmetered (grandfathered Premiere only).
 */
export function sttLimitFor(plan: PlanId, planSource?: string | null): number {
  if (planSource === WEEK_PASS_SOURCE) return WEEK_PASS_STT_SECONDS;
  return STT_LIMITS[plan] ?? STT_LIMITS.free;
}

// Rough Sarvam STT rate (₹/hour of audio) used only for the admin cost estimate.
// Not a billing source of truth — turns "hours transcribed" into a ballpark ₹ so
// the owner can sanity-check Sarvam's invoice. Update if Sarvam's pricing changes.
export const SARVAM_RATE_PER_HOUR_INR = 90;

// Unlicensed plugin accounts get a one-time taste: 2 watermark-free burn-ins
// for clips of at most 60 seconds (enforced server-side, consumed atomically).
export const PLUGIN_TRIAL_EXPORTS         = 2;
export const PLUGIN_TRIAL_MAX_DURATION_MS = 60_000;

export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  const formatted = rupees.toLocaleString('en-IN', {
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  });
  return `₹${formatted}`;
}

/** Resolve a tier, falling back to Free for an unknown/legacy plan value (e.g. a stale or
 *  malformed `plan` column) so a bad value never crashes the app with `undefined.x`. */
function tierFor(plan: PlanId): Tier {
  return TIERS[plan] ?? TIERS.free;
}

export function isWatermarkFreePlan(plan: PlanId): boolean {
  return tierFor(plan).watermarkFree;
}

/** Starter and up can use the NLE plugin for watermark-free burn-in renders.
 *  (Pre-2026-06-28 this was Editor+; Starter now includes the plugin. The Pro-only
 *  SRT-to-sequence — see hasPluginSrt — is what still differentiates the top tier.) */
export function isPluginLicensed(plan: PlanId): boolean {
  return plan === 'starter' || plan === 'editor' || plan === 'pro' || plan === 'premiere';
}

/** SRT-to-sequence inside the plugin is Pro-only. */
export function hasPluginSrt(plan: PlanId): boolean {
  return plan === 'pro' || plan === 'premiere';
}

/** Saving the .srt file (web editor download) requires any paid plan. */
export function canDownloadSrt(plan: PlanId): boolean {
  return plan !== 'free';
}

export function getFontLimit(plan: PlanId): number {
  return tierFor(plan).customFonts;
}

/** 4K export is an Editor+ feature. Free and Starter cap at 1080p — 4K renders on paid Lambda,
    so it's reserved for the higher tiers that cover that cost. */
export function canExport4k(plan: PlanId): boolean {
  return plan === 'editor' || plan === 'pro' || plan === 'premiere';
}

/** Server-side guard: clamp an export's output to a 1080p long edge for plans without 4K, so a
    direct API call can't bypass the UI gate. Preserves aspect ratio and keeps dimensions even. */
export function clampDimsForPlan(width: number, height: number, plan: PlanId): { width: number; height: number } {
  const long = Math.max(width, height);
  if (canExport4k(plan) || long <= 1920) return { width, height };
  const scale = 1920 / long;
  return {
    width:  Math.max(2, Math.round((width  * scale) / 2) * 2),
    height: Math.max(2, Math.round((height * scale) / 2) * 2),
  };
}
