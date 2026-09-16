/**
 * Cost control for Aimee — a MONTHLY allowance sized to what the account pays.
 *
 * WHY MONTHLY, NOT DAILY
 * The previous design capped every account at a flat $2/DAY regardless of tier.
 * Two things were wrong with that:
 *
 *   1. It ignored what the customer pays. A Plus account ($9.99/mo) had the
 *      same ceiling as Pro ($49.99/mo) — and a theoretical $60/month of AI
 *      cost against a $9.99 subscription.
 *   2. A daily window is arbitrary. Someone who does not open the app for
 *      three weeks gains nothing from the days they did not use, and someone
 *      researching hard for one afternoon is cut off despite being well inside
 *      what their subscription covers.
 *
 * The allowance now matches the billing period, because that is the period the
 * customer actually paid for.
 *
 * SIZING
 * At the configured token rates a typical turn costs roughly $0.0008. The
 * defaults below are deliberately generous relative to that — they exist to
 * stop runaway spend, not to ration normal use:
 *
 *   plus  $3.00/month   ≈ 3,750 turns   against $9.99  revenue
 *   pro   $12.00/month  ≈ 15,000 turns  against $49.99 revenue
 *
 * Override per tier with AIMEE_MONTHLY_CENTS_PLUS / _PRO. The numbers are a
 * business decision, not a technical one; these are starting points.
 *
 * OVERAGE
 * `reason: 'user_cap_hit'` means the account has spent its monthly allowance.
 * What happens next is a BILLING decision that differs per platform — on the
 * web an overage can be charged, on iOS and Android it cannot be charged
 * outside the store. This module therefore reports the state and does not
 * decide the outcome. See `overageState()`.
 *
 * Spend is recorded in microcents (1 USD = 100,000,000 mc).
 *
 * FAIL-CLOSED on ledger error: if the spend cannot be read it cannot be
 * enforced, so the call is refused rather than risking unbounded spend.
 */

export const GLOBAL_SPEND_SENTINEL_USER_ID =
  '00000000-0000-0000-0000-000000000000';

/**
 * Read a cents figure from the environment, validated ONCE at module load.
 *
 * `Number(Deno.env.get(NAME) ?? fallback)` defends against a MISSING secret
 * and nothing else, and every other shape fails open:
 *
 *   ""          Number('') is 0  -> allowance 0 -> the `allowanceMC > 0`
 *                                   guard is skipped -> no cap at all
 *   "   "       same, 0
 *   "$12"       NaN -> every comparison against it is false -> no cap
 *   "12.00 USD" NaN -> no cap
 *   "1,000"     NaN on the breaker -> no breaker
 *   "1200\n"    fine, but only by luck: Number() happens to trim
 *
 * This is the same class as GOOGLE_SERVICE_ACCOUNT_JSON being a three-character
 * documentation placeholder that passed `if (!VALUE)`. Boolean() is not a
 * check, and neither is Number(). So: require actual digits, reject anything
 * else loudly, and fall back to the default rather than to "unlimited".
 *
 * `zeroDisables` exists for the system breaker only, where 0 is a documented
 * way to switch it off. An EMPTY string still does not mean zero there — that
 * is the failure this function exists to stop.
 */
function centsFromEnv(name: string, fallback: number, zeroDisables = false): number {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw === null) return fallback;
  const trimmed = String(raw).trim();
  const n = /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : NaN;
  if (!Number.isFinite(n) || n < 0 || (n === 0 && !zeroDisables)) {
    console.error(
      `[aimee-cost] ${name} is not a usable cents figure (${JSON.stringify(raw)}). ` +
        `Falling back to ${fallback}. A spend cap that cannot be parsed is not a spend cap.`,
    );
    return fallback;
  }
  return n;
}

/**
 * Per-tier monthly allowance, in cents. Parsed once — a malformed secret
 * should log once at cold start, not on every request.
 *
 * Free gets three prompts a month (answers only). The message count is the
 * real gate; this is just a backstop so one pathological huge-context prompt
 * cannot cost more than the taster is worth.
 */
const MONTHLY_CENTS: Record<string, number> = {
  pro: centsFromEnv('AIMEE_MONTHLY_CENTS_PRO', 1200),
  plus: centsFromEnv('AIMEE_MONTHLY_CENTS_PLUS', 300),
  free: centsFromEnv('AIMEE_MONTHLY_CENTS_FREE', 25),
};

/** Per-tier monthly allowance, in cents. Unknown tier = no allowance. */
export function monthlyCentsForTier(tier: string): number {
  return MONTHLY_CENTS[tier] ?? 0;
}

/**
 * System-wide runaway breaker, monthly.
 *
 * Deliberately NOT a daily cap. The old $10/day global made one heavy day
 * black Aimee out for every user, including accounts that had spent nothing —
 * the only limit in the system where one customer degraded another's service.
 *
 * This exists solely to catch a genuine runaway (a prompt loop, a leaked key,
 * a bug that retries forever). Set it well above the sum of what subscribers
 * could legitimately spend, or it becomes the same blunt instrument.
 * Set AIMEE_MONTHLY_BUDGET_CENTS=0 to disable it entirely.
 */
export const SYSTEM_MONTHLY_CENTS = centsFromEnv(
  'AIMEE_MONTHLY_BUDGET_CENTS',
  100_000, // $1,000
  true, // an explicit "0" disables the breaker; "" does not
);

const MC_PER_CENT = 1_000_000;

export interface CostCheckResult {
  allowed: boolean;
  reason?: 'global_cap_hit' | 'user_cap_hit' | 'ledger_unreachable';
  /** Spend this month, microcents. */
  userSpendMC?: number;
  globalSpendMC?: number;
  /** The account's monthly allowance in microcents, for overage maths. */
  allowanceMC?: number;
  /** Microcents spent beyond the allowance. Zero unless the cap was hit. */
  overageMC?: number;
  /** Purchased credit balance, microcents. */
  creditBalanceMC?: number;
  /** True when this call is being funded by purchased credits, not the plan. */
  usingCredits?: boolean;
}

/**
 * Purchased credit balance for a user, in microcents.
 *
 * Returns null — NOT zero — when the balance cannot be read. Zero means "you
 * have no credits" and would deny someone who paid; null means "unknown" and
 * lets the caller fail closed for the right reason.
 */
export async function readCreditBalance(
  supabase: any,
  userId: string,
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('ai_credit_balance')
      .select('balance_microcents')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return null;
    // No row is a legitimate zero: the user has simply never bought a pack.
    return Number(data?.balance_microcents ?? 0);
  } catch {
    return null;
  }
}

/** First day of the current UTC month, as YYYY-MM-DD. */
function monthStart(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

/**
 * Check whether this account may make another Aimee call.
 *
 * @param tier the account's EFFECTIVE tier — resolved server-side, never
 *             taken from the client, since it decides how much may be spent.
 */
export async function checkCostCap(
  supabase: any,
  userId: string,
  tier: string,
): Promise<CostCheckResult> {
  const since = monthStart();
  const allowanceMC = monthlyCentsForTier(tier) * MC_PER_CENT;
  try {
    // Sum the daily ledger rows across the month. The ledger stays daily —
    // that granularity is useful for support and for spotting abuse — but the
    // ALLOWANCE is evaluated over the billing period.
    const { data, error } = await supabase
      .from('aimee_cost_cents')
      .select('user_id, spend_microcents')
      .in('user_id', [userId, GLOBAL_SPEND_SENTINEL_USER_ID])
      .gte('date', since);
    if (error) {
      return { allowed: false, reason: 'ledger_unreachable' };
    }

    let userSpend = 0;
    let globalSpend = 0;
    for (const row of data ?? []) {
      if (row.user_id === GLOBAL_SPEND_SENTINEL_USER_ID) {
        globalSpend += row.spend_microcents ?? 0;
      } else if (row.user_id === userId) {
        userSpend += row.spend_microcents ?? 0;
      }
    }

    const systemMC = SYSTEM_MONTHLY_CENTS * MC_PER_CENT;
    if (SYSTEM_MONTHLY_CENTS > 0 && globalSpend >= systemMC) {
      return {
        allowed: false,
        reason: 'global_cap_hit',
        userSpendMC: userSpend,
        globalSpendMC: globalSpend,
        allowanceMC,
        overageMC: 0,
      };
    }

    if (allowanceMC > 0 && userSpend >= allowanceMC) {
      // The plan's allowance is gone. Before refusing, check whether the user
      // BOUGHT more. Credit packs that the gate does not consult would be the
      // purest version of this codebase's recurring failure: money taken for
      // something that never takes effect.
      const creditBalance = await readCreditBalance(supabase, userId);
      if (creditBalance === null) {
        // Cannot read the balance, so cannot know whether they are entitled.
        // Fail closed rather than either denying a paying customer or handing
        // out unbounded spend.
        return { allowed: false, reason: 'ledger_unreachable' };
      }
      if (creditBalance > 0) {
        return {
          allowed: true,
          userSpendMC: userSpend,
          globalSpendMC: globalSpend,
          allowanceMC,
          overageMC: userSpend - allowanceMC,
          creditBalanceMC: creditBalance,
          usingCredits: true,
        };
      }
      return {
        allowed: false,
        reason: 'user_cap_hit',
        userSpendMC: userSpend,
        globalSpendMC: globalSpend,
        allowanceMC,
        overageMC: userSpend - allowanceMC,
        creditBalanceMC: 0,
      };
    }

    return {
      allowed: true,
      userSpendMC: userSpend,
      globalSpendMC: globalSpend,
      allowanceMC,
      overageMC: 0,
    };
  } catch (e) {
    console.error('[aimee-cost] ledger read failed:', e);
    return { allowed: false, reason: 'ledger_unreachable' };
  }
}

/**
 * Describe an over-allowance account for the caller to act on.
 *
 * Deliberately does NOT decide what happens. Charging for usage beyond the
 * subscription is a billing action, and the rules differ by platform: a web
 * customer can be charged through Square, while Apple and Google require any
 * paid digital consumption to go through their own purchase flows. Encoding
 * one answer here would bake a store violation into shared code.
 */
export function overageState(result: CostCheckResult): {
  overLimit: boolean;
  overageCents: number;
} {
  const over = result.reason === 'user_cap_hit';
  return {
    overLimit: over,
    overageCents: over ? Math.ceil((result.overageMC ?? 0) / MC_PER_CENT) : 0,
  };
}

/**
 * Record spend in microcents against both the user row and the global
 * sentinel row. Fire-and-forget — failures are logged but don't block
 * the caller's response (the next request's pre-check will re-read).
 */
export async function recordSpend(
  supabase: any,
  userId: string,
  microcents: number,
  /**
   * The allowance state as of the PRE-CALL check. Supplying it lets this
   * function work out how much of this turn falls beyond the plan and must
   * therefore be drawn from purchased credits. Omit it and no credits are
   * consumed — which is correct for callers that have no allowance concept,
   * and wrong for the chat path, so the chat path passes it.
   */
  opts?: { allowanceMC?: number; priorSpendMC?: number },
): Promise<void> {
  if (microcents <= 0) return;

  // Draw down purchased credits for the portion of this turn that exceeds the
  // plan allowance. Computed as the difference between the overage AFTER this
  // turn and the overage BEFORE it, so a turn that straddles the boundary only
  // charges credits for the part that actually crossed it.
  const allowanceMC = opts?.allowanceMC ?? 0;
  const priorSpendMC = opts?.priorSpendMC ?? 0;
  if (allowanceMC > 0) {
    const overBefore = Math.max(0, priorSpendMC - allowanceMC);
    const overAfter = Math.max(0, priorSpendMC + microcents - allowanceMC);
    const fromCredits = overAfter - overBefore;
    if (fromCredits > 0) {
      try {
        await supabase.rpc('consume_ai_credits', {
          p_user_id: userId,
          p_microcents: fromCredits,
        });
      } catch (e) {
        // Logged, not thrown: the spend ledger below is the record that gates
        // the next call, so a failed draw-down cannot let spend run away — it
        // only delays the balance catching up.
        console.error('[aimee-cost] credit draw-down failed:', e);
      }
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const id of [userId, GLOBAL_SPEND_SENTINEL_USER_ID]) {
    try {
      // ATOMIC, deliberately. This was SELECT-then-UPSERT, which loses every
      // increment that overlaps another: ten concurrent calls recorded one.
      // The sentinel row is written by every AI call from every user, so the
      // row that undercounted worst is the one the system-wide runaway
      // breaker reads. bump_aimee_spend does the addition inside Postgres'
      // row lock (20260916000000_aimee_spend_atomic.sql), exactly as
      // bump_ai_usage already does for the rate-limit ledger.
      //
      // No fallback to the old upsert if the RPC is missing: a fallback that
      // silently undercounts is the defect, not a mitigation. Deploy the
      // migration before these functions.
      const { error } = await supabase.rpc('bump_aimee_spend', {
        p_user_id: id,
        p_date: today,
        p_microcents: microcents,
      });
      if (error) {
        console.error('[aimee-cost] recordSpend failed:', error);
      }
    } catch (e) {
      console.error('[aimee-cost] recordSpend failed:', e);
    }
  }
}

/** User-facing text for a refusal. */
export function denialMessage(reason?: string): string {
  if (reason === 'global_cap_hit') {
    return 'Aimee is temporarily unavailable. Please try again shortly.';
  }
  if (reason === 'user_cap_hit') {
    return "You've used this month's AI allowance for your plan.";
  }
  return 'Aimee is temporarily unavailable. Please try again shortly.';
}
