/**
 * web-dose-reminders — sends Web Push dose reminders to the PWA.
 *
 * Invoked every 5 minutes by pg_cron (public.invoke_web_dose_reminders, see
 * migration 20261105020000_web_push_dose_reminders.sql) with the internal
 * secret, same as the community fan-out triggers. All the decisions — what is
 * due, dedupe, pruning — live in ../_shared/webReminderRun.ts, which reuses the
 * cadence native reminders use (../_shared/doseCadence.ts).
 *
 * Secrets:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)
 *   INTERNAL_FUNCTION_SECRET (already set for the other internal functions)
 * Generate the VAPID pair with: node scripts/generate-vapid-keys.mjs
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { reportError } from '../_shared/sentry.ts';
import { runWebReminders, type ReminderRow, type SubscriptionRow } from '../_shared/webReminderRun.ts';
import { runOneShots, type OneShotRow } from '../_shared/oneShotRun.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';
  if (!internalSecret) {
    console.error('[web-dose-reminders] MISCONFIG: INTERNAL_FUNCTION_SECRET unset');
    return json({ error: 'Server misconfigured: internal secret unset' }, 503);
  }
  if ((req.headers.get('x-internal-key') ?? '') !== internalSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const subject = Deno.env.get('VAPID_SUBJECT') ?? '';
  if (!publicKey || !privateKey || !subject) {
    console.error('[web-dose-reminders] MISCONFIG: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT unset');
    return json({ error: 'VAPID keys not configured' }, 503);
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  try {
    const { data: reminders, error } = await supabase
      .from('web_dose_reminders')
      .select('id, user_id, peptide_id, peptide_name, reminder_time, frequency, anchor_date, time_zone, enabled, updated_at')
      .eq('enabled', true)
      .limit(5000);
    if (error) throw new Error(`load reminders: ${error.message}`);

    const loadSubs = async (userIds: string[]) => {
      if (userIds.length === 0) return [];
      const { data, error: subErr } = await supabase
        .from('web_push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .in('user_id', userIds);
      if (subErr) throw new Error(`load subscriptions: ${subErr.message}`);
      return (data ?? []) as SubscriptionRow[];
    };
    const sendPush = async (sub: SubscriptionRow, payload: unknown) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: 'high' },
        );
        await supabase
          .from('web_push_subscriptions')
          .update({ last_sent_at: new Date().toISOString(), failure_count: 0 })
          .eq('id', sub.id);
        return { ok: true };
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode !== 404 && statusCode !== 410) {
          console.warn(`[web-dose-reminders] send failed (${statusCode ?? 'network'}) for ${sub.id}`);
        }
        return { ok: false, statusCode };
      }
    };
    const prune = async (id: string) => {
      await supabase.from('web_push_subscriptions').delete().eq('id', id);
    };

    const result = await runWebReminders({
      now: new Date(),
      reminders: (reminders ?? []) as ReminderRow[],
      subscriptionsFor: loadSubs,
      claim: async (reminderId, dueAt) => {
        const { error: claimErr } = await supabase
          .from('web_push_sent')
          .insert({ reminder_id: reminderId, due_at: dueAt.toISOString() });
        if (!claimErr) return true;
        if (claimErr.code === '23505') return false; // already reminded
        throw new Error(`claim: ${claimErr.message}`);
      },
      send: sendPush,
      pruneSubscription: prune,
      recordDelivered: async (reminderId, dueAt, delivered) => {
        await supabase
          .from('web_push_sent')
          .update({ delivered })
          .eq('reminder_id', reminderId)
          .eq('due_at', dueAt.toISOString());
      },
    });

    // One-time alerts (vial expiry, cycle end). Before migration
    // 20261105060000 the table does not exist: skip, never fail the dose run.
    let oneShots: unknown = null;
    const { data: alerts, error: alertErr } = await supabase
      .from('web_one_shot_alerts')
      .select('id, user_id, tag, fire_at, title, body')
      .is('sent_at', null)
      .eq('enabled', true)
      .lte('fire_at', new Date().toISOString())
      .limit(2000);
    if (alertErr) {
      if (alertErr.code !== '42P01' && alertErr.code !== 'PGRST205') console.warn('[web-dose-reminders] one-shots:', alertErr.message);
    } else {
      oneShots = await runOneShots({
        now: new Date(),
        alerts: (alerts ?? []) as OneShotRow[],
        subscriptionsFor: loadSubs,
        claim: async (id) => {
          const { data: claimed, error: cErr } = await supabase
            .from('web_one_shot_alerts')
            .update({ sent_at: new Date().toISOString() })
            .eq('id', id)
            .is('sent_at', null)
            .select('id');
          if (cErr) throw new Error(`claim one-shot: ${cErr.message}`);
          return (claimed ?? []).length === 1;
        },
        send: sendPush,
        pruneSubscription: prune,
      });
    }

    console.log('[web-dose-reminders]', JSON.stringify({ ...result, oneShots }));
    return json({ ok: true, ...result, oneShots });
  } catch (err) {
    reportError('web-dose-reminders', err);
    console.error('[web-dose-reminders] run failed:', (err as Error).message);
    return json({ error: 'run failed' }, 500);
  }
});
