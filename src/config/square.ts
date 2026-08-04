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

/** Public Location ID — used by the Web Payments SDK to tokenize the card. */
export const SQUARE_LOCATION_ID =
  process.env.EXPO_PUBLIC_SQUARE_LOCATION_ID ?? 'LBHKG5HYE2VAY';

/** Web Payments SDK script (sandbox vs production). */
export const SQUARE_SDK_URL =
  SQUARE_ENV === 'production'
    ? 'https://web.squarecdn.com/v1/square.js'
    : 'https://sandbox.web.squarecdn.com/v1/square.js';

/** Where Square returns the buyer after checkout (whitelisted return URL). */
export const SQUARE_RETURN_URL =
  process.env.EXPO_PUBLIC_SQUARE_RETURN_URL ?? 'https://app.peptalk.bio/subscription';
