/**
 * save-workout-overrides — persist the video-tagger's edits to Supabase.
 *
 * Admin-only (Jamie / Edward). Upserts each edited manifest entry into
 * public.workout_video_overrides, keyed by slug. The app then merges these
 * rows over the bundled src/data/workoutVideos.json at read time, so Jamie's
 * tags go live without an EAS build. Replaces the old clipboard → commit flow
 * (which is kept in the UI as a fallback).
 *
 * Body:  { edits: Record<slug, {
 *            title?: string,
 *            description?: string,
 *            exerciseId?: string | null,
 *            category?: WorkoutVideoCategory | null,
 *            durationSec?: number,
 *            needsReview?: boolean,
 *          }> }
 * Reply: { ok: true, saved: number }                 on 200
 *        { error: string }                           on 400 / 401 / 403 / 500
 *
 * Auth: validates the caller's JWT and checks the email against the
 *       ADMIN_EMAILS secret (same allowlist as tag-workout-video /
 *       get-workout-video). Writes use the service-role key, which bypasses
 *       RLS — the table has no write policy for authenticated/anon.
 *
 * Deploy:
 *   supabase functions deploy save-workout-overrides
 *
 * Required secrets (all already set for sibling fns):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ADMIN_EMAILS    comma-separated admin/tagger emails
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const VALID_CATEGORIES = new Set([
  'weight_loss', 'muscle_gain', 'muscle_growth', 'toning', 'strength',
  'endurance', 'longevity', 'yoga', 'pilates', 'recovery', 'form_tutorial',
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResp = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

interface EditPayload {
  title?: unknown;
  description?: unknown;
  exerciseId?: unknown;
  category?: unknown;
  durationSec?: unknown;
  needsReview?: unknown;
}

interface OverrideRow {
  slug: string;
  title: string | null;
  description: string | null;
  exercise_id: string | null;
  category: string | null;
  duration_sec: number | null;
  needs_review: boolean | null;
  updated_by: string;
}

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  try {
    // 1. Auth — must be a signed-in admin/tagger email.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResp({ error: 'Missing auth' }, 401);
    const token = authHeader.replace(/^Bearer\s+/i, '');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return jsonResp({ error: 'Invalid auth' }, 401);

    const userEmail = (user.email ?? '').toLowerCase();
    const adminEmails = (Deno.env.get('ADMIN_EMAILS') ?? '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!userEmail || !adminEmails.includes(userEmail)) {
      return jsonResp({ error: 'Admin only.' }, 403);
    }

    // 2. Parse + validate body.
    const body = await req.json().catch(() => ({}));
    const edits = body?.edits;
    if (!edits || typeof edits !== 'object' || Array.isArray(edits)) {
      return jsonResp({ error: 'edits object required' }, 400);
    }

    const rows: OverrideRow[] = [];
    for (const [slug, raw] of Object.entries(edits as Record<string, EditPayload>)) {
      if (!SLUG_RE.test(slug)) {
        return jsonResp({ error: `invalid slug: ${slug}` }, 400);
      }
      const e = raw ?? {};

      // category must be a known WorkoutVideoCategory (or null).
      let category: string | null = null;
      if (typeof e.category === 'string') {
        if (!VALID_CATEGORIES.has(e.category)) {
          return jsonResp({ error: `invalid category for ${slug}: ${e.category}` }, 400);
        }
        category = e.category;
      }

      let duration_sec: number | null = null;
      if (typeof e.durationSec === 'number' && Number.isFinite(e.durationSec)) {
        duration_sec = Math.round(e.durationSec);
      }

      rows.push({
        slug,
        title: typeof e.title === 'string' ? e.title : null,
        description: typeof e.description === 'string' ? e.description : null,
        exercise_id: typeof e.exerciseId === 'string' ? e.exerciseId : null,
        category,
        duration_sec,
        needs_review: typeof e.needsReview === 'boolean' ? e.needsReview : null,
        updated_by: userEmail,
      });
    }

    if (rows.length === 0) return jsonResp({ ok: true, saved: 0 });

    // 3. Upsert — slug is the PK so onConflict replaces the prior override.
    const { error: upsertErr } = await supabase
      .from('workout_video_overrides')
      .upsert(rows, { onConflict: 'slug' });

    if (upsertErr) {
      console.error('[save-workout-overrides] upsert failed:', upsertErr);
      return jsonResp({ error: 'Failed to save overrides' }, 500);
    }

    return jsonResp({ ok: true, saved: rows.length });
  } catch (err) {
    console.error('[save-workout-overrides] error:', err);
    return jsonResp({
      error: 'Internal error',
      detail: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
