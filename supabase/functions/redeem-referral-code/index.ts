/**
 * redeem-referral-code — applies a sales-agent referral code to the
 * authenticated user.
 *
 * Body: { code: string }
 *
 * Validates:
 *   - Code exists, is_active, not past valid_until
 *   - Code has not exceeded max_uses
 *   - User has not already redeemed any code (UNIQUE on user_id)
 *
 * On success, inserts a referral_redemptions row. Trigger fans out to
 * Edward's CRM (referral.redeemed event).
 *
 * Returns: { ok: true, discount_percent, apple_offer_code? }
 *          { ok: false, error: string }
 *
 * Reply includes apple_offer_code so the client can pass it to StoreKit
 * during the next IAP purchase — Apple validates + applies the
 * discount on its side.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CODE_REGEX = /^[A-Z0-9]{4,12}$/;

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResp({ error: 'Sign in to redeem a code.' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return jsonResp({ error: 'Invalid session.' }, 401);

    const body = await req.json().catch(() => ({}));
    const raw = String(body?.code ?? '').trim().toUpperCase();
    if (!raw) return jsonResp({ error: 'Code required.' }, 400);
    if (!CODE_REGEX.test(raw)) {
      return jsonResp({ error: 'Codes are 4-12 letters/numbers.' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check the user hasn't already redeemed.
    const { data: existing } = await admin
      .from('referral_redemptions')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing) {
      return jsonResp({ error: "You've already used a referral code on this account." }, 409);
    }

    // Look up the code.
    const { data: codeRow, error: codeErr } = await admin
      .from('referral_codes')
      .select('id, is_active, valid_until, max_uses, uses_count, discount_percent, apple_offer_code')
      .eq('code', raw)
      .maybeSingle();
    if (codeErr) {
      console.error('[redeem-referral-code] lookup failed', codeErr);
      return jsonResp({ error: 'Lookup failed.' }, 500);
    }
    if (!codeRow) return jsonResp({ error: 'Code not found.' }, 404);
    if (!codeRow.is_active) return jsonResp({ error: 'Code is no longer active.' }, 410);
    if (codeRow.valid_until && new Date(codeRow.valid_until) < new Date()) {
      return jsonResp({ error: 'Code has expired.' }, 410);
    }
    if (codeRow.max_uses && codeRow.uses_count >= codeRow.max_uses) {
      return jsonResp({ error: 'Code has reached its limit.' }, 410);
    }

    // Insert the redemption — UNIQUE(user_id) is the safety net against
    // race conditions on a fast double-tap.
    const { error: insertErr } = await admin
      .from('referral_redemptions')
      .insert({
        user_id: user.id,
        code_id: codeRow.id,
      });
    if (insertErr) {
      // 23505 = unique_violation — happens only on the double-tap race.
      if ((insertErr as any).code === '23505') {
        return jsonResp({ error: "You've already used a code." }, 409);
      }
      console.error('[redeem-referral-code] insert failed', insertErr);
      return jsonResp({ error: 'Could not save redemption.' }, 500);
    }

    return jsonResp({
      ok: true,
      discount_percent: codeRow.discount_percent,
      apple_offer_code: codeRow.apple_offer_code ?? null,
    });
  } catch (err) {
    console.error('[redeem-referral-code]', err);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
