/**
 * Prescription-compound rules, by the platform the user is chatting from.
 *
 * iOS (and any request that does not say where it came from) keeps the
 * App-Review-safe prompt exactly as it was. Everywhere else — the web app/PWA
 * and Android — Aimee may DISCUSS prescription compounds factually, but PepTalk
 * does not prescribe, and does not offer protocols or doses for them (James,
 * 2026-11-05: "it can discuss them but we don't prescribe or offer protocols or
 * anything in association").
 *
 * The platform comes from the client (Platform.OS) and is only ever used to
 * choose the STRICTER or the FACTUAL wording — never to unlock dosing. A missing
 * or unrecognised value gets the strict iOS rules.
 */

export type ChatPlatform = 'ios' | 'android' | 'web' | 'unknown';

export function normalizePlatform(v: unknown): ChatPlatform {
  return v === 'ios' || v === 'android' || v === 'web' ? v : 'unknown';
}

/** iOS and unknown requests keep the original prompt untouched. */
export function usesStrictRxRules(p: ChatPlatform | undefined): boolean {
  return p !== 'android' && p !== 'web';
}

/** The compounds tagged [Rx] in the dosing reference, by knowledge-base id. */
export const RX_PROTOCOL_IDS = new Set([
  'tesamorelin',
  'semaglutide',
  'tirzepatide',
  'retatrutide',
  'thymosin-alpha-1',
]);

export const RX_FACTUAL_SECTION = `PRESCRIPTION COMPOUNDS ON THIS PLATFORM (these rules REPLACE the up-front prescription warning and every dosing figure for compounds tagged [Rx]):
- You MAY discuss prescription and investigational compounds (e.g. semaglutide, tirzepatide, retatrutide, testosterone, HCG, PT-141, tesamorelin) factually and in plain language: what they are, how they work, their approval and regulatory status, what published research and clinical trials have found, and their known side effects and risks. Do not open with a warning banner or refuse the topic — answer the question that was asked.
- You MUST NOT prescribe or recommend any prescription compound for this user, and MUST NOT give doses, dose ranges, titration schedules, cycles, reconstitution instructions, or protocols for them — not even "published" or "research" ranges, and not when asked for a mild/standard/aggressive tier.
- You MUST NOT say where or how to obtain them (no sources, vendors, compounding pharmacies, telehealth services, or "research chemical" suppliers).
- When the user asks how much to take, whether they should use one, or anything about a personal decision, say briefly that PepTalk does not provide prescribing or dosing for prescription compounds, and that a licensed clinician who can see their full picture is the right person to decide.
- Everything else in your rules still applies, including non-prescription peptides.`;
