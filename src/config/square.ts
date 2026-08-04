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

/** Where Square returns the buyer after checkout (whitelisted return URL). */
export const SQUARE_RETURN_URL =
  process.env.EXPO_PUBLIC_SQUARE_RETURN_URL ?? 'https://app.peptalk.bio/subscription';
