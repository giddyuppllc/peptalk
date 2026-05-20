/**
 * Aimee Report Rewrite — Master Refactor Plan v3.1 §9.3 final-mile.
 *
 * Takes the structured templated body produced by
 * `src/services/aimeeReports.ts` and returns the same content rewritten
 * in Aimee's warm, second-person, no-emoji voice. Keeps numbers exact,
 * keeps the recommendation, just lifts the prose so weekly reports
 * read as a real coach instead of a template assembly.
 *
 * Why a dedicated function:
 *   - Different cadence than chat (once/week per user, not interactive).
 *     Should not count against the daily chat cap.
 *   - Different prompt — rewrite-only, no tool calls.
 *
 * Tier:    Pro only.
 * Limit:   2 rewrites/day per user. Plenty for the Sunday cron plus an
 *          ad-hoc tap on the Reports surface.
 * Cost:    ~$0.0006/call → ~$0.024/year per Pro user.
 *
 * Deploy: supabase functions deploy aimee-report-rewrite
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.x.ai/v1';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'grok-4-1-fast-reasoning';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const DAILY_LIMIT = 2;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

const SYSTEM_PROMPT = `You are Aimee, the PepTalk health coach. The user pays you to be observant and concise — never breathless, never marketing-tone.

You will receive a TEMPLATED WEEKLY REPORT assembled from real data. Your job is to rewrite the BODY into Aimee's voice:

- Second person ("you"), warm but professional.
- 2–3 short paragraphs, plain prose. No bullet lists. No markdown. No emoji. No headers.
- Keep every number from the source EXACTLY — don't round, don't paraphrase numbers.
- Don't invent data points that aren't in the source.
- End with the source's recommendation sentence verbatim (or very close — only minor wording smoothing). The user expects the same action item the system surfaced.
- Length cap: 80 words across the rewrite. Trim filler ruthlessly.

Return ONLY the rewritten body as plain text. No JSON, no markdown fences.`;

async function checkRateLimit(
  supabase: any,
  userId: string,
  functionName: string,
  limit: number,
): Promise<{ allowed: boolean; limit: number; retryAfter?: number }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc('bump_ai_usage', {
      p_user_id: userId,
      p_function_name: functionName,
      p_date: today,
    });
    if (error) throw error;
    const newCount = Array.isArray(data) && data[0]
      ? (data[0] as any).count ?? 0
      : 0;
    if (newCount > limit) {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setUTCHours(24, 0, 0, 0);
      const retryAfter = Math.max(
        1,
        Math.round((tomorrow.getTime() - now.getTime()) / 1000),
      );
      return { allowed: false, limit, retryAfter };
    }
    return { allowed: true, limit };
  } catch (err) {
    console.error(`[${functionName}] rate-limit check failed; failing closed:`, err);
    return { allowed: false, limit, retryAfter: 60 };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResp({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResp({ error: 'Missing auth' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return jsonResp({ error: 'Invalid auth' }, 401);

    if (!OPENAI_API_KEY) return jsonResp({ error: 'AI service not configured' }, 500);

    // Tier check — Pro only (with beta-tester bypass for tier check only,
    // not the cap).
    const userEmail = (user.email ?? '').toLowerCase();
    const betaSet = new Set(
      (Deno.env.get('BETA_TESTER_EMAILS') ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    const isBetaTester = !!userEmail && betaSet.has(userEmail);
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, is_pro')
      .eq('id', user.id)
      .single();
    const tier = isBetaTester ? 'pro' : (profile?.subscription_tier ?? 'free');
    const isPro = tier === 'pro' || profile?.is_pro === true || isBetaTester;
    if (!isPro) {
      return jsonResp(
        { error: 'Aimee report rewrites are a PepTalk Pro feature.', upgrade: true },
        403,
      );
    }

    const rate = await checkRateLimit(supabase, user.id, 'aimee-report-rewrite', DAILY_LIMIT);
    if (!rate.allowed) {
      return jsonResp(
        {
          error: `Daily report-rewrite limit reached (${rate.limit}/day).`,
          retryAfter: rate.retryAfter,
        },
        429,
      );
    }

    const body = await req.json().catch(() => ({}));
    const templatedBody = typeof body?.body === 'string' ? body.body.slice(0, 4000) : '';
    const headline = typeof body?.headline === 'string' ? body.headline.slice(0, 200) : '';
    const recommendation =
      typeof body?.recommendation === 'string'
        ? body.recommendation.slice(0, 500)
        : '';

    if (!templatedBody) {
      return jsonResp({ error: 'body required' }, 400);
    }

    const userPrompt = [
      `HEADLINE: ${headline}`,
      '',
      'TEMPLATED BODY:',
      templatedBody,
      '',
      `RECOMMENDATION (preserve verbatim or near-verbatim at the end): ${recommendation}`,
    ].join('\n');

    const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 350,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[aimee-report-rewrite] grok err', res.status, detail);
      return jsonResp({ error: `Grok ${res.status}` }, 502);
    }
    const completion = await res.json();
    const rewritten: string =
      completion?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!rewritten) {
      return jsonResp({ error: 'Empty rewrite — keeping the templated version.' }, 502);
    }

    return jsonResp({ body: rewritten });
  } catch (err) {
    console.error('[aimee-report-rewrite] fatal', err);
    return jsonResp(
      { error: err instanceof Error ? err.message : 'rewrite error' },
      500,
    );
  }
});
