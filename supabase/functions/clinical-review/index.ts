/**
 * clinical-review — durable storage for the clinical data review page.
 *
 * The review page (public/review-*.html) is a standalone static page with no
 * Supabase session: the reviewer is a clinician opening a link, not an app
 * user. So this function does its own auth with a shared token carried in the
 * link (`?t=...`) and writes with the service role. The table has RLS on and
 * no policies, so this function is the only way in.
 *
 * GET  ?t=TOKEN            -> { decisions: { "dose:nad-plus": "table", ... } }
 * POST { t, kind, peptideId, verdict, reviewer?, note? }
 *                          -> { ok: true }
 *   verdict null/'' deletes the row (reviewer un-picked an answer).
 *
 * Deploy (no JWT — the token below is the auth, and the reviewer has no session):
 *   supabase secrets set CLINICAL_REVIEW_TOKEN=<random-string>
 *   supabase functions deploy clinical-review --no-verify-jwt
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const REVIEW_TOKEN = Deno.env.get('CLINICAL_REVIEW_TOKEN') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Length-independent compare so a wrong token can't be timed out character by character. */
function tokenOk(given: string): boolean {
  if (!REVIEW_TOKEN || !given) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(REVIEW_TOKEN);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Kinds match the review page's localStorage key prefixes, except the uncited
// table, which the page keys as `cite:` — normalised to `uncited` on the way in
// so the stored vocabulary matches the column's check constraint.
// 'edit' carries a payload of corrections instead of a verdict.
const KINDS = new Set(['dose', 'cycle', 'prov', 'uncited', 'edit']);
// 'reviewed' is what the uncited checkboxes store; the rest are conflict picks.
const VERDICTS = new Set(['table', 'protocol', 'ladder', 'other', 'reviewed']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // A missing secret must fail closed — otherwise every empty token would pass.
  if (!REVIEW_TOKEN) return json({ error: 'Review link is not configured' }, 503);

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    if (req.method === 'GET') {
      const t = new URL(req.url).searchParams.get('t') ?? '';
      if (!tokenOk(t)) return json({ error: 'Invalid link' }, 401);

      const { data, error } = await db
        .from('clinical_review_decisions')
        .select('kind, peptide_id, verdict, reviewer, payload, updated_at');
      if (error) return json({ error: error.message }, 500);

      // Edits are keyed by peptide alone (kind 'edit'), verdicts by kind+peptide.
      const edits: Record<string, unknown> = {};
      for (const row of data ?? []) if (row.payload) edits[row.peptide_id] = row.payload;

      // Collapse to the flat key shape the page already uses in localStorage,
      // mapping `uncited` back to the page's `cite:` prefix.
      const decisions: Record<string, string> = {};
      for (const row of data ?? []) {
        const prefix = row.kind === 'uncited' ? 'cite' : row.kind;
        if (row.verdict) decisions[`${prefix}:${row.peptide_id}`] = row.verdict;
      }
      return json({ decisions, edits, count: (data ?? []).length });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (!tokenOk(String(body?.t ?? ''))) return json({ error: 'Invalid link' }, 401);

      const kind = String(body?.kind ?? '').trim();
      const peptideId = String(body?.peptideId ?? '').trim();
      const reviewer = String(body?.reviewer ?? 'unknown').trim().slice(0, 120) || 'unknown';
      const note = body?.note == null ? null : String(body.note).slice(0, 2000);
      const rawVerdict = body?.verdict == null ? '' : String(body.verdict).trim();

      if (!KINDS.has(kind)) return json({ error: 'Unknown kind' }, 400);
      if (!peptideId || peptideId.length > 120) return json({ error: 'Bad peptideId' }, 400);

      /* kind 'edit' carries the reviewer's corrections rather than a verdict:
         corrected figures, a citation, notes, rewritten prose. One row per
         peptide per reviewer, upserted on every keystroke-debounced save. */
      if (kind === 'edit') {
        const payload = body?.payload;
        if (payload == null || typeof payload !== 'object' || Array.isArray(payload))
          return json({ error: 'payload must be an object' }, 400);
        if (JSON.stringify(payload).length > 40000)
          return json({ error: 'payload too large' }, 413);
        const { error } = await db.from('clinical_review_decisions').upsert(
          { kind, peptide_id: peptideId, verdict: null, reviewer, payload, updated_at: new Date().toISOString() },
          { onConflict: 'kind,peptide_id,reviewer' },
        );
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      // Un-picking an answer removes the row rather than storing an empty verdict.
      if (!rawVerdict) {
        const { error } = await db
          .from('clinical_review_decisions')
          .delete()
          .match({ kind, peptide_id: peptideId, reviewer });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, cleared: true });
      }

      if (!VERDICTS.has(rawVerdict)) return json({ error: 'Unknown verdict' }, 400);

      const { error } = await db.from('clinical_review_decisions').upsert(
        {
          kind,
          peptide_id: peptideId,
          verdict: rawVerdict,
          reviewer,
          note,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'kind,peptide_id,reviewer' },
      );
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
