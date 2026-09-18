/**
 * Free tier: three Aimee messages a month, answers only.
 *
 * WHAT THIS PROTECTS
 * Free previously got a hard 403 from `aimee-chat-stream`. Opening it up means
 * four separate things have to stay true at once, and each has already failed
 * at least once in this codebase:
 *
 *  1. The limit the METER reports must equal the limit the GATE applies. They
 *     live in two files, so nothing but a test keeps them honest — and a meter
 *     that disagrees with the gate is worse than no meter, because people plan
 *     around it.
 *  2. Reading usage must never CONSUME usage. `bump_ai_usage` increments; if
 *     the usage endpoint ever called it, merely opening the subscription screen
 *     would spend one of the three.
 *  3. Free must be offered NO tools. Filtering after the fact is not enough —
 *     a model that is never offered a tool cannot call one.
 *  4. Aimee must be TOLD she has no tools, or she says "I have logged that"
 *     and nothing happens. That exact broken-promise pattern is the reason
 *     aimeeFallbackPromises.test.ts exists.
 *
 * Assertions are plain string matching. An earlier guard in this repo built
 * patterns with `new RegExp` inside template literals, the escaping collapsed,
 * and it matched nothing while looking correct.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/**
 * Source with line comments stripped.
 *
 * Negative assertions have to run against CODE. The first version of this file
 * failed because the comments explaining why the daily wording was removed
 * themselves quoted the daily wording — the guard fired on its own rationale.
 */
function codeOnly(src: string): string {
  // NL rather than a newline escape on purpose: this file is authored through
  // a shell heredoc that halves backslashes, which has silently corrupted
  // guards in this repo before.
  const NL = String.fromCharCode(10);
  return src
    .split(NL)
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join(NL);
}

const CHAT = 'supabase/functions/aimee-chat-stream/index.ts';
const USAGE = 'supabase/functions/aimee-usage/index.ts';

/** Pull "tier: number" pairs out of a named record literal, without regex. */
function limitsIn(src: string, name: string): Record<string, number> {
  const start = src.indexOf(name);
  if (start < 0) throw new Error(`${name} not found`);
  const open = src.indexOf('{', start);
  const close = src.indexOf('}', open);
  const body = src.slice(open + 1, close);
  const out: Record<string, number> = {};
  for (const line of body.split('\n')) {
    const clean = line.trim();
    if (!clean || clean.startsWith('//')) continue;
    const [k, v] = clean.split(':');
    if (!k || !v) continue;
    const n = Number(v.replace(',', '').trim());
    if (Number.isFinite(n)) out[k.trim()] = n;
  }
  return out;
}

describe('free tier gets no AI — the taste is the trial', () => {
  const chat = read(CHAT);

  it('the chat gate allows nothing for free', () => {
    // Was 3. Edward, 2026-09-18: "the free acc has none of the ai features
    // otherwise" — a week of Pro shows the real thing; three prompts a month
    // showed a thin version of it and were neither trial nor product.
    expect(limitsIn(chat, 'RATE_LIMITS').free).toBe(0);
  });

  it('so the 403 catches free, carrying the upgrade flag the client needs', () => {
    // A zero limit routes into the tier refusal. It must never become a bare
    // 403: `upgrade: true` is what the client turns into the lock and the
    // upgrade path, and without it free users meet a dead end instead of an
    // offer.
    expect(limitsIn(chat, 'RATE_LIMITS').free).toBe(0);
    expect(chat).toContain("jsonError(403, 'AI chat requires PepTalk+ or Pro subscription', { upgrade: true })");
  });

  it('NEVER ships without the trial that replaces it', () => {
    // On its own this takes three messages a month away from ~226 existing
    // free accounts and offers nothing back. The trial is what makes removing
    // the trickle defensible, so the two are pinned together: if free is 0,
    // the migration that grants the trial must exist and must grant Pro.
    const free = limitsIn(chat, 'RATE_LIMITS').free;
    if (free > 0) return; // trickle restored — the coupling does not apply

    const migration = read('supabase/migrations/20260918130000_launch_trial_on_signup.sql');
    expect(migration).toContain("'launch_trial_pro_7d'");
    expect(migration).toContain("'pro'");
    expect(migration).toContain("NOW() + INTERVAL '7 days'");
    // renews=false, or the 3-day grace makes a 7-day trial a 10-day one.
    expect(migration).toMatch(/FALSE\s*\)/);
    // And the grant must be wired into the signup trigger, not left as a
    // function nobody calls.
    expect(migration).toContain('CREATE TRIGGER on_auth_user_created');
  });

  it('the limit message states a MONTHLY window, not a daily one', () => {
    // This said "Daily message limit reached ... Resets tomorrow" after the
    // allowance became monthly. Telling someone to wait for a reset that will
    // not come is worse than a bare refusal.
    const code = codeOnly(chat);
    expect(code).not.toContain('Resets tomorrow');
    expect(code).not.toContain('/day)');
    expect(chat).toContain('free Aimee messages this month');
  });

  it('offers free an upgrade route when the allowance is gone', () => {
    expect(chat).toContain("upgrade: tier === 'free' || tier === 'plus'");
  });
});

describe('free tier is answers-only', () => {
  const chat = read(CHAT);

  it('withholds the tool list entirely rather than filtering results', () => {
    // The free branch is still a literal empty list. The paid branch also
    // passes through the health-data consent filter (52eb417), which can only
    // REMOVE tools — see aiDataConsent.test.ts.
    expect(chat).toContain(
      'tools: args.canUseTools ? toolsAllowedForConsent(AIMEE_TOOLS, args.hasConsent) : []',
    );
  });

  it('free is the tier denied tools', () => {
    const map = read(CHAT);
    const start = map.indexOf('TIER_CAN_USE_TOOLS');
    const block = map.slice(start, map.indexOf('}', map.indexOf('{', start)));
    expect(block).toContain('free: false');
    expect(block).toContain('plus: true');
    expect(block).toContain('pro: true');
  });

  it('tells Aimee she cannot act, so she does not promise that she has', () => {
    expect(chat).toContain('this user is on the free plan');
    expect(chat).toContain('cannot take any action');
    expect(chat).toContain('Never say you');
    expect(chat).toContain('or will do, any of those things');
  });
});

describe('the meter cannot disagree with the gate', () => {
  it('reports the same per-tier limits the chat function enforces', () => {
    const gate = limitsIn(read(CHAT), 'RATE_LIMITS');
    const meter = limitsIn(read(USAGE), 'MESSAGE_LIMITS');
    expect(meter).toEqual(gate);
  });

  it('reads the usage row instead of bumping it', () => {
    // bump_ai_usage INCREMENTS. Calling it here would spend one of the three
    // free messages every time the meter rendered.
    const usage = read(USAGE);
    // The CALL form, not the name — the comment above it explains why it is
    // avoided, and must not itself trip the guard.
    expect(codeOnly(usage)).not.toContain("rpc('bump_ai_usage'");
    expect(usage).toContain("from('ai_usage_log')");
    expect(usage).toContain("select('count')");
  });

  it('counts against the same monthly bucket key the gate writes', () => {
    const key = "`${new Date().toISOString().slice(0, 7)}-01`";
    expect(read(CHAT)).toContain(key);
    expect(read(USAGE)).toContain(key);
  });

  it('reports being at the limit on message count, not only on spend', () => {
    expect(read(USAGE)).toContain('messagesUsed >= messageLimit');
  });
});
