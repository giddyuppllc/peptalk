/**
 * Aimee Pending Action Confirm — Supabase Edge Function.
 *
 * The streaming chat endpoint emits `pending_action` events when a tool
 * proposes a write (draft_meal_template, propose_log_field). The client
 * shows the user a Confirm/Edit/Cancel modal. This endpoint executes the
 * commit when the user taps Confirm.
 *
 * Flow:
 *   1. Verify the action row exists, belongs to the caller, is 'pending'.
 *   2. Branch by tool_name and write to the appropriate user table.
 *   3. Flip the action's status to 'confirmed' (or 'cancelled' for cancel).
 *
 * Auth: required (user must own the action). Action ids are UUIDs and
 * RLS prevents cross-user access even with a leaked id.
 *
 * POST body:
 *   { action_id: "uuid", decision: "confirm" | "cancel", edits?: {...} }
 *
 * Returns:
 *   { ok: true, status: "confirmed"|"cancelled", written?: {...} }
 *
 * Deploy: supabase functions deploy aimee-action-confirm
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 1. Auth ----------------------------------------------------------------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonError(401, 'Missing auth token');
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return jsonError(401, 'Invalid auth token');
  }

  // 2. Parse body ---------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON');
  }
  const actionId = typeof body.action_id === 'string' ? body.action_id : null;
  const decision = body.decision === 'confirm' ? 'confirm' : 'cancel';
  const edits = (body.edits && typeof body.edits === 'object')
    ? (body.edits as Record<string, unknown>)
    : null;

  if (!actionId) return jsonError(400, 'action_id required');

  // 3. Load the pending action --------------------------------------------
  const { data: action, error: loadErr } = await supabase
    .from('aimee_pending_actions')
    .select('id, user_id, tool_name, input, output, status, expires_at')
    .eq('id', actionId)
    .single();
  if (loadErr || !action) {
    return jsonError(404, 'Action not found');
  }
  if (action.user_id !== user.id) {
    // RLS would normally catch this, but be defensive: never leak existence.
    return jsonError(404, 'Action not found');
  }
  if (action.status !== 'pending') {
    return jsonError(409, `Action already ${action.status}`);
  }
  if (action.expires_at && new Date(action.expires_at) < new Date()) {
    // Auto-expire.
    await supabase
      .from('aimee_pending_actions')
      .update({ status: 'expired', resolved_at: new Date().toISOString() })
      .eq('id', actionId);
    return jsonError(410, 'Action expired');
  }

  // 4. Branch on decision -------------------------------------------------
  if (decision === 'cancel') {
    await supabase
      .from('aimee_pending_actions')
      .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
      .eq('id', actionId);
    return ok({ status: 'cancelled' });
  }

  // 5. Confirm — write to the target table --------------------------------
  const output = mergeEdits(action.output, edits);
  let written: Record<string, unknown> = {};
  try {
    if (action.tool_name === 'draft_meal_template') {
      written = await commitMealTemplate(supabase, user.id, output);
    } else if (action.tool_name === 'propose_log_field') {
      written = await commitLogField(supabase, user.id, output);
    } else {
      // For read-only tools that somehow ended up here, just mark confirmed.
      written = { note: 'no-op for non-write tool' };
    }
  } catch (e) {
    console.error('[aimee-action-confirm] commit failed:', e);
    return jsonError(500, 'Commit failed');
  }

  await supabase
    .from('aimee_pending_actions')
    .update({
      status: 'confirmed',
      resolved_at: new Date().toISOString(),
      output, // persist user edits for audit trail
    })
    .eq('id', actionId);

  return ok({ status: 'confirmed', written });
});

// ─── Commit handlers ──────────────────────────────────────────────────────

/**
 * Insert a meal template into `meal_entries` as a saved-template-style entry.
 * Marks it as "from_aimee" so the user's history can filter.
 */
async function commitMealTemplate(
  supabase: any,
  userId: string,
  output: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const totals = (output.totals as Record<string, number>) ?? {};
  const items = Array.isArray(output.items) ? (output.items as any[]) : [];
  const today = new Date().toISOString().slice(0, 10);
  const row: Record<string, unknown> = {
    user_id: userId,
    date: today,
    meal_type: output.mealType ?? 'snack',
    title: output.title ?? 'Aimee meal template',
    foods: items, // jsonb in meal_entries
    calories: Math.round(totals.calories ?? 0),
    protein_grams: Math.round(totals.protein ?? 0),
    carbs_grams: Math.round(totals.carbs ?? 0),
    fat_grams: Math.round(totals.fat ?? 0),
    source: 'aimee',
    notes: output.notes ?? null,
  };
  // Some meal_entries deployments have different column names. Try the
  // strict shape first; if it fails on a missing column, retry with the
  // minimal set.
  const tryInsert = async (rowToInsert: Record<string, unknown>) =>
    supabase.from('meal_entries').insert(rowToInsert).select('id').single();

  let { data, error } = await tryInsert(row);
  if (error && /column .* does not exist/i.test(error.message ?? '')) {
    // Retry with a minimal shape.
    const minimal = {
      user_id: userId,
      date: today,
      meal_type: row.meal_type,
      foods: items,
      source: 'aimee',
    };
    ({ data, error } = await tryInsert(minimal));
  }
  if (error) {
    throw new Error(`meal_entries insert failed: ${error.message}`);
  }
  return { meal_entry_id: data?.id, totals };
}

/**
 * Upsert a single field into TODAY's check_in row.
 */
async function commitLogField(
  supabase: any,
  userId: string,
  output: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const field = String(output.field ?? '');
  const value = output.value;
  const today = output.date ?? new Date().toISOString().slice(0, 10);

  const fieldMap: Record<string, string> = {
    mood: 'mood',
    energy: 'energy',
    sleepHours: 'sleep_hours',
    weightLbs: 'weight_lbs',
    symptoms: 'symptoms',
    notes: 'notes',
  };
  const dbField = fieldMap[field];
  if (!dbField) {
    throw new Error(`unknown log field: ${field}`);
  }

  // Read-modify-write. Avoid clobbering other fields the user set today.
  const { data: existing } = await supabase
    .from('check_ins')
    .select('id')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('check_ins')
      .update({ [dbField]: value })
      .eq('id', existing.id);
    if (error) throw new Error(`check_ins update failed: ${error.message}`);
    return { check_in_id: existing.id, field: dbField, value };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('check_ins')
    .insert({
      user_id: userId,
      date: today,
      [dbField]: value,
    })
    .select('id')
    .single();
  if (insertErr) {
    throw new Error(`check_ins insert failed: ${insertErr.message}`);
  }
  return { check_in_id: inserted?.id, field: dbField, value, created: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function jsonError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

function ok(body: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ ok: true, ...body }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

function mergeEdits(
  original: Record<string, unknown> | unknown,
  edits: Record<string, unknown> | null,
): Record<string, unknown> {
  const base = (original && typeof original === 'object')
    ? (original as Record<string, unknown>)
    : {};
  if (!edits) return base;
  // Shallow merge — clients are not allowed to inject arbitrary keys; they
  // can only overwrite existing keys.
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) {
    if (k in edits) out[k] = edits[k];
  }
  return out;
}
