/**
 * community-push-fanout — Expo push delivery for community notifications.
 *
 * Fired by the AFTER INSERT trigger on community_notifications via
 * pg_net.http_post. Body: { notificationId: UUID }.
 *
 * Flow:
 *   1. Look up the notification row + actor profile.
 *   2. Look up active push tokens for the recipient (push_tokens).
 *   3. Format a copy line based on the notification kind.
 *   4. POST to https://exp.host/--/api/v2/push/send (Expo push API).
 *   5. Process the receipt — DELETE any tokens that came back as
 *      DeviceNotRegistered or InvalidCredentials.
 *
 * Idempotency: notification rows insert once. Multiple devices for the
 * same user just receive separate pushes. The Expo push service itself
 * dedupes if we send the same payload twice in <1s.
 *
 * Auth: service-role JWT from the trigger (SECURITY DEFINER context),
 * so we deploy WITHOUT --no-verify-jwt (default behavior verifies the
 * supabase JWT, which the trigger sends as the service role).
 *
 * Deploy:
 *   supabase functions deploy community-push-fanout
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface CommunityNotification {
  id: string;
  user_id: string;
  actor_id: string | null;
  kind: string;
  post_id: string | null;
  comment_id: string | null;
  body: string | null;
}

interface PushToken {
  id: string;
  user_id: string;
  expo_push_token: string;
}

const KIND_COPY: Record<string, { title: string; body: (actor: string) => string }> = {
  reply_to_post: {
    title: 'New reply',
    body: (actor) => `${actor} replied to your post.`,
  },
  reply_to_comment: {
    title: 'New reply',
    body: (actor) => `${actor} replied to your comment.`,
  },
  reaction: {
    title: 'New reaction',
    body: (actor) => `${actor} reacted to your post.`,
  },
  mention: {
    title: 'You were mentioned',
    body: (actor) => `${actor} mentioned you in a comment.`,
  },
  moderation_action: {
    title: 'Moderation action',
    body: () => 'A post or comment of yours was reviewed.',
  },
};

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  // 2026-05-17 security fix: depending on whether this fn is deployed
  // with --no-verify-jwt, the public URL may be reachable unauthenticated.
  // Add an internal-secret check matching the pattern used by community-
  // live-broadcast — the trigger passes x-internal-key via pg_net.http_post.
  const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
  const providedSecret = req.headers.get('x-internal-key') ?? '';
  if (!internalSecret) {
    // The SECRET ISN'T SET ON THIS FUNCTION — a deploy/config miss, not an
    // attacker. Without this loud log, every push silently 401-drops and the
    // symptom ("no community notifications") is undiagnosable. Set it with:
    //   supabase secrets set INTERNAL_FUNCTION_SECRET=<value matching the DB GUC>
    console.error('[community-push-fanout] MISCONFIG: INTERNAL_FUNCTION_SECRET unset — all pushes will 401-drop');
    return jsonResp({ error: 'Server misconfigured: internal secret unset' }, 503);
  }
  if (providedSecret !== internalSecret) {
    return jsonResp({ error: 'Unauthorized' }, 401);
  }

  try {
    const { notificationId } = await req.json().catch(() => ({}));
    if (!notificationId || typeof notificationId !== 'string') {
      return jsonResp({ error: 'notificationId required' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Pull the notification.
    const { data: notification, error: nErr } = await admin
      .from('community_notifications')
      .select('id, user_id, actor_id, kind, post_id, comment_id, body')
      .eq('id', notificationId)
      .maybeSingle();

    if (nErr || !notification) {
      console.warn('[push-fanout] notification not found:', notificationId, nErr);
      return jsonResp({ ok: false, reason: 'not_found' }, 200);
    }
    const n = notification as CommunityNotification;
    if (!n.user_id) {
      // Shouldn't happen — trigger guards on it — but stay defensive.
      return jsonResp({ ok: false, reason: 'no_recipient' }, 200);
    }

    const copy = KIND_COPY[n.kind];
    if (!copy) {
      // Unknown kind — local-poll path will still surface it next foreground.
      return jsonResp({ ok: false, reason: 'unknown_kind' }, 200);
    }

    // 2. Resolve actor display name.
    let actorName = 'Someone';
    if (n.actor_id) {
      const { data: actor } = await admin
        .from('profiles')
        .select('username, display_name')
        .eq('id', n.actor_id)
        .maybeSingle();
      actorName =
        actor?.display_name?.trim() ||
        actor?.username?.trim() ||
        actorName;
    }

    // 3. Look up active tokens for recipient.
    const { data: tokens, error: tErr } = await admin
      .from('push_tokens')
      .select('id, user_id, expo_push_token')
      .eq('user_id', n.user_id)
      .order('last_seen_at', { ascending: false })
      .limit(4);

    if (tErr) {
      console.error('[push-fanout] token lookup failed:', tErr);
      return jsonResp({ ok: false, reason: 'token_lookup_failed' }, 200);
    }
    if (!tokens || tokens.length === 0) {
      // No registered devices — local-poll covers them next foreground.
      return jsonResp({ ok: true, reason: 'no_tokens' }, 200);
    }

    // 4. Build Expo push messages — one per token.
    const messages = (tokens as PushToken[]).map((tok) => ({
      to: tok.expo_push_token,
      title: copy.title,
      body: copy.body(actorName),
      sound: 'default',
      data: {
        kind: n.kind,
        postId: n.post_id,
        commentId: n.comment_id,
        notificationId: n.id,
        // Deep-link target honored by the tap router in notificationService
        // (registerNotificationResponseHandler reads data.route first). Without
        // this, background taps fell through to the kind-inference fallback —
        // which only matched the legacy 'community-*' vocab, not these `kind`
        // values — and the app just opened to the last screen (P1). Matches the
        // community post route: app/(tabs)/community/[id].tsx.
        route: n.post_id ? `/(tabs)/community/${n.post_id}` : '/(tabs)/community',
      },
    }));

    // 5. Send (single round-trip — Expo accepts arrays).
    const expoRes = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!expoRes.ok) {
      const text = await expoRes.text().catch(() => '');
      console.error('[push-fanout] expo error', expoRes.status, text);
      return jsonResp({ ok: false, reason: 'expo_error', status: expoRes.status }, 200);
    }

    const payload = await expoRes.json();
    // Expo returns: { data: [{ status, id?, message?, details? }, ...] }
    const tickets: Array<{ status: string; details?: { error?: string } }> = payload?.data ?? [];

    // 6. Clean up dead tokens — DeviceNotRegistered means the user uninstalled
    // or revoked permissions; nothing we can do but stop sending to that token.
    const idsToDelete: string[] = [];
    tickets.forEach((ticket, idx) => {
      if (ticket.status === 'error') {
        const err = ticket.details?.error ?? '';
        if (err === 'DeviceNotRegistered' || err === 'InvalidCredentials') {
          const t = tokens![idx] as PushToken;
          if (t?.id) idsToDelete.push(t.id);
        }
      }
    });
    if (idsToDelete.length > 0) {
      await admin.from('push_tokens').delete().in('id', idsToDelete);
    }

    return jsonResp({
      ok: true,
      delivered: tickets.filter((t) => t.status === 'ok').length,
      pruned: idsToDelete.length,
    });
  } catch (err) {
    console.error('[push-fanout]', err);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
