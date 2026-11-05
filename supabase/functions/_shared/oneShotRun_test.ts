import { assertEquals } from 'jsr:@std/assert@1';
import { runOneShots, type OneShotRow } from './oneShotRun.ts';

const now = new Date('2026-12-03T16:05:00Z');
const row = (id: string, fire: string, user = 'u1'): OneShotRow => ({ id, user_id: user, tag: `protocol-bpc-157-${id}`, fire_at: fire, title: 'BPC-157 vial expiring', body: 'b' });

function deps(alerts: OneShotRow[], opts: { gone?: boolean } = {}) {
  const claimed = new Set<string>();
  const sent: string[] = [];
  const pruned: string[] = [];
  return {
    claimed, sent, pruned,
    d: {
      now,
      alerts,
      subscriptionsFor: async (ids: string[]) => ids.flatMap((u) => [{ id: `s-${u}`, user_id: u, endpoint: 'e', p256dh: 'p', auth: 'a' }]),
      claim: async (id: string) => (claimed.has(id) ? false : (claimed.add(id), true)),
      send: async (s: { id: string }, p: { tag: string }) => (opts.gone ? { ok: false, statusCode: 410 } : (sent.push(`${s.id}:${p.tag}`), { ok: true })),
      pruneSubscription: async (id: string) => { pruned.push(id); },
    },
  };
}

Deno.test('sends a due alert once; future alerts wait', async () => {
  const t = deps([row('a', '2026-12-03T16:00:00Z'), row('b', '2026-12-04T16:00:00Z')]);
  assertEquals((await runOneShots(t.d)).sent, 1);
  assertEquals(t.sent, ['s-u1:protocol-bpc-157-a']);
  assertEquals((await runOneShots(t.d)).sent, 0); // already claimed
});

Deno.test('an alert days late is retired without sending', async () => {
  const t = deps([row('old', '2026-11-28T16:00:00Z')]);
  const r = await runOneShots(t.d);
  assertEquals([r.sent, r.stale], [0, 1]);
  assertEquals(t.claimed.has('old'), true);
});

Deno.test('a gone subscription is pruned', async () => {
  const t = deps([row('a', '2026-12-03T16:00:00Z')], { gone: true });
  await runOneShots(t.d);
  assertEquals(t.pruned, ['s-u1']);
});
