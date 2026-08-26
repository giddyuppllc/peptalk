/**
 * Auto-refill — top up AI credit automatically when it runs low.
 *
 * WEB ONLY, and that is a platform rule rather than a product choice.
 * Apple and Google both require the user to confirm every consumable
 * purchase; neither exposes an auto-recharge primitive for one-time products.
 * The only auto-charging product type on those stores is an auto-renewable
 * subscription, which bills monthly whether or not the credit ran out — a
 * different thing from "refill when empty". Charging a card we hold to unlock
 * in-app content on those platforms would also be a guideline violation.
 *
 * So `isAutoRefillSupported()` is the single place that rule is expressed, and
 * the UI hides the control entirely off web rather than showing a toggle that
 * would quietly do nothing.
 *
 * Every failure returns null. A toggle rendered from a guessed state is worse
 * than an absent one when the thing it controls charges a card.
 */

import { Platform } from 'react-native';
import { supabase } from './supabase';
import { captureException } from './telemetry';

export interface AutoRefillState {
  enabled: boolean;
  /** Hard ceiling on automatic charges per calendar month. */
  maxPerMonth: number;
  usedThisMonth: number;
  /** True after repeated declines — it stops itself rather than retrying. */
  pausedForFailures: boolean;
  lastRefillAt: string | null;
  lastError: string | null;
}

/**
 * Can this build offer auto-refill at all?
 *
 * Native returns false unconditionally. There is no server-side platform
 * check to match, because the setting alone is harmless — the charging
 * function only ever pays through Square, so a native user has no card for it
 * to find even if the flag were somehow set.
 */
export function isAutoRefillSupported(): boolean {
  return Platform.OS === 'web';
}

async function call(body: Record<string, unknown>): Promise<AutoRefillState | null> {
  try {
    const { data, error } = await supabase.functions.invoke(
      'credit-autorefill-settings',
      { body },
    );
    if (error) return null;
    const d = data as Partial<AutoRefillState> | null;
    if (!d || typeof d.enabled !== 'boolean') return null;
    return {
      enabled: d.enabled,
      maxPerMonth: typeof d.maxPerMonth === 'number' ? d.maxPerMonth : 0,
      usedThisMonth: typeof d.usedThisMonth === 'number' ? d.usedThisMonth : 0,
      pausedForFailures: d.pausedForFailures === true,
      lastRefillAt: d.lastRefillAt ?? null,
      lastError: d.lastError ?? null,
    };
  } catch (err) {
    captureException(err, { source: 'autoRefill' });
    return null;
  }
}

/** Read the current setting. Sends no `enabled`, so it cannot switch anything on. */
export function fetchAutoRefill(): Promise<AutoRefillState | null> {
  return call({});
}

/** Turn it on or off. Returns the state the server ended up in, not what we asked for. */
export function setAutoRefill(enabled: boolean): Promise<AutoRefillState | null> {
  return call({ enabled });
}

/**
 * The line shown under the toggle.
 *
 * States the cap explicitly whenever it is on. Someone authorising automatic
 * card charges is entitled to see the ceiling without going looking for it.
 */
export function autoRefillSummary(s: AutoRefillState, priceLabel: string): string {
  if (s.pausedForFailures) {
    return 'Auto-refill is paused — the last few payments were declined. Turn it back on once your card is updated.';
  }
  if (!s.enabled) {
    return `Buy ${priceLabel} of credit automatically when you run low.`;
  }
  return `On — up to ${s.maxPerMonth} refills a month (${s.usedThisMonth} used). ${priceLabel} each.`;
}
