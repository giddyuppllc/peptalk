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

// Mirror the community_posts_feed view's anonymity masking: anonymous posts
// must never expose their author's real user_id to anyone but the author.
// The view returns NULL user_id for is_anonymous rows the viewer doesn't own,
// but this function reads the BASE table, so we mask in code here.
function maskAnonymous<T extends { user_id: string | null; is_anonymous?: boolean }>(
  posts: T[],
  viewerId: string,
): T[] {
  return posts.map((p) =>
    p.is_anonymous && p.user_id !== viewerId ? { ...p, user_id: null } : p,
  );
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
      //
      // 2026-05-17 security fix: the previous `.or(\`title.ilike.%${escaped}%,…\`)`
      // path interpolated the user query into a PostgREST `or()` filter
      // string. The escape regex stripped `%_\` but NOT commas, parens
      // or dots, so a crafted q like `x),user_id.eq.<uuid>,title.ilike.%(x`
      // could inject arbitrary filters and pull other users' drafts.
      // Two-call approach: run separate `.ilike()` queries per column
      // and union in code. PostgREST escapes parameterised ilike values
      // automatically, so the user input never reaches the filter DSL.
      const pattern = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      let titleQ = supabase
        .from('community_posts')
        .select('id, user_id, topic_slug, title, body, reaction_count, comment_count, is_anonymous, created_at')
        .eq('is_deleted', false)
        .ilike('title', pattern)
        .order('created_at', { ascending: false })
        .limit(30);
      let bodyQ = supabase
        .from('community_posts')
        .select('id, user_id, topic_slug, title, body, reaction_count, comment_count, is_anonymous, created_at')
        .eq('is_deleted', false)
        .ilike('body', pattern)
        .order('created_at', { ascending: false })
        .limit(30);
      if (topicSlug) {
        titleQ = titleQ.eq('topic_slug', topicSlug);
        bodyQ = bodyQ.eq('topic_slug', topicSlug);
      }
      const [titleRes, bodyRes] = await Promise.all([titleQ, bodyQ]);
      const seen = new Set<string>();
      const merged = [...(titleRes.data ?? []), ...(bodyRes.data ?? [])]
        .filter((p) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        })
        .sort((a, b) =>
          (b.created_at ?? '').localeCompare(a.created_at ?? ''),
        )
        .slice(0, 30);
      return json({ posts: maskAnonymous(merged, user.id) });
    }

    return json({ posts: maskAnonymous(data ?? [], user.id) });
  } catch (err) {
    console.error('[community-search]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
