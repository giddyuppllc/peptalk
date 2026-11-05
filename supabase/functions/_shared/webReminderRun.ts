/**
 * One run of the web dose-reminder sender, with every side effect injected —
 * the edge function supplies Supabase + web-push, the tests supply fakes.
 *
 *   1. For each enabled schedule, find the due instants in the catch-up window
 *      using the shared cadence (doseCadence.ts, the same code native uses).
 *   2. Claim (schedule, due instant) in web_push_sent. Only the run that
 *      inserts the claim sends, so each dose reminds once even if runs
 *      overlap or retry.
 *   3. Send to every subscription the user has (several devices are normal).
 *   4. A 404/410 from the push service means the subscription is gone for
 *      good: delete it.
 */
import { dueInstants } from './doseCadence.ts';

export interface ReminderRow {
  id: string;
  user_id: string;
  peptide_id: string;
  peptide_name: string;
  reminder_time: string;
  frequency: string;
  anchor_date: string | null;
  time_zone: string;
  enabled: boolean;
  updated_at: string;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface RunDeps {
  now: Date;
  /** Look back this far so a late or skipped run still delivers. */
  catchUpMinutes?: number;
  reminders: ReminderRow[];
  subscriptionsFor: (userIds: string[]) => Promise<SubscriptionRow[]>;
  /** Insert the (reminder, due) claim; true only if THIS call inserted it. */
  claim: (reminderId: string, dueAt: Date) => Promise<boolean>;
  send: (sub: SubscriptionRow, payload: PushPayload) => Promise<{ ok: boolean; statusCode?: number }>;
  pruneSubscription: (id: string) => Promise<void>;
  recordDelivered?: (reminderId: string, dueAt: Date, delivered: number) => Promise<void>;
}

export interface RunResult {
  due: number;
  claimed: number;
  sent: number;
  pruned: number;
  failed: number;
}

/** Same wording as the native reminder (notificationService.scheduleDoseReminder). */
export function payloadFor(r: ReminderRow, dueAt: Date): PushPayload {
  return {
    title: `${r.peptide_name} Dose Reminder`,
    body: 'Time to take your scheduled dose.',
    url: '/calendar',
    tag: `dose-${r.peptide_id}-${dueAt.toISOString()}`,
  };
}

export function dueReminders(
  reminders: ReminderRow[],
  now: Date,
  catchUpMinutes = 15,
): Array<{ reminder: ReminderRow; dueAt: Date }> {
  const out: Array<{ reminder: ReminderRow; dueAt: Date }> = [];
  for (const r of reminders) {
    if (!r.enabled) continue; // the master switch
    // Never remind for a time that passed before the schedule was saved.
    const saved = Date.parse(r.updated_at);
    const fromMs = Math.max(now.getTime() - catchUpMinutes * 60_000, Number.isFinite(saved) ? saved : 0);
    const from = new Date(fromMs);
    for (const dueAt of dueInstants(
      { frequency: r.frequency, anchorDate: r.anchor_date, time: r.reminder_time, timeZone: r.time_zone },
      from,
      now,
    )) {
      out.push({ reminder: r, dueAt });
    }
  }
  return out;
}

export async function runWebReminders(deps: RunDeps): Promise<RunResult> {
  const result: RunResult = { due: 0, claimed: 0, sent: 0, pruned: 0, failed: 0 };
  const due = dueReminders(deps.reminders, deps.now, deps.catchUpMinutes);
  result.due = due.length;
  if (due.length === 0) return result;

  const subs = await deps.subscriptionsFor([...new Set(due.map((d) => d.reminder.user_id))]);
  const byUser = new Map<string, SubscriptionRow[]>();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  const pruned = new Set<string>();

  for (const { reminder, dueAt } of due) {
    const targets = (byUser.get(reminder.user_id) ?? []).filter((s) => !pruned.has(s.id));
    if (targets.length === 0) continue; // nothing to deliver to: don't burn the claim
    if (!(await deps.claim(reminder.id, dueAt))) continue; // already reminded
    result.claimed++;
    const payload = payloadFor(reminder, dueAt);
    let delivered = 0;
    for (const sub of targets) {
      try {
        const res = await deps.send(sub, payload);
        if (res.ok) {
          delivered++;
        } else if (res.statusCode === 404 || res.statusCode === 410) {
          await deps.pruneSubscription(sub.id);
          pruned.add(sub.id);
          result.pruned++;
        } else {
          result.failed++;
        }
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await deps.pruneSubscription(sub.id);
          pruned.add(sub.id);
          result.pruned++;
        } else {
          result.failed++;
        }
      }
    }
    result.sent += delivered;
    await deps.recordDelivered?.(reminder.id, dueAt, delivered);
  }
  return result;
}
