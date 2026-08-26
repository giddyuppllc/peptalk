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
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkCostCap } from '../aimee-chat-stream/_cost.ts';
import { resolveEffectiveTier } from '../_shared/effectiveTier.ts';
import { reportError } from '../_shared/sentry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await authed.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profile } = await admin
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .maybeSingle();

    const tier = await resolveEffectiveTier(admin, user.id, {
      profileTier: profile?.subscription_tier,
    });

    // Reuses the ENFORCING code path, so the meter can never disagree with the
    // gate. A separate calculation here would drift the first time either
    // changed.
    const cost = await checkCostCap(admin, user.id, tier);

    if (cost.reason === 'ledger_unreachable') {
      // Say so rather than reporting zero used, which would read as "plenty
      // left" at exactly the moment we cannot tell.
      return json({ error: 'usage_unavailable' }, 503);
    }

    const allowanceMC = cost.allowanceMC ?? 0;
    const spentMC = cost.userSpendMC ?? 0;
    const pct = allowanceMC > 0 ? Math.min(100, (spentMC / allowanceMC) * 100) : 0;

    // First of next month, UTC — when the allowance resets.
    const now = new Date();
    const resetsAt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ).toISOString();

    return json({
      tier,
      /** Cents, so the client never has to know about microcents. */
      allowanceCents: Math.round(allowanceMC / 1_000_000),
      spentCents: Math.round(spentMC / 1_000_000),
      percentUsed: Math.round(pct),
      atLimit: cost.reason === 'user_cap_hit',
      resetsAt,
    });
  } catch (err) {
    reportError('aimee-usage', err);
    console.error('[aimee-usage]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
