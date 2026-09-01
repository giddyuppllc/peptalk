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
import { compactVerify, importX509, decodeProtectedHeader } from 'https://esm.sh/jose@5.9.6';
import { X509Certificate } from 'https://esm.sh/@peculiar/x509@1.9.7';
import { reportError } from '../_shared/sentry.ts';
import { isCreditPack, packForProduct } from '../_shared/credits.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const APPLE_SHARED_SECRET = Deno.env.get('APPLE_SHARED_SECRET') ?? '';
const BUNDLE_ID = Deno.env.get('APPLE_BUNDLE_ID') ?? 'com.peptalkapp.peptalk';

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

/**
 * Record where a validation attempt got to.
 *
 * Never throws and never blocks the response. This exists so that a failure on
 * the money path leaves evidence -- previously a customer could pay, get
 * nothing, and be completely invisible to us afterwards. Logging must not
 * become a new way for the money path to fail, so every error here is
 * swallowed after being reported.
 */
async function logStage(
  admin: any,
  args: {
    userId?: string | null;
    platform: string;
    productId: string;
    stage: string;
    externalId?: string | null;
    purchaseToken?: string | null;
    acknowledged?: boolean | null;
    error?: string | null;
  },
): Promise<void> {
  try {
    await admin.rpc('log_purchase_validation', {
      p_user_id: args.userId ?? null,
      p_platform: args.platform,
      p_product_id: args.productId,
      p_stage: args.stage,
      p_external_id: args.externalId ?? null,
      p_purchase_token: args.purchaseToken ?? null,
      p_acknowledged: args.acknowledged ?? null,
      p_error: args.error ?? null,
    });
  } catch (e) {
    console.error('[validate-purchase] logStage failed:', e);
  }
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

    // ── Credit packs (consumables) branch off before the tier lookup ──
    //
    // They are not subscriptions: no tier, no expiry, and a user may buy the
    // same SKU many times. Handled entirely by handleCreditPack, which returns
    // early -- the subscription machinery below would reject them as unknown
    // products, and any of it that did run would be wrong for a consumable.
    if (isCreditPack(body.productId)) {
      return await handleCreditPack(user.id, body);
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
    let originalTransactionId: string | null = null;

    // Evidence FIRST. If everything after this line fails -- a timeout, a cold
    // start, a database outage -- this row still names the user and the
    // product, which is the difference between a findable problem and an
    // invisible one.
    const logClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    await logStage(logClient, {
      userId: user.id,
      platform: body.platform,
      productId: body.productId,
      stage: 'received',
      purchaseToken: body.platform === 'android' ? body.receipt : null,
    });

    if (body.platform === 'ios') {
      const result = await verifyAppleReceiptV2(body.receipt, body.productId);
      validated = result.valid;
      expiresAt = result.expiresAt;
      originalTransactionId = result.originalTransactionId;
    } else {
      const result = await verifyGoogleReceipt(body.productId, body.receipt);
      validated = result.valid;
      expiresAt = result.expiresAt;
      originalTransactionId = result.originalTransactionId;
    }

    if (!validated) {
      // The store said no. No money is owed, but record it: a spike here is
      // how a broken verifier or a bad service-account key announces itself.
      await logStage(logClient, {
        userId: user.id,
        platform: body.platform,
        productId: body.productId,
        stage: 'verify_failed',
        externalId: originalTransactionId,
        error: 'store rejected the receipt',
      });
      return json({ error: 'Receipt could not be verified' }, 400);
    }

    // Verified. On Android the acknowledgement has ALREADY happened inside
    // verifyGoogleReceipt, before any database work -- so from here on the
    // customer's money is safe from the 3-day auto-refund even if everything
    // below fails. What is NOT safe is their entitlement, which is exactly
    // what the reconciliation sweep looks for.
    await logStage(logClient, {
      userId: user.id,
      platform: body.platform,
      productId: body.productId,
      stage: 'verified',
      externalId: originalTransactionId,
      acknowledged: body.platform === 'android' ? true : null,
    });

    // ── Cross-user dedup ──
    // Reject if the same Apple original_transaction_id (or Google orderId
    // base) is already bound to a DIFFERENT user. Without this check, a
    // leaked receipt shared in a forum could grant Pro to multiple accounts.
    // Same-user re-validation is fine — that's the upsert path below.
    if (originalTransactionId) {
      const adminLookupClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: existing, error: dupErr } = await adminLookupClient
        .from('subscriptions')
        .select('user_id')
        .eq('original_transaction_id', originalTransactionId)
        .neq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (dupErr) {
        // Fail-closed on lookup failure — it's safer to reject than to
        // silently grant duplicate entitlements while the dedup check is
        // unavailable.
        console.error(
          '[validate-purchase] dedup lookup failed for txn',
          originalTransactionId,
          dupErr,
        );
        // Verified but not granted: the customer has paid and has nothing.
        // This is the row the reconciliation sweep looks for.
        await logStage(logClient, {
          userId: user.id,
          platform: body.platform,
          productId: body.productId,
          stage: 'grant_failed',
          externalId: originalTransactionId,
          error: 'dedup lookup failed',
        });
        reportError('validate-purchase', new Error('PAID BUT NOT GRANTED: dedup lookup failed'));
        return json({ error: 'Could not validate receipt; please try again' }, 503);
      }
      if (existing) {
        console.warn(
          '[validate-purchase] receipt already bound to another user',
          { txn: originalTransactionId, otherUser: existing.user_id, claimingUser: user.id },
        );
        return json(
          { error: 'This purchase is already linked to another account. Contact support.' },
          409,
        );
      }
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

    // 2026-05-17 IAP P1 fix: write Google purchaseTokens into a
    // dedicated `purchase_token` column (added in migration
    // 20260517000001) so google-rtdn can do a clean indexed lookup
    // without colliding on the first-500-chars-of-receipt_data
    // legacy path. iOS keeps writing the full base64 receipt into
    // receipt_data — that field's no longer used as a lookup key.
    const subRow: Record<string, unknown> = {
      user_id: user.id,
      product_id: body.productId,
      tier,
      platform: body.platform,
      expires_at: expiresAt,
      is_active: true,
      last_validated_at: new Date().toISOString(),
      receipt_data: body.receipt.substring(0, 500),
      original_transaction_id: originalTransactionId,
    };
    if (body.platform === 'android') {
      subRow.purchase_token = body.receipt;
    }

    // ── Crossgrade fix (P1 revenue) ──
    // iOS reuses the SAME original_transaction_id across every product in a
    // subscription group. A Plus→Pro upgrade therefore arrives with
    // productId=peptalk_pro_* but the SAME original_transaction_id as the
    // user's existing Plus row. The upsert below keys on (user_id,
    // product_id), so for a never-seen (user, pro) pair it does an INSERT —
    // which collides with the GLOBAL partial unique index
    // `subscriptions_original_transaction_id_unique` (one otxid → one row).
    // That 23505 used to bubble up as a 500, so the client kept tier='plus'
    // even though Apple charged the user for Pro. Free the otxid from the
    // superseded sibling row (same user + same otxid, different product)
    // first: deactivate it and clear its original_transaction_id so the
    // index no longer holds the value. The new Pro row then claims the otxid
    // cleanly, and client tier resolution (most-recent ACTIVE row wins, Pro
    // outranks Plus) lands the user on Pro.
    if (originalTransactionId) {
      const { error: freeErr } = await adminClient
        .from('subscriptions')
        .update({ is_active: false, original_transaction_id: null })
        .eq('user_id', user.id)
        .eq('original_transaction_id', originalTransactionId)
        .neq('product_id', body.productId);
      if (freeErr) {
        console.error(
          `[validate-purchase] CRITICAL: could not free original_transaction_id from superseded row for user ${user.id}:`,
          freeErr,
        );
        // Verified but not granted: the customer has paid and has nothing.
        // This is the row the reconciliation sweep looks for.
        await logStage(logClient, {
          userId: user.id,
          platform: body.platform,
          productId: body.productId,
          stage: 'grant_failed',
          externalId: originalTransactionId,
          error: 'subscriptions upsert failed',
        });
        reportError('validate-purchase', new Error('PAID BUT NOT GRANTED: subscriptions upsert failed'));
        return json({ error: 'Could not record subscription' }, 500);
      }
    }

    const { error: subErr } = await adminClient
      .from('subscriptions')
      .upsert(subRow, { onConflict: 'user_id,product_id' });

    if (subErr) {
      console.error(
        `[validate-purchase] CRITICAL: subscriptions upsert failed for user ${user.id}:`,
        subErr,
      );
      // Fail the validation so the client doesn't think it succeeded —
      // it can retry, and user isn't charged twice (receipt replay is idempotent).
      // Verified but not granted: the customer has paid and has nothing.
      // This is the row the reconciliation sweep looks for.
      await logStage(logClient, {
        userId: user.id,
        platform: body.platform,
        productId: body.productId,
        stage: 'grant_failed',
        externalId: originalTransactionId,
        error: 'subscriptions upsert failed',
      });
      reportError('validate-purchase', new Error('PAID BUT NOT GRANTED: subscriptions upsert failed'));
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

    // Log the initial-purchase event to the audit table alongside the
    // renewals/refunds/cancels that come via apple-notifications +
    // google-rtdn. Without this, the events table only captures the
    // lifecycle events AFTER the first purchase and ops can't trace a
    // "where did this subscription come from?" question end-to-end.
    //
    // Best-effort: a failure here doesn't affect entitlement (the
    // subscriptions row is already correct) — just log and continue.
    // External event id MUST be stable so retries dedupe via the
    // `UNIQUE (platform, external_event_id)` constraint. Earlier this
    // baked Date.now() into the id — every re-validation (which the
    // client runs on every cold boot via syncFromServer) created a
    // fresh row, triggered notify_crm_fanout to fire the
    // `subscription.activated` webhook to Edward's CRM repeatedly for
    // the same purchase. P0 from Wave 76.10 schema audit.
    //
    // Apple: originalTransactionId is stable across renewals + the
    // entire subscription lifecycle (Apple docs guarantee this).
    // Google: orderId is unique per purchase event; for the initial
    // purchase audit we fall back to the receipt prefix only when
    // originalTransactionId is missing.
    const externalEventId =
      body.platform === 'ios'
        ? originalTransactionId
          ? `validate-ios-${originalTransactionId}`
          : `validate-ios-${user.id}-${body.productId}-receipt-${body.receipt.substring(0, 40)}`
        : originalTransactionId
          ? `validate-android-${originalTransactionId}`
          : `validate-android-${body.productId}-${body.receipt.substring(0, 40)}`;
    await adminClient
      .from('subscription_events')
      .upsert(
        {
          user_id: user.id,
          product_id: body.productId,
          platform: body.platform,
          event_type: 'initial_purchase',
          external_event_id: externalEventId,
          raw_payload: { source: 'validate-purchase', tier, expiresAt },
          expires_at: expiresAt,
        },
        { onConflict: 'platform,external_event_id', ignoreDuplicates: true },
      )
      .then(({ error }) => {
        if (error) {
          console.warn('[validate-purchase] subscription_events insert failed:', error);
        }
      });

    await logStage(logClient, {
      userId: user.id,
      platform: body.platform,
      productId: body.productId,
      stage: 'granted',
      externalId: originalTransactionId,
    });
    return json({ success: true, tier, expiresAt });
  } catch (err) {
    reportError('validate-purchase', err);
    console.error('[validate-purchase] Unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

// ---------------------------------------------------------------------------
// Apple receipt verification
// ---------------------------------------------------------------------------

// StoreKit 2 (react-native-iap v15): the iOS purchaseToken is a JWS-signed
// transaction, NOT a StoreKit 1 base64 receipt. The deprecated /verifyReceipt
// endpoint rejects a JWS, so we verify it locally against Apple's cert chain
// (verifier ported verbatim from the proven apple-notifications function).
async function verifyAppleReceiptV2(
  receipt: string,
  expectedProductId: string,
): Promise<{ valid: boolean; expiresAt: string | null; originalTransactionId: string | null }> {
  try {
    const tx: any = await verifyAppleJWS(receipt);
    if (tx?.bundleId && tx.bundleId !== BUNDLE_ID) {
      console.warn('[validate-purchase] JWS bundleId mismatch:', tx.bundleId, 'expected', BUNDLE_ID);
      return { valid: false, expiresAt: null, originalTransactionId: null };
    }
    if (tx?.productId !== expectedProductId) {
      console.warn('[validate-purchase] JWS productId mismatch: got', tx?.productId, 'expected', expectedProductId);
      return { valid: false, expiresAt: null, originalTransactionId: null };
    }
    const expiresMs = Number(tx?.expiresDate ?? 0);
    const revokedMs = Number(tx?.revocationDate ?? 0); // set on refund/revoke
    const isActive = expiresMs > Date.now() && !revokedMs;
    const originalTransactionId =
      tx?.originalTransactionId != null ? String(tx.originalTransactionId) : null;
    return {
      valid: isActive,
      expiresAt: expiresMs > 0 ? new Date(expiresMs).toISOString() : null,
      originalTransactionId,
    };
  } catch (err) {
    console.error('[validate-purchase] StoreKit 2 JWS verification failed:', (err as any)?.message ?? err);
    return { valid: false, expiresAt: null, originalTransactionId: null };
  }
}

/**
 * Verify a CONSUMABLE (credit-pack) purchase on Apple.
 *
 * Consumables differ from subscriptions in exactly the way that matters here:
 * there is no expiry, so `expiresDate > now` -- the liveness test the
 * subscription verifier uses -- would reject every valid one. What is checked
 * instead is that the transaction is authentic (same certificate-chain
 * verification, unchanged), is for OUR bundle, names the SKU the client
 * claims, and has not been refunded.
 *
 * `transactionId` (not `originalTransactionId`) is the idempotency key: each
 * consumable purchase is its own transaction, and a user may legitimately buy
 * the same pack repeatedly. Keying on originalTransactionId would silently
 * drop every repeat purchase as a duplicate.
 */
async function verifyAppleConsumable(
  receipt: string,
  expectedProductId: string,
): Promise<{ valid: boolean; transactionId: string | null }> {
  try {
    const tx: any = await verifyAppleJWS(receipt);
    if (tx?.bundleId && tx.bundleId !== BUNDLE_ID) {
      console.warn('[validate-purchase] consumable bundleId mismatch:', tx.bundleId);
      return { valid: false, transactionId: null };
    }
    if (tx?.productId !== expectedProductId) {
      console.warn(
        '[validate-purchase] consumable productId mismatch: got',
        tx?.productId,
        'expected',
        expectedProductId,
      );
      return { valid: false, transactionId: null };
    }
    // Refunded or revoked purchases must not grant credits.
    if (Number(tx?.revocationDate ?? 0) > 0) {
      console.warn('[validate-purchase] consumable was revoked/refunded');
      return { valid: false, transactionId: null };
    }
    const transactionId = tx?.transactionId != null ? String(tx.transactionId) : null;
    if (!transactionId) {
      // Without a transaction id there is no idempotency key, and a retry
      // would grant a second time. Refuse rather than risk double-granting.
      console.error('[validate-purchase] consumable has no transactionId');
      return { valid: false, transactionId: null };
    }
    return { valid: true, transactionId };
  } catch (err) {
    console.error('[validate-purchase] consumable JWS verification failed:', (err as any)?.message ?? err);
    return { valid: false, transactionId: null };
  }
}

/**
 * Verify a CONSUMABLE (credit-pack) purchase on Google Play.
 *
 * A DIFFERENT ENDPOINT from subscriptions: `purchases/products/...` rather
 * than `purchases/subscriptions/...`. Calling the subscription endpoint with a
 * one-time product token returns 404, which would read as "invalid purchase"
 * for a customer who genuinely paid.
 *
 * purchaseState: 0 = Purchased, 1 = Canceled, 2 = Pending. Only 0 grants --
 * Pending means a deferred payment method has not settled yet, and granting on
 * it hands out credits for money that may never arrive.
 */
async function verifyGoogleConsumable(
  productId: string,
  purchaseToken: string,
): Promise<{ valid: boolean; transactionId: string | null }> {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.error('[validate-purchase] GOOGLE_SERVICE_ACCOUNT_JSON not set');
    return { valid: false, transactionId: null };
  }
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return { valid: false, transactionId: null };

    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${ANDROID_PACKAGE_NAME}/purchases/products/${productId}/tokens/` +
      `${encodeURIComponent(purchaseToken)}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      console.error('[validate-purchase] Google product API error:', res.status, await res.text());
      return { valid: false, transactionId: null };
    }
    const data = await res.json();
    if (data.purchaseState !== 0) {
      console.warn('[validate-purchase] consumable purchaseState not Purchased:', data.purchaseState);
      return { valid: false, transactionId: null };
    }
    // The purchase token is unique per purchase and is what Google itself
    // dedupes on, so it is the safest idempotency key. orderId is used when
    // present because it is the identifier that appears on the payout report.
    const transactionId =
      typeof data.orderId === 'string' && data.orderId ? data.orderId : purchaseToken;

    // Acknowledge within 3 days or Play auto-refunds. Non-fatal: the customer
    // has paid, so a failed acknowledge must not withhold their credits.
    if (data.acknowledgementState === 0) {
      await acknowledgeGoogleProduct(productId, purchaseToken, accessToken).catch((err) => {
        console.warn('[validate-purchase] Google product acknowledge failed (non-fatal):', err);
      });
    }
    return { valid: true, transactionId };
  } catch (err) {
    console.error('[validate-purchase] Google consumable verify threw:', err);
    return { valid: false, transactionId: null };
  }
}

/** products.acknowledge -- the one-time-purchase counterpart of the
 *  subscription acknowledge below. Different URL; same 3-day deadline. */
async function acknowledgeGoogleProduct(
  productId: string,
  purchaseToken: string,
  accessToken: string,
): Promise<void> {
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${ANDROID_PACKAGE_NAME}/purchases/products/${productId}/tokens/` +
    `${encodeURIComponent(purchaseToken)}:acknowledge`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    throw new Error(`acknowledge product ${res.status}: ${await res.text()}`);
  }
}

// --- StoreKit 2 JWS verifier (ported from apple-notifications/index.ts) ------
async function verifyAppleJWS(jws: string): Promise<any> {
  const header = decodeProtectedHeader(jws) as any;
  const x5c: string[] | undefined = header?.x5c;
  if (!x5c || x5c.length === 0) throw new Error('JWS missing x5c header');
  await assertChainRootedAtApple(x5c);
  await verifyX509Chain(x5c);
  const leafPem =
    '-----BEGIN CERTIFICATE-----\n' +
    x5c[0].replace(/(.{64})/g, '$1\n') +
    '\n-----END CERTIFICATE-----';
  const key = await importX509(leafPem, header.alg ?? 'ES256');
  const { payload } = await compactVerify(jws, key);
  return JSON.parse(new TextDecoder().decode(payload));
}

// SHA-256 fingerprint of Apple Root CA - G3 — pinned so a rotated/different
// root is rejected. Source: apple.com/certificateauthority/AppleRootCA-G3.cer
const APPLE_ROOT_G3_SHA256 =
  '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function assertChainRootedAtApple(x5c: string[]): Promise<void> {
  if (x5c.length < 2) throw new Error('JWS x5c chain must include leaf + intermediate + root');
  const rootHash = await sha256Hex(base64ToBytes(x5c[x5c.length - 1]));
  if (rootHash !== APPLE_ROOT_G3_SHA256) {
    throw new Error(`Untrusted root cert in x5c chain (sha256=${rootHash})`);
  }
}

async function verifyX509Chain(x5c: string[]): Promise<void> {
  const certs = x5c.map((b64) => new X509Certificate(base64ToBytes(b64)));
  const now = new Date();
  for (let i = 0; i < certs.length; i++) {
    const cert = certs[i];
    if (now < cert.notBefore || now > cert.notAfter) {
      throw new Error(`Cert ${i} (${cert.subject}) outside validity window`);
    }
    const issuer = certs[i + 1] ?? certs[i];
    const ok = await cert.verify({ publicKey: issuer.publicKey });
    if (!ok) throw new Error(`Cert ${i} (${cert.subject}) signature does not verify`);
  }
}

// (Legacy StoreKit 1 verifier — retained, no longer the active path.)
async function verifyAppleReceipt(
  receipt: string,
  expectedProductId: string,
): Promise<{ valid: boolean; expiresAt: string | null; originalTransactionId: string | null }> {
  // Try production first, fall back to sandbox if Apple responds with 21007.
  // 2026-05-17 security fix: track which environment validated so we can
  // reject sandbox receipts in a production app. Without this, anyone with
  // a sandbox-signed receipt (TestFlight build, jailbroken device, sandbox
  // tester) can self-grant Pro tier in the released app.
  let res = await postAppleReceipt(APPLE_PROD_URL, receipt);
  let validatedEnvironment: 'Production' | 'Sandbox' = 'Production';
  if (res.status === 21007) {
    res = await postAppleReceipt(APPLE_SANDBOX_URL, receipt);
    validatedEnvironment = 'Sandbox';
  }

  if (res.status !== 0) {
    return { valid: false, expiresAt: null, originalTransactionId: null };
  }

  // Do NOT blanket-reject sandbox receipts in prod. Apple App Review purchases
  // with a SANDBOX Apple ID even against the production binary, so rejecting
  // sandbox here turns the reviewer's Subscribe into a no-op and re-triggers
  // the Guideline 2.1a rejection. Self-grant abuse (replaying a sandbox
  // receipt) is bounded by the original_transaction_id dedup downstream — that
  // is the real guard, not a blanket environment reject. We still record which
  // environment validated so abuse can be monitored.
  const receiptEnv = (res.environment ?? validatedEnvironment) as string;
  if (receiptEnv === 'Sandbox') {
    console.warn('[validate-purchase] accepting sandbox receipt (App Review / testing path)');
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
    return { valid: false, expiresAt: null, originalTransactionId: null };
  }

  const expiresMs = parseInt(match.expires_date_ms ?? '0', 10);
  // Apple cancellation_date_ms is set when the user cancels mid-period OR
  // Apple revokes the purchase. Treat either as invalid even if the
  // subscription window hasn't yet elapsed.
  const cancelledMs = parseInt(match.cancellation_date_ms ?? '0', 10);
  const isActive = expiresMs > Date.now() && cancelledMs === 0;

  // original_transaction_id is stable across renewals — that's the natural
  // dedup key. transaction_id changes per renewal; don't use it.
  const originalTransactionId =
    typeof match.original_transaction_id === 'string'
      ? match.original_transaction_id
      : null;

  return {
    valid: isActive,
    expiresAt: expiresMs > 0 ? new Date(expiresMs).toISOString() : null,
    originalTransactionId,
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
): Promise<{ valid: boolean; expiresAt: string | null; originalTransactionId: string | null }> {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.error('[validate-purchase] GOOGLE_SERVICE_ACCOUNT_JSON not set');
    return { valid: false, expiresAt: null, originalTransactionId: null };
  }

  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return { valid: false, expiresAt: null, originalTransactionId: null };

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${encodeURIComponent(purchaseToken)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[validate-purchase] Google API error:', res.status, err);
      return { valid: false, expiresAt: null, originalTransactionId: null };
    }

    const data = await res.json();
    // Google returns expiryTimeMillis as a string.
    // paymentState: 0=pending, 1=received, 2=free trial, 3=pending deferred
    // upgrade/downgrade. Accept 1 and 2 as paid/valid.
    const expiresMs = parseInt(data.expiryTimeMillis ?? '0', 10);
    const paymentState = data.paymentState;
    const paid = paymentState === 1 || paymentState === 2;
    const isActive = expiresMs > Date.now() && paid;
    // orderId is the per-purchase identifier on Google. Stable across renewals
    // (renewals get a `..0` `..1` suffix on the base orderId — strip it for
    // dedup so all renewals of the same subscription map to one key).
    const orderId =
      typeof data.orderId === 'string'
        ? data.orderId.split('..')[0]
        : null;

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
      originalTransactionId: orderId,
    };
  } catch (err) {
    console.error('[validate-purchase] Google verify threw:', err);
    return { valid: false, expiresAt: null, originalTransactionId: null };
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

/**
 * Verify and grant a credit-pack (consumable) purchase.
 *
 * The grant itself is idempotent in the DATABASE -- `grant_ai_credits` keys on
 * (source, external_id) with a unique constraint -- which matters because
 * clients retry. StoreKit in particular re-delivers unfinished transactions on
 * every app launch, so this endpoint WILL be called repeatedly with the same
 * transaction, and it has to be safe rather than merely unlikely to collide.
 *
 * A duplicate is reported as success. The client's job on success is to finish
 * / consume the transaction; returning an error for a replay would leave that
 * transaction unfinished forever and re-deliver it on every launch.
 */
async function handleCreditPack(
  userId: string,
  body: ValidateBody,
): Promise<Response> {
  const pack = packForProduct(body.productId);
  if (!pack) {
    // Unreachable via isCreditPack, but never grant on an unknown SKU.
    return json({ error: `Unknown credit pack: ${body.productId}` }, 400);
  }

  const result =
    body.platform === 'ios'
      ? await verifyAppleConsumable(body.receipt, body.productId)
      : await verifyGoogleConsumable(body.productId, body.receipt);

  if (!result.valid || !result.transactionId) {
    return json({ error: 'Purchase could not be verified' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const source = body.platform === 'ios' ? 'apple' : 'google';

  // Cross-user replay: the same store transaction must never fund two
  // accounts. The unique constraint stops a second GRANT, but it would
  // silently attribute the replay to whoever called first, so this is checked
  // explicitly and refused loudly.
  const { data: priorGrant } = await admin
    .from('ai_credit_grants')
    .select('user_id')
    .eq('source', source)
    .eq('external_id', result.transactionId)
    .maybeSingle();
  if (priorGrant && priorGrant.user_id !== userId) {
    console.error(
      `[validate-purchase] credit transaction ${result.transactionId} already bound to another user`,
    );
    return json({ error: 'This purchase is already linked to another account' }, 409);
  }

  const { data, error } = await admin.rpc('grant_ai_credits', {
    p_user_id: userId,
    p_source: source,
    p_external_id: result.transactionId,
    p_product_id: body.productId,
    p_microcents: pack.creditCents * 1_000_000,
    p_price_cents: pack.priceCents,
  });

  if (error) {
    console.error('[validate-purchase] CRITICAL grant_ai_credits failed:', error);
    reportError('validate-purchase', error);
    // 500 so the client retries: the customer has paid and the grant is
    // idempotent, so retrying is safe and dropping it is not.
    return json({ error: 'Could not apply credits, please retry' }, 500);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const balanceMC = Number(row?.balance_microcents ?? 0);
  const wasDuplicate = row?.was_duplicate === true;
  if (wasDuplicate) {
    console.log(`[validate-purchase] replay of credit tx ${result.transactionId} — no double grant`);
  }

  return json({
    success: true,
    productId: body.productId,
    creditsAddedCents: wasDuplicate ? 0 : pack.creditCents,
    balanceCents: Math.round(balanceMC / 1_000_000),
    duplicate: wasDuplicate,
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
