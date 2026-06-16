/**
 * Aimee Workout — Supabase Edge Function
 *
 * Designs a targeted, randomized workout PROGRAM STRUCTURE following Jamie's
 * training rules (split, frequency, stacking/supersets, set/rep/tempo/rest
 * conventions). It returns a program of days→slots where each slot names a
 * muscle group + priority tier (P1–P4) + set type. The CLIENT then fills each
 * slot with a real exercise from the on-device library (src/data/jamieExercises
 * .json) — so the AI never invents an exercise, and re-generating yields a
 * fresh mix. Pro-tier gated. API key stays server-side.
 *
 * Deploy: supabase functions deploy aimee-workout
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.x.ai/v1';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'grok-4.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// --- Taxonomy the model must stay inside (mirrors src/types/fitness.ts) ----
const MUSCLES = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'core',
  'quads', 'hamstrings', 'glutes', 'calves', 'trapezius', 'cardio',
] as const;
const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;
const SET_TYPES = ['normal', 'super_set', 'super_set_2', 'drop_set', 'giant_set'] as const;

type Muscle = typeof MUSCLES[number];
type Priority = typeof PRIORITIES[number];
type SetType = typeof SET_TYPES[number];

interface Slot {
  muscle: Muscle;
  priority: Priority;
  setType: SetType;
  sets: number;
  reps: string;
  tempo?: string;
  rest?: string;
  timeSeconds?: number;
}
interface Day { name: string; slots: Slot[]; }
interface Program { label: string; days: Day[]; }

interface WorkoutBody {
  goal?: string;
  daysPerWeek?: number;
  location?: 'gym' | 'home';
  gender?: 'men' | 'women' | 'anyone';
  focusMuscles?: string[];
  /** muscle -> which priorities have ≥1 exercise given location/gender (so the model only emits fillable slots) */
  availability?: Record<string, string[]>;
  level?: 'beginner' | 'intermediate' | 'advanced';
}

// Jamie's program rules distilled into prescriptive bullets the model follows.
// (Grounded in the Core Challenge Workouts spec: P1–P4 priority tiers,
//  Static/Variable stacking, superset rounds, tempo/rest conventions.)
const PROGRAM_RULES = `PROGRAM RULES (follow strictly):
- Priority tiers: P1 = primary compound/most-used movement (anchor every day with P1 work); P2 = main accessory; P3 = secondary accessory/isolation; P4 = specialized finisher/rehab. Lead each day with P1, then descend.
- Stacking: pair exercises into supersets by giving two consecutive slots the SAME setType ("super_set", then the next slot "super_set_2"). Use supersets for accessory/finisher work, not heavy P1 compounds. "normal" = straight sets.
- Frequency / split: choose a sensible split for the requested days/week — 3d full-body or push/pull/legs; 4d upper/lower x2; 5d push/pull/legs/upper/lower or a bro-split; 6d push/pull/legs x2. Hit each major muscle 1–2x/week. Balance push vs pull.
- Targeting: bias slot muscles toward the goal (strength/hypertrophy = compounds & main muscles; weight_loss/circuit/aerobic = more cardio + supersets + higher reps; transformation/body_recomp = mix). Honor focusMuscles when provided.
- Sets/reps by goal: strength 3–5 sets, 4–6 reps; hypertrophy/transformation 3–4 sets, 8–12 reps; body_recomp 3 sets, 10–12; weight_loss/circuit 2–3 sets, 12–20 or timed; aerobic timed/AMRAP.
- Tempo "eccentric-pause-concentric" e.g. "3-1-1"; heavier work slower eccentric. Rest: strength 90–150s, hypertrophy 45–75s, circuit/weight_loss 20–45s. Use timeSeconds (not reps) for planks/holds/cardio.
- Variety: vary the muscle order and superset pairings each generation so repeat requests feel fresh ("randomized"). Do NOT repeat the exact same day structure across days.
- 4–7 slots per day. Never exceed the day count requested.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Invalid session' }, 401);

    // Pro gate — beta-tester allowlist driven by BETA_TESTER_EMAILS (CSV).
    const BETA_TESTER_EMAILS = new Set<string>(
      (Deno.env.get('BETA_TESTER_EMAILS') ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
    const isBetaTester =
      !!user.email && BETA_TESTER_EMAILS.has(user.email.toLowerCase());

    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .maybeSingle();
    const tier = isBetaTester ? 'pro' : (profile?.subscription_tier ?? 'free');
    if (tier !== 'pro') {
      return json({ error: 'Pro tier required', upgrade: true }, 403);
    }

    // Rate limit — 10 workout generations/day per user (locked, matches recipe gen).
    const rateLimit = await checkRateLimit(supabase, user.id, 'aimee-workout', 10);
    if (!rateLimit.allowed) {
      return json({
        error: `Daily workout limit reached (${rateLimit.limit}/day). Resets tomorrow.`,
        retryAfter: rateLimit.retryAfter,
      }, 429);
    }

    if (!OPENAI_API_KEY) {
      return json({ error: 'AI service not configured' }, 500);
    }

    const body: WorkoutBody = await req.json().catch(() => ({}));
    const goal = clampString(body.goal ?? 'transformation', 40);
    const daysPerWeek = Math.min(Math.max(Math.round(body.daysPerWeek ?? 4), 1), 6);
    const location = body.location === 'home' ? 'home' : 'gym';
    const gender = body.gender === 'men' || body.gender === 'women' ? body.gender : 'anyone';
    const level = body.level ?? 'intermediate';
    const focusMuscles = (body.focusMuscles ?? [])
      .filter((m): m is Muscle => (MUSCLES as readonly string[]).includes(m))
      .slice(0, 6);

    // availability map keeps the model inside what the on-device library can fill.
    const availability = sanitizeAvailability(body.availability);
    const availabilityLine = availability
      ? `Only emit (muscle, priority) slots that exist in this availability map (muscle -> available priorities):\n${JSON.stringify(availability)}`
      : `Available muscles: ${MUSCLES.join(', ')}. Priorities: ${PRIORITIES.join(', ')}.`;

    const focusLine = focusMuscles.length
      ? `The user especially wants to target: ${focusMuscles.join(', ')}. Weight the program toward these without ignoring balance.`
      : '';

    const systemPrompt = `You are Aimee, an expert strength coach. Design a ${daysPerWeek}-day/week workout PROGRAM for a "${goal}" goal, ${level} level, training at ${location === 'home' ? 'home with minimal equipment' : 'a full gym'}, suitable for ${gender === 'anyone' ? 'anyone' : gender}.

${PROGRAM_RULES}

CRITICAL: You do NOT choose specific exercises and you must NEVER name one. The
app fills every slot from its own vetted exercise library. Your job is ONLY to
choose, per slot, a muscle group + priority tier + set type + sets/reps/tempo/
rest. Do not put exercise names anywhere in the output.

${availabilityLine}
${focusLine}

Return ONLY valid JSON (no prose) shaped exactly like:
{
  "label": "short program name",
  "days": [
    {
      "name": "Day 1 — Push",
      "slots": [
        { "muscle": "chest", "priority": "P1", "setType": "normal", "sets": 4, "reps": "6-8", "tempo": "3-1-1", "rest": "90-120s" }
      ]
    }
  ]
}
Rules for the JSON:
- "muscle" MUST be one of: ${MUSCLES.join(', ')}.
- "priority" MUST be one of: ${PRIORITIES.join(', ')}.
- "setType" MUST be one of: ${SET_TYPES.join(', ')}.
- "reps" is a string (e.g. "8-12" or "AMRAP"); for timed work omit reps and set "timeSeconds" (integer seconds).
- Exactly ${daysPerWeek} day objects. 4–7 slots each. No commentary outside the JSON.`;

    const aiRes = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Build my ${daysPerWeek}-day ${goal} program. Make it feel fresh — vary exercises/order from any previous version.` },
        ],
        temperature: 0.95,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('[aimee-workout] AI call failed:', aiRes.status, errText);
      return json({ error: 'AI service failed' }, 502);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content ?? '{}';

    let parsed: { label?: string; days?: unknown };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('[aimee-workout] could not parse JSON:', content);
      return json({ error: 'AI returned malformed response' }, 502);
    }

    const program = validateProgram(parsed, daysPerWeek, goal);
    if (!program || program.days.length === 0) {
      return json({ error: 'AI returned an unusable program' }, 502);
    }

    return json({ program });
  } catch (err) {
    console.error('[aimee-workout] unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

// --- Validation: keep only slots the client can actually fill -------------
function validateProgram(raw: any, daysPerWeek: number, goal: string): Program | null {
  if (!raw || !Array.isArray(raw.days)) return null;
  const muscleSet = new Set<string>(MUSCLES);
  const prioSet = new Set<string>(PRIORITIES);
  const setTypeSet = new Set<string>(SET_TYPES);

  const days: Day[] = [];
  for (const d of raw.days.slice(0, daysPerWeek)) {
    if (!d || !Array.isArray(d.slots)) continue;
    const slots: Slot[] = [];
    for (const s of d.slots.slice(0, 8)) {
      if (!s || !muscleSet.has(s.muscle)) continue;
      const priority = prioSet.has(s.priority) ? s.priority : 'P1';
      const setType = setTypeSet.has(s.setType) ? s.setType : 'normal';
      const sets = Math.min(Math.max(Math.round(Number(s.sets) || 3), 1), 6);
      const timeSeconds = s.timeSeconds != null
        ? Math.min(Math.max(Math.round(Number(s.timeSeconds)), 5), 600)
        : undefined;
      const reps = timeSeconds ? '' : clampString(String(s.reps ?? '10-12'), 24);
      slots.push({
        muscle: s.muscle,
        priority,
        setType,
        sets,
        reps,
        tempo: s.tempo ? clampString(String(s.tempo), 16) : undefined,
        rest: s.rest ? clampString(String(s.rest), 16) : undefined,
        timeSeconds,
      });
    }
    if (slots.length > 0) {
      days.push({ name: clampString(String(d.name ?? `Day ${days.length + 1}`), 60), slots });
    }
  }
  if (days.length === 0) return null;
  return { label: clampString(String(raw.label ?? `${goal} program`), 60), days };
}

function sanitizeAvailability(raw: unknown): Record<string, string[]> | null {
  if (!raw || typeof raw !== 'object') return null;
  const muscleSet = new Set<string>(MUSCLES);
  const prioSet = new Set<string>(PRIORITIES);
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!muscleSet.has(k) || !Array.isArray(v)) continue;
    const ps = v.filter((p): p is string => typeof p === 'string' && prioSet.has(p));
    if (ps.length) out[k] = [...new Set(ps)];
  }
  return Object.keys(out).length ? out : null;
}

function clampString(s: string, max: number): string {
  return (s ?? '').toString().slice(0, max);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Check-and-increment a per-user, per-function, per-day call counter.
 * Atomic via bump_ai_usage RPC (2026-05-17 audit fix). Fails closed.
 */
async function checkRateLimit(
  supabase: any,
  userId: string,
  functionName: string,
  limit: number,
): Promise<{ allowed: boolean; limit: number; count: number; retryAfter?: number; failedClosed?: boolean }> {
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
      const retryAfter = Math.max(1, Math.round((tomorrow.getTime() - now.getTime()) / 1000));
      return { allowed: false, limit, count: newCount, retryAfter };
    }
    return { allowed: true, limit, count: newCount };
  } catch (err) {
    console.error(`[${functionName}] rate-limit check failed; failing closed:`, err);
    return { allowed: false, limit, count: 0, retryAfter: 60, failedClosed: true };
  }
}
