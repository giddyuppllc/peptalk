// RECOVERED ORIGINAL SOURCE — extracted 2026-09-01 from the deployed bundle.
//
// This is NOT a reconstruction. Supabase's deployed ESZIP embeds source maps
// carrying `sourcesContent` — the original TypeScript, types and comments
// intact. The extraction was validated against a control: `_shared/effectiveTier.ts`,
// which the repo already had, came back BYTE-IDENTICAL.
//
// It went missing because it was deployed from a working copy and never
// committed. See supabase/functions/_recovered/README.md.

/**
 * reconcile-purchases — find customers who paid and got nothing, and fix them.
 *
 * WHY THIS EXISTS
 * On 2026-08-22 a customer bought PepTalk Plus on Google Play. The money left
 * her account. She spent three days signing in and out, still on the free tier,
 * and then messaged us on Instagram. There was no subscription row, no
 * subscription event, and no log line — the only evidence she existed was the
 * message.
 *
 * The live purchase path is a single attempt with no second chance. If the
 * database write fails, or the function times out, or Play's notification never
 * arrives, the customer is simply stranded and nothing anywhere notices. Adding
 * a log made the failure visible; this makes it self-correcting.
 *
 * WHAT IT DOES
 * Sweeps purchase_validation_log for attempts that VERIFIED with the store but
 * never resulted in entitlement, re-checks each one against the store, and
 * grants what is owed. Verification is always re-run rather than trusted from
 * the log — a purchase can be refunded or cancelled between the original
 * attempt and the sweep, and granting on a stale record would hand out a tier
 * for money that has since been returned.
 *
 * SAFE TO RUN REPEATEDLY. Every write is an upsert keyed on
 * (user_id, product_id), so a second run over the same backlog changes
 * nothing. Run it on a schedule, run it by hand after an incident, run it
 * twice — the result is the same.
 *
 * INTERNAL ONLY. It grants paid tiers, so it is not reachable from a client.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { reportError } from '../_shared/sentry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
const ANDROID_PACKAGE_NAME =
  Deno.env.get('ANDROID_PACKAGE_NAME') ?? 'com.peptalkapp.peptalk';
const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? '';

/** Mirrors PRODUCT_TO_TIER in validate-purchase. */
const PRODUCT_TO_TIER: Record<string, 'plus' | 'pro'> = {
  peptalk_plus_monthly: 'plus',
  peptalk_plus_yearly: 'plus',
  peptalk_pro_monthly: 'pro',
  peptalk_pro_yearly: 'pro',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Service-account access token for the Play Developer API. */
async function googleToken(): Promise<string | null> {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) return null;
  try {
    const sa = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const claim = b64url(
      new TextEncoder().encode(
        JSON.stringify({
          iss: sa.client_email,
          scope: 'https://www.googleapis.com/auth/androidpublisher',
          aud: 'https://oauth2.googleapis.com/token',
          iat: now,
          exp: now + 3600,
        }),
      ),
    );
    const pem = String(sa.private_key)
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s/g, '');
    const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`)),
    );
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claim}.${b64url(sig)}`,
      }),
    });
    const j = await res.json();
    return j.access_token ?? null;
  } catch (e) {
    console.error('[reconcile] google token failed:', e);
    return null;
  }
}

/**
 * Re-check a Play subscription. Deliberately re-queries the store rather than
 * trusting the log: between the failed attempt and now, the purchase may have
 * been refunded, cancelled, or expired.
 */
async function recheckGoogle(
  productId: string,
  token: string,
  access: string,
): Promise<{ live: boolean; expiresAt: string | null; orderId: string | null; acknowledged: boolean }> {
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${ANDROID_PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${encodeURIComponent(token)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  if (!res.ok) return { live: false, expiresAt: null, orderId: null, acknowledged: false };
  const d = await res.json();
  const expiresMs = parseInt(d.expiryTimeMillis ?? '0', 10);
  const paid = d.paymentState === 1 || d.paymentState === 2;
  const live = expiresMs > Date.now() && paid;

  // Belt and braces: if it somehow reached the sweep unacknowledged, the
  // 3-day auto-refund clock is still running. Acknowledge before anything else.
  if (live && d.acknowledgementState === 0) {
    await fetch(`${url}:acknowledge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: '{}',
    }).catch((e) => console.warn('[reconcile] acknowledge failed:', e));
  }

  return {
    live,
    expiresAt: expiresMs > 0 ? new Date(expiresMs).toISOString() : null,
    orderId: typeof d.orderId === 'string' ? d.orderId.split('..')[0] : null,
    acknowledged: d.acknowledgementState === 1,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = req.headers.get('x-internal-secret') ?? '';
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return json({ error: 'Forbidden' }, 403);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';
  const summary = {
    examined: 0,
    granted: 0,
    stillOwed: 0,
    noLongerLive: 0,
    skippedNoToken: 0,
    errors: 0,
    dryRun,
  };

  try {
    // Anything that verified with the store but never reached 'granted'.
    const { data: rows, error } = await admin
      .from('purchase_validation_log')
      .select('id, user_id, platform, product_id, purchase_token, external_id, stage, created_at')
      .in('stage', ['verified', 'grant_failed'])
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      reportError('reconcile-purchases', error);
      return json({ error: 'Could not read the validation log' }, 500);
    }

    const access = await googleToken();

    for (const row of rows ?? []) {
      summary.examined += 1;
      try {
        // Already fixed by a later attempt? Then there is nothing to do.
        const { data: existing } = await admin
          .from('subscriptions')
          .select('id, is_active, expires_at')
          .eq('user_id', row.user_id)
          .eq('product_id', row.product_id)
          .maybeSingle();
        if (existing?.is_active) {
          if (!dryRun) {
            await admin
              .from('purchase_validation_log')
              .update({ stage: 'granted', updated_at: new Date().toISOString() })
              .eq('id', row.id);
          }
          continue;
        }

        if (row.platform !== 'android' || !row.purchase_token) {
          // iOS receipts are not re-checkable without the original JWS, which
          // is not stored. Those are surfaced for a human rather than guessed at.
          summary.skippedNoToken += 1;
          summary.stillOwed += 1;
          continue;
        }
        if (!access) {
          summary.errors += 1;
          continue;
        }

        const check = await recheckGoogle(row.product_id, row.purchase_token, access);
        if (!check.live) {
          // Refunded, cancelled or expired since. Nothing is owed -- and
          // granting here would give away a tier for returned money.
          summary.noLongerLive += 1;
          if (!dryRun) {
            await admin
              .from('purchase_validation_log')
              .update({ stage: 'verify_failed', error: 'no longer live at store', updated_at: new Date().toISOString() })
              .eq('id', row.id);
          }
          continue;
        }

        const tier = PRODUCT_TO_TIER[row.product_id];
        if (!tier) { summary.errors += 1; continue; }

        if (dryRun) { summary.stillOwed += 1; continue; }

        const nowIso = new Date().toISOString();
        const { error: upErr } = await admin.from('subscriptions').upsert(
          {
            user_id: row.user_id,
            product_id: row.product_id,
            tier,
            platform: 'android',
            expires_at: check.expiresAt,
            is_active: true,
            last_validated_at: nowIso,
            original_transaction_id: check.orderId,
          },
          { onConflict: 'user_id,product_id' },
        );
        if (upErr) {
          summary.errors += 1;
          reportError('reconcile-purchases', upErr);
          continue;
        }

        await admin.from('profiles').update({ subscription_tier: tier }).eq('id', row.user_id);
        await admin
          .from('purchase_validation_log')
          .update({ stage: 'granted', acknowledged: true, updated_at: nowIso })
          .eq('id', row.id);
        summary.granted += 1;
      } catch (inner) {
        summary.errors += 1;
        console.error('[reconcile] row failed:', row.id, inner);
      }
    }

    // A backlog that never empties is a broken pipeline, not a quiet week.
    if (summary.stillOwed > 0 || summary.errors > 0) {
      console.warn(`[reconcile] ${summary.stillOwed} still owed, ${summary.errors} errors`);
    }
    return json(summary);
  } catch (err) {
    reportError('reconcile-purchases', err);
    console.error('[reconcile-purchases]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
