/**
 * Cost cap for Aimee.
 *
 * Two layers:
 *   1. Per-user daily — protects against a single account fanning out cost.
 *   2. System-wide daily — global circuit breaker on the Grok / xAI bill.
 *      Stored under the sentinel UUID below.
 *
 * Spend is recorded in microcents (1 USD = 100,000,000 mc).
 *
 * Default budgets (override via Supabase secrets):
 *   AIMEE_DAILY_BUDGET_CENTS         — system-wide ceiling. Default 1000 = $10.
 *   AIMEE_PER_USER_DAILY_CENTS       — per-user ceiling.    Default 200  = $2.
 *
 * Both are FAIL-CLOSED on DB error: if we can't read the ledger, we can't
 * enforce the cap, so we refuse the call rather than risk runaway spend.
 */

export const GLOBAL_SPEND_SENTINEL_USER_ID =
  '00000000-0000-0000-0000-000000000000';

const SYSTEM_DAILY_CENTS = Number(
  Deno.env.get('AIMEE_DAILY_BUDGET_CENTS') ?? 1000,
);
const PER_USER_DAILY_CENTS = Number(
  Deno.env.get('AIMEE_PER_USER_DAILY_CENTS') ?? 200,
);

const SYSTEM_DAILY_MC = SYSTEM_DAILY_CENTS * 1_000_000;
const PER_USER_DAILY_MC = PER_USER_DAILY_CENTS * 1_000_000;

export interface CostCheckResult {
  allowed: boolean;
  reason?:
    | 'global_cap_hit'
    | 'user_cap_hit'
    | 'ledger_unreachable';
  globalSpendMC?: number;
  userSpendMC?: number;
}

export async function checkCostCap(
  supabase: any,
  userId: string,
): Promise<CostCheckResult> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data, error } = await supabase
      .from('aimee_cost_cents')
      .select('user_id, spend_microcents')
      .in('user_id', [userId, GLOBAL_SPEND_SENTINEL_USER_ID])
      .eq('date', today);
    if (error) {
      return { allowed: false, reason: 'ledger_unreachable' };
    }
    const userRow = (data ?? []).find((r: any) => r.user_id === userId);
    const globalRow = (data ?? []).find(
      (r: any) => r.user_id === GLOBAL_SPEND_SENTINEL_USER_ID,
    );
    const userSpend = userRow?.spend_microcents ?? 0;
    const globalSpend = globalRow?.spend_microcents ?? 0;
    if (globalSpend >= SYSTEM_DAILY_MC) {
      return {
        allowed: false,
        reason: 'global_cap_hit',
        globalSpendMC: globalSpend,
        userSpendMC: userSpend,
      };
    }
    if (userSpend >= PER_USER_DAILY_MC) {
      return {
        allowed: false,
        reason: 'user_cap_hit',
        globalSpendMC: globalSpend,
        userSpendMC: userSpend,
      };
    }
    return { allowed: true, globalSpendMC: globalSpend, userSpendMC: userSpend };
  } catch (e) {
    console.error('[aimee-cost] ledger read failed:', e);
    return { allowed: false, reason: 'ledger_unreachable' };
  }
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
): Promise<void> {
  if (microcents <= 0) return;
  const today = new Date().toISOString().slice(0, 10);

  // Use the Postgres function form for atomic increment so two concurrent
  // calls don't lose updates. We define an RPC-free pattern via upsert +
  // SQL function fallback. Simplest robust approach: SELECT-then-UPDATE
  // wrapped in two upserts. Supabase Postgres handles per-row write
  // serialization at the constraint level.
  for (const uid of [userId, GLOBAL_SPEND_SENTINEL_USER_ID]) {
    try {
      // Read-then-upsert. Race conditions on heavily-concurrent traffic
      // can drop one update — acceptable for a soft cap that we re-check
      // on every request.
      const { data: existing } = await supabase
        .from('aimee_cost_cents')
        .select('spend_microcents, call_count')
        .eq('user_id', uid)
        .eq('date', today)
        .maybeSingle();
      const nextSpend = (existing?.spend_microcents ?? 0) + microcents;
      const nextCount = (existing?.call_count ?? 0) + 1;
      await supabase
        .from('aimee_cost_cents')
        .upsert(
          {
            user_id: uid,
            date: today,
            spend_microcents: nextSpend,
            call_count: nextCount,
            last_called_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,date' },
        );
    } catch (e) {
      console.error(`[aimee-cost] recordSpend failed for ${uid}:`, e);
    }
  }
}

export function denialMessage(reason: CostCheckResult['reason']): string {
  switch (reason) {
    case 'global_cap_hit':
      return 'Aimee is taking a breather — the daily AI budget is paused. She\'ll be back tomorrow.';
    case 'user_cap_hit':
      return 'You\'ve reached your daily Aimee message budget. New conversations resume tomorrow.';
    case 'ledger_unreachable':
      return 'Aimee is temporarily unavailable — please try again in a minute.';
    default:
      return 'Aimee is unavailable right now.';
  }
}
