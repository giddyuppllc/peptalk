/**
 * Auto-refill — the rules around charging a card without the customer present.
 *
 * This is the only place in PepTalk where money moves with nobody watching, so
 * the properties worth pinning are all about restraint:
 *
 *  1. It is WEB ONLY. Apple and Google require the user to confirm every
 *     consumable purchase; charging a stored card to unlock in-app content on
 *     those platforms is a guideline violation. A toggle that appeared on
 *     native and quietly did nothing would be worse than no toggle.
 *  2. The monthly cap is stated to the user whenever it is on. Someone
 *     authorising automatic charges is entitled to see the ceiling.
 *  3. Repeated declines pause it rather than retrying forever, and the UI says
 *     so instead of going silent.
 *  4. A failed read renders nothing rather than a guessed state — a toggle
 *     drawn from a guess is the wrong thing to put in front of a card charge.
 */
import { Platform } from 'react-native';
import fs from 'node:fs';
import path from 'node:path';
import {
  isAutoRefillSupported,
  autoRefillSummary,
  type AutoRefillState,
} from '../../services/autoRefill';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const base: AutoRefillState = {
  enabled: false,
  maxPerMonth: 4,
  usedThisMonth: 0,
  pausedForFailures: false,
  lastRefillAt: null,
  lastError: null,
};

describe('auto-refill is web only', () => {
  const original = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  });

  it.each(['ios', 'android'])('is NOT offered on %s', (os) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    expect(isAutoRefillSupported()).toBe(false);
  });

  it('is offered on web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    expect(isAutoRefillSupported()).toBe(true);
  });
});

describe('what the toggle tells the user', () => {
  it('states the monthly ceiling whenever it is on', () => {
    const s = autoRefillSummary({ ...base, enabled: true, usedThisMonth: 1 }, '$4.99');
    expect(s).toContain('4 refills a month');
    expect(s).toContain('1 used');
    expect(s).toContain('$4.99');
  });

  it('explains a pause rather than going quiet', () => {
    // Silence after declines reads as "it is still working".
    const s = autoRefillSummary({ ...base, enabled: true, pausedForFailures: true }, '$4.99');
    expect(s.toLowerCase()).toContain('paused');
    expect(s.toLowerCase()).toContain('declined');
  });

  it('describes what it will do before it is switched on', () => {
    const s = autoRefillSummary(base, '$4.99');
    expect(s).toContain('$4.99');
    expect(s).not.toContain('refills a month');
  });
});

describe('the client never guesses the state', () => {
  const src = read('src/services/autoRefill.ts');

  it('returns null on any failure instead of a default', () => {
    expect(src).toContain('if (error) return null;');
    expect(src).toContain("typeof d.enabled !== 'boolean'");
  });

  it('a plain read cannot switch charging on', () => {
    // fetchAutoRefill sends no `enabled` key at all, and the server only
    // writes when it sees an explicit boolean.
    expect(src).toContain('return call({});');
  });

  it('the UI renders what the server returned, not what was requested', () => {
    const ui = read('src/components/CreditPackShelf.tsx');
    expect(ui).toContain('if (updated) setAutoRefillState(updated);');
  });

  it('the toggle is hidden entirely off web', () => {
    const ui = read('src/components/CreditPackShelf.tsx');
    expect(ui).toContain('if (isAutoRefillSupported())');
  });
});

describe('server-side spend limits exist', () => {
  const sql = read('supabase/migrations/20260826180000_credit_autorefill.sql');

  it('caps automatic spend per month', () => {
    expect(sql).toContain('max_per_month');
    expect(sql).toContain('refills_this_period >= v_row.max_per_month');
  });

  it('claims the slot BEFORE charging', () => {
    // Claiming after charging would risk a second charge on a retry; claiming
    // first risks losing one slot, which is the better failure.
    const fn = sql.slice(sql.indexOf('claim_autorefill_slot'));
    expect(fn).toContain('refills_this_period = refills_this_period + 1');
    expect(fn).toContain('FOR UPDATE');
  });

  it('stops after a run of declines', () => {
    expect(sql).toContain('consecutive_failures >= 3');
  });

  it('is off unless explicitly turned on', () => {
    expect(sql).toContain('enabled BOOLEAN NOT NULL DEFAULT FALSE');
  });

  it('clients cannot raise their own ceiling', () => {
    // Read-own policy only; every write goes through SECURITY DEFINER.
    expect(sql).toContain('"Read own autorefill"');
    expect(sql).not.toContain('FOR UPDATE USING (auth.uid() = user_id)');
  });
});

describe('the charging function is not client-reachable', () => {
  const fn = read('supabase/functions/credit-autorefill/index.ts');

  it('requires the internal secret', () => {
    // Assert the COMPARISON, not just the header name and the 403 string.
    // A mutation that replaced the condition with `false` — opening card
    // charging to anyone — left both of those intact and slipped past.
    expect(fn).toContain('x-internal-secret');
    expect(fn).toContain('secret !== INTERNAL_SECRET');
    expect(fn).toContain('!INTERNAL_SECRET');
    expect(fn).toContain("json({ error: 'Forbidden' }, 403)");
  });

  it('re-checks the threshold server-side rather than trusting the caller', () => {
    expect(fn).toContain('above_threshold');
  });

  it('grants against the Square payment id, so a retry cannot double-grant', () => {
    expect(fn).toContain('p_external_id: paymentId');
  });

  it('does not hand the slot back when the card was already charged', () => {
    // The customer has paid; returning the slot would invite a second charge.
    const block = fn.slice(fn.indexOf('BUT GRANT FAILED'));
    expect(block).toContain('p_success: true');
  });
});
