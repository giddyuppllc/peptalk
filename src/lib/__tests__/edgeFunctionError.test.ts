import { readEdgeFunctionError } from '../edgeFunctionError';

/** A FunctionsHttpError as supabase-js v2 builds it: context is a Response. */
function httpError(status: number, body: unknown) {
  const res = new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  return Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: res });
}

describe('readEdgeFunctionError', () => {
  it('reads status and the function message from the Response context', async () => {
    const e = await readEdgeFunctionError(httpError(429, { error: 'Daily lab-scan limit reached (5/day). Resets tomorrow.' }));
    expect(e).toMatchObject({ status: 429, message: 'Daily lab-scan limit reached (5/day). Resets tomorrow.', upgrade: false });
  });

  it('flags upgrade from the body or a 403', async () => {
    expect((await readEdgeFunctionError(httpError(403, { error: 'Requires PepTalk+', upgrade: true }))).upgrade).toBe(true);
    expect((await readEdgeFunctionError(httpError(403, 'nope'))).upgrade).toBe(true);
  });

  it('never returns the generic supabase-js text as the message', async () => {
    const e = await readEdgeFunctionError(httpError(500, 'not json'));
    expect(e.status).toBe(500);
    expect(e.message).toBeNull();
  });

  it('network errors: no status, keeps a real message', async () => {
    expect(await readEdgeFunctionError(new TypeError('Network request failed'))).toMatchObject({
      status: null,
      message: 'Network request failed',
      upgrade: false,
    });
  });

  it('can be read twice (clone), so a caller re-reading the body still works', async () => {
    const err = httpError(429, { error: 'limit' });
    await readEdgeFunctionError(err);
    expect((await readEdgeFunctionError(err)).message).toBe('limit');
  });
});
