/**
 * Reply budgets for one-shot (non-chat) AI calls.
 *
 * grok-4.3 is a reasoning model. On the OpenAI-compatible API its hidden
 * reasoning is generated inside `max_tokens`, so a cap sized for the visible
 * answer (the weekly report rewrite used 350, lab interpretation 1,200) can be
 * spent on thinking and leave the answer cut off mid-sentence — or empty.
 *
 * `replyMaxTokens` gives the visible answer its target plus reasoning headroom.
 * `wasCutOff` reports a reply the provider stopped at the cap, so callers can
 * refuse to show a truncated answer instead of presenting it as complete.
 * Cost is still bounded: these features are capped per day by bump_ai_usage.
 */

/** Room for hidden reasoning on top of the visible answer. */
export const REASONING_HEADROOM_TOKENS = 3072;

export function replyMaxTokens(visibleTarget: number): number {
  return Math.max(1, Math.floor(visibleTarget)) + REASONING_HEADROOM_TOKENS;
}

/** True when the provider stopped because it hit max_tokens. */
// deno-lint-ignore no-explicit-any
export function wasCutOff(completion: any): boolean {
  const reason = completion?.choices?.[0]?.finish_reason;
  return reason === 'length' || reason === 'max_tokens';
}
