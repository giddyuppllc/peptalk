/**
 * Prescription compounds, for the on-device fallback bot.
 *
 * Mirrors RX_PROTOCOL_IDS and usesStrictRxRules in
 * supabase/functions/_shared/rxPolicy.ts — the main chat's rules — so the
 * fallback says the same thing Aimee would. rxCompounds.test.ts holds the two
 * lists together.
 *
 * On iOS (and an unknown platform) the fallback keeps its existing behaviour,
 * exactly as the main chat does. On web/PWA and Android it never gives doses,
 * ranges, protocols or reconstitution for these: PepTalk does not prescribe
 * (James, 2026-11-05).
 */
export const RX_COMPOUND_IDS = new Set([
  'tesamorelin',
  'semaglutide',
  'tirzepatide',
  'retatrutide',
  'thymosin-alpha-1',
]);

export type BotPlatform = 'ios' | 'android' | 'web' | string | undefined;

export function strictRxPlatform(platform: BotPlatform): boolean {
  return platform !== 'android' && platform !== 'web';
}

/** True when the fallback must not give dosing/protocol detail for this compound. */
export function withholdRxDosing(peptideId: string, platform: BotPlatform): boolean {
  return RX_COMPOUND_IDS.has(peptideId) && !strictRxPlatform(platform);
}
