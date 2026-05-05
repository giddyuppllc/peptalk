/**
 * community-react — toggle a reaction on a post or comment.
 *
 * Free for all authenticated users (engagement, not creation, drives
 * the spam vector). One reaction of each kind per user-target.
 *
 * Deploy: supabase functions deploy community-react
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

const ALLOWED_KINDS = new Set(['helpful', 'like', 'dose_warning']);

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
    const postId = body?.postId ? String(body.postId) : null;
    const commentId = body?.commentId ? String(body.commentId) : null;
    const kind = String(body?.kind ?? '');
    const action = body?.action === 'remove' ? 'remove' : 'add';

    if (!ALLOWED_KINDS.has(kind)) return json({ error: 'Invalid reaction kind.' }, 400);
    if ((postId == null) === (commentId == null)) {
      return json({ error: 'Provide exactly one of postId or commentId.' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (action === 'remove') {
      const q = admin.from('community_reactions').delete().eq('user_id', user.id).eq('kind', kind);
      const { error: delErr } = postId
        ? await q.eq('post_id', postId)
        : await q.eq('comment_id', commentId!);
      if (delErr) throw delErr;
      return json({ ok: true, action: 'removed' });
    }

    // Add — upsert-ish via insert + ignore unique-violation.
    const { error: insertErr } = await admin.from('community_reactions').insert({
      user_id: user.id,
      post_id: postId,
      comment_id: commentId,
      kind,
    });
    if (insertErr && !String(insertErr.message ?? '').toLowerCase().includes('duplicate')) {
      throw insertErr;
    }

    return json({ ok: true, action: 'added' });
  } catch (err) {
    console.error('[community-react]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
