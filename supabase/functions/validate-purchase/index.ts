/**
 * Validate Purchase — verify an iOS/Android IAP receipt with the store
 * and update the user's subscription tier.
 *
 * Called by the client after a successful native purchase.
 *
 * Deploy: supabase functions deploy validate-purchase
 *
 * Required secrets:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - SUPABASE_ANON_KEY
 *   - APPLE_SHARED_SECRET (from App Store Connect → Subscriptions → shared secret)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const APPLE_SHARED_SECRET = Deno.env.get('APPLE_SHARED_SECRET') ?? '';

const APPLE_PROD_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

const ANDROID_PACKAGE_NAME = Deno.env.get('ANDROID_PACKAGE_NAME') ?? 'com.peptalkapp.peptalk';
const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Product ID → tier mapping (must mirror src/services/iapService.ts)
const PRODUCT_TO_TIER: Record<string, 'plus' | 'pro'> = {
  'peptalk_plus_monthly': 'plus',
  'peptalk_plus_yearly': 'plus',
  'peptalk_pro_monthly': 'pro',
  'peptalk_pro_yearly': 'pro',
};

interface ValidateBody {
  platform: 'ios' | 'android';
  productId: string;
  receipt: string; // transactionReceipt (iOS) or purchaseToken (Android)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // Verify the caller's auth token
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: 'Invalid session' }, 401);
    }

    const body: ValidateBody = await req.json();
    if (!body.receipt || !body.productId || !body.platform) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const tier = PRODUCT_TO_TIER[body.productId];
    if (!tier) {
      return json({ error: `Unknown product: ${body.productId}` }, 400);
    }

    // ── Validate receipt with store ──
    //
    // CRITICAL: We must confirm the receipt is actually for the product_id
    // the client claims. Without that check, a user could send a legitimate
    // Plus-monthly receipt but pass `productId=peptalk_pro_yearly` in the
    // body — Apple/Google would return success for the receipt, we'd map
    // our claimed productId to 'pro', and grant them a tier they didn't pay
    // for. Apple doesn't enforce product match; we do it explicitly below.
    // Google does, because the product_id is part of the verify URL path.
    let validated = false;
    let expiresAt: string | null = null;

    if (body.platform === 'ios') {
      const result = await verifyAppleReceipt(body.receipt, body.productId);
      validated = result.valid;
      expiresAt = result.expiresAt;
    } else {
      const result = await verifyGoogleReceipt(body.productId, body.receipt);
      validated = result.valid;
      expiresAt = result.expiresAt;
    }

    if (!validated) {
      return json({ error: 'Receipt could not be verified' }, 400);
    }

    // ── Update subscription tier in DB ──
    // We don't have real transactions across Supabase's REST layer, but we
    // can make this eventually-consistent + self-healing:
    //   1. Try the subscriptions upsert first (the authoritative row).
    //   2. Then try the profiles update. If profiles fails, subscriptions
    //      still has the truth — client's syncFromServer reads subscriptions
    //      anyway and will correct the tier on next boot.
    //   3. Log any error loudly with the user id so ops can reconcile.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { error: subErr } = await adminClient.from('subscriptions').upsert({
      user_id: user.id,
      product_id: body.productId,
      tier,
      platform: body.platform,
      expires_at: expiresAt,
      is_active: true,
      last_validated_at: new Date().toISOString(),
      receipt_data: body.receipt.substring(0, 500),
    }, { onConflict: 'user_id,product_id' });

    if (subErr) {
      console.error(
        `[validate-purchase] CRITICAL: subscriptions upsert failed for user ${user.id}:`,
        subErr,
      );
      // Fail the validation so the client doesn't think it succeeded —
      // it can retry, and user isn't charged twice (receipt replay is idempotent).
      return json({ error: 'Could not record subscription' }, 500);
    }

    // Profiles update is best-effort — subscriptions is the source of truth.
    const { error: profErr } = await adminClient
      .from('profiles')
      .update({ subscription_tier: tier, is_pro: tier === 'pro' })
      .eq('id', user.id);

    if (profErr) {
      console.warn(
        `[validate-purchase] profiles update failed for user ${user.id} (subscriptions row is correct; client syncFromServer will reconcile):`,
        profErr,
      );
    }

    return json({ success: true, tier, expiresAt });
  } catch (err) {
    console.error('[validate-purchase] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

// ---------------------------------------------------------------------------
// Apple receipt verification
// ---------------------------------------------------------------------------

async function verifyAppleReceipt(
  receipt: string,
  expectedProductId: string,
): Promise<{ valid: boolean; expiresAt: string | null }> {
  // Try production first, fall back to sandbox if Apple responds with 21007
  let res = await postAppleReceipt(APPLE_PROD_URL, receipt);
  if (res.status === 21007) {
    res = await postAppleReceipt(APPLE_SANDBOX_URL, receipt);
  }

  if (res.status !== 0) {
    return { valid: false, expiresAt: null };
  }

  // Apple can return multiple in-app entries (renewals, upgrades, etc.).
  // Walk latest_receipt_info — which is sorted most-recent first when
  // `exclude-old-transactions` is set — and pick the most recent entry
  // whose product_id matches what the client claimed. Falls back to the
  // legacy in_app array for first-purchase receipts.
  const candidates: any[] = [
    ...(Array.isArray(res.latest_receipt_info) ? res.latest_receipt_info : []),
    ...(Array.isArray(res.receipt?.in_app) ? res.receipt.in_app : []),
  ];
  const match = candidates.find((r) => r?.product_id === expectedProductId);
  if (!match) {
    console.warn(
      '[validate-purchase] Apple receipt valid but product_id mismatch:',
      'expected', expectedProductId,
      'got', candidates.map((c) => c?.product_id).join(','),
    );
    return { valid: false, expiresAt: null };
  }

  const expiresMs = parseInt(match.expires_date_ms ?? '0', 10);
  // Apple cancellation_date_ms is set when the user cancels mid-period OR
  // Apple revokes the purchase. Treat either as invalid even if the
  // subscription window hasn't yet elapsed.
  const cancelledMs = parseInt(match.cancellation_date_ms ?? '0', 10);
  const isActive = expiresMs > Date.now() && cancelledMs === 0;

  return {
    valid: isActive,
    expiresAt: expiresMs > 0 ? new Date(expiresMs).toISOString() : null,
  };
}

async function postAppleReceipt(url: string, receipt: string): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receipt,
      password: APPLE_SHARED_SECRET,
      'exclude-old-transactions': true,
    }),
  });
  return await res.json();
}

// ---------------------------------------------------------------------------
// Google Play receipt verification
// ---------------------------------------------------------------------------

async function verifyGoogleReceipt(
  productId: string,
  purchaseToken: string,
): Promise<{ valid: boolean; expiresAt: string | null }> {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.error('[validate-purchase] GOOGLE_SERVICE_ACCOUNT_JSON not set');
    return { valid: false, expiresAt: null };
  }

  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return { valid: false, expiresAt: null };

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${encodeURIComponent(purchaseToken)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[validate-purchase] Google API error:', res.status, err);
      return { valid: false, expiresAt: null };
    }

    const data = await res.json();
    // Google returns expiryTimeMillis as a string.
    // paymentState: 0=pending, 1=received, 2=free trial, 3=pending deferred
    // upgrade/downgrade. Accept 1 and 2 as paid/valid.
    const expiresMs = parseInt(data.expiryTimeMillis ?? '0', 10);
    const paymentState = data.paymentState;
    const paid = paymentState === 1 || paymentState === 2;
    const isActive = expiresMs > Date.now() && paid;

    // CRITICAL: acknowledge the purchase so Google doesn't auto-refund after
    // 3 days. acknowledgementState: 0 = not acknowledged, 1 = acknowledged.
    // Fire-and-forget — a failed acknowledge isn't a reason to deny entitlement,
    // the user's already paid; we just log so ops can catch systemic issues.
    if (isActive && data.acknowledgementState === 0) {
      await acknowledgeGoogleSubscription(productId, purchaseToken, accessToken).catch((err) => {
        console.warn('[validate-purchase] Google acknowledge failed (non-fatal):', err);
      });
    }

    return {
      valid: isActive,
      expiresAt: expiresMs > 0 ? new Date(expiresMs).toISOString() : null,
    };
  } catch (err) {
    console.error('[validate-purchase] Google verify threw:', err);
    return { valid: false, expiresAt: null };
  }
}

/**
 * Acknowledge a Google Play subscription purchase so Play Billing doesn't
 * auto-refund after the 3-day acknowledgement window. Required by Play
 * Billing Library per https://developer.android.com/google/play/billing/integrate#acknowledge.
 */
async function acknowledgeGoogleSubscription(
  productId: string,
  purchaseToken: string,
  accessToken: string,
): Promise<void> {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok && res.status !== 409) {
    // 409 Conflict is returned when the purchase is already acknowledged
    // (likely a retry) — safe to ignore.
    throw new Error(`acknowledge responded ${res.status}: ${await res.text()}`);
  }
}

/**
 * Exchange the service account JSON for a short-lived OAuth access token.
 * Uses the JWT bearer flow per https://developers.google.com/identity/protocols/oauth2/service-account
 */
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

    // Build and sign a JWT with the private key (RS256)
    const header = { alg: 'RS256', typ: 'JWT' };
    const enc = (obj: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
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
    if (!res.ok) {
      console.error('[validate-purchase] Google token exchange failed:', await res.text());
      return null;
    }
    const data = await res.json();
    return data.access_token ?? null;
  } catch (err) {
    console.error('[validate-purchase] getGoogleAccessToken failed:', err);
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
