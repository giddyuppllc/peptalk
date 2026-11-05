/**
 * Delete User — Supabase Edge Function
 *
 * Permanently deletes the authenticated user's account and all associated data.
 * Required by Apple App Store guidelines.
 *
 * Deploy: supabase functions deploy delete-user
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { reportError } from '../_shared/sentry.ts';
import { billableWebSubs, cancelSquareSubscriptions, squareBase } from '../_shared/squareCancel.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the user's token
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role client to delete user + cascading data
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    /*
     * Stop billing BEFORE anything is deleted. A web (Square) subscription is
     * billed by Square, not by these rows: deleting them and the account used
     * to leave Square charging a user who no longer had an account to cancel
     * from. If Square does not confirm every cancel, nothing is deleted and the
     * user is told, so they are never left paying for a deleted account.
     * (App Store / Play subscriptions are the store's to cancel; the app's
     * deletion flow already points users there.)
     */
    const { data: webSubs, error: webSubErr } = await adminClient
      .from('subscriptions')
      .select('product_id, original_transaction_id, expires_at')
      .eq('user_id', user.id)
      .eq('platform', 'web')
      .eq('is_active', true)
      .not('original_transaction_id', 'is', null);
    if (webSubErr) {
      console.error('[delete-user] could not read web subscriptions:', webSubErr);
      return new Response(JSON.stringify({ error: 'Could not check your subscription. Please try again.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const billable = billableWebSubs((webSubs ?? []) as { product_id: string; original_transaction_id: string; expires_at: string | null }[]);
    if (billable.length > 0) {
      const token = Deno.env.get('SQUARE_ACCESS_TOKEN') ?? '';
      const results = token
        ? await cancelSquareSubscriptions(billable, { token, base: squareBase(Deno.env.get('SQUARE_ENV')), tag: 'delete-user' })
        : billable.map((r) => ({ subscriptionId: r.original_transaction_id, ok: false, error: 'Square not configured' }));
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        reportError('delete-user', new Error(`square cancel failed for ${failed.map((f) => f.subscriptionId).join(',')}`));
        return new Response(
          JSON.stringify({
            error:
              "We couldn't cancel your web subscription, so your account was not deleted (deleting it would leave the subscription billing). Please try again, or contact support@peptalk.bio.",
            subscriptionCancelFailed: true,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Delete user data from EVERY user-keyed table before removing the
    // auth record. ON DELETE CASCADE usually handles this, but we defense-
    // in-depth here because a missing cascade leaves orphan PII rows.
    // Kept in sync with the TableName union in src/services/syncService.ts.
    //
    // Ordering: data tables first, profiles last (some reference profiles.id).
    // Keep this list in sync with the TableName union in
    // src/services/syncService.ts + any new user-keyed table added via
    // a migration. `ai_usage_log` is non-PII counters but still user-scoped.
    const tables = [
      'check_ins',
      'dose_logs',
      'active_protocols',
      'meal_entries',
      'workout_logs',
      'chat_messages',
      'journal_entries',
      'saved_stacks',
      'health_profiles',
      'injection_sites',
      'pantry_items',
      'cycle_period_entries',
      'cycle_day_logs',
      'contraception_history',
      'connected_integrations',
      'allergen_entries',
      'side_effect_entries',
      'lab_results',
      'ai_usage_log',
      // Per-user daily AI spend. No FK to auth.users (the table also holds the
      // system-wide total under the all-zeros id, which this never matches),
      // so nothing else removes a deleted user's rows.
      'aimee_cost_cents',
      'subscription_events',
      'subscriptions',
      // Web push (cascade on auth.users too; listed so nothing waits on it).
      'web_push_subscriptions',
      'web_dose_reminders',
      'web_one_shot_alerts',
      'profiles',
    ];
    for (const table of tables) {
      const { error } = await adminClient.from(table).delete().eq('user_id', user.id);
      // Profiles uses `id` not `user_id`; retry with the correct column name.
      if (error && table === 'profiles') {
        await adminClient.from('profiles').delete().eq('id', user.id);
      } else if (error) {
        console.warn(`[delete-user] table ${table} delete returned error:`, error);
      }
    }

    // Delete the auth user (this is the final nuke)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('[delete-user] Failed to delete auth user:', deleteError);
      return new Response(JSON.stringify({ error: 'Failed to delete account' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    reportError('delete-user', err);
    console.error('[delete-user] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
