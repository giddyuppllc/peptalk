/**
 * Every Aimee tool, end to end: what the model can call → what the edge
 * function returns → what the app does with it.
 *
 * "The ability for AI to interact with the app never seems to work right"
 * (James, 2026-11-05) came down to the three layers disagreeing: tools that
 * queried columns production does not have, a confirm that wrote rows the app
 * never reads back, and fields mapped to columns that do not exist. These tests
 * run the REAL server executors (supabase/functions/aimee-chat-stream/_tools.ts)
 * and feed their output to the REAL client sanitizers and nav allowlist.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AIMEE_TOOLS,
  SCREEN_TO_PATH,
  executeTool,
} from '../../../supabase/functions/aimee-chat-stream/_tools';
import {
  sanitizeAddToPantry,
  sanitizeLogAppetite,
  sanitizeLogDose,
  sanitizeLogMeal,
  sanitizeLogWater,
  sanitizeScheduleWorkout,
} from '../../utils/aimeeActionSanitize';
import { isAllowedNavigationPath } from '../aimeeNavAllowlist';

const ROOT = join(__dirname, '..', '..', '..');
const TODAY = new Date().toISOString().slice(0, 10);

/** Production columns, read 2026-11-05 (information_schema). */
const PROD_COLUMNS: Record<string, string[]> = {
  check_ins: 'id user_id date mood energy stress recovery sleep_quality appetite weight_lbs resting_heart_rate steps hrv_ms vo2_max spo2 notes emotion_tags side_effect_tags peptide_effects sleep_stages active_calories created_at source respiratory_rate body_measurements'.split(' '),
  workout_logs: 'id user_id started_at completed_at duration_minutes program_id day_id sets rating notes workout_name created_at'.split(' '),
  meal_entries: 'id user_id date meal_type timestamp foods quick_log notes created_at source'.split(' '),
  dose_logs: 'id user_id peptide_id peptide_name amount unit route date time site batch_number notes created_at source'.split(' '),
  active_protocols: 'id user_id peptide_id peptide_name dose_amount dose_unit route frequency start_date end_date is_active created_at'.split(' '),
  profiles: 'id email name first_name last_name avatar_url subscription_tier is_pro favorite_peptides created_at updated_at share_anonymized_data username display_name is_plus age_range age_attested_at age_gate_min phone date_of_birth address_line1 address_line2 city region postal_code country welcome_email_sent_at leaderboard_opt_in'.split(' '),
  health_profiles: 'user_id profile setup_complete current_step updated_at'.split(' '),
  exercises_library: 'id name muscles priority level location gender metrics created_at'.split(' '),
  aimee_pending_actions: 'id user_id conversation_id tool_name input output status created_at expires_at resolved_at'.split(' '),
};

/** Columns migration 20261105020000 adds, read from the migration file itself. */
const MIGRATION_SQL = readFileSync(join(ROOT, 'supabase', 'migrations', '20261105020000_aimee_tool_columns.sql'), 'utf8');
function migrationColumns(table: string): string[] {
  const block =
    MIGRATION_SQL.split(`ALTER TABLE public.${table}`)
      .slice(1)
      .map((seg) => seg.split(';')[0])
      .find((seg) => /ADD COLUMN/.test(seg)) ?? '';
  return [...block.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
}
const AFTER_MIGRATION: Record<string, string[]> = Object.fromEntries(
  Object.entries(PROD_COLUMNS).map(([t, cols]) => [t, [...cols, ...migrationColumns(t)]]),
);

/**
 * A Supabase stand-in that records every table + column a query names and,
 * like PostgREST, fails a query that names a column the schema lacks (42703).
 * `schema` = production today, or production after the migration.
 */
function recordingDb(
  schema: Record<string, string[]> = AFTER_MIGRATION,
  rows: Record<string, unknown[]> = {},
) {
  const calls: { table: string; columns: string[]; failed: boolean }[] = [];
  const builder = (table: string): any => {
    let failed = false;
    const result = () =>
      failed ? { data: null, error: { code: '42703', message: 'column does not exist' } } : { data: rows[table] ?? [], error: null };
    const b: any = {
      select: (cols: string) => {
        const columns = cols.split(',').map((c) => c.trim()).filter(Boolean);
        failed = columns.some((c) => !(schema[table] ?? []).includes(c));
        calls.push({ table, columns, failed });
        return b;
      },
      eq: () => b, gte: () => b, order: () => b, limit: () => b, in: () => b, overlaps: () => b,
      insert: (row: Record<string, unknown>) => {
        calls.push({ table, columns: Object.keys(row), failed: false });
        return b;
      },
      single: async () => (failed ? result() : { data: { id: 'x' }, error: null }),
      maybeSingle: async () => (failed ? result() : { data: (rows[table] ?? [])[0] ?? null, error: null }),
      then: (r: any, j?: any) => Promise.resolve(result()).then(r, j),
    };
    return b;
  };
  return { calls, db: { from: builder } };
}

const ctx = (db: unknown) => ({ supabase: db, userId: 'u1', conversationId: null, localDate: TODAY });

/** The client_action types the chat screen actually handles. */
const SCREEN_SRC = readFileSync(join(ROOT, 'app', '(tabs)', 'peptalk.tsx'), 'utf8');
const CLIENT_WRITE_TYPES = [...SCREEN_SRC.matchAll(/action\.type === '([a-z_]+)'/g)].map((m) => m[1]);
const CARD_CONFIRM_TOOLS = [...SCREEN_SRC.matchAll(/action\.tool === '([a-z_]+)'/g)].map((m) => m[1]);

describe('every tool the model can call', () => {
  const names = AIMEE_TOOLS.map((t) => t.function.name);

  it('has an executor (no "unknown tool")', async () => {
    for (const name of names) {
      const out = await executeTool(name, {}, ctx(recordingDb().db));
      expect({ name, err: out.error }).not.toEqual({ name, err: `unknown tool: ${name}` });
    }
  });

  it('after the migration: reads the designed columns, and every column exists', async () => {
    for (const name of ['summarize_pattern', 'get_user_metrics', 'suggest_workout']) {
      const { calls, db } = recordingDb(AFTER_MIGRATION);
      await executeTool(name, { muscles: ['Chest'] }, ctx(db));
      for (const c of calls) expect({ name, table: c.table, failed: c.failed }).toMatchObject({ failed: false });
    }
    const { calls, db } = recordingDb(AFTER_MIGRATION);
    await executeTool('get_user_metrics', {}, ctx(db));
    const asked = calls.flatMap((c) => c.columns);
    for (const col of ['height_cm', 'weight_kg', 'gender', 'date_of_birth', 'sleep_hours', 'symptoms']) expect(asked).toContain(col);
  });

  it('before the migration: tolerates the missing columns and still answers', async () => {
    const rows = {
      check_ins: [{ date: TODAY, mood: 4, energy: 3, sleep_quality: 4 }],
      health_profiles: [{ profile: { bodyMetrics: { heightInches: 65, weightLbs: 150 }, dateOfBirth: '1990-01-01', biologicalSex: 'female' } }],
      profiles: [{ subscription_tier: 'pro', date_of_birth: null }],
    };
    const trends = await executeTool('summarize_pattern', { signals: ['mood', 'sleep'] }, ctx(recordingDb(PROD_COLUMNS, rows).db));
    expect(trends.checkins).toMatchObject({ count: 1, avgMood: 4, avgSleepQuality1to5: 4 });
    const metrics = await executeTool('get_user_metrics', {}, ctx(recordingDb(PROD_COLUMNS, rows).db));
    // Falls back to the health profile, so nothing is lost before the backfill.
    expect(metrics.profile).toMatchObject({ height_cm: 165.1, weight_kg: 68, dob: '1990-01-01', gender: 'female' });
  });

  it('after the migration: sleep hours are averaged', async () => {
    const rows = { check_ins: [{ date: TODAY, mood: 4, energy: 3, sleep_quality: 4, sleep_hours: 7.5 }] };
    const trends = await executeTool('summarize_pattern', { signals: ['sleep'] }, ctx(recordingDb(AFTER_MIGRATION, rows).db));
    expect(trends.checkins).toMatchObject({ avgSleepHours: 7.5 });
  });
});

describe('client-action tools: server output → app handler', () => {
  async function action(name: string, input: Record<string, unknown>) {
    const out = await executeTool(name, input, ctx(recordingDb().db));
    expect(out.error).toBeUndefined();
    const ca = out.client_action as { type: string; payload?: any; path?: string };
    expect(ca).toBeTruthy();
    return ca;
  }

  it('log_dose → sanitizeLogDose', async () => {
    const ca = await action('log_dose', { peptideName: 'Selank', amount: 250, unit: 'mcg' });
    expect(CLIENT_WRITE_TYPES).toContain(ca.type);
    expect(CARD_CONFIRM_TOOLS).toContain(ca.type);
    expect(sanitizeLogDose(ca.payload)).toMatchObject({ amount: 250, unit: 'mcg', date: TODAY });
  });

  it('log_meal → sanitizeLogMeal', async () => {
    const ca = await action('log_meal', {
      mealType: 'lunch', title: 'Eggs and toast',
      items: [{ name: 'Eggs', calories: 140, proteinGrams: 12 }],
    });
    expect(CLIENT_WRITE_TYPES).toContain(ca.type);
    const meal = sanitizeLogMeal(ca.payload);
    expect(meal?.mealType).toBe('lunch');
    expect(meal?.foods[0]).toMatchObject({ foodName: 'Eggs', calories: 140, proteinGrams: 12 });
  });

  it('draft_meal_template keeps its server record', async () => {
    const { calls, db } = recordingDb();
    const out = await executeTool('draft_meal_template', { mealType: 'lunch', title: 'Bowl', items: [{ name: 'Rice' }] }, ctx(db));
    expect(out.template_record_id).toBe('x');
    expect(out.requires_confirm).toBeUndefined(); // one confirm card, the client's
    expect(calls.some((c) => c.table === 'aimee_pending_actions')).toBe(true);
    expect(SCREEN_SRC).toMatch(/action\.tool === 'draft_meal_template'[\s\S]{0,400}saveAimeeMealTemplate\(action\.preview\)[\s\S]{0,80}applyLogMealAction\(action\.preview\)/);
    expect(SCREEN_SRC).toMatch(/addMealTemplateAction\(\{/);
  });

  it('draft_meal_template → confirm card → sanitizeLogMeal (shows in the meal log)', async () => {
    const ca = await action('draft_meal_template', {
      mealType: 'breakfast', title: 'Greek yogurt bowl',
      items: [{ name: 'Greek yogurt', amount: '1 cup', proteinGrams: 20, calories: 150 }],
    });
    expect(ca.type).toBe('draft_meal_template');
    expect(CLIENT_WRITE_TYPES).toContain('draft_meal_template');
    expect(CARD_CONFIRM_TOOLS).toContain('draft_meal_template');
    const meal = sanitizeLogMeal(ca.payload);
    expect(meal?.mealType).toBe('breakfast');
    expect(meal?.foods[0]).toMatchObject({ foodName: 'Greek yogurt', proteinGrams: 20, calories: 150 });
  });

  it('schedule_workout → sanitizeScheduleWorkout', async () => {
    const ca = await action('schedule_workout', { name: 'Push day', date: TODAY, time: '07:30' });
    expect(CLIENT_WRITE_TYPES).toContain(ca.type);
    expect(sanitizeScheduleWorkout(ca.payload)).toMatchObject({ workoutName: 'Push day' });
  });

  it('log_water → sanitizeLogWater', async () => {
    const ca = await action('log_water', { ounces: 16 });
    expect(CLIENT_WRITE_TYPES).toContain(ca.type);
    expect(sanitizeLogWater(ca.payload)).toMatchObject({ ounces: 16, date: TODAY });
  });

  it('log_appetite → sanitizeLogAppetite', async () => {
    const ca = await action('log_appetite', { state: 'hungry' });
    expect(CLIENT_WRITE_TYPES).toContain(ca.type);
    expect(sanitizeLogAppetite(ca.payload)).toMatchObject({ state: 'hungry' });
  });

  it('add_to_pantry → sanitizeAddToPantry', async () => {
    const ca = await action('add_to_pantry', { items: [{ name: 'Eggs', quantity: 12, unit: 'each', category: 'protein', storageLocation: 'fridge' }] });
    expect(CLIENT_WRITE_TYPES).toContain(ca.type);
    expect(sanitizeAddToPantry(ca.payload)[0]).toMatchObject({ name: 'Eggs' });
  });

  it('open_dosing_calculator → an allowed, real route, pre-filled only from the user\'s own data', async () => {
    const open = async (input: Record<string, unknown>, rows: Record<string, unknown[]> = {}) => {
      const out = await executeTool('open_dosing_calculator', input, ctx(recordingDb(AFTER_MIGRATION, rows).db));
      const ca = out.client_action as { type: string; path: string };
      expect(ca.type).toBe('navigate');
      expect(isAllowedNavigationPath(ca.path)).toBe(true);
      return { path: ca.path, from: out.prefilledFrom };
    };
    // What the user said wins.
    expect(await open({ peptideId: 'bpc-157', doseMcg: 300, vialMg: 5, waterMl: 2 })).toMatchObject({ from: 'stated' });
    // Else their active protocol (mg → mcg)...
    const proto = await open({ peptideId: 'bpc-157' }, { active_protocols: [{ peptide_id: 'bpc-157', dose_amount: 0.25, dose_unit: 'mg' }] });
    expect(proto).toMatchObject({ from: 'protocol' });
    expect(proto.path).toMatch(/doseMcg=250/);
    // ...else their last logged dose.
    const log = await open({ peptideId: 'selank' }, { dose_logs: [{ peptide_id: 'selank', amount: 300, unit: 'mcg', date: TODAY }] });
    expect(log).toMatchObject({ from: 'dose_log' });
    expect(log.path).toMatch(/doseMcg=300/);
    // No data of theirs → no dose; the calculator fills vial/water from its reference.
    const none = await open({ peptideId: 'bpc-157' });
    expect(none.path).toBe('/doses/calculator?peptideId=bpc-157');
    const desc = AIMEE_TOOLS.find((t) => t.function.name === 'open_dosing_calculator')!.function.description;
    expect(desc).toMatch(/never put in an amount you chose/);
  });

  it('navigate_to_screen: every advertised screen maps to an allowed route that exists', () => {
    const desc = AIMEE_TOOLS.find((t) => t.function.name === 'navigate_to_screen')!.function.description;
    const list = desc.slice(desc.indexOf('Available screens'));
    const advertised = [...list.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
    expect(advertised.length).toBeGreaterThan(20);
    for (const screen of advertised) {
      const path = SCREEN_TO_PATH[screen];
      expect({ screen, mapped: !!path }).toEqual({ screen, mapped: true });
      expect({ screen, path, allowed: isAllowedNavigationPath(path) }).toMatchObject({ allowed: true });
      const rel = path.replace(/^\//, '');
      const candidates = [`app/${rel}.tsx`, `app/${rel}/index.tsx`, rel === '(tabs)' ? 'app/(tabs)/index.tsx' : ''];
      expect({ screen, path, exists: candidates.some((c) => c && existsSync(join(ROOT, c))) }).toMatchObject({ exists: true });
    }
  });
});

describe('propose_log_field: model enum → confirm function → real columns', () => {
  const confirmSrc = readFileSync(join(ROOT, 'supabase', 'functions', 'aimee-action-confirm', 'index.ts'), 'utf8');
  const map = Object.fromEntries(
    [...confirmSrc.slice(confirmSrc.indexOf('const fieldMap'), confirmSrc.indexOf('};', confirmSrc.indexOf('const fieldMap'))).matchAll(/(\w+): '(\w+)'/g)].map((m) => [m[1], m[2]]),
  );
  const tool = AIMEE_TOOLS.find((t) => t.function.name === 'propose_log_field')!;
  const fields = (tool.function.parameters as any).properties.field.enum as string[];

  it('the designed fields are all there, and each maps to a column that exists after the migration', () => {
    expect(fields).toEqual(expect.arrayContaining(['mood', 'energy', 'sleepHours', 'sleepQuality', 'weightLbs', 'symptoms', 'notes']));
    for (const f of fields) {
      expect({ f, column: map[f] }).toEqual({ f, column: expect.any(String) });
      expect({ f, ok: AFTER_MIGRATION.check_ins.includes(map[f]) }).toEqual({ f, ok: true });
    }
    expect(map).toMatchObject({ sleepHours: 'sleep_hours', symptoms: 'symptoms', sleepQuality: 'sleep_quality' });
  });

  it('before the migration a new column falls back or says so — never a crash', () => {
    expect(confirmSrc).toMatch(/symptoms: 'side_effect_tags'/);
    expect(confirmSrc).toMatch(/sleep_hours: null/);
    expect(confirmSrc).toMatch(/can be saved once the database update/);
  });

  it('queues a pending action the confirm card can show', async () => {
    const { calls, db } = recordingDb();
    const out = await executeTool('propose_log_field', { field: 'sleepQuality', value: 4 }, ctx(db));
    expect(out).toMatchObject({ requires_confirm: true, pending_action_id: 'x' });
    const insert = calls.find((c) => c.table === 'aimee_pending_actions')!;
    for (const col of insert.columns) expect(PROD_COLUMNS.aimee_pending_actions).toContain(col);
  });

  it('the screen refreshes check-ins after the server writes one', () => {
    expect(SCREEN_SRC).toMatch(/a\.tool === 'propose_log_field'[\s\S]{0,120}syncFromServer/);
  });
});
