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
import { jwtVerify, createRemoteJWKSet } from 'https://esm.sh/jose@5.9.6';

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
  // Refunds / chargebacks arrive here, NOT in subscriptionNotification.
  // Only emitted if "Voided Purchases" notifications are enabled in
  // Play Console → Monetization setup.
  voidedPurchasesNotification?: {
    purchaseToken: string;
    orderId: string;
    productType: number; // 1 = subscription, 2 = one-time
    refundType: number;  // 1 = full refund, 2 = partial/quantity
  };
  testNotification?: { version: string };
}

// Google's OIDC JWKS endpoint — served via createRemoteJWKSet so jose
// caches + auto-refreshes when keys rotate. Pinned to Google's
// well-known endpoint for service-account / Pub/Sub OIDC tokens.
const GOOGLE_OIDC_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_OIDC_ISSUER = 'https://accounts.google.com';
const GOOGLE_RTDN_AUDIENCE = Deno.env.get('GOOGLE_RTDN_AUDIENCE') ?? '';
const JWKS = createRemoteJWKSet(new URL(GOOGLE_OIDC_JWKS_URL));

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    // AUTH: verify the OIDC JWT Google Pub/Sub attached. Two-step:
    //   1. Signature must verify against Google's published JWKS.
    //   2. `aud` claim must match the GOOGLE_RTDN_AUDIENCE secret
    //      (set to this function's URL when configuring the Pub/Sub
    //      push subscription with "Enable authentication" ticked).
    //
    // CRITICAL: GOOGLE_RTDN_AUDIENCE is REQUIRED. Earlier versions of
    // this code fell back to bearer-presence-only when the secret was
    // unset; that's an unauthenticated path — any caller could forge
    // subscription state transitions for arbitrary purchaseTokens. We
    // now refuse to start without the secret.
    if (!GOOGLE_RTDN_AUDIENCE) {
      console.error('[google-rtdn] FATAL: GOOGLE_RTDN_AUDIENCE not configured');
      return new Response('Service Unavailable: missing audience config', { status: 503 });
    }
    const authz = req.headers.get('authorization') ?? '';
    if (!authz.startsWith('Bearer ')) {
      console.warn('[google-rtdn] missing bearer token');
      return new Response('Unauthorized', { status: 401 });
    }

    const idToken = authz.slice('Bearer '.length).trim();
    try {
      await jwtVerify(idToken, JWKS, {
        issuer: [GOOGLE_OIDC_ISSUER, 'accounts.google.com'],
        audience: GOOGLE_RTDN_AUDIENCE,
      });
    } catch (verifyErr) {
      console.warn('[google-rtdn] OIDC verify failed:', verifyErr);
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

    // Voided purchases (refund / chargeback) → revoke entitlement now.
    // Without this, a refunded user keeps their tier until the sub would
    // have naturally expired (only an immediate SUBSCRIPTION_REVOKED type-12
    // was handled before). Resolves the same way as the subscription path:
    // user/row by purchase_token, with the legacy receipt_data backstop.
    const voided = payload.voidedPurchasesNotification;
    if (voided) {
      const vToken = voided.purchaseToken;
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      let { data: vRow } = await admin
        .from('subscriptions')
        .select('user_id, product_id')
        .eq('purchase_token', vToken)
        .limit(1)
        .maybeSingle();
      if (!vRow) {
        const fb = await admin
          .from('subscriptions')
          .select('user_id, product_id')
          .eq('receipt_data', vToken.substring(0, 500))
          .limit(1)
          .maybeSingle();
        vRow = fb.data ?? null;
      }
      const vUserId = vRow?.user_id ?? null;
      const vProductId = vRow?.product_id ?? null;

      await admin.from('subscription_events').upsert(
        {
          user_id: vUserId,
          product_id: vProductId,
          platform: 'android',
          event_type: 'refund',
          external_event_id: envelope.message.messageId,
          raw_payload: { payload },
          expires_at: null,
        },
        { onConflict: 'platform,external_event_id', ignoreDuplicates: true },
      );

      if (vUserId && vProductId) {
        await admin
          .from('subscriptions')
          .update({ is_active: false, last_validated_at: new Date().toISOString() })
          .eq('user_id', vUserId)
          .eq('product_id', vProductId);
      } else {
        console.warn('[google-rtdn] voided purchase with no matching row:', vToken.substring(0, 12));
      }

      return new Response('ok', { status: 200 });
    }

    const sub = payload.subscriptionNotification;
    if (!sub) {
      // Other notification types (one-time products) — ack and move on.
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

    // Look up the user by purchaseToken via the dedicated `purchase_token`
    // column (migration 20260517000001). Previously matched against
    // `receipt_data.substring(0,500)` which mixed polymorphic Apple
    // receipts with Google tokens and risked collisions on
    // refunds/regrants where different tokens share a 500-char prefix.
    // Backfill in the same migration so legacy rows still resolve.
    let { data: existing } = await admin
      .from('subscriptions')
      .select('user_id, product_id')
      .eq('purchase_token', purchaseToken)
      .limit(1)
      .maybeSingle();
    // Backstop: if migration backfill hasn't run yet, fall back to
    // the legacy receipt_data lookup so we don't drop events during
    // the cutover window.
    if (!existing) {
      const fallback = await admin
        .from('subscriptions')
        .select('user_id, product_id')
        .eq('receipt_data', purchaseToken.substring(0, 500))
        .limit(1)
        .maybeSingle();
      existing = fallback.data ?? null;
    }
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

    // Mutate subscriptions only when productId resolves to a known tier.
    // Defaulting unknown product ids to 'plus' (previous behavior) would
    // silently mis-tier a user on a typo or future-product replay.
    if (userId && state.expiresAt !== undefined) {
      const tier = PRODUCT_TO_TIER[productId];
      if (!tier) {
        console.warn('[google-rtdn] unknown productId, skipping subscriptions upsert:', productId);
      } else {
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
