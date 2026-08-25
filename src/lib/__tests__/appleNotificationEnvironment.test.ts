/**
 * A sandbox purchase must never be indistinguishable from a real one.
 *
 * Apple delivers BOTH Sandbox and Production App Store Server Notifications to
 * the SAME production URL — there is no separate sandbox endpoint. The JWS
 * signature is valid and the bundle id matches in both cases, so the two are
 * distinguishable ONLY by the `environment` field on the payload.
 *
 * apple-notifications verified the signature and checked the bundle id, then
 * wrote the entitlement without ever reading `environment`. Anyone with a
 * sandbox tester account on this bundle id could hand themselves Pro, and
 * sandbox activity mixed silently into real subscription state.
 *
 * We deliberately do NOT reject Sandbox — App Review buys in sandbox against
 * the production build, and refusing it would fail review. What must hold is
 * that the environment is READ and RECORDED on both writes.
 *
 * Source-level rather than behavioural: this is a Deno edge function that
 * verifies real Apple certificate chains, so standing it up in jest would test
 * the mock, not the function. What can be pinned here is that the field is
 * read and persisted — which is exactly what regressed.
 */
import fs from 'node:fs';
import path from 'node:path';

const FN = path.join(
  __dirname, '..', '..', '..',
  'supabase', 'functions', 'apple-notifications', 'index.ts',
);
const src = fs.readFileSync(FN, 'utf8');

describe('apple-notifications environment capture', () => {
  it('is the file we think it is', () => {
    // Without this the whole suite passes vacuously if the function moves.
    expect(src.length).toBeGreaterThan(2000);
    expect(src).toMatch(/verifyAppleJWS/);
    expect(src).toMatch(/subscription_events/);
  });

  it('reads the environment off the payload', () => {
    expect(src).toMatch(/const environment[^\n]*=/);
    // Must consult the signed transaction info, not only the outer envelope:
    // the outer `data.environment` is not covered by the JWS signature.
    expect(src).toMatch(/txInfo\?\.environment/);
  });

  it('records it on the audit log write', () => {
    const block = src.slice(src.indexOf("from('subscription_events')"));
    const upsert = block.slice(0, block.indexOf('onConflict'));
    expect(upsert).toMatch(/\benvironment\b/);
  });

  it('records it on the entitlement write', () => {
    const block = src.slice(src.lastIndexOf("from('subscriptions').upsert"));
    const upsert = block.slice(0, block.indexOf('onConflict'));
    expect(upsert).toMatch(/\benvironment\b/);
  });

  it('does not reject sandbox outright, which would fail App Review', () => {
    // A guard that returned early on Sandbox would break review purchases.
    const rejects = src
      .split('\n')
      .filter((l) => /environment\s*[!=]==?\s*'?Sandbox/i.test(l))
      .filter((l) => /return\s+new\s+Response|status:\s*4\d\d/.test(l));
    expect(rejects).toEqual([]);
  });
});
