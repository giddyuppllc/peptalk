/**
 * community-set-username — claim or change a community handle.
 *
 * Validates length / charset / reserved-word list, profanity-filters,
 * checks uniqueness, writes to profiles.username + display_name.
 *
 * Deploy: supabase functions deploy community-set-username
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

const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'mod', 'moderator', 'staff', 'support',
  'aimee', 'peptalk', 'peptide', 'pep_talk', 'peptalkapp',
  'system', 'official',
]);
const PROFANE_FRAGMENTS = [
  'fuck', 'shit', 'cunt', 'bitch', 'nigger', 'faggot', 'retard',
  'nazi', 'kkk', 'rape',
];

function isOffensive(name: string): boolean {
  const lower = name.toLowerCase();
  if (RESERVED_HANDLES.has(lower)) return true;
  return PROFANE_FRAGMENTS.some((f) => lower.includes(f));
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
    const username = String(body?.username ?? '').trim();
    const displayName = body?.displayName != null ? String(body.displayName).trim().slice(0, 60) : null;

    if (!USERNAME_REGEX.test(username)) {
      return json({ error: 'Username must be 3-20 characters, start with a letter, and contain only letters, numbers, or underscores.' }, 400);
    }
    if (isOffensive(username)) {
      return json({ error: 'That handle isn\'t allowed. Pick something else.' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Uniqueness check (case-insensitive). Race-safe enough: the unique
    // index in the migration is the authoritative guard; this returns a
    // friendlier error before hitting the index.
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .neq('id', user.id)
      .maybeSingle();
    if (existing) {
      return json({ error: 'That handle is taken.' }, 409);
    }

    const { error: updErr } = await admin
      .from('profiles')
      .update({
        username,
        display_name: displayName || username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updErr) {
      // Unique-constraint violations from the case-insensitive index land here.
      if (String(updErr.message ?? '').toLowerCase().includes('duplicate')) {
        return json({ error: 'That handle is taken.' }, 409);
      }
      throw updErr;
    }

    return json({ ok: true, username, displayName: displayName || username });
  } catch (err) {
    console.error('[community-set-username]', err);
    return json({ error: 'Internal error' }, 500);
  }
});
