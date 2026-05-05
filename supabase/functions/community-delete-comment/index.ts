/**
 * community-delete-comment — owner-only soft-delete.
 *
 * Body: { commentId }
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
    const commentId = String(body?.commentId ?? '').trim();
    if (!commentId) return json({ error: 'commentId required' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: comment } = await admin
      .from('community_comments')
      .select('id, user_id, is_deleted')
      .eq('id', commentId)
      .maybeSingle();
    if (!comment) return json({ error: 'Comment not found.' }, 404);
    if (comment.is_deleted) return json({ ok: true });
    if (comment.user_id !== user.id) return json({ error: 'Not the comment owner.' }, 403);

    const { error: updateErr } = await admin
      .from('community_comments')
      .update({ is_deleted: true })
      .eq('id', commentId);
    if (updateErr) throw updateErr;

    return json({ ok: true });
  } catch (err) {
    console.error('[community-delete-comment]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
