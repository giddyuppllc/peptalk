/**
 * Sync Service — Bridges Zustand local stores with Supabase cloud storage.
 *
 * Each store calls sync methods after local mutations. Data flows:
 *   Local write → Zustand store (instant) → Supabase upsert (async background)
 *   App start → Supabase fetch → Merge into Zustand store
 *
 * All syncs are fire-and-forget with error logging — the app works offline,
 * cloud sync is best-effort.
 */

import { supabase } from './supabase';

// Use `any` for dynamic table queries — Supabase types are strict
// but we're doing generic cross-table operations here
const db = supabase as any;

type TableName =
  | 'check_ins'
  | 'dose_logs'
  | 'meal_entries'
  | 'workout_logs'
  | 'chat_messages'
  | 'journal_entries'
  | 'saved_stacks'
  | 'health_profiles'
  | 'injection_sites'
  | 'pantry_items'
  | 'cycle_period_entries'
  | 'cycle_day_logs'
  | 'contraception_history'
  | 'connected_integrations'
  | 'allergen_entries';

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

async function getUserId(): Promise<string | null> {
  const { data: { session } } = await db.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Upsert a single record to a Supabase table.
 * Silently fails if offline or unauthenticated.
 */
export async function syncRecord(
  table: TableName,
  record: Record<string, unknown>
): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const { error } = await db
      .from(table)
      .upsert({ ...record, user_id: userId }, { onConflict: 'id' });

    if (error) console.warn(`[sync] ${table} upsert failed:`, error.message);
  } catch (e) {
    console.warn(`[sync] ${table} sync error:`, e);
  }
}

/**
 * Insert a single record (no upsert — for append-only tables like chat_messages).
 */
export async function insertRecord(
  table: TableName,
  record: Record<string, unknown>
): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const { error } = await db
      .from(table)
      .insert({ ...record, user_id: userId });

    if (error) console.warn(`[sync] ${table} insert failed:`, error.message);
  } catch (e) {
    console.warn(`[sync] ${table} sync error:`, e);
  }
}

/**
 * Delete a record from Supabase.
 */
export async function deleteRecord(
  table: TableName,
  recordId: string
): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const { error } = await db
      .from(table)
      .delete()
      .eq('id', recordId)
      .eq('user_id', userId);

    if (error) console.warn(`[sync] ${table} delete failed:`, error.message);
  } catch (e) {
    console.warn(`[sync] ${table} sync error:`, e);
  }
}

/**
 * Fetch all records for the current user from a table.
 * Used on app start to hydrate local stores from cloud.
 */
export async function fetchUserRecords<T = Record<string, unknown>>(
  table: TableName,
  options?: {
    orderBy?: string;
    ascending?: boolean;
    limit?: number;
  }
): Promise<T[]> {
  const userId = await getUserId();
  if (!userId) return [];

  try {
    let query = db
      .from(table)
      .select('*')
      .eq('user_id', userId);

    if (options?.orderBy) {
      query = query.order(options.orderBy, { ascending: options.ascending ?? false });
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.warn(`[sync] ${table} fetch failed:`, error.message);
      return [];
    }

    return (data ?? []) as T[];
  } catch (e) {
    console.warn(`[sync] ${table} fetch error:`, e);
    return [];
  }
}

/**
 * Sync the user's health profile. The DB stores the full profile JSON in a
 * single `profile` column so we never have to migrate shape changes.
 */
export async function syncHealthProfile(
  profile: unknown,
  extras?: { setup_complete?: boolean; current_step?: number }
): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    const { error } = await db
      .from('health_profiles')
      .upsert(
        {
          user_id: userId,
          profile,
          setup_complete: extras?.setup_complete ?? undefined,
          current_step: extras?.current_step ?? undefined,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (error) console.warn('[sync] health_profiles upsert failed:', error.message);
  } catch (e) {
    console.warn('[sync] health_profiles sync error:', e);
  }
}

/**
 * Batch sync — push multiple records at once.
 * Used for initial sync or catch-up after being offline.
 */
export async function batchSync(
  table: TableName,
  records: Record<string, unknown>[]
): Promise<void> {
  const userId = await getUserId();
  if (!userId || records.length === 0) return;

  try {
    const withUserId = records.map((r) => ({ ...r, user_id: userId }));
    const { error } = await db
      .from(table)
      .upsert(withUserId, { onConflict: 'id' });

    if (error) console.warn(`[sync] ${table} batch failed:`, error.message);
  } catch (e) {
    console.warn(`[sync] ${table} batch error:`, e);
  }
}

/**
 * Generic "hydrate local store from server" helper.
 *
 * The stores handle their own TypeScript shapes — pass a mapper that
 * takes a DB row and returns the local entry. Local entries keyed by
 * the same id as the DB row are overwritten by the server copy; any
 * local-only entries (e.g. offline edits that haven't synced yet) are
 * preserved.
 *
 * Callers:
 *   const merged = await hydrateFromServer<DbMeal, MealEntry>(
 *     'meal_entries',
 *     localMeals,
 *     (row) => toMealEntry(row),
 *     { orderBy: 'date', limit: 2000 },
 *   );
 */
export async function hydrateFromServer<Row, Entry extends { id: string }>(
  table: TableName,
  localEntries: Entry[],
  mapRow: (row: Row) => Entry,
  options?: { orderBy?: string; ascending?: boolean; limit?: number },
): Promise<Entry[]> {
  try {
    const rows = await fetchUserRecords<Row>(table, {
      orderBy: options?.orderBy,
      ascending: options?.ascending ?? false,
      limit: options?.limit,
    });
    if (rows.length === 0) return localEntries;
    const serverEntries = rows.map(mapRow).filter((e): e is Entry => !!e && !!e.id);
    const byId = new Map<string, Entry>();
    for (const e of localEntries) byId.set(e.id, e);
    for (const e of serverEntries) byId.set(e.id, e); // server wins on id conflict
    return Array.from(byId.values());
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[sync] ${table} hydrate failed:`, e);
    }
    return localEntries;
  }
}

/**
 * Sync subscription tier to profile.
 */
export async function syncSubscriptionTier(tier: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    await db
      .from('profiles')
      .update({ subscription_tier: tier, is_pro: tier === 'pro' })
      .eq('id', userId);
  } catch (e) {
    console.warn('[sync] tier sync error:', e);
  }
}
