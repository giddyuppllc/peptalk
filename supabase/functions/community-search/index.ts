/**
 * community-search — case-insensitive ILIKE on post titles + bodies.
 *
 * Free for all authenticated users (read access). Returns up to 30 posts
 * sorted by recency. v1.5 will swap to FTS once we have enough content
 * to make ranking matter.
 *
 * Deploy: supabase functions deploy community-search
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
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
    const q = String(body?.q ?? '').trim();
    const topicSlug = body?.topicSlug ? String(body.topicSlug) : null;

    if (q.length < 2) return json({ posts: [] });

    // Build a websearch-style tsquery so users can do "tirzepatide
    // nausea" without quotes and have both words AND-matched. Postgres
    // websearch_to_tsquery handles user-supplied input safely — strips
    // operators, no injection.
    let query = supabase
      .from('community_posts')
      .select('id, user_id, topic_slug, title, body, reaction_count, comment_count, is_anonymous, created_at')
      .eq('is_deleted', false)
      .textSearch('fts', q, { type: 'websearch', config: 'english' })
      .limit(30);

    if (topicSlug) query = query.eq('topic_slug', topicSlug);

    const { data, error } = await query;
    if (error) {
      // FTS query parse error — fall back to plain ILIKE so the user
      // gets results from a malformed query (e.g. just punctuation)
      // instead of an error toast.
      const escaped = q.replace(/[%_\\]/g, '');
      let fb = supabase
        .from('community_posts')
        .select('id, user_id, topic_slug, title, body, reaction_count, comment_count, is_anonymous, created_at')
        .eq('is_deleted', false)
        .or(`title.ilike.%${escaped}%,body.ilike.%${escaped}%`)
        .order('created_at', { ascending: false })
        .limit(30);
      if (topicSlug) fb = fb.eq('topic_slug', topicSlug);
      const { data: fbData } = await fb;
      return json({ posts: fbData ?? [] });
    }

    return json({ posts: data ?? [] });
  } catch (err) {
    console.error('[community-search]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
