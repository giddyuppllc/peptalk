/**
 * Aimee tool definitions + executors.
 *
 * Four tools surface concrete actions Aimee can take. Two are read-only
 * (suggest_workout, summarize_pattern) and execute inline. Two are
 * "proposing" (draft_meal_template, propose_log_field) — they record an
 * entry in `aimee_pending_actions` and return its id; the RN client shows
 * a confirm modal; the user's tap actually writes the data.
 *
 * Tool descriptions are carefully phrased so Claude knows WHEN to call
 * each (matters more for tool-use quality than the param schemas).
 *
 * All executors take a SupabaseClient (service role) and the user id.
 */

import type { AnthropicTool } from './_anthropic.ts';

// ─── Tool definitions exposed to Claude ──────────────────────────────────

export const AIMEE_TOOLS: AnthropicTool[] = [
  {
    name: 'suggest_workout',
    description: [
      'Surface 1-5 real exercises from the curated 451-exercise PepTalk library that match the user\'s criteria.',
      'Call this when the user asks for workout ideas, exercise suggestions, or "build me a [push/pull/leg/etc.] day".',
      'Returns concrete exercise rows with names, muscle groups, equipment level, and difficulty.',
      'Do NOT invent exercises — use this tool whenever the user wants specific moves.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        muscles: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Target muscle groups. Examples: "Chest", "Back", "Glutes", "Quads", "Hamstrings", "Shoulders", "Core Abdominals", "Biceps", "Triceps", "Circuit Cardio".',
        },
        level: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'advanced'],
          description: 'User\'s training level. Defaults to "beginner" if unknown.',
        },
        location: {
          type: 'string',
          enum: ['any', 'home', 'gym'],
          description: 'Where the user is training. "any" if unsure.',
        },
        gender: {
          type: 'string',
          enum: ['anyone', 'women', 'men'],
          description: 'Gender suitability filter. "anyone" by default.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
          description: 'How many exercises to return. Default 3.',
        },
      },
      required: ['muscles'],
    },
  },
  {
    name: 'summarize_pattern',
    description: [
      'Look for correlations across the user\'s recent logs — check-ins, workouts, meals, dose logs.',
      'Call this when the user asks "why am I feeling X this week?", "is my [protocol/training/diet] working?", or any "look across my data" question.',
      'Returns counts, averages, and observed correlations across the requested timeframe.',
      'This tool reads real data, so the answer is grounded — never invent numbers.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        timeframeDays: {
          type: 'integer',
          minimum: 1,
          maximum: 30,
          description: 'How many days back to look. Defaults to 14.',
        },
        signals: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['mood', 'energy', 'sleep', 'workouts', 'nutrition', 'doses'],
          },
          description:
            'Which signals to summarize. Defaults to all six if omitted.',
        },
      },
      required: [],
    },
  },
  {
    name: 'draft_meal_template',
    description: [
      'Draft a meal template (NOT a recipe) the user can add to their log.',
      'Call this when the user wants "ideas for breakfast/lunch/dinner", "what should I eat to hit my protein", or asks Aimee to plan a meal.',
      'The draft is saved as a PENDING action — the user must tap Confirm in the UI before anything writes.',
      'Returns a pending_action_id the client uses to show the confirm modal.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        mealType: {
          type: 'string',
          enum: ['breakfast', 'lunch', 'dinner', 'snack'],
        },
        title: {
          type: 'string',
          description: 'Short name for the template (e.g. "Greek yogurt power bowl").',
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              amount: { type: 'string', description: 'e.g. "3/4 cup" or "150 g".' },
              proteinGrams: { type: 'number' },
              carbsGrams: { type: 'number' },
              fatGrams: { type: 'number' },
              calories: { type: 'number' },
            },
            required: ['name'],
          },
          description: '1-8 food items in the template.',
        },
        notes: {
          type: 'string',
          description: 'Optional one-liner — timing, prep tip, etc. Keep under 240 chars.',
        },
      },
      required: ['mealType', 'title', 'items'],
    },
  },
  {
    name: 'propose_log_field',
    description: [
      'Propose adding a single structured field to TODAY\'s log (a check-in entry).',
      'Call this when the user mentions a data point in chat that they haven\'t logged — e.g. "I slept 7 hours" → propose a sleep field; "energy is low today" → propose energy=low.',
      'The proposal is saved as a PENDING action — the user must tap Confirm before anything writes.',
      'Returns a pending_action_id.',
    ].join(' '),
    input_schema: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: [
            'mood',
            'energy',
            'sleepHours',
            'weightLbs',
            'symptoms',
            'notes',
          ],
        },
        value: {
          description:
            'The value to set. Numeric for sleepHours/weightLbs; 1-5 scale for mood/energy; string for notes; array of strings for symptoms.',
        },
      },
      required: ['field', 'value'],
    },
  },
];

// ─── Executors ────────────────────────────────────────────────────────────
// Each takes a service-role Supabase client + user id + the model's tool_use
// input. Each returns a plain JSON-serializable result that Claude sees as
// the tool_result content block.

export async function execSuggestWorkout(
  supabase: any,
  _userId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const muscles = Array.isArray(input.muscles) ? (input.muscles as string[]) : [];
  const level = typeof input.level === 'string' ? input.level : 'beginner';
  const location = typeof input.location === 'string' ? input.location : 'any';
  const gender = typeof input.gender === 'string' ? input.gender : 'anyone';
  const limit = typeof input.limit === 'number'
    ? Math.max(1, Math.min(5, Math.floor(input.limit)))
    : 3;

  // Filter chain: muscles overlap + level + (location any OR matches) +
  // (gender anyone OR matches).
  let query = supabase
    .from('exercises_library')
    .select('id, name, muscles, priority, level, location, gender, metrics')
    .limit(50);

  if (muscles.length > 0) {
    query = query.overlaps('muscles', muscles);
  }
  if (level) {
    query = query.eq('level', level);
  }
  if (location && location !== 'any') {
    query = query.in('location', [location, 'any']);
  }
  if (gender && gender !== 'anyone') {
    query = query.in('gender', [gender, 'anyone']);
  }

  const { data, error } = await query;
  if (error) {
    return { error: 'exercise lookup failed', detail: error.message };
  }
  if (!data || data.length === 0) {
    return {
      results: [],
      message:
        'No exercises matched those filters. Try broader muscle groups or "any" location.',
    };
  }

  // Shuffle deterministically by (id-hash mod len) for variety w/o RNG drift.
  // We use sliced first N after a sort-by-priority bias toward P1 then P2.
  const priorityRank: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
  const sorted = [...data].sort((a: any, b: any) =>
    (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99),
  );
  const top = sorted.slice(0, Math.min(limit * 3, sorted.length));
  // Light shuffle within the top so users don't see the same 3 every time.
  for (let i = top.length - 1; i > 0; i--) {
    const j = Math.floor((Date.now() / 1000 + i) % (i + 1));
    [top[i], top[j]] = [top[j], top[i]];
  }
  const results = top.slice(0, limit).map((e: any) => ({
    id: e.id,
    name: e.name,
    muscles: e.muscles,
    level: e.level,
    location: e.location,
    metrics: e.metrics,
    priority: e.priority,
  }));

  return { results, count: results.length };
}

export async function execSummarizePattern(
  supabase: any,
  userId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const days = typeof input.timeframeDays === 'number'
    ? Math.max(1, Math.min(30, Math.floor(input.timeframeDays)))
    : 14;
  const requestedSignals = Array.isArray(input.signals)
    ? (input.signals as string[])
    : ['mood', 'energy', 'sleep', 'workouts', 'nutrition', 'doses'];

  const since = new Date(Date.now() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const summary: Record<string, unknown> = { timeframeDays: days, since };

  // Cap per-table scan at 200 rows so a power user doesn't blow up the cost.
  if (
    requestedSignals.includes('mood') ||
    requestedSignals.includes('energy') ||
    requestedSignals.includes('sleep')
  ) {
    const { data: checkins } = await supabase
      .from('check_ins')
      .select('date, mood, energy, sleep_hours')
      .eq('user_id', userId)
      .gte('date', since)
      .order('date', { ascending: false })
      .limit(200);
    if (checkins && checkins.length > 0) {
      const mood = checkins
        .map((c: any) => c.mood)
        .filter((v: any) => typeof v === 'number');
      const energy = checkins
        .map((c: any) => c.energy)
        .filter((v: any) => typeof v === 'number');
      const sleep = checkins
        .map((c: any) => c.sleep_hours)
        .filter((v: any) => typeof v === 'number');
      summary.checkins = {
        count: checkins.length,
        avgMood: mood.length ? round2(mean(mood)) : null,
        avgEnergy: energy.length ? round2(mean(energy)) : null,
        avgSleepHours: sleep.length ? round2(mean(sleep)) : null,
      };
    } else {
      summary.checkins = { count: 0, note: 'No check-ins logged in this window.' };
    }
  }

  if (requestedSignals.includes('workouts')) {
    const { data: workouts } = await supabase
      .from('workout_logs')
      .select('id, started_at, duration_minutes, workout_name')
      .eq('user_id', userId)
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(200);
    if (workouts && workouts.length > 0) {
      const durations = workouts
        .map((w: any) => w.duration_minutes)
        .filter((v: any) => typeof v === 'number');
      summary.workouts = {
        count: workouts.length,
        avgDurationMin: durations.length ? Math.round(mean(durations)) : null,
        mostRecent: workouts[0]?.workout_name ?? null,
      };
    } else {
      summary.workouts = { count: 0 };
    }
  }

  if (requestedSignals.includes('nutrition')) {
    const { data: meals } = await supabase
      .from('meal_entries')
      .select('id, date, calories, protein_grams, carbs_grams, fat_grams')
      .eq('user_id', userId)
      .gte('date', since)
      .limit(200);
    if (meals && meals.length > 0) {
      const cals = meals.map((m: any) => m.calories ?? 0);
      const protein = meals.map((m: any) => m.protein_grams ?? 0);
      // Aggregate per day so averages are days-not-meals.
      const perDay: Record<string, { cal: number; pro: number }> = {};
      for (const m of meals) {
        const d = m.date ?? '';
        if (!perDay[d]) perDay[d] = { cal: 0, pro: 0 };
        perDay[d].cal += m.calories ?? 0;
        perDay[d].pro += m.protein_grams ?? 0;
      }
      const dayCount = Object.keys(perDay).length || 1;
      const totalCal = Object.values(perDay).reduce((acc, v) => acc + v.cal, 0);
      const totalPro = Object.values(perDay).reduce((acc, v) => acc + v.pro, 0);
      summary.nutrition = {
        mealCount: meals.length,
        daysLogged: dayCount,
        avgDailyCalories: Math.round(totalCal / dayCount),
        avgDailyProteinGrams: Math.round(totalPro / dayCount),
        // Keep the raw sums short — model doesn't need 6dp.
        _samples: { calSamples: cals.length, proSamples: protein.length },
      };
    } else {
      summary.nutrition = { mealCount: 0 };
    }
  }

  if (requestedSignals.includes('doses')) {
    const { data: doses } = await supabase
      .from('dose_logs')
      .select('id, taken_at, peptide_name, dose_mcg, dose_mg')
      .eq('user_id', userId)
      .gte('taken_at', since)
      .order('taken_at', { ascending: false })
      .limit(200);
    if (doses && doses.length > 0) {
      const peptides: Record<string, number> = {};
      for (const d of doses) {
        const k = d.peptide_name ?? 'unknown';
        peptides[k] = (peptides[k] ?? 0) + 1;
      }
      summary.doses = {
        count: doses.length,
        peptideHistogram: peptides,
        mostRecent: doses[0]
          ? {
              peptide: doses[0].peptide_name,
              takenAt: doses[0].taken_at,
            }
          : null,
      };
    } else {
      summary.doses = { count: 0 };
    }
  }

  return summary;
}

export async function execDraftMealTemplate(
  supabase: any,
  userId: string,
  input: Record<string, unknown>,
  conversationId: string | null,
): Promise<Record<string, unknown>> {
  // Compute aggregate macros if not present.
  const items = Array.isArray(input.items) ? input.items : [];
  const totals = items.reduce(
    (acc: any, it: any) => ({
      protein: acc.protein + (Number(it.proteinGrams) || 0),
      carbs: acc.carbs + (Number(it.carbsGrams) || 0),
      fat: acc.fat + (Number(it.fatGrams) || 0),
      calories: acc.calories + (Number(it.calories) || 0),
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 },
  );

  const output = {
    mealType: input.mealType,
    title: input.title,
    items,
    notes: input.notes ?? null,
    totals,
  };

  const { data, error } = await supabase
    .from('aimee_pending_actions')
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      tool_name: 'draft_meal_template',
      input,
      output,
    })
    .select('id')
    .single();
  if (error) {
    return { error: 'failed to queue meal template', detail: error.message };
  }
  return {
    pending_action_id: data.id,
    requires_confirm: true,
    preview: output,
    message:
      'I drafted a meal template — tap Confirm in the chat to add it to your log, or Edit to tweak it first.',
  };
}

export async function execProposeLogField(
  supabase: any,
  userId: string,
  input: Record<string, unknown>,
  conversationId: string | null,
): Promise<Record<string, unknown>> {
  const field = String(input.field ?? '');
  const value = input.value;
  if (!field) {
    return { error: 'missing field name' };
  }

  // Lightweight validation — full validation runs in the confirm handler.
  if (field === 'mood' || field === 'energy') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 5) {
      return { error: 'mood/energy must be 1-5' };
    }
  }
  if (field === 'sleepHours') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 24) {
      return { error: 'sleepHours must be 0-24' };
    }
  }
  if (field === 'weightLbs') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 40 || n > 800) {
      return { error: 'weightLbs out of plausible range' };
    }
  }

  const output = { field, value, date: new Date().toISOString().slice(0, 10) };
  const { data, error } = await supabase
    .from('aimee_pending_actions')
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      tool_name: 'propose_log_field',
      input,
      output,
    })
    .select('id')
    .single();
  if (error) {
    return { error: 'failed to queue log field', detail: error.message };
  }
  return {
    pending_action_id: data.id,
    requires_confirm: true,
    preview: output,
    message: `I can log ${field} = ${JSON.stringify(value)} to today's check-in — tap Confirm to save.`,
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: { supabase: any; userId: string; conversationId: string | null },
): Promise<Record<string, unknown>> {
  switch (toolName) {
    case 'suggest_workout':
      return execSuggestWorkout(ctx.supabase, ctx.userId, toolInput);
    case 'summarize_pattern':
      return execSummarizePattern(ctx.supabase, ctx.userId, toolInput);
    case 'draft_meal_template':
      return execDraftMealTemplate(
        ctx.supabase,
        ctx.userId,
        toolInput,
        ctx.conversationId,
      );
    case 'propose_log_field':
      return execProposeLogField(
        ctx.supabase,
        ctx.userId,
        toolInput,
        ctx.conversationId,
      );
    default:
      return { error: `unknown tool: ${toolName}` };
  }
}

// ─── Small numeric helpers ────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((acc, n) => acc + n, 0) / arr.length;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
