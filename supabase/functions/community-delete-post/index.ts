/**
 * community-delete-post — owner-only soft-delete.
 *
 * Sets `is_deleted = true` on a post the requester owns. Soft-delete
 * preserves audit trail and lets us later show "deleted by author"
 * tombstones in places that referenced the post (notifications,
 * comment threads, etc.) without breaking foreign keys.
 *
 * Body: { postId }
 *
 * Admins can also delete via the existing `community-moderate` flow
 * (different path, separate auth); this function is exclusively for
 * the post's own author.
 *
 * Deploy: supabase functions deploy community-delete-post
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Invalid session' }, 401);

    const body = await req.json().catch(() => ({}));
    const postId = String(body?.postId ?? '').trim();
    if (!postId) return json({ error: 'postId required' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: post } = await admin
      .from('community_posts')
      .select('id, user_id, is_deleted')
      .eq('id', postId)
      .maybeSingle();
    if (!post) return json({ error: 'Post not found.' }, 404);
    if (post.is_deleted) return json({ ok: true }); // idempotent
    if (post.user_id !== user.id) return json({ error: 'Not the post owner.' }, 403);

    const { error: updateErr } = await admin
      .from('community_posts')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', postId);
    if (updateErr) throw updateErr;

    return json({ ok: true });
  } catch (err) {
    console.error('[community-delete-post]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
