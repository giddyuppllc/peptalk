/**
 * community-moderate — admin-only review queue actions.
 *
 * Admins identified by BETA_TESTER_EMAILS allowlist (same allowlist as
 * the AI features — keeps "internal team" semantics consistent without
 * a separate admins table). Actions:
 *   - dismiss: mark report as dismissed, leave content visible
 *   - delete:  soft-delete the reported content + mark report actioned
 *   - approve_topic / reject_topic: handle pending topic suggestions
 *
 * Deploy: supabase functions deploy community-moderate
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

    // Admin gate — BETA_TESTER_EMAILS doubles as admin list for now.
    const ADMIN_EMAILS = new Set<string>(
      (Deno.env.get('BETA_TESTER_EMAILS') ?? '')
        .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    );
    const isAdmin = !!user.email && ADMIN_EMAILS.has(user.email.toLowerCase());
    if (!isAdmin) return json({ error: 'Admin only' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const nowIso = new Date().toISOString();

    if (action === 'dismiss') {
      const reportId = String(body?.reportId ?? '');
      if (!reportId) return json({ error: 'reportId required' }, 400);
      const { error } = await admin
        .from('community_reports')
        .update({ status: 'dismissed', resolved_at: nowIso, resolved_by: user.id })
        .eq('id', reportId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'delete') {
      const reportId = String(body?.reportId ?? '');
      if (!reportId) return json({ error: 'reportId required' }, 400);
      const { data: report } = await admin
        .from('community_reports').select('post_id, comment_id, reason').eq('id', reportId).maybeSingle();
      if (!report) return json({ error: 'Report not found' }, 404);

      // Look up the author up-front so we can both soft-delete and notify.
      // We do this before the delete because soft-delete + RLS could mask
      // the row from later SELECTs depending on policy ordering.
      let authorId: string | null = null;
      if (report.post_id) {
        const { data: row } = await admin
          .from('community_posts').select('user_id').eq('id', report.post_id).maybeSingle();
        authorId = row?.user_id ?? null;
        await admin.from('community_posts')
          .update({ is_deleted: true, updated_at: nowIso })
          .eq('id', report.post_id);
      }
      if (report.comment_id) {
        const { data: row } = await admin
          .from('community_comments').select('user_id').eq('id', report.comment_id).maybeSingle();
        authorId = row?.user_id ?? null;
        await admin.from('community_comments')
          .update({ is_deleted: true })
          .eq('id', report.comment_id);
      }
      // Mark all reports against this target as actioned in one sweep.
      if (report.post_id) {
        await admin.from('community_reports')
          .update({ status: 'actioned', resolved_at: nowIso, resolved_by: user.id })
          .eq('post_id', report.post_id).eq('status', 'pending');
      }
      if (report.comment_id) {
        await admin.from('community_reports')
          .update({ status: 'actioned', resolved_at: nowIso, resolved_by: user.id })
          .eq('comment_id', report.comment_id).eq('status', 'pending');
      }

      // Notify the author so the post doesn't just silently vanish from
      // their feed. Reuses the same moderation_action kind the AI vision
      // pipeline writes — push-fanout + the in-app notification screen
      // already render this kind with a "Content was hidden" copy.
      if (authorId) {
        try {
          await admin.from('community_notifications').insert({
            user_id: authorId,
            actor_id: null,
            kind: 'moderation_action',
            post_id: report.post_id ?? null,
            comment_id: report.comment_id ?? null,
            body: report.reason
              ? `Reported by community: ${report.reason}`
              : 'A post or comment of yours was removed by a moderator.',
          });
        } catch (notifyErr) {
          console.warn('[community-moderate] notify failed:', notifyErr);
        }
      }
      return json({ ok: true });
    }

    if (action === 'approve_topic') {
      const slug = String(body?.slug ?? '');
      if (!slug) return json({ error: 'slug required' }, 400);
      const { error } = await admin
        .from('community_topics').update({ status: 'approved' }).eq('slug', slug);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'reject_topic') {
      const slug = String(body?.slug ?? '');
      if (!slug) return json({ error: 'slug required' }, 400);
      const { error } = await admin
        .from('community_topics').update({ status: 'rejected', is_active: false }).eq('slug', slug);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[community-moderate]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
