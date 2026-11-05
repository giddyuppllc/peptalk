/**
 * Dosing rules for the on-device fallback bot — the SAME module the main chat
 * uses (supabase/functions/_shared/rxPolicy.ts), imported, not mirrored, so the
 * fallback and Aimee cannot disagree.
 *
 * The fallback runs with no network, so it cannot read ai_policy_settings. It
 * uses the same per-platform defaults the server falls back to: iOS (and an
 * unknown platform) no label dosing; Android and web label info allowed.
 * Research-compound protocols and personalised dosing are never given.
 */
import {
  APPROVED_RX,
  classifyCompound,
  defaultPolicyFor,
  normalizePlatform,
  type ApprovedRx,
  type CompoundClass,
} from '../../supabase/functions/_shared/rxPolicy';

export type BotPlatform = 'ios' | 'android' | 'web' | string | undefined;

/** How the fallback may answer a dosing question about this compound. */
export function botDosingMode(
  idOrName: string,
  platform: BotPlatform,
): { kind: CompoundClass; labelAllowed: boolean; approved?: ApprovedRx } {
  const kind = classifyCompound(idOrName);
  const approved =
    kind === 'approved_rx'
      ? APPROVED_RX.find((r) => r.names.some((n) => idOrName.trim().toLowerCase().startsWith(n)))
      : undefined;
  return {
    kind,
    labelAllowed: kind === 'approved_rx' && defaultPolicyFor(normalizePlatform(platform)).approvedRxLabelInfo,
    approved,
  };
}

/** Kept for callers from the first version: true when no dose detail may be shown. */
export function withholdRxDosing(peptideId: string, platform: BotPlatform): boolean {
  return botDosingMode(peptideId, platform).kind !== 'supplement';
}

/** Kept for callers: true where label info is off by default (iOS / unknown). */
export function strictRxPlatform(platform: BotPlatform): boolean {
  return !defaultPolicyFor(normalizePlatform(platform)).approvedRxLabelInfo;
}
