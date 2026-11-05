/**
 * One run of the web one-time alerts (vial expiry, cycle end), with every side
 * effect injected — the web-dose-reminders function supplies Supabase +
 * web-push, the tests supply fakes.
 *
 * Due = enabled, not sent, fire_at in (now - catch-up, now]. An alert more than
 * the catch-up window late is marked sent without sending: a "vial expiring"
 * notice days after the fact is noise. The claim (setting sent_at where it is
 * still null) is what makes each alert send once even if runs overlap.
 */
import type { PushPayload, SubscriptionRow } from './webReminderRun.ts';

export interface OneShotRow {
  id: string;
  user_id: string;
  tag: string;
  fire_at: string;
  title: string;
  body: string;
}

export interface OneShotDeps {
  now: Date;
  catchUpHours?: number;
  alerts: OneShotRow[];
  subscriptionsFor: (userIds: string[]) => Promise<SubscriptionRow[]>;
  /** Set sent_at if still null; true only if THIS call did it. */
  claim: (id: string) => Promise<boolean>;
  send: (sub: SubscriptionRow, payload: PushPayload) => Promise<{ ok: boolean; statusCode?: number }>;
  pruneSubscription: (id: string) => Promise<void>;
}

export async function runOneShots(d: OneShotDeps): Promise<{ due: number; stale: number; sent: number }> {
  const windowMs = (d.catchUpHours ?? 24) * 3_600_000;
  const now = d.now.getTime();
  const due: OneShotRow[] = [];
  const stale: OneShotRow[] = [];
  for (const a of d.alerts) {
    const t = Date.parse(a.fire_at);
    if (!Number.isFinite(t) || t > now) continue;
    (now - t <= windowMs ? due : stale).push(a);
  }
  for (const a of stale) await d.claim(a.id);

  const subs = await d.subscriptionsFor([...new Set(due.map((a) => a.user_id))]);
  let sent = 0;
  for (const a of due) {
    if (!(await d.claim(a.id))) continue;
    for (const sub of subs.filter((s) => s.user_id === a.user_id)) {
      const res = await d.send(sub, { title: a.title, body: a.body, url: '/calendar', tag: a.tag });
      if (res.ok) sent += 1;
      else if (res.statusCode === 404 || res.statusCode === 410) await d.pruneSubscription(sub.id);
    }
  }
  return { due: due.length, stale: stale.length, sent };
}
