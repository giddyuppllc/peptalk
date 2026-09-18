/**
 * The monthly AI allowance, for every AI edge function that is not the chat
 * stream.
 *
 * WHY THIS EXISTS
 * Edward, 2026-08-26: "daily limits are dumb limit per acc based on what they
 * pay" and "i dont want a daily cap". aimee-chat-stream moved to a monthly,
 * tier-sized dollar allowance (_cost.ts), but every other AI function kept its
 * own per-DAY call counter (recipe 10/day, plan 5/day, scans 5 or 20/day...).
 * Those functions also recorded no spend, so the monthly breaker could not see
 * them: a heavy recipe user was invisible to the allowance that is supposed to
 * be "what they pay".
 *
 * WHAT IT DOES
 * Exactly what the chat stream does, by calling the same code:
 *   - before the provider call, `checkCostCap` against the SERVER-resolved tier:
 *     the per-tier monthly allowance (AIMEE_MONTHLY_CENTS_*), purchased credits
 *     beyond it, and the system-wide runaway breaker (AIMEE_MONTHLY_BUDGET_CENTS);
 *   - after it, `recordSpend` of the tokens the provider reports, into the same
 *     `aimee_cost_cents` ledger, drawing credits for any part beyond the plan.
 *
 * A refusal answers with `denialMessage(reason)` and `reason`, the same
 * response shape and wording the chat stream returns.
 *
 * 429 vs 503 — THESE ARE DIFFERENT EVENTS
 * This module hardcoded 429 for every refusal, including `ledger_unreachable`,
 * and the migration that introduced it deleted explicitly-reasoned 503
 * branches from aimee-chat, food-scan, lab-scan and aimee-pantry-scan.
 * `ledger_unreachable` is not a quota: it means the spend table could not be
 * READ, so the cap cannot be enforced and the call is refused fail-closed.
 * Answering 429 tells every client that a retry is pointless until the quota
 * resets — `src/services/aimeeWorkout.ts:254` maps 429 to `rate_limit` — so a
 * database blip reads as "you are out of messages" and backoff does not retry
 * something that would succeed a second later. aimee-voice was left saying 503
 * for its own bump failure and 429 for the ledger, in the same handler.
 *
 * `retryAfter` and `upgrade` come back too. The chat stream sends both, and
 * `aimeeWorkout.ts:251` keys its upgrade prompt on `body?.upgrade` — without
 * it, a user who has spent their allowance is told to wait rather than offered
 * the plan that would let them continue.
 *
 * PRICING CAVEAT
 * Spend is priced with tokensToMicrocents, i.e. the Grok per-token rates
 * (GROK_INPUT_MC_PER_TOKEN / GROK_OUTPUT_MC_PER_TOKEN). The vision functions
 * call OpenAI instead, whose rates differ; their spend is approximate until a
 * per-provider rate is configured. A response with no `usage` block records 0.
 */
import {
  checkCostCap,
  denialMessage,
  recordSpend,
  type CostCheckResult,
} from '../aimee-chat-stream/_cost.ts';
import { tokensToMicrocents } from '../aimee-chat-stream/_grok.ts';

/**
 * One flat shape, not a discriminated union: callers read `status`/`body` on
 * refusal and `cost` on success, and a flat type narrows the same way under
 * any compiler strictness.
 */
export interface AllowanceCheck {
  allowed: boolean;
  /** The pre-call cost state; pass it to recordAiSpend. */
  cost: CostCheckResult;
  /**
   * HTTP status to answer with when refused.
   * 429 = out of allowance. 503 = the ledger could not be read, so the cap
   * could not be enforced; the client should back off and retry.
   */
  status: 429 | 503;
  /** Response body to answer with when refused. */
  body: { error: string; reason?: string; retryAfter?: number; upgrade?: boolean };
}

/** Seconds until the monthly allowance resets (start of the next UTC month). */
function secondsToMonthReset(now = new Date()): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.max(1, Math.round((next.getTime() - now.getTime()) / 1000));
}

/**
 * May this account make another AI call this month?
 *
 * @param tier the EFFECTIVE tier from resolveEffectiveTier, never a value the
 *             client sent: it decides how much may be spent.
 */
export async function checkAiAllowance(
  supabase: unknown,
  userId: string,
  tier: string,
): Promise<AllowanceCheck> {
  const cost = await checkCostCap(supabase, userId, tier);

  if (cost.reason === 'ledger_unreachable') {
    // Not a quota. The cap could not be read, so it could not be enforced —
    // a transient, retryable failure, and the same 60 seconds aimee-voice and
    // the chat stream already use for their own failed-closed path.
    return {
      allowed: cost.allowed,
      cost,
      status: 503,
      body: { error: denialMessage(cost.reason), reason: cost.reason, retryAfter: 60 },
    };
  }

  return {
    allowed: cost.allowed,
    cost,
    status: 429,
    body: {
      error: denialMessage(cost.reason),
      reason: cost.reason,
      retryAfter: secondsToMonthReset(),
      // Only the account's OWN allowance is something a plan change fixes. The
      // system-wide breaker is not the user's to buy past, and offering an
      // upgrade there would sell a plan that changes nothing.
      upgrade: cost.reason === 'user_cap_hit' && (tier === 'free' || tier === 'plus'),
    },
  };
}

/** Microcents for an OpenAI-shaped completion's `usage` block. */
export function completionMicrocents(completion: unknown): number {
  const usage = (completion as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)
    ?.usage;
  const n = (v: unknown) => {
    const x = Number(v ?? 0);
    return Number.isFinite(x) && x > 0 ? x : 0;
  };
  return tokensToMicrocents({
    input_tokens: n(usage?.prompt_tokens),
    output_tokens: n(usage?.completion_tokens),
  });
}

/**
 * Record what a completed provider call cost against the monthly ledger.
 * Pass the `cost` from checkAiAllowance so any part of the call beyond the
 * plan allowance is drawn from purchased credits, as in the chat stream.
 */
export async function recordAiSpend(
  supabase: unknown,
  userId: string,
  cost: CostCheckResult,
  completion: unknown,
): Promise<void> {
  await recordSpend(supabase, userId, completionMicrocents(completion), {
    allowanceMC: cost.allowanceMC,
    priorSpendMC: cost.userSpendMC,
  });
}
