/**
 * community-edit-comment — owner-only comment editing.
 *
 * Updates body / image_urls of an existing comment. Same constraints as
 * community-edit-post but scoped to the smaller comment body limit.
 *
 * Body: { commentId, body?, imageUrls? }
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

const BODY_MIN = 1, BODY_MAX = 4000;

const PROFANITY = [
  'fuck', 'shit', 'cunt', 'bitch', 'nigger', 'faggot', 'retard',
];

function looksProfane(s: string): boolean {
  const lower = s.toLowerCase();
  return PROFANITY.some((p) => lower.includes(p));
}

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
    if (!comment || comment.is_deleted) return json({ error: 'Comment not found.' }, 404);
    if (comment.user_id !== user.id) return json({ error: 'Not the comment owner.' }, 403);

    const updates: Record<string, unknown> = {};

    if (typeof body?.body === 'string') {
      const text = body.body.trim();
      if (text.length < BODY_MIN || text.length > BODY_MAX) {
        return json({ error: `Comment must be ${BODY_MIN}-${BODY_MAX} characters.` }, 400);
      }
      if (looksProfane(text)) {
        return json({ error: 'Comment contains language not allowed.' }, 400);
      }
      updates.body = text;
    }

    if (Array.isArray(body?.imageUrls)) {
      const R2_PUBLIC_BASE = (Deno.env.get('R2_PUBLIC_BASE') ?? '').replace(/\/$/, '');
      const cleaned: string[] = [];
      for (const u of body.imageUrls) {
        if (typeof u !== 'string') continue;
        if (R2_PUBLIC_BASE && !u.startsWith(R2_PUBLIC_BASE + '/')) continue;
        cleaned.push(u);
        if (cleaned.length >= 4) break;
      }
      updates.image_urls = cleaned;
    }

    if (Object.keys(updates).length === 0) {
      return json({ error: 'Nothing to update.' }, 400);
    }

    updates.last_edited_at = new Date().toISOString();

    const { error: updateErr } = await admin
      .from('community_comments')
      .update(updates)
      .eq('id', commentId);
    if (updateErr) throw updateErr;

    return json({ ok: true });
  } catch (err) {
    console.error('[community-edit-comment]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
