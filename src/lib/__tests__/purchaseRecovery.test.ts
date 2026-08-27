/**
 * Paid-but-not-granted: evidence, and recovery.
 *
 * WHAT HAPPENED
 * A customer bought PepTalk Plus on Google Play on 2026-08-22. The money left
 * her account. She signed in and out for three days, still on the free tier,
 * then messaged us on Instagram. When we went looking there was no
 * subscription row, no subscription event, and no log line anywhere — the only
 * evidence she existed was the message she sent.
 *
 * Two separate defects produced that:
 *
 *   1. A failure on the money path left NO RECORD, so it was unfindable and
 *      uncountable. Every other Android buyer in the same position is still
 *      invisible today.
 *   2. The live purchase path is a single attempt with no second chance. If
 *      the database write fails, the customer is simply stranded.
 *
 * These tests pin the fixes for both, and the safety properties that stop the
 * recovery itself becoming a way to give away paid tiers.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const SQL = read('supabase/migrations/20260827090000_purchase_validation_log.sql');
const VALIDATE = read('supabase/functions/validate-purchase/index.ts');
const RECONCILE = read('supabase/functions/reconcile-purchases/index.ts');

/** Source with line comments stripped, for negative assertions. */
function codeOnly(src: string): string {
  const NL = String.fromCharCode(10);
  return src
    .split(NL)
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('--');
    })
    .join(NL);
}

describe('a failure on the money path leaves evidence', () => {
  it('records the attempt BEFORE verification is attempted', () => {
    // This is the row a crash or timeout leaves behind. Logging after
    // verification would lose exactly the cases we could not see.
    const preVerify = VALIDATE.indexOf("stage: 'received'");
    const verifyCall = VALIDATE.indexOf('verifyGoogleReceipt(body.productId');
    expect(preVerify).toBeGreaterThan(-1);
    expect(preVerify).toBeLessThan(verifyCall);
  });

  it('distinguishes the stages that mean different things', () => {
    for (const stage of ['received', 'verified', 'verify_failed', 'grant_failed', 'granted']) {
      expect(VALIDATE).toContain(`stage: '${stage}'`);
    }
  });

  it('marks verified-but-ungranted separately from a rejected receipt', () => {
    // 'verify_failed' owes the customer nothing. 'grant_failed' means their
    // money is gone and they have nothing. Collapsing the two would hide the
    // only cases that need a human.
    expect(VALIDATE).toContain("stage: 'grant_failed'");
    expect(VALIDATE).toContain("stage: 'verify_failed'");
  });

  it('raises an alert when someone paid and got nothing', () => {
    // Silence is what let this run undetected. Every grant_failed exit
    // reports, so it reaches Sentry rather than only a log nobody reads.
    expect(VALIDATE).toContain('PAID BUT NOT GRANTED');
    const occurrences = VALIDATE.split('PAID BUT NOT GRANTED').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it('never lets logging break the money path', () => {
    // A new write in the purchase flow must not become a new way to fail it.
    const fn = VALIDATE.slice(VALIDATE.indexOf('async function logStage'));
    expect(fn).toContain('catch');
    expect(fn).toContain('logStage failed');
  });
});

describe('the evidence table is not reachable from a client', () => {
  it('enables RLS and defines no client policy at all', () => {
    // The rows carry purchase tokens, which are bearer credentials for the
    // store APIs. RLS with zero policies denies every client; the service
    // role bypasses RLS so the edge functions still work.
    expect(SQL).toContain('ALTER TABLE public.purchase_validation_log ENABLE ROW LEVEL SECURITY');
    expect(codeOnly(SQL)).not.toContain('CREATE POLICY');
  });

  it('keeps the logging function off anon and authenticated', () => {
    expect(SQL).toContain('FROM PUBLIC, anon, authenticated');
    expect(SQL).toContain('TO service_role');
  });

  it('collapses retries onto one row instead of inflating the count', () => {
    // A client that retries twenty times is one problem, not twenty.
    expect(SQL).toContain('attempts = attempts + 1');
    expect(SQL).toContain('WHERE platform = p_platform AND external_id = p_external_id');
  });

  it('keeps the FIRST error rather than the last', () => {
    // The original failure is the diagnostic one; later errors are usually
    // downstream noise.
    expect(SQL).toContain('error = COALESCE(error, LEFT(p_error, 500))');
  });
});

describe('recovery cannot give away a tier for money that came back', () => {
  it('re-queries the store instead of trusting the log', () => {
    // Between the failed attempt and the sweep a purchase can be refunded,
    // cancelled or expired. Granting from a stale record would hand out a
    // paid tier for returned money.
    expect(RECONCILE).toContain('recheckGoogle');
    expect(RECONCILE).toContain('purchases/subscriptions/');
  });

  it('refuses to grant when the purchase is no longer live', () => {
    expect(RECONCILE).toContain('if (!check.live)');
    expect(RECONCILE).toContain('no longer live at store');
  });

  it('requires BOTH an unexpired date and a paid state', () => {
    // Either alone is insufficient: an unexpired cancelled subscription and a
    // paid-but-expired one are both "not owed".
    expect(RECONCILE).toContain('expiresMs > Date.now() && paid');
  });

  it('acknowledges anything that reached the sweep unacknowledged', () => {
    // If it got this far unacknowledged the 3-day auto-refund clock is still
    // running — acknowledge before anything else.
    expect(RECONCILE).toContain('acknowledgementState === 0');
    expect(RECONCILE).toContain(':acknowledge');
  });

  it('is safe to run twice', () => {
    // Every write is an upsert keyed on (user_id, product_id), and a row that
    // is already active is skipped outright.
    expect(RECONCILE).toContain("onConflict: 'user_id,product_id'");
    expect(RECONCILE).toContain('if (existing?.is_active)');
  });

  it('supports a dry run that changes nothing', () => {
    expect(RECONCILE).toContain('dryRun');
    expect(RECONCILE).toContain('if (dryRun)');
  });

  it('surfaces iOS rows for a human rather than guessing', () => {
    // iOS receipts cannot be re-checked without the original JWS, which is
    // not stored. Guessing would mean granting on no evidence.
    expect(RECONCILE).toContain('skippedNoToken');
    expect(RECONCILE).toContain("row.platform !== 'android'");
  });

  it('is internal-only', () => {
    expect(RECONCILE).toContain('x-internal-secret');
    expect(RECONCILE).toContain('secret !== INTERNAL_SECRET');
    expect(RECONCILE).toContain('!INTERNAL_SECRET');
  });
});
