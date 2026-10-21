/**
 * Delete User — Supabase Edge Function
 *
 * Permanently deletes the authenticated user's account and all associated data.
 * Required by Apple App Store guidelines.
 *
 * Deploy: supabase functions deploy delete-user
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from 'npm:@aws-sdk/client-s3@3.658.1';
import { reportError } from '../_shared/sentry.ts';
import { purgeUserImages } from '../_shared/r2UserObjects.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/**
 * Remove the user's community images from R2 (post/, comment/, avatar/ under
 * their id — the keys community-upload-image mints). Without this the images
 * stayed publicly readable after the account was gone.
 *
 * Best-effort: runs only after the auth user is deleted, so a failure never
 * leaves a half-deleted account, and it never fails the request — it reports
 * to Sentry instead. Returns how many objects were deleted, or null if R2 is
 * not configured.
 */
async function deleteUserImages(userId: string): Promise<number | null> {
  const endpoint = Deno.env.get('R2_ENDPOINT');
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.warn('[delete-user] R2 not configured; community images not removed');
    return null;
  }
  const Bucket = Deno.env.get('R2_COMMUNITY_BUCKET') ?? 'peptalk-community';
  const s3 = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });

  const { deleted, failed } = await purgeUserImages(userId, {
    async listPage(Prefix, ContinuationToken) {
      const page = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }));
      return {
        keys: (page.Contents ?? []).map((o) => o.Key ?? ''),
        nextToken: page.IsTruncated ? page.NextContinuationToken : undefined,
      };
    },
    async deleteKeys(keys) {
      const res = await s3.send(
        new DeleteObjectsCommand({
          Bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      return res.Errors?.length ?? 0;
    },
  });
  if (failed > 0) {
    reportError('delete-user', new Error(`R2 image cleanup: ${failed} object(s) not deleted`));
  }
  return deleted;
}

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
      'subscription_events',
      'subscriptions',
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

    // Community images on R2, after the account is really gone.
    try {
      await deleteUserImages(user.id);
    } catch (err) {
      reportError('delete-user', err);
      console.error('[delete-user] R2 image cleanup failed:', err);
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
