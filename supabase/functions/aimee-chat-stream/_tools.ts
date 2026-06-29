/**
 * Aimee tool definitions + executors.
 *
 * Tools come in three flavors:
 *
 *   1. READ-ONLY            — execute inline and return data to the model
 *                             (suggest_workout, summarize_pattern,
 *                              get_user_metrics)
 *   2. PROPOSING            — record an entry in `aimee_pending_actions`
 *                             and return its id; the RN client shows a
 *                             confirm modal; the user's tap actually
 *                             writes the data (draft_meal_template,
 *                             propose_log_field)
 *   3. CLIENT-ACTION        — return a deep link / navigation intent the
 *                             RN client executes (open_dosing_calculator,
 *                             navigate_to_screen). Server-side state is
 *                             NOT modified.
 *
 * Direct-write executors (log_dose, log_meal, schedule_workout) write
 * straight to Supabase and tell the model "done." These are deliberately
 * narrow — anything that could embarrass the user (large updates,
 * deletes) stays in the proposing flow.
 *
 * Tool descriptions are carefully phrased so the model knows WHEN to call
 * each — this matters more for tool-use quality than the param schemas.
 *
 * Wire format: OpenAI Chat Completions tools spec, since we talk to
 * xAI's Grok which speaks that dialect.
 */

import type { GrokTool } from './_grok.ts';

// ─── Tool definitions exposed to Grok ─────────────────────────────────────

export const AIMEE_TOOLS: GrokTool[] = [
  // ───── workouts ─────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'suggest_workout',
      description: [
        'Surface 1-5 real exercises from the curated 451-exercise PepTalk library that match the user\'s criteria.',
        'Call this when the user asks for workout ideas, exercise suggestions, or "build me a [push/pull/leg/etc.] day".',
        'Returns concrete exercise rows with names, muscle groups, equipment level, and difficulty.',
        'Do NOT invent exercises — use this tool whenever the user wants specific moves.',
      ].join(' '),
      parameters: {
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
  },
  // ───── insights ─────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'summarize_pattern',
      description: [
        'Look for correlations across the user\'s recent logs — check-ins, workouts, meals, dose logs.',
        'Call this when the user asks "why am I feeling X this week?", "is my [protocol/training/diet] working?", or any "look across my data" question.',
        'Returns counts, averages, and observed correlations across the requested timeframe.',
        'This tool reads real data, so the answer is grounded — never invent numbers.',
      ].join(' '),
      parameters: {
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
            description: 'Which signals to summarize. Defaults to all six if omitted.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_metrics',
      description: [
        'Read a quick snapshot of the user\'s current metrics: recent weight, latest body composition, most recent check-in scores, active protocols.',
        'Call this when the user asks "what are my numbers?", "how am I doing overall?", "what\'s my [weight/BMI/etc.] today?", or before recommending changes that depend on current state.',
        'Returns the latest values only — for trends use summarize_pattern.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  // ───── meals (propose + direct log) ─────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'draft_meal_template',
      description: [
        'Draft a meal template (NOT a recipe) the user can add to their log.',
        'Call this when the user wants "ideas for breakfast/lunch/dinner", "what should I eat to hit my protein", or asks Aimee to plan a meal.',
        'The draft is saved as a PENDING action — the user must tap Confirm in the UI before anything writes.',
        'Returns a pending_action_id the client uses to show the confirm modal.',
      ].join(' '),
      parameters: {
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
  },
  {
    type: 'function',
    function: {
      name: 'log_meal',
      description: [
        'Log a meal the user already ate or is eating now — direct write, no confirm step.',
        'Call this when the user TELLS you they ate something ("I just had X", "log my lunch — two eggs and toast"). Do NOT call for hypothetical meals or planning; use draft_meal_template for that.',
        'Conservative: if the user uses future-tense ("I\'m going to eat") or asks for ideas, this is NOT the right tool.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          mealType: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
          title: { type: 'string', description: 'Short name. Required.' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                grams: { type: 'number' },
                calories: { type: 'number' },
                proteinGrams: { type: 'number' },
                carbsGrams: { type: 'number' },
                fatGrams: { type: 'number' },
              },
              required: ['name'],
            },
            description: '1-8 foods the user actually ate.',
          },
          date: {
            type: 'string',
            description: 'ISO date (YYYY-MM-DD). Defaults to today.',
          },
        },
        required: ['mealType', 'title', 'items'],
      },
    },
  },
  // ───── log fields (propose) ─────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'propose_log_field',
      description: [
        'Propose adding a single structured field to TODAY\'s check-in log.',
        'Call this when the user mentions a data point in chat that they haven\'t logged — e.g. "I slept 7 hours" → propose a sleep field; "energy is low today" → propose energy=low.',
        'The proposal is saved as a PENDING action — the user must tap Confirm before anything writes.',
        'Returns a pending_action_id.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['mood', 'energy', 'sleepHours', 'weightLbs', 'symptoms', 'notes'],
          },
          value: {
            description:
              'The value to set. Numeric for sleepHours/weightLbs; 1-5 scale for mood/energy; string for notes; array of strings for symptoms.',
          },
        },
        required: ['field', 'value'],
      },
    },
  },
  // ───── doses (direct log) ───────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'log_dose',
      description: [
        'Log a peptide dose the user already took — direct write.',
        'Call this when the user TELLS you they took something ("I just injected my Selank, 0.25 mg"). Do NOT call to schedule future doses or to recommend a protocol — for future scheduling, just describe what they should do in prose; never invent tool names.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          peptideId: { type: 'string', description: 'Optional — the canonical peptide id if known.' },
          peptideName: { type: 'string', description: 'Display name as the user said it.' },
          amount: { type: 'number', description: 'Numeric dose amount.' },
          unit: { type: 'string', enum: ['mcg', 'mg', 'iu'], description: 'Unit of the amount.' },
          route: {
            type: 'string',
            enum: ['subcutaneous', 'intramuscular', 'oral', 'nasal', 'sublingual'],
            description: 'Route of administration. Default subcutaneous for most peptides.',
          },
          site: { type: 'string', description: 'Optional injection site (e.g. "left thigh").' },
          notes: { type: 'string', description: 'Optional one-line note.' },
          date: { type: 'string', description: 'ISO date YYYY-MM-DD. Defaults to today.' },
          time: { type: 'string', description: 'HH:MM (24h). Defaults to now.' },
        },
        required: ['peptideName', 'amount', 'unit'],
      },
    },
  },
  // ───── workouts (schedule) ──────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'schedule_workout',
      description: [
        'Schedule a workout for a future day (writes to workout_logs as a planned entry — completed_at left null).',
        'Call this when the user asks Aimee to "put X on my calendar" or "plan a workout for Saturday".',
        'For "what should I do today?" suggestions without committing, use suggest_workout instead.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Workout name, e.g. "Push day", "Heavy legs".' },
          date: { type: 'string', description: 'ISO date YYYY-MM-DD.' },
          time: { type: 'string', description: 'HH:MM (24h). Optional.' },
          durationMinutes: { type: 'integer', minimum: 5, maximum: 240 },
          notes: { type: 'string' },
        },
        required: ['name', 'date'],
      },
    },
  },
  // ───── client-side action tools (deep links) ────────────────────────────
  {
    type: 'function',
    function: {
      name: 'open_dosing_calculator',
      description: [
        'Open the dosing calculator screen, optionally pre-filled with a peptide + suggested dose.',
        'Call this when the user asks "calculate my dose for X", "how much X do I draw", or anything that needs the reconstitution math.',
        'The client navigates to /doses/calculator with the deep-link params; no server state changes.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          peptideId: { type: 'string', description: 'Canonical peptide id (e.g. "bpc-157", "selank").' },
          peptideName: { type: 'string', description: 'Display name if id unknown.' },
          doseMcg: { type: 'number', description: 'Suggested dose in micrograms to pre-fill.' },
          vialMg: { type: 'number', description: 'Vial size in milligrams to pre-fill.' },
          waterMl: { type: 'number', description: 'BAC water in mL to pre-fill (1-3 typical).' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to_screen',
      description: [
        'Navigate the user to another screen in the app. Use sparingly — only when the user explicitly asks to "open" or "go to" something, or when answering a question really needs them to be on a specific screen.',
        'Available screens (v3): "home", "peptides", "aimee", "nutrition", "workouts", "community", "check-in", "calendar", "profile", "stack-builder", "dosing-calc",',
        '"tracker", "tracker-weight", "tracker-sleep", "tracker-mood", "tracker-photos",',
        '"doses", "doses-calculator", "doses-stack-builder", "doses-library", "doses-tracker", "doses-side-effects",',
        '"activity", "activity-performance",',
        '"labs", "labs-entry", "body-composition", "body-composition-entry",',
        '"pantry", "pantry-add", "pantry-scan",',
        '"aimee-reports",',
        '"community-leaderboard", "community-milestones",',
        '"profile-appearance", "profile-community-prefs", "settings-notifications", "subscription".',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          screen: { type: 'string', description: 'One of the available screen names.' },
        },
        required: ['screen'],
      },
    },
  },
  // ───── water (direct write, confirm card) ───────────────────────────────
  {
    type: 'function',
    function: {
      name: 'log_water',
      description: [
        'Log water the user drank — direct write, requires user confirm on client.',
        'Call this when the user says they drank water ("I had a glass of water", "log 16 oz", "two cups").',
        'Convert to ounces (cup = 8 oz, glass = 8 oz, bottle = 16 oz unless they specify).',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          ounces: { type: 'number', description: 'Amount of water in ounces. Must be > 0.' },
          date: { type: 'string', description: 'ISO date (YYYY-MM-DD). Defaults to today.' },
        },
        required: ['ounces'],
      },
    },
  },
  // ───── appetite (direct write, confirm card) ────────────────────────────
  {
    type: 'function',
    function: {
      name: 'log_appetite',
      description: [
        'Log how the user\'s appetite is right now — direct write, requires user confirm.',
        'Call this when the user mentions appetite ("I\'m hungry", "I feel full", "kinda nauseous").',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          state: { type: 'string', enum: ['hungry', 'full', 'nauseous'] },
          notes: { type: 'string', description: 'Optional context — under 200 chars.' },
        },
        required: ['state'],
      },
    },
  },
  // ───── pantry (direct write, confirm card) ──────────────────────────────
  {
    type: 'function',
    function: {
      name: 'add_to_pantry',
      description: [
        'Add items to the user\'s kitchen / pantry inventory — direct write, requires user confirm.',
        'Call this when the user says they bought groceries or stocked up ("I bought 2 lbs chicken", "I have eggs and yogurt in the fridge").',
        'Infer storageLocation: meat/dairy/produce → fridge, ice cream / frozen veg → freezer, cans/dry goods → pantry.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                quantity: { type: 'number', description: 'Defaults to 1 if unknown.' },
                unit: {
                  type: 'string',
                  enum: ['each', 'oz', 'g', 'lb', 'cup', 'tbsp', 'tsp', 'ml', 'l'],
                },
                category: {
                  type: 'string',
                  enum: ['produce', 'dairy', 'grain', 'protein', 'frozen', 'condiment', 'other'],
                },
                storageLocation: {
                  type: 'string',
                  enum: ['fridge', 'freezer', 'pantry'],
                },
              },
              required: ['name'],
            },
            description: '1-20 pantry items to add.',
          },
        },
        required: ['items'],
      },
    },
  },
];

// ─── Executors ────────────────────────────────────────────────────────────
// Each takes a service-role Supabase client + user id + the model's
// tool-call arguments. Each returns a plain JSON-serializable result.
//
// Two side-channel fields can appear on results:
//   - requires_confirm + pending_action_id  → client shows confirm modal
//   - client_action: { type, ... }          → client executes a deep link

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

  let query = supabase
    .from('exercises_library')
    .select('id, name, muscles, priority, level, location, gender, metrics')
    .limit(50);

  if (muscles.length > 0) query = query.overlaps('muscles', muscles);
  if (level) query = query.eq('level', level);
  if (location && location !== 'any') query = query.in('location', [location, 'any']);
  if (gender && gender !== 'anyone') query = query.in('gender', [gender, 'anyone']);

  const { data, error } = await query;
  if (error) {
    return { error: 'exercise lookup failed', detail: error.message };
  }
  if (!data || data.length === 0) {
    return {
      results: [],
      message: 'No exercises matched those filters. Try broader muscle groups or "any" location.',
    };
  }

  const priorityRank: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
  const sorted = [...data].sort((a: any, b: any) =>
    (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99),
  );
  const top = sorted.slice(0, Math.min(limit * 3, sorted.length));
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

  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const summary: Record<string, unknown> = { timeframeDays: days, since };

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
      const mood = checkins.map((c: any) => c.mood).filter((v: any) => typeof v === 'number');
      const energy = checkins.map((c: any) => c.energy).filter((v: any) => typeof v === 'number');
      const sleep = checkins.map((c: any) => c.sleep_hours).filter((v: any) => typeof v === 'number');
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
      const durations = workouts.map((w: any) => w.duration_minutes).filter((v: any) => typeof v === 'number');
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
      .select('id, date, foods, quick_log')
      .eq('user_id', userId)
      .gte('date', since)
      .limit(200);
    if (meals && meals.length > 0) {
      const perDay: Record<string, { cal: number; pro: number }> = {};
      for (const m of meals) {
        const d = m.date ?? '';
        if (!perDay[d]) perDay[d] = { cal: 0, pro: 0 };
        const foods = Array.isArray(m.foods) ? m.foods : [];
        for (const f of foods) {
          perDay[d].cal += Number(f?.calories) || 0;
          perDay[d].pro += Number(f?.proteinGrams) || 0;
        }
        const ql = m.quick_log ?? {};
        perDay[d].cal += Number(ql.calories) || 0;
        perDay[d].pro += Number(ql.protein) || 0;
      }
      const dayCount = Object.keys(perDay).length || 1;
      const totalCal = Object.values(perDay).reduce((acc, v) => acc + v.cal, 0);
      const totalPro = Object.values(perDay).reduce((acc, v) => acc + v.pro, 0);
      summary.nutrition = {
        mealCount: meals.length,
        daysLogged: dayCount,
        avgDailyCalories: Math.round(totalCal / dayCount),
        avgDailyProteinGrams: Math.round(totalPro / dayCount),
      };
    } else {
      summary.nutrition = { mealCount: 0 };
    }
  }

  if (requestedSignals.includes('doses')) {
    const { data: doses } = await supabase
      .from('dose_logs')
      .select('id, date, time, peptide_name, amount, unit')
      .eq('user_id', userId)
      .gte('date', since)
      .order('date', { ascending: false })
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
          ? { peptide: doses[0].peptide_name, date: doses[0].date, time: doses[0].time }
          : null,
      };
    } else {
      summary.doses = { count: 0 };
    }
  }

  return summary;
}

export async function execGetUserMetrics(
  supabase: any,
  userId: string,
  _input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Pull the latest of each thing in parallel.
  const [profileRes, latestCheckin, activeProtocols, latestDose] = await Promise.all([
    supabase
      .from('profiles')
      .select('subscription_tier, height_cm, weight_kg, dob, gender')
      .eq('id', userId)
      .single(),
    supabase
      .from('check_ins')
      .select('date, mood, energy, sleep_hours, weight_lbs, symptoms, notes')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('active_protocols')
      .select('peptide_name, dose_amount, dose_unit, route, frequency, start_date')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('start_date', { ascending: false })
      .limit(5),
    supabase
      .from('dose_logs')
      .select('peptide_name, amount, unit, date, time')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    profile: profileRes?.data ?? null,
    latestCheckin: latestCheckin?.data ?? null,
    activeProtocols: activeProtocols?.data ?? [],
    latestDose: latestDose?.data ?? null,
  };
}

export async function execDraftMealTemplate(
  supabase: any,
  userId: string,
  input: Record<string, unknown>,
  conversationId: string | null,
): Promise<Record<string, unknown>> {
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
    message: 'I drafted a meal template — tap Confirm in the chat to add it to your log, or Edit to tweak it first.',
  };
}

export function execLogMeal(
  input: Record<string, unknown>,
  localDate?: string,
): Record<string, unknown> {
  // We hand the payload back to the client and let useMealStore.addMeal
  // own the write. Single source of truth: local Zustand → syncRecord
  // upserts to Supabase. Avoids the "Aimee says Logged but nothing
  // shows up in the meal log UI" bug that pure server-side inserts
  // would create (no read-back layer for meal_entries).
  const mealType = typeof input.mealType === 'string' ? input.mealType : 'snack';
  const title = typeof input.title === 'string' ? input.title : 'Meal';
  // Date range guard — see sanitizeRecentDate() for rationale. When the
  // model omits the date, default to the user's LOCAL date, not server UTC.
  const date = sanitizeRecentDate(input.date, localDate);
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

  const id = crypto.randomUUID();
  return {
    ok: true,
    meal_entry_id: id,
    summary: `Logged ${mealType}: ${title} (${Math.round(totals.calories)} kcal, ${Math.round(totals.protein)}g protein) on ${date}.`,
    client_action: {
      type: 'log_meal',
      payload: {
        id,
        date,
        mealType,
        title,
        items,
        totals,
        notes: typeof input.notes === 'string' ? input.notes : null,
        timestamp: new Date().toISOString(),
      },
    },
  };
}

export async function execProposeLogField(
  supabase: any,
  userId: string,
  input: Record<string, unknown>,
  conversationId: string | null,
  localDate?: string,
): Promise<Record<string, unknown>> {
  const field = String(input.field ?? '');
  const value = input.value;
  if (!field) return { error: 'missing field name' };

  if (field === 'mood' || field === 'energy') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 5) return { error: 'mood/energy must be 1-5' };
  }
  if (field === 'sleepHours') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 24) return { error: 'sleepHours must be 0-24' };
  }
  if (field === 'weightLbs') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 40 || n > 800) return { error: 'weightLbs out of plausible range' };
  }
  if (field === 'symptoms') {
    if (!Array.isArray(value) || !value.every((s) => typeof s === 'string')) {
      return { error: 'symptoms must be an array of strings' };
    }
  }
  if (field === 'notes') {
    if (typeof value !== 'string') {
      return { error: 'notes must be a string' };
    }
  }

  // Prefer the user's LOCAL date (passed from the client per request)
  // so an entry made at 9 PM PST lands on today's check-in row, not
  // tomorrow's. Falls back to server UTC if the client didn't send it
  // (legacy clients; harmless on older builds).
  const date = (typeof localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(localDate))
    ? localDate
    : new Date().toISOString().slice(0, 10);
  const output = { field, value, date };
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
  if (error) return { error: 'failed to queue log field', detail: error.message };
  return {
    pending_action_id: data.id,
    requires_confirm: true,
    preview: output,
    message: `I can log ${field} = ${JSON.stringify(value)} to today's check-in — tap Confirm to save.`,
  };
}

export function execLogDose(
  input: Record<string, unknown>,
  localDate?: string,
): Record<string, unknown> {
  // Hand the payload back to the client → useDoseLogStore.logDose owns
  // the write. See execLogMeal for the rationale (single source of
  // truth in the local store; syncRecord pushes to Supabase).
  const peptideName = typeof input.peptideName === 'string' ? input.peptideName : '';
  if (!peptideName) return { error: 'peptideName required' };
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'amount must be > 0' };
  const unit = typeof input.unit === 'string' ? input.unit : 'mcg';
  if (!['mcg', 'mg', 'iu'].includes(unit)) return { error: 'unit must be mcg/mg/iu' };

  // Date range guard. Earlier this only validated the shape, so a
  // coaxed model could log a dose for 2099-01-01 (or 1999) and
  // pollute the dose log + future alert calculations. P1 from Wave
  // 76.11 Aimee fuzzing audit. Allow yesterday, today, and tomorrow
  // (timezone slop on the client side). When the model omits the date,
  // default to the user's LOCAL date, not server UTC.
  const date = sanitizeRecentDate(input.date, localDate);
  const time = typeof input.time === 'string' && /^\d{2}:\d{2}$/.test(input.time)
    ? input.time
    : new Date().toISOString().slice(11, 16);

  return {
    ok: true,
    summary: `Logged ${amount} ${unit} of ${peptideName} at ${time} on ${date}.`,
    client_action: {
      type: 'log_dose',
      payload: {
        peptideId: typeof input.peptideId === 'string' ? input.peptideId : peptideName,
        peptideName,
        amount,
        unit,
        route: typeof input.route === 'string' ? input.route : 'subcutaneous',
        site: typeof input.site === 'string' ? input.site : undefined,
        notes: typeof input.notes === 'string' ? input.notes : undefined,
        date,
        time,
      },
    },
  };
}

export function execScheduleWorkout(
  input: Record<string, unknown>,
): Record<string, unknown> {
  // Returns a client_action payload — see execLogDose / execLogMeal for
  // why we don't write to Supabase directly here.
  const name = typeof input.name === 'string' ? input.name.slice(0, 80) : '';
  if (!name) return { error: 'name required' };
  // Schedule must be near-future: today through +365 days. Past dates
  // are rejected — completed workouts use finishWorkout, not schedule.
  const date = sanitizeFutureDate(input.date);
  if (!date) {
    return { error: 'date must be YYYY-MM-DD between today and one year out' };
  }
  const time = typeof input.time === 'string' ? input.time : '12:00';
  const startedAtIso = `${date}T${time.length === 5 ? time : '12:00'}:00.000Z`;

  const duration = typeof input.durationMinutes === 'number' ? Math.floor(input.durationMinutes) : null;

  return {
    ok: true,
    summary: `Scheduled "${name}" for ${date}${time !== '12:00' ? ` at ${time}` : ''}.`,
    client_action: {
      type: 'schedule_workout',
      payload: {
        id: crypto.randomUUID(),
        workoutName: name,
        startedAt: startedAtIso,
        durationMinutes: duration,
        notes: typeof input.notes === 'string' ? input.notes : null,
      },
    },
  };
}

export function execOpenDosingCalculator(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const params = new URLSearchParams();
  // v3 calculator at /doses/calculator reads `peptideId`, `doseMcg`,
  // `vialMg`, `waterMl` from query params. Old /calculators/dosing was
  // retired — v3 is feature-complete per §14.
  if (typeof input.peptideId === 'string') params.set('peptideId', input.peptideId);
  else if (typeof input.peptideName === 'string') params.set('peptideId', input.peptideName);
  if (typeof input.doseMcg === 'number') params.set('doseMcg', String(input.doseMcg));
  if (typeof input.vialMg === 'number') params.set('vialMg', String(input.vialMg));
  if (typeof input.waterMl === 'number') params.set('waterMl', String(input.waterMl));

  const qs = params.toString();
  const path = qs ? `/doses/calculator?${qs}` : '/doses/calculator';

  return {
    ok: true,
    client_action: { type: 'navigate', path },
    message: 'Opening the dosing calculator…',
  };
}

// Routes verified against app/ directory. v3 screens are NOT inside
// (tabs) for most surfaces — they're top-level routes pushed via the
// 4-card home drill (per the v3 refactor; bottom tab bar is hidden).
const SCREEN_TO_PATH: Record<string, string> = {
  // Original tab routes (still reachable as deep links)
  home: '/(tabs)',
  peptides: '/(tabs)/my-stacks',
  aimee: '/(tabs)/peptalk',
  nutrition: '/(tabs)/nutrition',
  workouts: '/(tabs)/workouts',
  community: '/(tabs)/community',
  'check-in': '/(tabs)/check-in',
  calendar: '/(tabs)/calendar',
  profile: '/(tabs)/profile',
  'stack-builder': '/(tabs)/stack-builder',
  'dosing-calc': '/doses/calculator',
  subscription: '/subscription',
  // v3 tracker hub
  tracker: '/tracker',
  'tracker-weight': '/tracker/weight',
  'tracker-sleep': '/tracker/sleep',
  'tracker-mood': '/tracker/mood',
  'tracker-photos': '/tracker/photos',
  // v3 doses hub
  doses: '/doses',
  'doses-calculator': '/doses/calculator',
  'doses-stack-builder': '/doses/stack-builder',
  'doses-library': '/doses/library',
  'doses-tracker': '/doses/tracker',
  'doses-side-effects': '/doses/side-effects',
  // v3 activity hub
  activity: '/activity',
  'activity-performance': '/activity/performance',
  // v3 labs + body comp
  labs: '/labs',
  'labs-entry': '/labs/entry',
  'body-composition': '/body-composition',
  'body-composition-entry': '/body-composition/entry',
  // Pantry
  pantry: '/pantry',
  'pantry-add': '/pantry/add',
  'pantry-scan': '/pantry/scan',
  // Aimee reports
  'aimee-reports': '/aimee/reports',
  // Community v2
  'community-leaderboard': '/community/leaderboard',
  'community-milestones': '/community/milestones',
  // Profile drills
  'profile-appearance': '/profile/appearance',
  'profile-community-prefs': '/profile/community-prefs',
  'settings-notifications': '/settings/notifications',
};

export function execLogWater(
  input: Record<string, unknown>,
  localDate?: string,
): Record<string, unknown> {
  const ounces = Number(input.ounces);
  if (!Number.isFinite(ounces) || ounces <= 0) {
    return { error: 'ounces must be > 0' };
  }
  // Sanity cap — single log shouldn't exceed 200 oz (a gallon-and-a-half).
  // Prevents a hallucinated 9999 from poisoning daily totals.
  if (ounces > 200) return { error: 'ounces too large (max 200 per log)' };
  // When the model omits the date, default to the user's LOCAL date, not
  // server UTC, so an evening log doesn't land on tomorrow for US users.
  const date =
    typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
      ? input.date
      : todayFor(localDate);
  return {
    ok: true,
    summary: `Log ${Math.round(ounces)} oz of water for ${date}.`,
    client_action: {
      type: 'log_water',
      payload: { ounces: Math.round(ounces), date },
    },
  };
}

export function execLogAppetite(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const state = typeof input.state === 'string' ? input.state : '';
  if (!['hungry', 'full', 'nauseous'].includes(state)) {
    return { error: 'state must be hungry/full/nauseous' };
  }
  const notes =
    typeof input.notes === 'string' && input.notes.length <= 200
      ? input.notes
      : undefined;
  return {
    ok: true,
    summary: `Log appetite: ${state}${notes ? ` (${notes})` : ''}.`,
    client_action: {
      type: 'log_appetite',
      payload: { state, notes },
    },
  };
}

export function execAddToPantry(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const raw = Array.isArray(input.items) ? input.items : [];
  if (raw.length === 0) return { error: 'items array required' };
  if (raw.length > 20) return { error: 'max 20 items per call' };
  const items = raw
    .map((it: any) => {
      const name = typeof it?.name === 'string' ? it.name.trim() : '';
      if (!name) return null;
      const quantity = Number(it?.quantity);
      const unit = typeof it?.unit === 'string' ? it.unit : 'each';
      const category = typeof it?.category === 'string' ? it.category : undefined;
      const storageLocation =
        typeof it?.storageLocation === 'string' && ['fridge', 'freezer', 'pantry'].includes(it.storageLocation)
          ? it.storageLocation
          : 'pantry';
      return {
        name,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit,
        category,
        storageLocation,
      };
    })
    .filter(Boolean);
  if (items.length === 0) return { error: 'no valid items' };
  return {
    ok: true,
    summary: `Add ${items.length} item${items.length === 1 ? '' : 's'} to your pantry.`,
    client_action: {
      type: 'add_to_pantry',
      payload: { items },
    },
  };
}

export function execNavigateToScreen(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const screen = typeof input.screen === 'string' ? input.screen : '';
  const path = SCREEN_TO_PATH[screen];
  if (!path) {
    return {
      error: `unknown screen: ${screen}`,
      available: Object.keys(SCREEN_TO_PATH),
    };
  }
  return {
    ok: true,
    client_action: { type: 'navigate', path },
    message: `Taking you to ${screen}…`,
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: {
    supabase: any;
    userId: string;
    conversationId: string | null;
    /** User's local-tz date (YYYY-MM-DD) so we don't write to the wrong day. */
    localDate?: string;
  },
): Promise<Record<string, unknown>> {
  switch (toolName) {
    case 'suggest_workout':
      return execSuggestWorkout(ctx.supabase, ctx.userId, toolInput);
    case 'summarize_pattern':
      return execSummarizePattern(ctx.supabase, ctx.userId, toolInput);
    case 'get_user_metrics':
      return execGetUserMetrics(ctx.supabase, ctx.userId, toolInput);
    case 'draft_meal_template':
      return execDraftMealTemplate(ctx.supabase, ctx.userId, toolInput, ctx.conversationId);
    case 'log_meal':
      return execLogMeal(toolInput, ctx.localDate);
    case 'propose_log_field':
      return execProposeLogField(
        ctx.supabase,
        ctx.userId,
        toolInput,
        ctx.conversationId,
        ctx.localDate,
      );
    case 'log_dose':
      return execLogDose(toolInput, ctx.localDate);
    case 'schedule_workout':
      return execScheduleWorkout(toolInput);
    case 'open_dosing_calculator':
      return execOpenDosingCalculator(toolInput);
    case 'navigate_to_screen':
      return execNavigateToScreen(toolInput);
    case 'log_water':
      return execLogWater(toolInput, ctx.localDate);
    case 'log_appetite':
      return execLogAppetite(toolInput);
    case 'add_to_pantry':
      return execAddToPantry(toolInput);
    default:
      return { error: `unknown tool: ${toolName}` };
  }
}

// ─── Small numeric helpers ────────────────────────────────────────────────

/**
 * Resolve the "today" default for a log entry. Prefers the user's
 * client-supplied LOCAL date (YYYY-MM-DD) so an entry made at 9 PM PST
 * lands on the correct calendar day instead of tomorrow's server-UTC
 * date. Falls back to server UTC only when the client didn't send one.
 */
function todayFor(localDate?: string): string {
  return (typeof localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(localDate))
    ? localDate
    : new Date().toISOString().slice(0, 10);
}

/**
 * Reject dates more than 1 day in the future (timezone slop) and
 * more than 365 days in the past (don't let the model log doses for
 * 2099-01-01 or 1999 just because the user phrased a prompt cleverly).
 * When the input is missing or out of range, falls back to the user's
 * local date (`fallbackLocalDate`) if provided, else server UTC today —
 * this fixes the wrong-calendar-day bug for users behind UTC who omit
 * the date (the common "I just took/ate X" case).
 */
function sanitizeRecentDate(input: unknown, fallbackLocalDate?: string): string {
  const fallback = todayFor(fallbackLocalDate);
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return fallback;
  }
  const parsed = new Date(`${input}T12:00:00Z`).getTime();
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const now = Date.now();
  const dayMs = 86_400_000;
  if (parsed > now + 1 * dayMs || parsed < now - 365 * dayMs) {
    return fallback;
  }
  return input;
}

/**
 * Future-scheduled workouts can land up to 365 days ahead (annual
 * meso-cycle planners) but never in the past (you don't "schedule"
 * what's already happened — that's `finishWorkout`).
 */
function sanitizeFutureDate(input: unknown): string | null {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const parsed = new Date(`${input}T12:00:00Z`).getTime();
  if (!Number.isFinite(parsed)) return null;
  const now = Date.now();
  const dayMs = 86_400_000;
  if (parsed < now - 1 * dayMs || parsed > now + 365 * dayMs) return null;
  return input;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((acc, n) => acc + n, 0) / arr.length;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
