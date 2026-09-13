'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { type PlanId, isWatermarkFreePlan, sttLimitFor } from '@/lib/tiers';
import { useCachedFetch, invalidateCache } from '@/lib/clientCache';
import { effectivePlan } from '@/lib/planExpiry';

export const CREDITS_CACHE_KEY = 'credits';

/** Call after anything that changes credits (payment, export, transcription). */
export function invalidateCredits(): void {
  invalidateCache(CREDITS_CACHE_KEY);
}

export interface UserCredits {
  exportsUsed:         number;
  plan:                PlanId;
  upiVpa:              string | null;
  upiVpaLocked:        boolean;
  /** One-shot watermark-free export credits (₹9 icebreaker / ₹99 pass) */
  wmCredits:           number;
  icebreakerPurchased: boolean;
  sttSecondsUsed:      number;
  sttWindowStart:      string | null;
  /** End of the paid billing period (drives "renews on"); null on free. */
  renewsAt:            string | null;
  subStatus:           string | null;
  hasSubscription:     boolean;
  /** Null until the first-run "how did you find us?" modal is completed/dismissed. */
  onboardedAt:         string | null;
  /** Active referral promo on this account (e.g. 'sanjay20'), or null. */
  promoCode:           string | null;
  /** A redeemed first-charge discount is waiting to apply on the next monthly checkout. */
  promoOfferPending:   boolean;
  /** When a promo-granted free month ends (drives "free trial ends <date>"); null otherwise. */
  planExpiresAt:       string | null;
  /** Grant origin ('promo' | 'one_time' | 'week_pass' | 'subscription' | null) — the
      Week Pass grants the Starter plan but a smaller STT pool, resolved from this. */
  planSource:          string | null;
}

export interface UseCreditsResult {
  credits:  UserCredits | null;
  loading:  boolean;
  refresh:  () => Promise<void>;
  /** Paid plan, or a one-shot credit ready — the next export renders clean. */
  watermarkFree: boolean;
  /** STT seconds left in the rolling 30-day window (null = unmetered plan). */
  sttSecondsLeft: number | null;
  /** The plan's STT allowance in seconds (0 = unmetered). */
  sttLimitSeconds: number;
  /** When the rolling 30-day allowance window resets. */
  resetsAt: Date | null;
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

async function fetchCredits(): Promise<UserCredits | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_credits')
    .select('exports_used, plan, upi_vpa, upi_vpa_locked, wm_credits, icebreaker_purchased, stt_seconds_used, stt_window_start, sub_current_period_end, sub_status, rzp_subscription_id, onboarded_at, promo_code, promo_offer_pending, plan_expires_at, plan_source')
    .eq('user_id', user.id)
    .single();

  if (!data) return null;
  // Resolve the same way the server does (planExpiry.ts): a lapsed grant reads as free here too,
  // so the plan badge and the preview watermark can't disagree with what an export will actually
  // produce. planExpiresAt below is still the RAW deadline — the account page renders it.
  const eff = effectivePlan(data);
  return {
    exportsUsed:         data.exports_used,
    plan:                eff.plan,
    upiVpa:              data.upi_vpa ?? null,
    upiVpaLocked:        data.upi_vpa_locked ?? false,
    wmCredits:           data.wm_credits ?? 0,
    icebreakerPurchased: data.icebreaker_purchased ?? false,
    sttSecondsUsed:      data.stt_seconds_used ?? 0,
    sttWindowStart:      data.stt_window_start ?? null,
    renewsAt:            data.sub_current_period_end ?? null,
    subStatus:           data.sub_status ?? null,
    hasSubscription:     !!data.rzp_subscription_id,
    onboardedAt:         data.onboarded_at ?? null,
    promoCode:           data.promo_code ?? null,
    promoOfferPending:   data.promo_offer_pending ?? false,
    planExpiresAt:       data.plan_expires_at ?? null,
    planSource:          eff.planSource,
  };
}

export function useCredits(): UseCreditsResult {
  // Key off the auth state so logged-out sessions skip the fetch entirely.
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    createClient().auth.getUser()
      .then(({ data }) => { if (!cancelled) setAuthed(!!data.user); })
      .catch(() => { if (!cancelled) setAuthed(false); });
    return () => { cancelled = true; };
  }, []);

  const { data: credits, loading, refresh } = useCachedFetch<UserCredits>(
    authed ? CREDITS_CACHE_KEY : null,
    useCallback(fetchCredits, []),
    60_000,
  );

  // Self-heal stale entitlement. The cache is stale-while-revalidate with a 60s TTL
  // that only re-checks on mount, so an editor that's already open (or was cached as
  // free moments before the upgrade) keeps showing the old plan — a watermarked
  // preview and a "Free" badge — even though the user just paid. That's the bulk of
  // the "I paid but I'm still on Free / still watermarked" reports. Re-fetch whenever
  // the user returns to the tab or it regains focus (an upgrade may have completed in
  // another tab, or the webhook may have landed after a transient verify miss).
  // Throttled so rapid focus flips don't hammer the DB. Mirrors the plugin's
  // re-loadMe-on-focus fix for the same class of stale-license bug.
  useEffect(() => {
    if (!authed) return;
    let last = 0;
    const maybeRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - last < 15_000) return;
      last = now;
      refresh().catch(() => {});
    };
    window.addEventListener('focus', maybeRefresh);
    document.addEventListener('visibilitychange', maybeRefresh);
    return () => {
      window.removeEventListener('focus', maybeRefresh);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
  }, [authed, refresh]);

  const watermarkFree = credits
    ? isWatermarkFreePlan(credits.plan) || credits.wmCredits > 0
    : false;

  // Mirror of the server's lazy 30-day window: an expired window means the full
  // allowance is back even though the row still shows old usage.
  const sttLimitSeconds = credits ? sttLimitFor(credits.plan, credits.planSource) : sttLimitFor('free');
  let sttSecondsLeft: number | null = null;
  if (credits && sttLimitSeconds > 0) {
    const windowExpired = credits.sttWindowStart
      ? Date.now() - new Date(credits.sttWindowStart).getTime() > WINDOW_MS
      : false;
    sttSecondsLeft = windowExpired
      ? sttLimitSeconds
      : Math.max(0, sttLimitSeconds - credits.sttSecondsUsed);
  }

  const resetsAt = credits?.sttWindowStart
    ? new Date(new Date(credits.sttWindowStart).getTime() + WINDOW_MS)
    : null;

  return {
    credits: credits ?? null,
    loading: authed === null ? true : loading,
    refresh,
    watermarkFree,
    sttSecondsLeft,
    sttLimitSeconds,
    resetsAt,
  };
}
