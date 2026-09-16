/**
 * What to offer a user Aimee has just refused.
 *
 * WHY THIS IS A FUNCTION AND NOT TWO COPIES OF AN INLINE TERNARY
 * It was two copies. `llmService.ts` (non-streaming fallback) and
 * `app/(tabs)/peptalk.tsx` (the SSE 'denied' event) each built the same
 * quickReplies / navAction / actions triple from `upgrade`, and only one of
 * them would have been updated when a second signal arrived. The refusal a
 * user sees depends on which transport answered, which is not a thing a user
 * can perceive or a reviewer can predict.
 *
 * THE TWO SIGNALS, AND WHY THEY ARE NOT THE SAME
 * The server sends both on a 429 (see `_shared/aiAllowance.ts` and
 * `aimee-chat-stream/index.ts`):
 *
 *   upgrade — a PLAN CHANGE would fix this. Free and Plus only: Pro is the
 *             top plan, so telling a Pro subscriber to upgrade is an offer
 *             that does not exist.
 *   topUp   — a CREDIT PACK would fix this. Any tier, because `checkCostCap`
 *             spends credits before it refuses, for everyone. For Pro it is
 *             the only offer there is, which is the whole reason this exists:
 *             a Pro user who hit the cost cap previously got a bare refusal
 *             and no path at all.
 *
 * Both can be true at once (Free/Plus at the cost cap). The plan comes first
 * then, because it is the durable fix and the pack is a one-off.
 *
 * WHAT THIS MUST NEVER DO
 * Offer a top-up where credits cannot help. Credits move the monthly COST
 * ceiling only. The per-message rate limit (RATE_LIMITS in aimee-chat-stream)
 * never reads the credit balance, so a pack bought against THAT wall changes
 * nothing — and "money taken for something that never takes effect" is the
 * failure `_shared/credits.ts` names as this codebase's recurring one. The
 * protection is that the server simply does not set `topUp` on the message
 * limit or on the system-wide breaker; this function trusts those flags and
 * invents neither.
 *
 * Both destinations are `/subscription`, which is where `CreditPackShelf`
 * renders. That keeps the store rule in `credits.ts` intact without this file
 * having to know about it: the shelf owns the per-platform purchase rail, so
 * the native app never links out to Square.
 */

/** Matches the `actions` shape the chat message renderer already consumes. */
export interface AimeeDenialAction {
  label: string;
  route: string;
  icon: string;
}

export interface AimeeDenialOffer {
  quickReplies?: string[];
  navAction?: string;
  actions?: AimeeDenialAction[];
}

/**
 * Existing shipped strings, reused verbatim rather than authored here.
 * "Top up AI credit" is the CreditPackShelf card title; "View subscription
 * plans" / "See plans" are what the upgrade path has always said.
 */
export const DENIAL_COPY = {
  plansQuickReply: 'View subscription plans',
  plansAction: 'See plans',
  topUpQuickReply: 'Top up AI credit',
  topUpAction: 'Top up AI credit',
} as const;

const SUBSCRIPTION_ROUTE = '/subscription';

export function aimeeDenialOffer(flags: {
  upgrade?: boolean;
  topUp?: boolean;
}): AimeeDenialOffer {
  const upgrade = flags.upgrade === true;
  const topUp = flags.topUp === true;

  // Neither signal: a refusal with no remedy — a transport error, the
  // system-wide breaker, or the message limit. Render no action rather than a
  // button that leads somewhere useless.
  if (!upgrade && !topUp) return {};

  const quickReplies: string[] = [];
  const actions: AimeeDenialAction[] = [];

  if (upgrade) {
    quickReplies.push(DENIAL_COPY.plansQuickReply);
    actions.push({
      label: DENIAL_COPY.plansAction,
      route: SUBSCRIPTION_ROUTE,
      icon: 'sparkles-outline',
    });
  }
  if (topUp) {
    quickReplies.push(DENIAL_COPY.topUpQuickReply);
    actions.push({
      label: DENIAL_COPY.topUpAction,
      route: SUBSCRIPTION_ROUTE,
      icon: 'battery-charging-outline',
    });
  }

  return { quickReplies, navAction: SUBSCRIPTION_ROUTE, actions };
}

export default aimeeDenialOffer;
