/**
 * Web dose reminders: schedule → due selection, time zones, dedupe, the off
 * switch, multi-device delivery and pruning of dead subscriptions.
 */
import {
  doseCadence,
  remindsOn,
  dueInstants,
  zonedInstant,
  localParts,
} from '../doseCadence';
import { dueReminders, runWebReminders, type ReminderRow, type SubscriptionRow } from '../webReminderRun';

const reminder = (over: Partial<ReminderRow> = {}): ReminderRow => ({
  id: 'r1',
  user_id: 'u1',
  peptide_id: 'bpc-157',
  peptide_name: 'BPC-157',
  reminder_time: '08:00',
  frequency: 'daily',
  anchor_date: '2026-11-02', // a Monday
  time_zone: 'America/Phoenix', // UTC-7, no DST
  enabled: true,
  updated_at: '2026-11-01T00:00:00Z',
  ...over,
});

describe('cadence (shared with native)', () => {
  it('weekly cadences start on the protocol start weekday', () => {
    expect(doseCadence('weekly', '2026-11-04')).toEqual({ kind: 'weekly', weekdays: [3] }); // Wed
    expect(doseCadence('biw', '2026-11-02')).toEqual({ kind: 'weekly', weekdays: [1, 4] }); // Mon, Thu
    expect(doseCadence('tiw', '2026-11-06')).toEqual({ kind: 'weekly', weekdays: [5, 0, 2] }); // Fri, Sun, Tue
    expect(doseCadence('eod', '2026-11-02')).toEqual({ kind: 'weekly', weekdays: [1, 3, 5, 0] });
  });

  it('falls back to Monday without an anchor, and daily for unknown frequencies', () => {
    expect(doseCadence('weekly')).toEqual({ kind: 'weekly', weekdays: [1] });
    expect(doseCadence('something-new')).toEqual({ kind: 'daily' });
  });

  it('biweekly reminds every 14 days from the anchor, never before it', () => {
    const c = doseCadence('biweekly', '2026-11-02');
    expect(remindsOn(c, '2026-11-02')).toBe(true);
    expect(remindsOn(c, '2026-11-16')).toBe(true);
    expect(remindsOn(c, '2026-11-09')).toBe(false);
    expect(remindsOn(c, '2026-10-19')).toBe(false);
  });
});

describe('time zones', () => {
  it('08:00 in Phoenix is 15:00Z; 08:00 in New York is 13:00Z in November (EST)', () => {
    expect(zonedInstant('2026-11-05', 8, 0, 'America/Phoenix')?.toISOString()).toBe('2026-11-05T15:00:00.000Z');
    expect(zonedInstant('2026-11-05', 8, 0, 'America/New_York')?.toISOString()).toBe('2026-11-05T13:00:00.000Z');
    expect(zonedInstant('2026-07-05', 8, 0, 'America/New_York')?.toISOString()).toBe('2026-07-05T12:00:00.000Z'); // EDT
  });

  it('uses the user\'s local date, not UTC (late evening in LA is the next day in UTC)', () => {
    expect(localParts(new Date('2026-11-06T04:30:00Z'), 'America/Los_Angeles')).toEqual({ dateKey: '2026-11-05', minutes: 20 * 60 + 30 });
  });

  it('a weekly Thursday 21:00 Sydney reminder fires at 10:00Z (AEDT, UTC+11)', () => {
    const due = dueInstants(
      { frequency: 'weekly', anchorDate: '2026-11-05', time: '21:00', timeZone: 'Australia/Sydney' },
      new Date('2026-11-05T09:50:00Z'),
      new Date('2026-11-05T10:05:00Z'),
    );
    expect(due.map((d) => d.toISOString())).toEqual(['2026-11-05T10:00:00.000Z']);
  });

  it('an invalid zone falls back to UTC instead of throwing', () => {
    const due = dueInstants(
      { frequency: 'daily', time: '08:00', timeZone: 'Not/AZone' },
      new Date('2026-11-05T07:55:00Z'),
      new Date('2026-11-05T08:00:00Z'),
    );
    expect(due).toHaveLength(1);
  });
});

describe('due selection', () => {
  const at = (iso: string) => new Date(iso);

  it('a daily 08:00 Phoenix reminder is due in the run just after 15:00Z, and not before', () => {
    expect(dueReminders([reminder()], at('2026-11-05T14:58:00Z'))).toHaveLength(0);
    const due = dueReminders([reminder()], at('2026-11-05T15:02:00Z'));
    expect(due.map((d) => d.dueAt.toISOString())).toEqual(['2026-11-05T15:00:00.000Z']);
  });

  it('a skipped run is caught up within 15 minutes, not after', () => {
    expect(dueReminders([reminder()], at('2026-11-05T15:14:00Z'))).toHaveLength(1);
    expect(dueReminders([reminder()], at('2026-11-05T15:16:00Z'))).toHaveLength(0);
  });

  it('weekly protocols only remind on their days', () => {
    const weekly = reminder({ frequency: 'weekly', anchor_date: '2026-11-04' }); // Wednesdays
    expect(dueReminders([weekly], at('2026-11-05T15:02:00Z'))).toHaveLength(0); // Thursday
    expect(dueReminders([weekly], at('2026-11-04T15:02:00Z'))).toHaveLength(1); // Wednesday
  });

  it('the master switch off (enabled=false) sends nothing', () => {
    expect(dueReminders([reminder({ enabled: false })], at('2026-11-05T15:02:00Z'))).toHaveLength(0);
  });

  it('never fires for a time that passed before the reminder was saved', () => {
    const justSaved = reminder({ updated_at: '2026-11-05T15:01:00Z' });
    expect(dueReminders([justSaved], at('2026-11-05T15:02:00Z'))).toHaveLength(0);
  });
});

describe('runWebReminders', () => {
  const NOW = new Date('2026-11-05T15:02:00Z');
  const subs: SubscriptionRow[] = [
    { id: 's-phone', user_id: 'u1', endpoint: 'https://push/phone', p256dh: 'p', auth: 'a' },
    { id: 's-laptop', user_id: 'u1', endpoint: 'https://push/laptop', p256dh: 'p', auth: 'a' },
  ];

  function deps(over: Partial<Parameters<typeof runWebReminders>[0]> = {}) {
    const claims = new Set<string>();
    const sent: string[] = [];
    const pruned: string[] = [];
    return {
      claims,
      sent,
      pruned,
      d: {
        now: NOW,
        reminders: [reminder()],
        subscriptionsFor: async () => subs,
        claim: async (id: string, dueAt: Date) => {
          const k = `${id}|${dueAt.toISOString()}`;
          if (claims.has(k)) return false;
          claims.add(k);
          return true;
        },
        send: async (s: SubscriptionRow) => {
          sent.push(s.id);
          return { ok: true };
        },
        pruneSubscription: async (id: string) => {
          pruned.push(id);
        },
        ...over,
      },
    };
  }

  it('sends one reminder to every device the user has, with the native wording', async () => {
    let payload: unknown;
    const t = deps({
      send: async (s: SubscriptionRow, p: unknown) => {
        payload = p;
        t.sent.push(s.id);
        return { ok: true };
      },
    });
    const r = await runWebReminders(t.d);
    expect(r).toMatchObject({ due: 1, claimed: 1, sent: 2 });
    expect(t.sent).toEqual(['s-phone', 's-laptop']);
    expect(payload).toEqual({
      title: 'BPC-157 Dose Reminder',
      body: 'Time to take your scheduled dose.',
      url: '/calendar',
      tag: 'dose-bpc-157-2026-11-05T15:00:00.000Z',
    });
  });

  it('each dose reminds once: a second run in the same window sends nothing', async () => {
    const t = deps();
    await runWebReminders(t.d);
    const second = await runWebReminders({ ...t.d, now: new Date('2026-11-05T15:07:00Z') });
    expect(second).toMatchObject({ due: 1, claimed: 0, sent: 0 });
    expect(t.sent).toHaveLength(2);
  });

  it('prunes a subscription the push service says is gone (410) and still delivers to the rest', async () => {
    const t = deps({
      send: async (s: SubscriptionRow) => (s.id === 's-phone' ? { ok: false, statusCode: 410 } : { ok: true }),
    });
    const r = await runWebReminders(t.d);
    expect(t.pruned).toEqual(['s-phone']);
    expect(r).toMatchObject({ sent: 1, pruned: 1, failed: 0 });
  });

  it('a thrown 404 from web-push also prunes; a 500 is a failure, not a prune', async () => {
    const t = deps({
      send: async (s: SubscriptionRow) => {
        const e = Object.assign(new Error('x'), { statusCode: s.id === 's-phone' ? 404 : 500 });
        throw e;
      },
    });
    const r = await runWebReminders(t.d);
    expect(t.pruned).toEqual(['s-phone']);
    expect(r).toMatchObject({ pruned: 1, failed: 1, sent: 0 });
  });

  it('no subscriptions: nothing sent and the claim is not burned (they can still get it after subscribing)', async () => {
    const t = deps({ subscriptionsFor: async () => [] });
    const r = await runWebReminders(t.d);
    expect(r).toMatchObject({ due: 1, claimed: 0 });
    expect(t.claims.size).toBe(0);
  });
});
