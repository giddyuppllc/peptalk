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
 * credit-autorefill-settings — read or change the caller's own auto-refill setting.
 *
 * Deliberately a SEPARATE function from `credit-autorefill`. That one moves
 * money and is gated on an internal secret; this one is user-facing and
 * authenticated as the caller. Folding a user-callable action into the
 * money-moving function would put a public entry point on the same code path
 * that charges cards.
 *
 * The only thing a user can change here is on/off. The monthly spend cap, the
 * refill counter and the decline streak are safety limits and are maintained
 * exclusively by the SECURITY DEFINER functions — a client cannot raise its own
 * ceiling.
 *
 * Auto-refill is WEB ONLY (Apple and Google require the user to confirm every
 * consumable purchase), so the client only shows this on web. The server does
 * not enforce a platform check because the setting is harmless on its own —
 * `credit-autorefill` is what would decline to act, and it only ever charges
 * through Square.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { reportError } from '../_shared/sentry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await authed.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const body = await req.json().catch(() => ({}));

    // A write only when `enabled` is explicitly a boolean; anything else is a
    // read, so a malformed body can never silently switch on card charging.
    if (typeof body?.enabled === 'boolean') {
      const { error } = await admin.rpc('set_autorefill_enabled', {
        p_user_id: user.id,
        p_enabled: body.enabled,
      });
      if (error) {
        console.error('[credit-autorefill-settings] set failed:', error);
        return json({ error: 'Could not save that setting' }, 500);
      }
    }

    const { data } = await admin
      .from('ai_credit_autorefill')
      .select('enabled, max_per_month, refills_this_period, consecutive_failures, last_refill_at, last_error')
      .eq('user_id', user.id)
      .maybeSingle();

    return json({
      // No row means never opted in, which is off.
      enabled: data?.enabled === true,
      maxPerMonth: data?.max_per_month ?? 4,
      usedThisMonth: data?.refills_this_period ?? 0,
      // Surfaced so the UI can say why it stopped rather than going quiet.
      pausedForFailures: (data?.consecutive_failures ?? 0) >= 3,
      lastRefillAt: data?.last_refill_at ?? null,
      lastError: data?.last_error ?? null,
    });
  } catch (err) {
    reportError('credit-autorefill-settings', err);
    return json({ error: 'Internal error' }, 500);
  }
});
