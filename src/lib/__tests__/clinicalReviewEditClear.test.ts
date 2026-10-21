/**
 * Jamie's clinical-review workbench: clearing an edit must delete its row.
 *
 * The 'edit' branch of supabase/functions/clinical-review always upserted and
 * returned before the delete branch, so a card whose corrections were all
 * cleared was saved as `payload: {}` and could never leave the table (L044).
 * The workbench signals "cleared" by posting an empty payload: its pushEdit
 * only copies non-empty fields.
 *
 * This runs the REAL handler under a Deno shim with a fake Supabase client and
 * asserts on what it does to the table, not on what the source says.
 */

type Call = { op: 'upsert' | 'delete'; table: string; arg: any; options?: any };

const TOKEN = 'review-token-for-tests';

function loadHandler() {
  jest.resetModules();
  const calls: Call[] = [];
  let handler: ((req: Request) => Promise<Response>) | null = null;
  (globalThis as any).Deno = {
    env: { get: (k: string) => ({ CLINICAL_REVIEW_TOKEN: TOKEN, SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } as Record<string, string>)[k] },
    serve: (h: (req: Request) => Promise<Response>) => {
      handler = h;
    },
  };
  jest.doMock(
    'https://esm.sh/@supabase/supabase-js@2',
    () => ({
      createClient: () => ({
        from: (table: string) => ({
          upsert: async (arg: any, options: any) => {
            calls.push({ op: 'upsert', table, arg, options });
            return { error: null };
          },
          delete: () => ({
            match: async (arg: any) => {
              calls.push({ op: 'delete', table, arg });
              return { error: null };
            },
          }),
        }),
      }),
    }),
    { virtual: true },
  );
  require('../../../supabase/functions/clinical-review/index.ts');
  if (!handler) throw new Error('clinical-review did not register a handler');
  return { handler: handler as (req: Request) => Promise<Response>, calls };
}

const post = (body: Record<string, unknown>) =>
  new Request('http://x/functions/v1/clinical-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ t: TOKEN, reviewer: 'Jamie', ...body }),
  });

describe('clinical-review edit rows', () => {
  it('an empty payload deletes that reviewer’s edit row and upserts nothing', async () => {
    const { handler, calls } = loadHandler();
    const res = await handler(post({ kind: 'edit', peptideId: 'bpc-157', payload: {} }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, cleared: true });
    expect(calls).toEqual([
      {
        op: 'delete',
        table: 'clinical_review_decisions',
        arg: { kind: 'edit', peptide_id: 'bpc-157', reviewer: 'Jamie' },
      },
    ]);
  });

  it('a payload whose fields are all blank or null also deletes', async () => {
    const { handler, calls } = loadHandler();
    await handler(post({ kind: 'edit', peptideId: 'bpc-157', payload: { note: '  ', citation: null } }));
    expect(calls.map((c) => c.op)).toEqual(['delete']);
  });

  it('a payload with any correction is still upserted, not deleted', async () => {
    const { handler, calls } = loadHandler();
    const res = await handler(post({ kind: 'edit', peptideId: 'bpc-157', payload: { note: '', correctedDose: '250 mcg' } }));
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe('upsert');
    expect(calls[0].arg).toMatchObject({ kind: 'edit', peptide_id: 'bpc-157', reviewer: 'Jamie' });
    expect(calls[0].arg.payload).toEqual({ note: '', correctedDose: '250 mcg' });
  });

  it('still refuses a bad token before touching the table', async () => {
    const { handler, calls } = loadHandler();
    const res = await handler(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ t: 'wrong', kind: 'edit', peptideId: 'x', payload: {} }) }),
    );
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('still requires payload to be an object', async () => {
    const { handler, calls } = loadHandler();
    const res = await handler(post({ kind: 'edit', peptideId: 'bpc-157', payload: [] }));
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});

afterAll(() => {
  delete (globalThis as any).Deno;
});
