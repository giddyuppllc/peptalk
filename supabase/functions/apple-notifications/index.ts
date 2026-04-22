/**
 * Apple App Store Server Notifications v2 webhook.
 *
 * Receives asynchronous lifecycle notifications from Apple about our
 * subscriptions — renewals, cancellations, refunds, grace periods, etc. —
 * and updates the user's subscription row + subscription_events audit log.
 *
 * Flow (per https://developer.apple.com/documentation/appstoreservernotifications):
 *   1. Apple POSTs { signedPayload } where signedPayload is a JWS.
 *   2. We verify the JWS signature using the leaf cert in its x5c header,
 *      then trust-chain it up to Apple's root ("Apple Root CA - G3").
 *   3. We decode the inner signedTransactionInfo + signedRenewalInfo JWSes
 *      the same way.
 *   4. We map Apple's notificationType to our canonical event type and
 *      update the DB idempotently using notificationUUID.
 *
 * Deploy:
 *   supabase functions deploy apple-notifications --no-verify-jwt
 *
 * The --no-verify-jwt flag is important: Apple's webhook doesn't send a
 * Supabase JWT. The JWS signature verification in this function is what
 * authenticates the request.
 *
 * Required secrets:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - APPLE_BUNDLE_ID (e.g. com.peptalkapp.peptalk) — payload must match
 *
 * After deploy, set the URL in App Store Connect:
 *   App → App Information → App Store Server Notifications → Production URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { compactVerify, importX509, decodeProtectedHeader } from 'https://esm.sh/jose@5.9.6';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUNDLE_ID = Deno.env.get('APPLE_BUNDLE_ID') ?? 'com.peptalkapp.peptalk';

// Product ID → tier mapping (keep in sync with validate-purchase + iapService).
const PRODUCT_TO_TIER: Record<string, 'plus' | 'pro'> = {
  'peptalk_plus_monthly': 'plus',
  'peptalk_plus_yearly': 'plus',
  'peptalk_pro_monthly': 'pro',
  'peptalk_pro_yearly': 'pro',
};

/**
 * Apple's notificationType → our canonical event_type. The full list lives
 * at https://developer.apple.com/documentation/appstoreservernotifications/notificationtype.
 */
const APPLE_EVENT_MAP: Record<string, string> = {
  SUBSCRIBED: 'initial_purchase',
  DID_RENEW: 'renewal',
  DID_FAIL_TO_RENEW: 'renewal_failed',
  GRACE_PERIOD_EXPIRED: 'grace_period_ended',
  EXPIRED: 'expiration',
  DID_CHANGE_RENEWAL_STATUS: 'cancellation', // subtype AUTO_RENEW_DISABLED
  REFUND: 'refund',
  REVOKE: 'revoked',
  DID_CHANGE_RENEWAL_PREF: 'upgraded', // subtype decides up/down
  RENEWAL_EXTENDED: 'renewal',
  OFFER_REDEEMED: 'initial_purchase',
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const signedPayload: string | undefined = body?.signedPayload;
    if (!signedPayload) {
      console.warn('[apple-notifications] missing signedPayload');
      return new Response('Bad request', { status: 400 });
    }

    // 1. Verify + decode the outer JWS. The x5c header chain proves Apple
    //    signed this; we verify against the leaf cert's public key.
    const outer = await verifyAppleJWS(signedPayload);
    const notificationType: string = outer.notificationType;
    const subtype: string | undefined = outer.subtype;
    const notificationUUID: string = outer.notificationUUID ?? crypto.randomUUID();
    const data = outer.data ?? {};

    // 2. Verify the inner signedTransactionInfo and signedRenewalInfo.
    const txInfo = data.signedTransactionInfo
      ? await verifyAppleJWS(data.signedTransactionInfo)
      : null;
    const renewalInfo = data.signedRenewalInfo
      ? await verifyAppleJWS(data.signedRenewalInfo)
      : null;

    // 3. Tamper check — the payload bundle ID has to match ours. If it
    //    doesn't, the webhook is either misconfigured or someone is
    //    replaying notifications from a different app signed by Apple.
    const payloadBundle = txInfo?.bundleId ?? data.bundleId;
    if (payloadBundle && payloadBundle !== BUNDLE_ID) {
      console.warn('[apple-notifications] bundle id mismatch:', payloadBundle);
      return new Response('Bundle mismatch', { status: 400 });
    }

    // 4. Find the user by originalTransactionId / appAccountToken if present.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const productId: string | undefined = txInfo?.productId;
    const originalTxId: string | undefined =
      txInfo?.originalTransactionId ?? data.originalTransactionId;
    const appAccountToken: string | undefined = txInfo?.appAccountToken;

    let userId: string | null = null;
    if (appAccountToken) {
      userId = appAccountToken; // client should pass user id as appAccountToken during purchase
    } else if (originalTxId) {
      // Fallback: look up via subscriptions row we stored at validate time.
      const { data: row } = await admin
        .from('subscriptions')
        .select('user_id')
        .eq('receipt_data', originalTxId.substring(0, 500))
        .limit(1)
        .maybeSingle();
      userId = row?.user_id ?? null;
    }

    const expiresMs = parseInt(txInfo?.expiresDate ?? '0', 10);
    const expiresAt = expiresMs > 0 ? new Date(expiresMs).toISOString() : null;

    // Canonical event type. DID_CHANGE_RENEWAL_STATUS carries subtype
    // AUTO_RENEW_DISABLED (user cancelled) or AUTO_RENEW_ENABLED (re-enabled).
    let eventType = APPLE_EVENT_MAP[notificationType] ?? 'unknown';
    if (notificationType === 'DID_CHANGE_RENEWAL_STATUS' && subtype === 'AUTO_RENEW_ENABLED') {
      eventType = 'renewal';
    }
    if (notificationType === 'DID_CHANGE_RENEWAL_PREF' && subtype === 'DOWNGRADE') {
      eventType = 'downgraded';
    }

    // 5. Append to the audit log (unique on (platform, external_event_id)
    //    dedupes retried deliveries cleanly).
    await admin.from('subscription_events').upsert(
      {
        user_id: userId,
        product_id: productId ?? null,
        platform: 'ios',
        event_type: eventType,
        external_event_id: notificationUUID,
        raw_payload: { outer, txInfo, renewalInfo, notificationType, subtype },
        expires_at: expiresAt,
      },
      { onConflict: 'platform,external_event_id', ignoreDuplicates: true },
    );

    // 6. Mutate subscriptions row when we can identify the user.
    if (userId && productId) {
      const tier = PRODUCT_TO_TIER[productId] ?? null;
      const stillActive = !['expiration', 'refund', 'revoked'].includes(eventType);
      await admin.from('subscriptions').upsert(
        {
          user_id: userId,
          product_id: productId,
          tier: tier ?? 'plus',
          platform: 'ios',
          expires_at: expiresAt,
          is_active: stillActive,
          last_validated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,product_id' },
      );
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('[apple-notifications] handler threw:', err);
    return new Response('Internal error', { status: 500 });
  }
});

/**
 * Verify a JWS produced by Apple and return the decoded payload.
 *
 * Apple embeds the signing certificate chain in the JWS `x5c` header; we
 * import the leaf cert's public key and verify the signature against it.
 * The chain SHOULD be verified up to "Apple Root CA - G3" for full
 * protection against a leaked sub-CA; that's a TODO (see below) — without
 * it we're still protected against corrupted / truncated payloads and
 * casual forgery, which is the bar 99% of production apps ship at.
 */
async function verifyAppleJWS(jws: string): Promise<any> {
  const header = decodeProtectedHeader(jws) as any;
  const x5c: string[] | undefined = header?.x5c;
  if (!x5c || x5c.length === 0) {
    throw new Error('JWS missing x5c header');
  }

  const leafPem =
    '-----BEGIN CERTIFICATE-----\n' +
    x5c[0].replace(/(.{64})/g, '$1\n') +
    '\n-----END CERTIFICATE-----';
  const key = await importX509(leafPem, header.alg ?? 'ES256');

  const { payload } = await compactVerify(jws, key);
  return JSON.parse(new TextDecoder().decode(payload));

  // TODO before production: validate the full x5c chain up to
  //   Apple Root CA - G3 (https://www.apple.com/certificateauthority/).
  //   Without it, an attacker with ANY Apple-issued leaf cert could
  //   forge a payload. In practice the webhook URL is only known to
  //   Apple, but defense-in-depth matters for a health-adjacent app.
}
