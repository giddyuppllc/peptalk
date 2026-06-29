/**
 * Effective-tier resolver — hardens server-side Pro/Plus gating against
 * EXPIRED or INACTIVE subscriptions.
 *
 * THE PROBLEM
 * Every edge-function tier gate historically authorized off
 * `profiles.subscription_tier` alone. That column is only a MIRROR maintained
 * by the IAP lifecycle webhooks (apple-notifications / google-rtdn). It fails
 * BOTH ways:
 *   - Fails OPEN: a misfired expiration webhook leaves a lapsed user with a
 *     stale paid value → paid access they no longer pay for.
 *   - Fails CLOSED: a terminal event for ONE product clobbers the mirror to
 *     'free' for a user who still holds a DIFFERENT live subscription (e.g.
 *     iOS Plus expires while Android Pro is active) → a real payer locked out.
 *
 * THE FIX
 * The `subscriptions` table is the source of truth — one row per
 * (user_id, product_id), each with its own `tier`, `is_active`, `expires_at`.
 * We compute entitlement DIRECTLY from the live rows (not the mirror), taking
 * the HIGHEST live tier the user holds. This is robust to a stale/clobbered
 * mirror in either direction. Admin / reviewer grants seed an active row with
 * a far-future expiry, so they verify cleanly. Only the BETA_TESTER_EMAILS
 * allowlist has no subscriptions row — passed in explicitly, never downgraded.
 *
 * RENEWAL GRACE
 * At each auto-renewal boundary the row stays `is_active=true` but its stored
 * `expires_at` is the OLD period end until the DID_RENEW / RTDN webhook lands
 * (seconds–hours of delivery lag, or the full provider billing-grace window).
 * A strict `expires_at > now` test would wrongly downgrade every renewing
 * payer during that gap, so we honor a GRACE buffer. A genuinely lapsed sub is
 * caught either by `is_active=false` (terminal webhook) or by `expires_at`
 * falling past `now - GRACE`.
 *
 * NULL EXPIRY
 * A NULL `expires_at` is treated as NOT live: no legitimate writer produces an
 * active null-expiry row (admin grants write a real +10y date; the table
 * default is 7 days). The only producers are provider-state-fetch FAILURE
 * paths — honoring those would re-open the fail-open hole, so we don't.
 *
 * USAGE — replace the legacy line
 *     const tier = isBetaTester ? 'pro' : (profile?.subscription_tier ?? 'free');
 * with
 *     const tier = await resolveEffectiveTier(admin, user.id, {
 *       profileTier: profile?.subscription_tier,  // fail-open fallback only
 *       isBetaTester,
 *     });
 *
 * Cost: ONE lightweight indexed query (idx_subscriptions_user_active on
 * (user_id, is_active)) for every non-beta caller. These gates front expensive
 * AI / scan calls, so a single indexed read is negligible.
 */

// `admin` is a service-role Supabase client. Typed loosely so this file has no
// hard dependency on the supabase-js type surface across Deno import maps.
// deno-lint-ignore no-explicit-any
type AdminClient = { from: (table: string) => any };

export interface ResolveTierOpts {
  /**
   * Raw value of profiles.subscription_tier for the user (may be null). Used
   * ONLY as the fail-open fallback if the subscriptions read errors — the live
   * decision comes from the subscriptions rows, not this mirror.
   */
  profileTier?: string | null;
  /** True when the caller is on the BETA_TESTER_EMAILS allowlist. */
  isBetaTester?: boolean;
}

const TIER_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2 };

// Covers auto-renewal webhook-delivery lag and the typical provider billing
// grace period. A lapsed sub whose terminal webhook MISFIRED is still revoked
// once it falls this far past expiry (is_active=false revokes it immediately).
const GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * Returns the tier the SERVER should honor for this user — the highest tier
 * backed by a LIVE subscriptions row (is_active && within the expiry+grace
 * window), or 'free' if none. Fails OPEN to the profile mirror on a transient
 * read error so a paying user is never locked out by a flaky lookup; abuse
 * stays bounded by the cost cap + daily rate limit downstream.
 */
export async function resolveEffectiveTier(
  admin: AdminClient,
  userId: string,
  opts: ResolveTierOpts,
): Promise<string> {
  // Beta-tester / admin override — does not ride on an IAP subscription, so it
  // must never be downgraded and needs no query.
  if (opts.isBetaTester) return 'pro';

  const { data, error } = await admin
    .from('subscriptions')
    .select('tier, expires_at')
    .eq('user_id', userId)
    .eq('is_active', true);

  // Transient read failure → fail open to the (mirror) profile tier. Don't
  // punish a paying user for a flaky lookup.
  if (error) {
    const fallback = (opts.profileTier ?? 'free').toLowerCase();
    return fallback === 'plus' || fallback === 'pro' ? fallback : 'free';
  }

  if (!data || data.length === 0) return 'free';

  const liveAfter = Date.now() - GRACE_MS;
  let best = 'free';
  for (const row of data as { tier: string | null; expires_at: string | null }[]) {
    // NULL expiry is NOT live (only failure paths produce it — see header).
    if (!row.expires_at) continue;
    if (new Date(row.expires_at).getTime() <= liveAfter) continue;
    const t = (row.tier ?? 'free').toLowerCase();
    if ((TIER_RANK[t] ?? 0) > (TIER_RANK[best] ?? 0)) best = t;
  }
  return best;
}
