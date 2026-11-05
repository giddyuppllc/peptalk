import { assertEquals } from 'jsr:@std/assert@1';
import { billableWebSubs, cancelSquareSubscriptions } from './squareCancel.ts';

const now = new Date('2026-11-05T12:00:00Z');

Deno.test('only subscriptions that can still bill are cancelled', () => {
  const rows = [
    { product_id: 'plus', original_transaction_id: 's1', expires_at: '2026-12-01T00:00:00Z' },
    { product_id: 'pro', original_transaction_id: 's2', expires_at: '2026-09-25T00:00:00Z' },
    { product_id: 'pro', original_transaction_id: 's3', expires_at: null },
  ];
  assertEquals(billableWebSubs(rows, now).map((r) => r.original_transaction_id), ['s1', 's3']);
});

Deno.test('reports each result; a failure carries Square\'s reason', async () => {
  const fetchImpl = (async (url: string) =>
    url.includes('/s1/')
      ? new Response(JSON.stringify({ subscription: { canceled_date: '2026-12-01' } }), { status: 200 })
      : new Response(JSON.stringify({ errors: [{ detail: 'Subscription not found' }] }), { status: 404 })) as unknown as typeof fetch;
  const r = await cancelSquareSubscriptions(
    [{ product_id: 'plus', original_transaction_id: 's1' }, { product_id: 'pro', original_transaction_id: 's9' }],
    { token: 't', base: 'https://x', fetchImpl },
  );
  assertEquals(r.map((x) => [x.subscriptionId, x.ok, x.canceledDate, x.error ?? null]), [
    ['s1', true, '2026-12-01', null],
    ['s9', false, null, 'Subscription not found'],
  ]);
});

Deno.test('a network error is a failure, not a throw', async () => {
  const fetchImpl = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  const r = await cancelSquareSubscriptions([{ product_id: 'p', original_transaction_id: 's1' }], { token: 't', base: 'https://x', fetchImpl });
  assertEquals([r[0].ok, r[0].error], [false, 'offline']);
});
