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
 * A refusal answers 429 with `denialMessage(reason)` and `reason`, the same
 * response shape and wording the chat stream returns.
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
  /** HTTP status to answer with when refused. */
  status: 429;
  /** Response body to answer with when refused. */
  body: { error: string; reason?: string };
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
  return {
    allowed: cost.allowed,
    cost,
    status: 429,
    body: { error: denialMessage(cost.reason), reason: cost.reason },
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
