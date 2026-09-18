/**
 * community-report — flag a post, a comment, a member, or an AI response.
 *
 * Free for all authenticated users. Inserts a row in community_reports;
 * the auto-moderate trigger fires soft-delete after 3 distinct reporters
 * (posts and comments only — see the migration).
 *
 * FOUR TARGETS, EXACTLY ONE PER REPORT
 *   postId          a community post
 *   commentId       a comment
 *   reportedUserId  a member — the leaderboard and shout-outs show another
 *                   person's display name, avatar and progress metrics, and
 *                   Guideline 1.2 wants a way to report the person there, not
 *                   just to block them
 *   aiMessageText   an Aimee reply. Chat is client-side, so there is no row to
 *                   point at; the text and its timestamp ARE the report.
 *
 * WHAT AN AI REPORT MUST NOT CARRY
 * Only the assistant's own message and when it was shown. No profile, no
 * health context, no conversation history — the client builds the payload
 * through buildAiMessageReport (src/lib/aiReport.ts) and this function accepts
 * no other field, so neither side can widen it alone.
 *
 * Requires migration 20260916120000_community_reports_user_and_ai_targets.sql.
 * Without it the widened CHECK does not exist and a member / AI report is
 * refused by the database.
 *
 * Deploy: supabase functions deploy community-report
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { reportError } from '../_shared/sentry.ts';

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

/** Matches the length CHECK on community_reports.ai_message_text. */
const AI_MESSAGE_MAX = 4000;

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
    const reportedUserId = body?.reportedUserId ? String(body.reportedUserId) : null;
    // Trim first: a stream that produced only whitespace is not a message, and
    // '' must not count as a target the way a truthy id does.
    const aiMessageRaw = body?.aiMessageText != null ? String(body.aiMessageText).trim() : '';
    const aiMessageText = aiMessageRaw.length > 0 ? aiMessageRaw.slice(0, AI_MESSAGE_MAX) : null;
    const reason = String(body?.reason ?? '');
    const notes = body?.notes != null ? String(body.notes).slice(0, 500) : null;

    if (!ALLOWED_REASONS.has(reason)) return json({ error: 'Invalid reason.' }, 400);

    const targets = [postId, commentId, reportedUserId, aiMessageText].filter((t) => t != null);
    if (targets.length !== 1) {
      return json(
        { error: 'Provide exactly one of postId, commentId, reportedUserId or aiMessageText.' },
        400,
      );
    }
    if (reportedUserId != null && reportedUserId === user.id) {
      return json({ error: 'You cannot report yourself.' }, 400);
    }

    // Only accepted alongside aiMessageText, and only as a real timestamp —
    // an unparseable value is dropped rather than failing the report, because
    // losing the report matters more than losing the time.
    let aiMessageAt: string | null = null;
    if (aiMessageText != null && body?.aiMessageAt != null) {
      const parsed = Date.parse(String(body.aiMessageAt));
      if (!Number.isNaN(parsed)) aiMessageAt = new Date(parsed).toISOString();
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error: insertErr } = await admin.from('community_reports').insert({
      reporter_id: user.id,
      post_id: postId,
      comment_id: commentId,
      reported_user_id: reportedUserId,
      ai_message_text: aiMessageText,
      ai_message_at: aiMessageAt,
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
    reportError('community-report', err);
    console.error('[community-report]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
