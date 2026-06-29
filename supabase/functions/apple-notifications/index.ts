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
import { X509Certificate } from 'https://esm.sh/@peculiar/x509@1.9.7';

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

    // Primary user identification: the appAccountToken the client passed
    // to `purchaseProduct` at purchase time. Apple echoes this on every
    // subsequent notification for the same subscription.
    //
    // Fallback: query subscriptions.original_transaction_id (added in
    // 20260428_subscription_dedup) — validate-purchase populates this on
    // the very first purchase, so any notification after that round-trip
    // can resolve the user even if appAccountToken is missing (early test
    // builds, or a client that didn't pass one).
    //
    // If neither resolves a user, we still log the event with null
    // user_id (subscription_events.user_id is nullable) so ops can
    // reconcile when validate-purchase eventually runs.
    let userId: string | null = null;
    if (appAccountToken) {
      userId = appAccountToken;
    } else if (originalTxId) {
      const { data: match } = await admin
        .from('subscriptions')
        .select('user_id')
        .eq('original_transaction_id', originalTxId)
        .limit(1)
        .maybeSingle();
      if (match?.user_id) userId = match.user_id;
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

    // 6. Mutate subscriptions row when we can identify both the user and
    //    the tier. If the productId isn't in our PRODUCT_TO_TIER map (typo,
    //    new product not yet shipped, family-share replay), the audit
    //    event still records the raw payload but we don't write a row
    //    with a guessed tier — that would silently grant the wrong tier.
    if (userId && productId) {
      const tier = PRODUCT_TO_TIER[productId];
      if (!tier) {
        console.warn('[apple-notifications] unknown productId, skipping subscriptions upsert:', productId);
      } else {
        const stillActive = !['expiration', 'refund', 'revoked'].includes(eventType);

        // 2026-05-17 ordering fix: Apple does NOT guarantee notification
        // delivery order. A late `EXPIRED` for period N arriving after
        // `DID_RENEW` for period N+1 used to flip is_active=false and
        // rewrite expires_at backward. Compare against the existing row's
        // expires_at and only overwrite if the incoming event is for a
        // strictly newer period (OR the user lacks a row at all). Refund
        // / revoke events are terminal and always apply regardless of
        // expires_at — those are authoritative downgrades.
        const isTerminalDowngrade = eventType === 'refund' || eventType === 'revoked';
        const { data: existing } = await admin
          .from('subscriptions')
          .select('expires_at, is_active')
          .eq('user_id', userId)
          .eq('product_id', productId)
          .maybeSingle();

        const existingExpiresMs = existing?.expires_at
          ? new Date(existing.expires_at).getTime()
          : 0;
        const incomingExpiresMs = expiresAt
          ? new Date(expiresAt).getTime()
          : 0;

        const eventIsStale =
          !isTerminalDowngrade &&
          existing &&
          existingExpiresMs > 0 &&
          incomingExpiresMs > 0 &&
          incomingExpiresMs < existingExpiresMs;

        if (eventIsStale) {
          console.warn(
            '[apple-notifications] stale event ignored (incoming expires_at',
            expiresAt,
            'older than stored',
            existing.expires_at,
            ') user_id=',
            userId,
            'product_id=',
            productId,
          );
        } else {
          // ── Crossgrade fix (P1 revenue) ──
          // iOS reuses ONE original_transaction_id across every product in a
          // subscription group, so a Plus→Pro change (DID_CHANGE_RENEWAL_PREF
          // / UPGRADED) carries the same otxid as the user's existing Plus
          // row. The upsert below keys on (user_id, product_id) and would
          // INSERT a fresh (user, pro) row — colliding with the GLOBAL unique
          // index `subscriptions_original_transaction_id_unique` (23505).
          // Here that error isn't checked, so the upsert silently fails: the
          // new Pro row is never written, then the sibling-deactivation step
          // below flips the user's only active row to is_active=false,
          // dropping a paid Pro user to free. Free the otxid from the
          // superseded sibling row (same user + same otxid, different product)
          // first so the upsert can claim it.
          if (originalTxId) {
            await admin
              .from('subscriptions')
              .update({ is_active: false, original_transaction_id: null })
              .eq('user_id', userId)
              .eq('original_transaction_id', originalTxId)
              .neq('product_id', productId);
          }
          await admin.from('subscriptions').upsert(
            {
              user_id: userId,
              product_id: productId,
              tier,
              platform: 'ios',
              expires_at: expiresAt,
              is_active: stillActive,
              // Also persist the original transaction id so future
              // notifications carrying only originalTxId (legacy receipts,
              // family-share fallback) can still resolve the row.
              original_transaction_id: originalTxId ?? null,
              last_validated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,product_id' },
          );
        }

        // Gate the profile mirror on whether we actually applied the
        // subscriptions row. If the event was ignored as stale, the
        // profile would otherwise be flipped to a state that doesn't
        // match the (newer) subscription row, falsely downgrading the
        // user.
        if (!eventIsStale) {
          // ALSO mirror the tier into `profiles.subscription_tier` so the
          // server-side feature gates (aimee-chat-stream, aimee-lab-
          // interpret, community-create-post, etc.) reflect the new
          // state. Without this, a refunded/expired/revoked user keeps
          // server-side Pro access forever — they get blocked from
          // upgrading (already have access) but the feature still serves
          // them, so the only "downgrade" is when they buy something new
          // (which they won't, since it's free). P0 from Wave 76.7 audit.
          const profileTier = stillActive ? tier : 'free';
          const isPro = stillActive && tier === 'pro';
          const isPlus = stillActive && tier === 'plus';
          const { error: profileErr } = await admin
            .from('profiles')
            .update({
              subscription_tier: profileTier,
              is_pro: isPro,
              is_plus: isPlus,
            })
            .eq('id', userId);
          if (profileErr) {
            console.warn(
              '[apple-notifications] profiles.subscription_tier update failed:',
              profileErr.message,
            );
          }

          // If a Plus→Pro upgrade just happened, deactivate any sibling
          // subscription rows for the same user (different product_id)
          // that are still flagged is_active. Otherwise syncFromServer's
          // "most recent wins" query could later pick a stale Plus row
          // and downgrade the user. P1 from the same audit.
          if (stillActive) {
            await admin
              .from('subscriptions')
              .update({ is_active: false })
              .eq('user_id', userId)
              .neq('product_id', productId);
          }
        }
      }
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
 * The previous implementation pinned the ROOT cert by SHA-256
 * fingerprint and trusted the JWS signature against the LEAF cert's
 * public key — but never verified the cryptographic chain between
 * leaf → intermediate → root. An attacker could construct a chain
 * like [forged_leaf, forged_intermediate, real_apple_root_g3_der]
 * where the fingerprint pin passes but the JWS is signed by the
 * attacker's key. Per audit finding (Wave 76.7), this was a
 * subscription-grant forgery vector.
 *
 * Fix (Wave 76.8):
 *   1. Pin the root by SHA-256 fingerprint (unchanged — Apple Root G3).
 *   2. For each link cert[i] → cert[i+1], cryptographically verify
 *      that cert[i+1]'s public key actually signed cert[i]. Uses
 *      @peculiar/x509 over WebCrypto.
 *   3. Validate every cert's notBefore / notAfter window.
 *   4. Then (and only then) use the leaf's public key to verify the
 *      JWS payload itself.
 *
 * Forgery now requires producing a cert whose chain terminates at
 * Apple Root G3 AND whose every link is cryptographically signed by
 * the next — same trust anchor every Apple device ships with, only
 * Apple's CA can produce it.
 */
async function verifyAppleJWS(jws: string): Promise<any> {
  const header = decodeProtectedHeader(jws) as any;
  const x5c: string[] | undefined = header?.x5c;
  if (!x5c || x5c.length === 0) {
    throw new Error('JWS missing x5c header');
  }

  // 1. Pin root by fingerprint (rejects unknown root substitutions).
  await assertChainRootedAtApple(x5c);

  // 2. Cryptographically verify every link in the chain.
  await verifyX509Chain(x5c);

  // 3. Verify the JWS signature using the leaf cert's public key.
  //    Safe now: we've proven the leaf was issued by Apple.
  const leafPem =
    '-----BEGIN CERTIFICATE-----\n' +
    x5c[0].replace(/(.{64})/g, '$1\n') +
    '\n-----END CERTIFICATE-----';
  const key = await importX509(leafPem, header.alg ?? 'ES256');

  const { payload } = await compactVerify(jws, key);
  return JSON.parse(new TextDecoder().decode(payload));
}

// SHA-256 fingerprint of Apple Root CA - G3 (the production ASN signer).
// Source: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
// Constant-pinned here so a rotated / different root is rejected.
const APPLE_ROOT_G3_SHA256 =
  '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function assertChainRootedAtApple(x5c: string[]): Promise<void> {
  if (x5c.length < 2) {
    throw new Error('JWS x5c chain must include at least leaf + intermediate + root');
  }
  const rootDer = base64ToBytes(x5c[x5c.length - 1]);
  const rootHash = await sha256Hex(rootDer);
  if (rootHash !== APPLE_ROOT_G3_SHA256) {
    throw new Error(
      `Untrusted root cert in x5c chain (sha256=${rootHash} expected=${APPLE_ROOT_G3_SHA256})`,
    );
  }
}

/**
 * For each adjacent pair (child, issuer) in the x5c chain:
 *   - parse both with @peculiar/x509
 *   - verify child.signature was produced by issuer.publicKey
 *   - check child.notBefore ≤ now ≤ child.notAfter
 *
 * Also verifies that the root cert is properly self-signed (defense
 * in depth — the fingerprint pin already rejects unknown roots, but
 * a malformed self-signature would surface here).
 *
 * @peculiar/x509's `verify({ publicKey })` uses WebCrypto under the
 * hood and handles ECDSA r||s ↔ DER signature conversion automatically.
 */
async function verifyX509Chain(x5c: string[]): Promise<void> {
  const certs = x5c.map((b64) => new X509Certificate(base64ToBytes(b64)));
  const now = new Date();

  for (let i = 0; i < certs.length; i++) {
    const cert = certs[i];

    // Validity window.
    if (now < cert.notBefore || now > cert.notAfter) {
      throw new Error(
        `Cert ${i} (${cert.subject}) outside validity window: ` +
        `notBefore=${cert.notBefore.toISOString()} notAfter=${cert.notAfter.toISOString()}`,
      );
    }

    // Verify signature against issuer's public key. For the last cert
    // (root) the issuer IS the cert itself — confirms self-signature.
    const issuer = certs[i + 1] ?? certs[i];
    const ok = await cert.verify({ publicKey: issuer.publicKey });
    if (!ok) {
      throw new Error(
        `Cert ${i} (${cert.subject}) signature does not verify against ` +
        `issuer ${i + 1 < certs.length ? '(intermediate/root)' : '(self)'}`,
      );
    }
  }
}
