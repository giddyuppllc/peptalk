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
  profiles: 'id email name first_name last_name avatar_url subscription_tier is_pro favorite_peptides created_at updated_at'.split(' '),
  health_profiles: 'user_id profile setup_complete current_step updated_at'.split(' '),
  exercises_library: 'id name muscles priority level location gender metrics created_at'.split(' '),
  aimee_pending_actions: 'id user_id conversation_id tool_name input output status created_at expires_at resolved_at'.split(' '),
};

/** A Supabase stand-in that records every table + column a query names. */
function recordingDb() {
  const calls: Array<{ table: string; columns: string[] }> = [];
  const builder = (table: string): any => {
    const b: any = {
      select: (cols: string) => {
        calls.push({ table, columns: cols.split(',').map((c) => c.trim()).filter(Boolean) });
        return b;
      },
      eq: () => b, gte: () => b, order: () => b, limit: () => b, in: () => b, overlaps: () => b,
      insert: (row: Record<string, unknown>) => {
        calls.push({ table, columns: Object.keys(row) });
        return b;
      },
      single: async () => ({ data: { id: 'x' }, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (r: any) => r({ data: [], error: null }),
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

  it('queries only columns that exist in production', async () => {
    for (const name of ['summarize_pattern', 'get_user_metrics', 'suggest_workout']) {
      const { calls, db } = recordingDb();
      await executeTool(name, { muscles: ['Chest'] }, ctx(db));
      for (const c of calls) {
        const known = PROD_COLUMNS[c.table];
        expect({ name, table: c.table, known: !!known }).toEqual({ name, table: c.table, known: true });
        for (const col of c.columns) expect({ name, table: c.table, col, ok: known.includes(col) }).toMatchObject({ ok: true });
      }
    }
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

  it('open_dosing_calculator → an allowed, real route; never invents a dose', async () => {
    const ca = await action('open_dosing_calculator', { peptideId: 'bpc-157', vialMg: 5, waterMl: 2 });
    expect(ca.type).toBe('navigate');
    expect(isAllowedNavigationPath(ca.path!)).toBe(true);
    expect(ca.path).not.toMatch(/doseMcg/);
    const desc = AIMEE_TOOLS.find((t) => t.function.name === 'open_dosing_calculator')!.function.description;
    expect(desc).toMatch(/Never put in an amount the user did not state/);
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

  it('every field the model may propose maps to a check_ins column that exists', () => {
    for (const f of fields) {
      expect({ f, column: map[f] }).toEqual({ f, column: expect.any(String) });
      expect({ f, ok: PROD_COLUMNS.check_ins.includes(map[f]) }).toEqual({ f, ok: true });
    }
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
