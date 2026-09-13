// Read-time enforcement of a time-boxed plan grant.
//
// A Week Pass / one-time month / promo / cancelled-but-paid-through subscription all live in
// user_credits as `plan` + a `plan_expires_at` deadline. Until now the ONLY thing that acted on
// that deadline was the `expire_promo_grants` pg_cron sweep — which runs ONCE A DAY at 00:17 UTC.
// Every read path (watermark, STT pool, custom fonts, plugin seats) just trusted the `plan`
// column, so an expired grant kept delivering a paid plan for up to 24 extra hours: ~45 rows are
// in that state at any given moment. A 5-hour support grant issued at 13:25 UTC would really have
// run ~11 hours.
//
// So the deadline is now enforced HERE, at read time, and the sweep is demoted to housekeeping
// (it still normalises the stored row so admin views and analytics aren't misleading).
//
// The rule MIRRORS the sweep's SQL exactly — including its guard for a live subscription, whose
// entitlement is open-ended and must never be cut off by a stale deadline:
//
//   where plan_expires_at is not null
//     and plan_expires_at < now()
//     and (rzp_subscription_id is null or sub_status is distinct from 'active')
//
// Any divergence between the two would show up as a plan that flaps across the nightly sweep, so
// keep them in step if either changes.

import type { PlanId } from '@/lib/tiers';

/** The columns the expiry rule reads. Select these wherever an entitlement is derived. */
export interface PlanGrantRow {
  plan?:                string | null;
  plan_source?:         string | null;
  plan_expires_at?:     string | null;
  rzp_subscription_id?: string | null;
  sub_status?:          string | null;
}

/** Column list for a Supabase `.select()` on user_credits — keeps every call site in step. */
export const PLAN_GRANT_COLUMNS = 'plan, plan_source, plan_expires_at, rzp_subscription_id, sub_status';

/** Has this row's time-boxed grant lapsed? False for open-ended grants and live subscriptions. */
export function isGrantExpired(row: PlanGrantRow | null | undefined, nowMs: number = Date.now()): boolean {
  const raw = row?.plan_expires_at;
  if (!raw) return false;
  const expiresAt = Date.parse(raw);
  // An unparseable deadline must NEVER downgrade a paying user — fail open, exactly like the
  // rest of the entitlement path.
  if (!Number.isFinite(expiresAt) || expiresAt >= nowMs) return false;
  // An ACTIVE subscription is open-ended; its plan_expires_at (if any) is leftover state.
  if (row?.rzp_subscription_id && row?.sub_status === 'active') return false;
  return true;
}

/**
 * The plan this row actually entitles the user to right now.
 *
 * `planSource` is cleared alongside the plan on purpose: `sttLimitFor` resolves the Week Pass's
 * smaller pool from plan_source BEFORE it looks at the plan, so an expired Week Pass whose plan
 * had lapsed to free would otherwise still be handed 12 transcription minutes instead of the
 * free tier's 2.
 */
export function effectivePlan(
  row: PlanGrantRow | null | undefined,
  nowMs?: number,
): { plan: PlanId; planSource: string | null; expired: boolean } {
  const plan       = (row?.plan ?? 'free') as PlanId;
  const planSource = row?.plan_source ?? null;
  if (!isGrantExpired(row, nowMs)) return { plan, planSource, expired: false };
  return { plan: 'free', planSource: null, expired: true };
}
