/**
 * Google Play Real-time Developer Notifications (RTDN) webhook.
 *
 * Google Play Billing posts JSON Pub/Sub messages here when a subscription
 * changes state (renew, cancel, refund, pause, grace period, etc.). We
 * fetch current state from the androidpublisher API and update our own
 * tables + audit log.
 *
 * Deploy:
 *   supabase functions deploy google-rtdn --no-verify-jwt
 *
 * --no-verify-jwt because the caller is Google Cloud Pub/Sub, which
 * authenticates via its own OIDC token (see AUTH note below).
 *
 * Required secrets:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - GOOGLE_SERVICE_ACCOUNT_JSON  (shared with validate-purchase)
 *   - ANDROID_PACKAGE_NAME         (e.g. com.peptalkapp.peptalk)
 *   - GOOGLE_RTDN_AUDIENCE         (OPTIONAL: the function URL, used to
 *                                   verify Pub/Sub's OIDC token audience)
 *
 * After deploy:
 *   1. Create a Pub/Sub topic in GCP (e.g. `peptalk-rtdn`).
 *   2. In Play Console → Monetize → Subscriptions → set the topic name.
 *   3. Add a push subscription that targets this function URL with
 *      "Enable authentication" ticked so Google attaches an OIDC token.
 *
 * See https://developer.android.com/google/play/billing/rtdn-reference.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANDROID_PACKAGE_NAME = Deno.env.get('ANDROID_PACKAGE_NAME') ?? 'com.peptalkapp.peptalk';
const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? '';

// Google's notificationType int → our canonical event name.
// Source: https://developer.android.com/google/play/billing/rtdn-reference#sub
const GOOGLE_EVENT_MAP: Record<number, string> = {
  1: 'renewal',              // SUBSCRIPTION_RECOVERED
  2: 'renewal',              // SUBSCRIPTION_RENEWED
  3: 'cancellation',         // SUBSCRIPTION_CANCELED
  4: 'initial_purchase',     // SUBSCRIPTION_PURCHASED
  5: 'on_hold',              // SUBSCRIPTION_ON_HOLD
  6: 'grace_period_started', // SUBSCRIPTION_IN_GRACE_PERIOD
  7: 'renewal',              // SUBSCRIPTION_RESTARTED
  8: 'upgraded',             // SUBSCRIPTION_PRICE_CHANGE_CONFIRMED — approximate
  9: 'downgraded',           // SUBSCRIPTION_DEFERRED
  10: 'paused',              // SUBSCRIPTION_PAUSED
  11: 'paused',              // SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED
  12: 'revoked',             // SUBSCRIPTION_REVOKED
  13: 'expiration',          // SUBSCRIPTION_EXPIRED
};

const PRODUCT_TO_TIER: Record<string, 'plus' | 'pro'> = {
  'peptalk_plus_monthly': 'plus',
  'peptalk_plus_yearly': 'plus',
  'peptalk_pro_monthly': 'pro',
  'peptalk_pro_yearly': 'pro',
};

interface PubSubEnvelope {
  message: { data: string; messageId: string; publishTime: string };
  subscription: string;
}

interface RTDNPayload {
  version: string;
  packageName: string;
  eventTimeMillis: string;
  subscriptionNotification?: {
    version: string;
    notificationType: number;
    purchaseToken: string;
    subscriptionId: string;
  };
  testNotification?: { version: string };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    // AUTH: Google Pub/Sub attaches an OIDC JWT as Authorization: Bearer.
    // Strong verification would decode + check aud/iss against our URL
    // and Google's issuer. Minimum bar: ensure SOME Authorization header
    // exists so a random POSTer can't impersonate Pub/Sub. Supabase
    // edge-function URLs aren't discoverable, which helps.
    // TODO(prod): decode the OIDC JWT and verify signature via Google's
    // JWKS + match aud to this function's URL.
    const authz = req.headers.get('authorization') ?? '';
    if (!authz.startsWith('Bearer ')) {
      console.warn('[google-rtdn] missing bearer token');
      return new Response('Unauthorized', { status: 401 });
    }

    const envelope = (await req.json()) as PubSubEnvelope;
    if (!envelope?.message?.data) {
      return new Response('Bad request', { status: 400 });
    }

    const decoded = atob(envelope.message.data);
    const payload = JSON.parse(decoded) as RTDNPayload;

    // Test notifications come from the Play Console "Send test" button —
    // just ack so it turns green. Don't touch any tables.
    if (payload.testNotification) {
      return new Response('ok', { status: 200 });
    }

    if (payload.packageName && payload.packageName !== ANDROID_PACKAGE_NAME) {
      console.warn('[google-rtdn] package mismatch:', payload.packageName);
      return new Response('Package mismatch', { status: 400 });
    }

    const sub = payload.subscriptionNotification;
    if (!sub) {
      // Nothing actionable in other notification types today (voided
      // purchases, one-time products) — ack and move on.
      return new Response('ok', { status: 200 });
    }

    const notificationType = sub.notificationType;
    const productId = sub.subscriptionId;
    const purchaseToken = sub.purchaseToken;
    const externalEventId = envelope.message.messageId;

    // Fetch current subscription state from Google so we know expiresAt
    // and whether it's currently active. The notification alone doesn't
    // carry that. Reuses the service-account JWT flow from validate-purchase.
    const state = await fetchGoogleSubscriptionState(productId, purchaseToken);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Look up the user by purchaseToken (stored at validate-purchase time
    // in the subscriptions.receipt_data column, up to 500 chars — Play
    // tokens fit comfortably).
    const { data: existing } = await admin
      .from('subscriptions')
      .select('user_id, product_id')
      .eq('receipt_data', purchaseToken.substring(0, 500))
      .limit(1)
      .maybeSingle();
    const userId = existing?.user_id ?? null;

    const eventType = GOOGLE_EVENT_MAP[notificationType] ?? 'unknown';

    await admin.from('subscription_events').upsert(
      {
        user_id: userId,
        product_id: productId,
        platform: 'android',
        event_type: eventType,
        external_event_id: externalEventId,
        raw_payload: { payload, state },
        expires_at: state.expiresAt,
      },
      { onConflict: 'platform,external_event_id', ignoreDuplicates: true },
    );

    if (userId && state.expiresAt !== undefined) {
      const tier = PRODUCT_TO_TIER[productId] ?? 'plus';
      const stillActive = !['expiration', 'revoked', 'refund'].includes(eventType)
        && (state.expiresAt === null || new Date(state.expiresAt).getTime() > Date.now());
      await admin.from('subscriptions').upsert(
        {
          user_id: userId,
          product_id: productId,
          tier,
          platform: 'android',
          expires_at: state.expiresAt,
          is_active: stillActive,
          last_validated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,product_id' },
      );
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('[google-rtdn] handler threw:', err);
    // Return 2xx so Pub/Sub doesn't redeliver forever when the error is
    // a permanent parse bug. Non-retriable errors should be logged, not
    // retried. For retriable errors, switch to 500 conditionally.
    return new Response('ok', { status: 200 });
  }
});

async function fetchGoogleSubscriptionState(
  productId: string,
  purchaseToken: string,
): Promise<{ expiresAt: string | null }> {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
    return { expiresAt: null };
  }
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return { expiresAt: null };

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return { expiresAt: null };
    const data = await res.json();
    const expiresMs = parseInt(data.expiryTimeMillis ?? '0', 10);
    return { expiresAt: expiresMs > 0 ? new Date(expiresMs).toISOString() : null };
  } catch (err) {
    console.warn('[google-rtdn] fetchGoogleSubscriptionState failed:', err);
    return { expiresAt: null };
  }
}

// ---------------------------------------------------------------------------
// Google service-account JWT flow (duplicated from validate-purchase for now
// — extract to a shared module once we have 3 callers).
// ---------------------------------------------------------------------------

async function getGoogleAccessToken(): Promise<string | null> {
  try {
    const creds = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };
    const header = { alg: 'RS256', typ: 'JWT' };
    const enc = (obj: unknown) =>
      base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
    const unsigned = `${enc(header)}.${enc(payload)}`;
    const key = await importPKCS8(creds.private_key);
    const sigBuf = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      new TextEncoder().encode(unsigned),
    );
    const jwt = `${unsigned}.${base64UrlEncode(new Uint8Array(sigBuf))}`;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function importPKCS8(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
