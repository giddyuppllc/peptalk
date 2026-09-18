/**
 * Which unavailable integrations the Integrations screen lists under
 * "COMING SOON". Pure, so it can be tested.
 *
 * A platform health store that does not exist on this device is not "coming":
 *
 *   - Apple Health is unavailable on Android, on web, and on an iPad (iPadOS has
 *     no Health data layer). Listing it under COMING SOON there told an App
 *     Reviewer on an iPad, or a Play reviewer, that a feature was unfinished.
 *   - Health Connect is Android-only, so it is not listed on iOS.
 *
 * Third-party integrations that are genuinely pending (Oura, Whoop, …) are
 * unaffected.
 */
export function listUnderComingSoon(
  source: string,
  available: boolean,
  os: string,
): boolean {
  if (available) return false;
  if (source === 'apple_health') return false;
  if (source === 'health_connect' && os === 'ios') return false;
  return true;
}
