/**
 * aimee-lab-interpret — deep AI interpretation of a user's lab panel.
 *
 * Takes the user's existing lab results (already extracted, stored in
 * useLabResultsStore on the client) + their active peptide stack + a
 * minimal demographic context, and returns a structured markdown
 * interpretation:
 *
 *   1. Headline assessment ("3 markers out of range")
 *   2. Cross-panel patterns (e.g. metabolic, lipid, hormonal)
 *   3. Peptide-specific call-outs (e.g. "GLP-1 users — your HbA1c
 *      drop is consistent with semaglutide effects")
 *   4. Suggested follow-up labs / actions
 *   5. Top-of-mind disclaimer
 *
 * Pro tier only. Beta-tester allowlist mirrors other AI fns.
 *
 * Body: { results, drawDate?, activePeptides?, profile? }
 *   - results: Array<{ markerId, value, unit, date }>
 *   - activePeptides: string[] (peptide ids from the user's active stack)
 *   - profile: { age?, biologicalSex?, primaryGoals?: string[] }
 *
 * Reply: { markdown: string }
 *
 * Deploy: supabase functions deploy aimee-lab-interpret
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.x.ai/v1';
const MODEL = 'grok-4-1-fast-reasoning';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BETA_TESTER_EMAILS = new Set<string>(
  (Deno.env.get('BETA_TESTER_EMAILS') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

const SYSTEM_PROMPT = `You are a clinical lab interpretation assistant for a peptide / nutrition app called PepTalk. You produce concise, plain-language, **markdown-formatted** interpretations of a user's lab panel.

Your output MUST follow this structure exactly:

## At a glance
A 1-2 sentence headline. State how many values are out of reference range, and the most actionable single takeaway.

## Patterns
2-4 bullet points calling out **cross-marker patterns**. Examples:
- High LDL paired with high apoB and high Lp(a) → atherogenic lipoprotein pattern
- Low free T with elevated SHBG → check binding-protein-driven low free T
- High HbA1c with normal fasting glucose → postprandial dysregulation likely
- Elevated hsCRP with otherwise clean panel → systemic inflammation flag
Only mention patterns the data actually supports.

## Peptide-specific notes
If the user has active peptides, call out lab-relevant interactions. Examples:
- GLP-1 (semaglutide / tirzepatide / retatrutide) → expect HbA1c, fasting glucose, and triglycerides to drop; LDL effect modest. Watch for B12 dropping over long use.
- BPC-157 / TB-500 → no expected lab changes; if hsCRP changes, look at training load not the peptide.
- Tesamorelin → expect IGF-1 to rise modestly, fasting glucose may rise mildly.
- Ipamorelin / CJC-1295 → IGF-1 can rise; minimal glucose effect.
- HCG → expect total T and estradiol to rise, prolactin can rise.
If they have no active peptides, replace this section with: "_No active peptides to factor in._"

## Follow-up suggestions
2-4 specific actionable items. Things like:
- "Re-check Lp(a) once — it's largely genetic, no point measuring twice unless you're starting therapy"
- "Add ApoB to your next draw if you can — it's a better atherogenic marker than LDL alone"
- "Next draw: 6-8 weeks after a lifestyle/peptide change so trends are interpretable"

## Disclaimer
Always end with this exact text:
> This is an educational summary, not medical advice. Discuss interpretation and any decisions with your provider.

CRITICAL RULES:
- Plain language, no medical jargon without explanation.
- Numbers must match what's in the input — never invent values.
- Don't recommend specific peptide doses or new medications.
- Keep total length under 500 words.
- Markdown only — no HTML, no code blocks except where you'd format a value.
- Be honest if the panel is too sparse: "Only 3 markers logged — interpretation is limited."`;

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
    if (!authHeader) return jsonResp({ error: 'Missing auth token' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return jsonResp({ error: 'Invalid auth token' }, 401);

    // Pro-tier gate.
    const isBetaTester = !!user.email && BETA_TESTER_EMAILS.has(user.email.toLowerCase());
    const { data: profile } = await supabase
      .from('profiles').select('subscription_tier').eq('id', user.id).single();
    const effectiveTier = isBetaTester ? 'pro' : (profile?.subscription_tier ?? 'free');
    if (effectiveTier !== 'pro') {
      return jsonResp({
        error: 'Lab interpretation requires PepTalk Pro.',
        upgrade: true,
      }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const results = Array.isArray(body?.results) ? body.results : [];
    if (results.length === 0) {
      return jsonResp({ error: 'No lab results to interpret.' }, 400);
    }

    const activePeptides: string[] = Array.isArray(body?.activePeptides)
      ? body.activePeptides.filter((p: unknown): p is string => typeof p === 'string')
      : [];

    const userProfile = (body?.profile && typeof body.profile === 'object') ? body.profile : {};

    if (!OPENAI_API_KEY) {
      return jsonResp({ error: 'AI service not configured' }, 500);
    }

    // Build the user message — feed structured data the model can read
    // without us pre-interpreting it. Keep it compact.
    const compactResults = results
      .map((r: any) => ({
        marker: String(r.markerId ?? ''),
        value: typeof r.value === 'number' ? r.value : Number(r.value),
        unit: String(r.unit ?? ''),
        date: typeof r.date === 'string' ? r.date : '',
      }))
      .filter((r: { marker: string }) => r.marker);

    const userMessage = [
      `Lab results to interpret (JSON):`,
      JSON.stringify(compactResults),
      ``,
      `Active peptides (ids):`,
      JSON.stringify(activePeptides),
      ``,
      `User profile:`,
      JSON.stringify({
        age: typeof userProfile.age === 'number' ? userProfile.age : undefined,
        biologicalSex: userProfile.biologicalSex,
        primaryGoals: Array.isArray(userProfile.primaryGoals) ? userProfile.primaryGoals : undefined,
      }),
    ].join('\n');

    const aiRes = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 1200,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error('[aimee-lab-interpret] AI error:', err);
      return jsonResp({ error: 'Lab interpretation temporarily unavailable.' }, 502);
    }

    const completion = await aiRes.json();
    const markdown: string = completion.choices?.[0]?.message?.content ?? '';
    if (!markdown.trim()) {
      return jsonResp({ error: 'Empty response from AI service.' }, 502);
    }

    return jsonResp({ markdown });
  } catch (err) {
    console.error('[aimee-lab-interpret]', err);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
