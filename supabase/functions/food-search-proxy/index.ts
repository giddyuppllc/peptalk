/**
 * Food Search Proxy — Supabase Edge Function
 *
 * Server-side proxy for the third-party food APIs that require paid /
 * rate-limited keys (USDA FoodData Central, Spoonacular, CalorieNinjas).
 *
 * Why this exists (P3 security): the client used to read
 * EXPO_PUBLIC_USDA_API_KEY / EXPO_PUBLIC_SPOONACULAR_API_KEY /
 * EXPO_PUBLIC_CALORIENINJAS_API_KEY and call the vendors directly.
 * EXPO_PUBLIC_* vars are inlined into the shipped JS bundle, so those
 * keys were extractable from any installed app. The keys now live only
 * here, as server-side secrets, and the client calls this function.
 *
 * The function returns the vendor's response body UNCHANGED so the
 * client's existing parsing (`data.foods`, `data.results`, `data.items`)
 * is untouched. On any failure (missing key, vendor error, network) it
 * returns `{ unavailable: true }` so the client gracefully skips that
 * provider.
 *
 * Auth: validates the Supabase JWT (rejects anon), mirroring food-scan.
 * Any signed-in user may use it (food search is free across tiers).
 *
 * Required secrets:
 *   USDA_API_KEY            (USDA FoodData Central; falls back to DEMO_KEY)
 *   SPOONACULAR_API_KEY     (Spoonacular)
 *   CALORIENINJAS_API_KEY   (CalorieNinjas)
 *
 * Deploy: supabase functions deploy food-search-proxy
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Server-side vendor keys (NOT EXPO_PUBLIC — never shipped to the client).
const USDA_API_KEY = Deno.env.get('USDA_API_KEY') ?? 'DEMO_KEY';
const SPOONACULAR_API_KEY = Deno.env.get('SPOONACULAR_API_KEY') ?? '';
const CALORIENINJAS_API_KEY = Deno.env.get('CALORIENINJAS_API_KEY') ?? '';

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';
const SPOONACULAR_BASE = 'https://api.spoonacular.com';
const CALORIENINJAS_BASE = 'https://api.calorieninjas.com/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Graceful "skip this provider" signal the client expects. */
function unavailable(): Response {
  return json({ unavailable: true });
}

type Provider = 'usda' | 'spoonacular' | 'calorieninjas';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Validate auth (reject anon) — same pattern as food-scan.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing auth token' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ error: 'Invalid auth token' }, 401);
    }

    // 2. Parse request.
    const body = await req.json().catch(() => ({}));
    const provider = body?.provider as Provider | undefined;
    const query = typeof body?.query === 'string' ? body.query.trim() : '';

    if (!provider || !query) {
      return json({ error: 'provider and query are required' }, 400);
    }

    // 3. Build + issue the vendor call. We return the vendor's JSON body
    //    unchanged so the client's downstream parsing is identical to
    //    when it called the vendor directly.
    try {
      if (provider === 'usda') {
        const pageSize = clampInt(body?.pageSize, 1, 50, 25);
        const dataType = typeof body?.dataType === 'string' && body.dataType
          ? body.dataType
          : 'Foundation,SR Legacy,Branded';
        const url = `${USDA_BASE}/foods/search?query=${encodeURIComponent(query)}`
          + `&pageSize=${pageSize}`
          + `&api_key=${encodeURIComponent(USDA_API_KEY)}`
          + `&dataType=${encodeURIComponent(dataType)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return unavailable();
        return json(await res.json());
      }

      if (provider === 'spoonacular') {
        if (!SPOONACULAR_API_KEY) return unavailable();
        const number = clampInt(body?.number, 1, 25, 1);
        const url = `${SPOONACULAR_BASE}/food/ingredients/search?query=${encodeURIComponent(query)}`
          + `&number=${number}`
          + `&apiKey=${encodeURIComponent(SPOONACULAR_API_KEY)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return unavailable();
        return json(await res.json());
      }

      if (provider === 'calorieninjas') {
        if (!CALORIENINJAS_API_KEY) return unavailable();
        const url = `${CALORIENINJAS_BASE}/nutrition?query=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          headers: { 'X-Api-Key': CALORIENINJAS_API_KEY },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return unavailable();
        return json(await res.json());
      }

      return json({ error: 'Unknown provider' }, 400);
    } catch (err) {
      // Network / timeout / vendor outage — tell the client to skip this
      // provider rather than surface a hard error.
      console.error('[food-search-proxy] vendor call failed:', err);
      return unavailable();
    }
  } catch (error) {
    console.error('[food-search-proxy] Error:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
