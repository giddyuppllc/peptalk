/**
 * How much of this month's Aimee allowance the signed-in account has used.
 *
 * WHY THE SERVER REPORTS THIS
 * The spend ledger is readable by the client (RLS: "Read own aimee spend"),
 * but the ALLOWANCE lives in the edge environment. Computing the percentage
 * locally would mean hardcoding limits that drift the moment one is raised —
 * and a usage meter that lies is worse than no meter, because people plan
 * around it. The endpoint reuses the same code that ENFORCES the cap, so the
 * number shown can never disagree with the number applied.
 *
 * Every failure path returns null rather than a zero. "0% used" and "we don't
 * know" look identical to a user and mean opposite things — one says carry on,
 * the other says the meter is broken. Callers render nothing on null.
 */

import { supabase } from './supabase';
import { captureException } from './telemetry';

export interface AimeeUsage {
  tier: 'free' | 'plus' | 'pro' | string;
  /** Monthly allowance in cents. Free is metered in messages instead. */
  allowanceCents: number;
  spentCents: number;
  /** 0–100, already clamped server-side. */
  percentUsed: number;
  /** True once the allowance is exhausted for this billing month. */
  atLimit: boolean;
  /** ISO timestamp when the allowance resets. */
  resetsAt: string;
  /** Messages allowed this month for the tier. Free is metered on this. */
  messageLimit: number;
  messagesUsed: number;
  messagesRemaining: number;
}

/** Show a heads-up from here on. Early enough to act, late enough to not nag. */
export const USAGE_WARN_THRESHOLD = 80;

export async function fetchAimeeUsage(): Promise<AimeeUsage | null> {
  try {
    const { data, error } = await supabase.functions.invoke('aimee-usage', {
      body: {},
    });
    if (error) return null;
    const u = data as Partial<AimeeUsage> | null;
    // Validate rather than trust: a malformed response rendered as a meter
    // would be a confident-looking wrong number.
    if (
      !u ||
      typeof u.percentUsed !== 'number' ||
      typeof u.allowanceCents !== 'number' ||
      typeof u.spentCents !== 'number'
    ) {
      return null;
    }
    return {
      tier: u.tier ?? 'free',
      allowanceCents: u.allowanceCents,
      spentCents: u.spentCents,
      percentUsed: Math.max(0, Math.min(100, Math.round(u.percentUsed))),
      atLimit: u.atLimit === true,
      resetsAt: u.resetsAt ?? '',
      messageLimit: typeof u.messageLimit === 'number' ? u.messageLimit : 0,
      messagesUsed: typeof u.messagesUsed === 'number' ? u.messagesUsed : 0,
      messagesRemaining:
        typeof u.messagesRemaining === 'number' ? u.messagesRemaining : 0,
    };
  } catch (err) {
    captureException(err, { source: 'aimeeUsage.fetch' });
    return null;
  }
}

/** "resets 1 Sep" — short, and never a bare ISO string in the UI. */
export function formatResetDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * The line shown under the meter.
 *
 * Deliberately states the reset date whenever the allowance is gone. "You've
 * used your allowance" alone reads as permanent; people need to know it comes
 * back, and when.
 */
export function usageSummary(u: AimeeUsage): string {
  const resets = formatResetDate(u.resetsAt);
  // Free is metered in messages, not cents. Three prompts a month is small
  // enough that a percentage would be meaningless — the count is the fact
  // the user needs, and it must be exact before they lose the last one.
  if (u.tier === 'free') {
    if (u.messageLimit <= 0) return 'Aimee is available on PepTalk+ and Pro.';
    if (u.messagesRemaining <= 0) {
      return resets
        ? `You've used your ${u.messageLimit} free Aimee messages. More on ${resets}, or upgrade any time.`
        : `You've used your ${u.messageLimit} free Aimee messages.`;
    }
    const noun = u.messagesRemaining === 1 ? 'message' : 'messages';
    return `${u.messagesRemaining} of ${u.messageLimit} free Aimee ${noun} left this month.`;
  }
  if (u.atLimit) {
    return resets
      ? `You've used this month's AI allowance. It resets ${resets}.`
      : "You've used this month's AI allowance.";
  }
  if (u.percentUsed >= USAGE_WARN_THRESHOLD) {
    return resets
      ? `${u.percentUsed}% of this month's AI allowance used — resets ${resets}.`
      : `${u.percentUsed}% of this month's AI allowance used.`;
  }
  return resets
    ? `${u.percentUsed}% of this month's AI allowance used · resets ${resets}`
    : `${u.percentUsed}% of this month's AI allowance used`;
}
