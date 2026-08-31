import { withTimeout, TimeoutError, AUTH_TIMEOUT_MS } from '../withTimeout';
import { classifyAuthError, describeAuthError } from '../errorMessages';

jest.useFakeTimers();

describe('withTimeout', () => {
  it('resolves normally when the promise wins', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('propagates a real rejection rather than masking it as a timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('nope')), 1000)).rejects.toThrow('nope');
  });

  it('rejects when the promise never settles — the actual bug', async () => {
    // supabase-js sets no fetch timeout, so on a half-connected network the
    // sign-in call neither resolves nor rejects. The user taps Log In and
    // nothing happens, forever.
    const hangs = new Promise(() => {});
    const p = withTimeout(hangs, 5000, 'Sign in');
    jest.advanceTimersByTime(5000);
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
  });

  it('accepts a thenable, because supabase builders are not real Promises', async () => {
    // A plain object exposing only `then` — structurally what a supabase-js
    // query builder is. Borrowing a real Promise's `then` keeps the generic
    // signature honest without hand-rolling it.
    const inner = Promise.resolve('built');
    const thenable: PromiseLike<string> = { then: inner.then.bind(inner) };
    await expect(withTimeout(thenable, 1000)).resolves.toBe('built');
  });

  it('gives an interactive call a generous budget', () => {
    // A false timeout on a slow-but-working connection is worse than the hang
    // it replaces, so this only has to beat "forever".
    expect(AUTH_TIMEOUT_MS).toBeGreaterThanOrEqual(15_000);
  });
});

describe('a timeout reaches the user as something actionable', () => {
  it('classifies as offline, not as an unknown error', () => {
    // The whole point: the hang becomes the "check your connection" copy
    // instead of a dead button or a generic shrug.
    expect(classifyAuthError(new TimeoutError(20_000, 'Sign in'))).toBe('offline');
  });

  it('never shows the user the raw timeout text', () => {
    const d = describeAuthError(new TimeoutError(20_000, 'Sign in'));
    expect(d.message).not.toContain('20000');
    expect(d.message.toLowerCase()).toContain('connection');
    expect(d.retryable).toBe(true);
  });
});
