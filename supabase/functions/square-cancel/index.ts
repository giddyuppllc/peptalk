/**
 * square-cancel — lets a WEB (Square) subscriber cancel from the PWA.
 *
 * Web subscribers had no way to cancel: on web, "Manage Subscription" opened
 * Google Play (the code treated every non-iOS platform as Android) and the
 * paywall told them to cancel in their Apple ID. A customer who cannot cancel
 * disputes the charge instead.
 *
 * Cancels at the END of the paid period (Square's default): access continues
 * until the charged-through date, then square-webhook's subscription.updated
 * (CANCELED) ends it. Nothing is refunded here.
 *
 * Only the caller's own web subscriptions are touched — the user comes from
 * the JWT, never from the request body.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { reportError } from '../_shared/sentry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SQUARE_ACCESS_TOKEN = Deno.env.get('SQUARE_ACCESS_TOKEN') ?? '';
const SQUARE_ENV = Deno.env.get('SQUARE_ENV') ?? 'sandbox';
const SQUARE_BASE =
  SQUARE_ENV === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (!SQUARE_ACCESS_TOKEN) return json({ error: 'Square is not configured.' }, 503);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: rows, error } = await admin
      .from('subscriptions')
      .select('id, product_id, original_transaction_id, expires_at')
      .eq('user_id', user.id)
      .eq('platform', 'web')
      .eq('is_active', true)
      .not('original_transaction_id', 'is', null);
    if (error) return json({ error: 'Could not look up your subscription.' }, 500);
    if (!rows?.length) return json({ error: 'No active web subscription to cancel.' }, 404);

    const results: { productId: string; canceledDate: string | null; ok: boolean }[] = [];
    for (const row of rows as { product_id: string; original_transaction_id: string }[]) {
      const res = await fetch(
        `${SQUARE_BASE}/v2/subscriptions/${encodeURIComponent(row.original_transaction_id)}/cancel`,
        {
          method: 'POST',
          headers: {
            'Square-Version': '2024-07-17',
            Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[square-cancel] cancel failed', row.original_transaction_id, JSON.stringify(data));
      }
      results.push({
        productId: row.product_id,
        ok: res.ok,
        canceledDate: data?.subscription?.canceled_date ?? null,
      });
    }
    // The paid period is kept; square-webhook ends access on the CANCELED event.
    if (results.every((r) => !r.ok)) return json({ error: 'Square could not cancel the subscription. Please contact support.' }, 502);
    return json({ ok: true, results });
  } catch (e) {
    reportError('square-cancel', e);
    return json({ error: 'Something went wrong.' }, 500);
  }
});
