/**
 * Square web-checkout config (PWA / Platform.OS === 'web' ONLY).
 *
 * Native iOS/Android use IAP (src/services/iapService.ts) and never load this.
 * The Application ID is PUBLIC (Square Web Payments SDK uses it client-side).
 * The Access Token, Location ID, and webhook signature key are SERVER-ONLY —
 * they live as Supabase edge-function secrets, never in the client bundle.
 */

export const SQUARE_ENV: 'sandbox' | 'production' =
  (process.env.EXPO_PUBLIC_SQUARE_ENV as 'sandbox' | 'production') ?? 'sandbox';

/** Public sandbox Application ID (dev default). Override per-env via EXPO_PUBLIC_. */
export const SQUARE_APPLICATION_ID =
  process.env.EXPO_PUBLIC_SQUARE_APPLICATION_ID ??
  'sandbox-sq0idb-VpIJkyUJzr1uA6YQ_SHQGQ';

/**
 * Public Location ID — used by the Web Payments SDK to tokenize the card.
 *
 * The fallback is the SANDBOX location, and it is named as such deliberately.
 *
 * It used to be a bare `?? 'LBHKG5HYE2VAY'` with no indication of which
 * environment it belonged to, while production is 'LD9YGE0PA47SE'. A build that
 * set EXPO_PUBLIC_SQUARE_ENV and the application id but missed THIS variable
 * would therefore ship the production SDK and the production app id pointed at
 * a location that is not the production one — a payment misrouted silently,
 * with every other signal looking correct. verify:build checks the SDK and the
 * app id; it did not check this.
 */
const SANDBOX_LOCATION_ID = 'LBHKG5HYE2VAY';
export const SQUARE_LOCATION_ID =
  process.env.EXPO_PUBLIC_SQUARE_LOCATION_ID ?? SANDBOX_LOCATION_ID;

/** Web Payments SDK script (sandbox vs production). */
export const SQUARE_SDK_URL =
  SQUARE_ENV === 'production'
    ? 'https://web.squarecdn.com/v1/square.js'
    : 'https://sandbox.web.squarecdn.com/v1/square.js';

/** Where Square returns the buyer after checkout (whitelisted return URL). */
export const SQUARE_RETURN_URL =
  process.env.EXPO_PUBLIC_SQUARE_RETURN_URL ?? 'https://app.peptalk.bio/subscription';
