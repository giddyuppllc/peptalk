/**
 * Effective-tier resolver — hardens server-side Pro/Plus gating against
 * EXPIRED or INACTIVE subscriptions.
 *
 * THE PROBLEM
 * Every edge-function tier gate historically authorized off
 * `profiles.subscription_tier` alone. That column is only a MIRROR: it's
 * flipped to 'free' by the IAP lifecycle webhooks (apple-notifications /
 * google-rtdn). If a webhook misfires (e.g. google-rtdn unprovisioned, or a
 * dropped Pub/Sub delivery), a lapsed user keeps a stale paid value in
 * profiles and therefore keeps PAID SERVER ACCESS — a revenue door that
 * fails open (cost + abuse).
 *
 * THE FIX
 * The `subscriptions` table is the source of truth: it carries `is_active`
 * and `expires_at`, so entitlement can be verified by TIME without waiting on
 * a webhook. Admin / reviewer grants (admin_set_user_tier RPC) also seed an
 * active 10-year row there, so they verify cleanly too. Only the
 * BETA_TESTER_EMAILS allowlist has no subscriptions row — that override is
 * passed in explicitly and is never downgraded, exactly like the legacy gates.
 *
 * USAGE — replace the legacy line
 *     const tier = isBetaTester ? 'pro' : (profile?.subscription_tier ?? 'free');
 * with
 *     const tier = await resolveEffectiveTier(admin, user.id, {
 *       profileTier: profile?.subscription_tier,
 *       isBetaTester,
 *     });
 *
 * Cost: ONE extra lightweight indexed query (idx_subscriptions_user_active on
 * (user_id, is_active)), and only when the profile already claims a paid tier
 * (free callers and beta testers short-circuit with no query at all).
 */

// `admin` is a service-role Supabase client. Typed loosely so this file has no
// hard dependency on the supabase-js type surface across Deno import maps.
// deno-lint-ignore no-explicit-any
type AdminClient = { from: (table: string) => any };

export interface ResolveTierOpts {
  /** Raw value of profiles.subscription_tier for the user (may be null). */
  profileTier?: string | null;
  /** True when the caller is on the BETA_TESTER_EMAILS allowlist. */
  isBetaTester?: boolean;
}

/**
 * Returns the tier the SERVER should honor for this user.
 *
 * - Beta testers / admin allowlist  → 'pro' (never downgraded).
 * - profiles tier is free/unknown   → 'free' (nothing to verify).
 * - profiles tier is plus/pro       → that tier ONLY if a live (is_active &&
 *   not-yet-expired) subscriptions row backs it; otherwise 'free'.
 *
 * Fails OPEN on a transient query error so a paying user is never locked out
 * by a hiccup in the subscriptions read — abuse stays bounded by the cost cap
 * and daily rate limit downstream.
 */
export async function resolveEffectiveTier(
  admin: AdminClient,
  userId: string,
  opts: ResolveTierOpts,
): Promise<string> {
  // Beta-tester / admin override — same as the legacy gates. These grants do
  // not ride on an IAP subscription, so they must not be downgraded.
  if (opts.isBetaTester) return 'pro';

  const tier = (opts.profileTier ?? 'free').toLowerCase();
  // 'free' is the floor; an unknown value is treated as free. Nothing to
  // verify, and no query needed.
  if (tier !== 'plus' && tier !== 'pro') return 'free';

  // Paid tier claimed in the (mirror) profile — verify a LIVE subscription
  // actually backs it.
  const { data, error } = await admin
    .from('subscriptions')
    .select('expires_at')
    .eq('user_id', userId)
    .eq('is_active', true);

  // Transient read failure → fail open (keep the claimed tier). Don't punish a
  // paying user for a flaky lookup.
  if (error) return tier;

  if (!data || data.length === 0) return 'free';

  const now = Date.now();
  const hasLive = data.some(
    // A NULL expires_at means non-expiring (e.g. legacy / lifetime); treat it
    // as live. Otherwise it's live only while the expiry is still in the future.
    (row: { expires_at: string | null }) =>
      !row.expires_at || new Date(row.expires_at).getTime() > now,
  );

  return hasLive ? tier : 'free';
}
