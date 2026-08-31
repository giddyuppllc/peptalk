// RECOVERED FROM PRODUCTION — not the original source.
//
// `aimee-usage` (deployed version 3) is live on the PepTalk Supabase project and has
// NO source anywhere in this repo. Nobody could review it, diff it, or redeploy
// it; if it were deleted or needed a change it was gone.
//
// This was pulled back out of the deployed bundle on 2026-08-31 via
// `GET /v1/projects/{ref}/functions/aimee-usage/body`, which returns an ESZIP
// archive, and extracted from it.
//
// WHAT THIS IS AND IS NOT:
//   - It is the deployed module, faithfully: comments survived, logic intact,
//     brace-balanced, ends at the serve() handler.
//   - It is TRANSPILED. TypeScript annotations were stripped by the build, so
//     this is not byte-identical to whatever was written originally, and
//     formatting has been normalised.
//
// It lives under `_recovered/` ON PURPOSE. Directories starting with `_` are not
// treated as functions, so nothing here is in the deploy path — `supabase
// functions deploy` cannot pick it up and push a reconstruction over working
// production code.
//
// To adopt it: read it, restore the types, move it to
// `supabase/functions/aimee-usage/index.ts`, and only then deploy.

/**
 * aimee-usage — how much of this month's AI allowance the caller has used.
 *
 * WHY A FUNCTION AND NOT A DIRECT TABLE READ
 * The client CAN already read its own spend: `aimee_cost_cents` has a
 * "Read own aimee spend" RLS policy. What it cannot read is the ALLOWANCE —
 * that comes from AIMEE_MONTHLY_CENTS_PLUS / _PRO in the edge environment.
 *
 * Hardcoding those numbers in the app would work until the day someone raises
 * a limit and the app kept showing the old one — a usage meter that lies is
 * worse than no meter, because people plan around it. So the allowance is
 * reported by the same code that enforces it.
 *
 * The tier is resolved SERVER-side for the same reason it is in the chat
 * function: it decides how much may be spent, so it can never come from the
 * client.
 *
 * Read-only. Records nothing, charges nothing, and changes no state.
 */ import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkCostCap, readCreditBalance } from '../aimee-chat-stream/_cost.ts';
import { resolveEffectiveTier } from '../_shared/effectiveTier.ts';
import { reportError } from '../_shared/sentry.ts';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};
/**
 * Mirrors RATE_LIMITS in aimee-chat-stream/index.ts. Kept in sync by
 * src/lib/__tests__/aimeeFreeTier.test.ts — a meter that disagrees with the
 * gate is worse than no meter, because people plan around it.
 */ const MESSAGE_LIMITS = {
  free: 3,
  plus: 750,
  pro: 9000
};
const json = (b, status = 200)=>new Response(JSON.stringify(b), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({
      error: 'Unauthorized'
    }, 401);
    const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const { data: { user }, error: authErr } = await authed.auth.getUser();
    if (authErr || !user) return json({
      error: 'Unauthorized'
    }, 401);
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: profile } = await admin.from('profiles').select('subscription_tier').eq('id', user.id).maybeSingle();
    const tier = await resolveEffectiveTier(admin, user.id, {
      profileTier: profile?.subscription_tier
    });
    // Reuses the ENFORCING code path, so the meter can never disagree with the
    // gate. A separate calculation here would drift the first time either
    // changed.
    const cost = await checkCostCap(admin, user.id, tier);
    if (cost.reason === 'ledger_unreachable') {
      // Say so rather than reporting zero used, which would read as "plenty
      // left" at exactly the moment we cannot tell.
      return json({
        error: 'usage_unavailable'
      }, 503);
    }
    // Message count for the same monthly bucket the chat gate uses.
    // Deliberately a SELECT, never the bump_ai_usage RPC: that RPC INCREMENTS,
    // so metering through it would spend one of the user's messages every time
    // they merely looked at the meter. The tier cap lives in the chat function,
    // so it is mirrored here — kept honest by a test that reads both files.
    const period = `${new Date().toISOString().slice(0, 7)}-01`;
    const { data: usageRow } = await admin.from('ai_usage_log').select('count').eq('user_id', user.id).eq('function_name', 'aimee-chat-stream').eq('date', period).maybeSingle();
    const messagesUsed = usageRow?.count ?? 0;
    const messageLimit = MESSAGE_LIMITS[tier] ?? 0;
    // Purchased credits, shown alongside the plan allowance. A user who bought
    // a pack needs to see it land, and needs to see it draw down -- credits
    // that are invisible are indistinguishable from credits that were never
    // granted.
    const creditMC = await readCreditBalance(admin, user.id);
    const allowanceMC = cost.allowanceMC ?? 0;
    const spentMC = cost.userSpendMC ?? 0;
    const pct = allowanceMC > 0 ? Math.min(100, spentMC / allowanceMC * 100) : 0;
    // First of next month, UTC — when the allowance resets.
    const now = new Date();
    const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
    return json({
      tier,
      /** Cents, so the client never has to know about microcents. */ allowanceCents: Math.round(allowanceMC / 1_000_000),
      spentCents: Math.round(spentMC / 1_000_000),
      percentUsed: Math.round(pct),
      atLimit: cost.reason === 'user_cap_hit' || messageLimit > 0 && messagesUsed >= messageLimit,
      resetsAt,
      /**
       * Free is metered in MESSAGES, not cents — three prompts a month. A
       * percentage of a few cents means nothing to that user; "1 of 3 left"
       * does. Paid tiers report both and the client shows the cents meter.
       */ messageLimit,
      messagesUsed,
      messagesRemaining: Math.max(0, messageLimit - messagesUsed),
      /**
       * Purchased credit balance in cents, or null when it could not be read.
       * Null rather than 0 on purpose: "you have none" and "we could not tell"
       * must not look the same to someone who just paid.
       */ creditBalanceCents: creditMC === null ? null : Math.round(creditMC / 1_000_000)
    });
  } catch (err) {
    reportError('aimee-usage', err);
    console.error('[aimee-usage]', err);
    return json({
      error: 'Internal error'
    }, 500);
  }
});
