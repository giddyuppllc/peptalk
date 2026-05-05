/**
 * community-report — flag a post or comment.
 *
 * Free for all authenticated users. Inserts a row in community_reports;
 * the auto-moderate trigger fires soft-delete after 3 distinct reporters.
 *
 * Deploy: supabase functions deploy community-report
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

const ALLOWED_REASONS = new Set([
  'spam', 'harassment', 'unsafe_medical_advice',
  'misinformation', 'off_topic', 'other',
]);

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
    const reason = String(body?.reason ?? '');
    const notes = body?.notes != null ? String(body.notes).slice(0, 500) : null;

    if (!ALLOWED_REASONS.has(reason)) return json({ error: 'Invalid reason.' }, 400);
    if ((postId == null) === (commentId == null)) {
      return json({ error: 'Provide exactly one of postId or commentId.' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error: insertErr } = await admin.from('community_reports').insert({
      reporter_id: user.id,
      post_id: postId,
      comment_id: commentId,
      reason,
      notes,
      status: 'pending',
    });
    if (insertErr) {
      // Already-reported uniqueness — silent success.
      if (String(insertErr.message ?? '').toLowerCase().includes('duplicate')) {
        return json({ ok: true, alreadyReported: true });
      }
      throw insertErr;
    }

    return json({ ok: true });
  } catch (err) {
    console.error('[community-report]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
