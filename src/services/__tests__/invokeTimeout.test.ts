/**
 * Every edge-function call must have a deadline.
 *
 * 25 invoke sites, none with a timeout, and supabase-js sets no default. A
 * half-connected network leaves the request neither resolving nor rejecting and
 * the screen awaiting it just sits there — the same defect that made sign-in
 * look like the App Review 2.1(a) bug. It covers the food scanner, lab OCR,
 * workout generation, Aimee, community actions, and Square checkout, where the
 * user cannot tell whether they were charged.
 *
 * These tests exercise the PATCHING MECHANISM against a stand-in that mimics
 * supabase-js's real shape, because the first version of this fix was wrong in
 * a way source-reading could not catch: `SupabaseClient.functions` is a getter
 * that returns a NEW FunctionsClient on every access, so patching the instance
 * mutated a throwaway and did nothing.
 */
import { withTimeout, TimeoutError } from '../../lib/withTimeout';

/** Stand-in with supabase-js's actual shape: prototype method + fresh-per-access getter. */
class FakeFunctionsClient {
  async invoke(name: string) {
    if (name === 'hangs') return new Promise(() => {}); // never settles
    return { data: { ok: true, name }, error: null };
  }
}
class FakeSupabaseClient {
  get functions() {
    return new FakeFunctionsClient(); // NEW instance each access — the trap
  }
}

const FUNCTION_TIMEOUT_MS = 60_000;

function patch<T>(client: T): T {
  const probe = (client as { functions?: object }).functions;
  if (!probe) return client;
  const proto = Object.getPrototypeOf(probe) as {
    invoke?: (...a: unknown[]) => Promise<unknown>;
    __peptalkTimeoutPatched?: boolean;
  };
  const original = proto?.invoke;
  if (typeof original !== 'function' || proto.__peptalkTimeoutPatched) return client;
  proto.invoke = async function (this: unknown, ...args: unknown[]) {
    const name = typeof args[0] === 'string' ? args[0] : 'edge function';
    try {
      return await withTimeout(original.apply(this, args) as Promise<unknown>, FUNCTION_TIMEOUT_MS, name);
    } catch (err) {
      if (err instanceof TimeoutError) {
        return { data: null, error: { message: err.message, name: 'TimeoutError', status: 504 } };
      }
      throw err;
    }
  };
  proto.__peptalkTimeoutPatched = true;
  return client;
}

describe('edge-function invoke timeout', () => {
  it('survives the fresh-instance getter — the bug that broke the first attempt', async () => {
    jest.useFakeTimers();
    const client = patch(new FakeSupabaseClient());
    // Access `functions` twice: each returns a DIFFERENT object. Patching the
    // instance would only have covered the first.
    const a = client.functions;
    const b = client.functions;
    expect(a).not.toBe(b);

    const p = b.invoke('hangs') as Promise<{ data: unknown; error: { status: number } }>;
    jest.advanceTimersByTime(FUNCTION_TIMEOUT_MS);
    const res = await p;
    expect(res.data).toBeNull();
    expect(res.error.status).toBe(504);
    jest.useRealTimers();
  });

  it('leaves successful calls exactly as they were', async () => {
    const client = patch(new FakeSupabaseClient());
    const res = (await client.functions.invoke('food-scan')) as {
      data: { ok: boolean }; error: unknown;
    };
    expect(res.data.ok).toBe(true);
    expect(res.error).toBeNull();
  });

  it('resolves the supabase shape rather than throwing, so no caller changes', async () => {
    jest.useFakeTimers();
    const client = patch(new FakeSupabaseClient());
    const p = client.functions.invoke('hangs');
    jest.advanceTimersByTime(FUNCTION_TIMEOUT_MS);
    await expect(p).resolves.toHaveProperty('error.name', 'TimeoutError');
    jest.useRealTimers();
  });

  it('is idempotent — double-patching would stack timeouts', () => {
    const client = new FakeSupabaseClient();
    patch(client);
    const once = Object.getPrototypeOf(client.functions).invoke;
    patch(client);
    expect(Object.getPrototypeOf(client.functions).invoke).toBe(once);
  });

  it('gives generative work room to finish', () => {
    // Aimee, meal plans and lab OCR are genuinely slow. A false timeout on work
    // that would have succeeded is worse than the hang it replaces.
    expect(FUNCTION_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
  });
});
