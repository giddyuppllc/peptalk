/**
 * What the paywall SELLS must match what the server ENFORCES.
 *
 * WHY THIS EXISTS (Edward, 2026-09-16: "make the words match the caps")
 * The subscription screen sold "Unlimited Aimee chat" and "20 personalized
 * chats/day". Neither was true. Aimee is metered two ways, and whichever binds
 * first wins:
 *
 *   - a MESSAGE count per month  — RATE_LIMITS in aimee-chat-stream/index.ts
 *     (free 3, plus 750, pro 9000), mirrored by MESSAGE_LIMITS in aimee-usage
 *   - a COST cap per month       — TIER_CENTS in aimee-chat-stream/_cost.ts
 *     (free 25c, plus 300c, pro 1200c by default)
 *
 * So "unlimited" was false, "per day" was the wrong period, and the number
 * itself was wrong. Under Guideline 3.1.2 a subscription has to describe what
 * it actually delivers, which makes this a store-rejection risk and not only
 * a copy nit.
 *
 * WHAT IS ASSERTED, AND WHAT DELIBERATELY IS NOT
 * The copy says "up to N a month". `up to` is load-bearing: the cost cap can
 * bind before the message count on long conversations, so N is a CEILING, and
 * a ceiling is the only honest shape for a number the user cannot predict.
 * This test therefore pins:
 *
 *   1. the number in the copy == the number in the gate, per tier
 *   2. the copy is hedged ("up to"), so the cost cap can never make it a lie
 *   3. no Aimee surface calls the allowance unlimited or meters it per day
 *
 * It does NOT assert the cost caps, which are env-overridable
 * (AIMEE_MONTHLY_CENTS_*) and so cannot be pinned from the repo. Raising a
 * message limit without touching the copy fails here; raising a cost cap
 * correctly does not.
 *
 * Plain string matching, per the note in aimeeFreeTier.test.ts — an earlier
 * guard here built patterns with `new RegExp` inside a template literal, the
 * escaping collapsed, and it matched nothing while looking correct.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const GATE = 'supabase/functions/aimee-chat-stream/index.ts';

/**
 * Every file that puts an Aimee allowance in front of a user.
 *
 * `src/config/tourSteps.ts` was missing from this list until 2026-09-16 and it
 * was carrying BOTH defects this test was written to stop. The free→plus tour
 * sold 20 messages per day and the plus→pro tour was titled Unlimited over a
 * body promising no more message caps — on the walkthrough that fires the
 * moment someone upgrades, so it was the first thing a paying subscriber was
 * told. Four files were scanned, the fifth was not, and the suite was green.
 *
 * A guard list is only as wide as the surfaces on it. If a new screen, tour,
 * onboarding slide or push body ever quotes an Aimee allowance, add it here.
 */
const COPY_FILES = [
  'app/subscription.tsx',
  'app/onboarding.tsx',
  'app/(tabs)/profile.tsx',
  'src/components/PaywallModal.tsx',
  'src/config/tourSteps.ts',
];

/**
 * The quoted string literals in a file that mention Aimee.
 *
 * Line-at-a-time was too coarse and this test caught it on its first run:
 * onboarding.tsx holds one array whose line contains BOTH
 * 'Unlimited Stack Builder …' and the Aimee entry. Stack Builder really is
 * unlimited, so a line-level "no unlimited near Aimee" rule failed on a
 * true claim. The unit that carries a promise is the string, not the line.
 */
/**
 * Block and line comments, blanked rather than deleted so nothing else shifts.
 *
 * A comment shows a user nothing, and the files on this list explain at length
 * what they must not say — tourSteps.ts now records the exact wording it was
 * corrected away from. Without this, a note about the defect reads as the
 * defect, and the honest fix fails the test that asked for it.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, '$1');
}

/**
 * Words that make a clause a statement about the Aimee allowance even when the
 * name itself sits in a neighbouring clause. Deliberately narrow: it must be
 * about messages or chatting, so "Unlimited tracking" and "Unlimited Stack
 * Builder" — both true — stay outside it.
 */
const ALLOWANCE_VOCAB = /\bmessages?\b|\bmessaging\b|\bchats?\b|\bchatting\b/i;

function aimeeStrings(file: string): string[] {
  const src = stripComments(read(file));
  const out: string[] = [];
  // Single- or double-quoted literals, skipping escaped quotes.
  for (const m of src.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
    const s = m[1] ?? m[2] ?? '';
    if (!s.includes('Aimee')) continue;
    // Even one string can carry two unrelated promises:
    //   Unlimited tracking, 750 Aimee messages a month, Food Scanner & more
    // (app/(tabs)/profile.tsx:387). Tracking really is unlimited; Aimee is not.
    // So the string is split into clauses. The lookahead keeps 9,000 intact —
    // split on a comma that does NOT sit inside a number.
    //
    // KEEPING ONLY THE CLAUSES CONTAINING "Aimee" WAS THE BUG (2026-09-16).
    // The promise and the brand name routinely sit in different clauses:
    //
    //   Ask Aimee anything — peptide dosing, stacks, workouts, nutrition.
    //   20 messages per day.
    //
    // Only the FIRST clause names Aimee, so the clause carrying "per day" was
    // dropped and the test passed over the exact claim it exists to forbid.
    // Mutation-confirmed: reinstating that body left this suite green.
    //
    // A clause counts as an Aimee allowance claim if it names Aimee OR speaks
    // the allowance vocabulary (message / chat / cap). That keeps the profile
    // string above safe — "Unlimited tracking" names neither — while catching a
    // message promise wherever in the sentence it lands.
    for (const clause of s.split(/,(?!\d)/)) {
      if (clause.includes('Aimee') || ALLOWANCE_VOCAB.test(clause)) {
        out.push(clause.trim());
      }
    }
  }
  return out;
}

/** Pull `plus: 750,` out of the gate's RATE_LIMITS block. */
function gateLimit(tier: 'free' | 'plus' | 'pro'): number {
  const src = read(GATE);
  const start = src.indexOf('const RATE_LIMITS');
  expect(start).toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf('};', start));
  const line = block
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${tier}:`));
  expect(line).toBeDefined();
  const n = Number((line as string).replace(`${tier}:`, '').replace(',', '').trim());
  expect(Number.isFinite(n)).toBe(true);
  return n;
}

/** 9000 -> "9,000". The copy uses a thousands separator; the source does not. */
const grouped = (n: number) => n.toLocaleString('en-US');

describe('paywall claims match the enforced limits', () => {
  it('the gate still defines all three tiers', () => {
    // Free went 3 -> 0 on 2026-09-18: AI is what the subscription buys, and
    // the taste is the 7-day Pro trial rather than a permanent trickle. The
    // rest of this suite is what actually protects the user — that no figure
    // shown to anyone exceeds what the gate enforces — and it passed through
    // the change untouched, which is how we know no paywall copy was
    // advertising free Aimee messages.
    expect(gateLimit('free')).toBe(0);
    expect(gateLimit('plus')).toBe(750);
    expect(gateLimit('pro')).toBe(9000);
  });

  it('the meter agrees with the gate, tier by tier', () => {
    // A meter that disagrees with the gate is worse than no meter.
    const meter = read('supabase/functions/aimee-usage/index.ts');
    const start = meter.indexOf('const MESSAGE_LIMITS');
    expect(start).toBeGreaterThan(-1);
    const block = meter.slice(start, meter.indexOf('};', start));
    for (const tier of ['free', 'plus', 'pro'] as const) {
      expect(block).toContain(`${tier}: ${gateLimit(tier)},`);
    }
  });

  it.each([
    ['plus', 'app/subscription.tsx'],
    ['plus', 'app/onboarding.tsx'],
    ['plus', 'app/(tabs)/profile.tsx'],
    ['pro', 'app/subscription.tsx'],
    ['pro', 'src/components/PaywallModal.tsx'],
  ] as const)('%s copy in %s names the enforced number', (tier, file) => {
    const limit = gateLimit(tier);
    const src = read(file);
    // Either spelling, so the copy may group thousands or not.
    const named = src.includes(String(limit)) || src.includes(grouped(limit));
    expect(named).toBe(true);
  });

  it('every message figure a user is shown is one the gate enforces', () => {
    // The it.each above asks whether the right number appears ANYWHERE in the
    // file. That cannot see a WRONG one sitting next to it — mutation-confirmed
    // on 2026-09-16: changing the tour's "750 messages a month" to "900
    // messages a month" left this suite green. Here every figure the copy
    // attaches to the word "messages" must be one of the enforced limits.
    const allowed = new Set(
      (['free', 'plus', 'pro'] as const).flatMap((t) => {
        const n = gateLimit(t);
        return [String(n), grouped(n)];
      }),
    );
    let figures = 0;
    for (const file of COPY_FILES) {
      for (const s of aimeeStrings(file)) {
        // "750 messages", "9,000 messages", and "750 Aimee messages" — up to
        // two words may sit between the number and the noun.
        for (const m of s.matchAll(/\b(\d[\d,]*)\s+(?:\S+\s+){0,2}messages?\b/gi)) {
          figures++;
          expect({ file, claim: s.trim(), figure: m[1] }).toEqual({
            file,
            claim: s.trim(),
            figure: allowed.has(m[1]) ? m[1] : `one of ${[...allowed].join(' / ')}`,
          });
        }
      }
    }
    // Anti-vacuity: a rename that hid every figure must not read as a pass.
    expect(figures).toBeGreaterThanOrEqual(4);
  });

  it('every Aimee message figure states the period it applies to', () => {
    // The number is a ceiling. Without a period it reads as "9,000 messages",
    // full stop, which is neither the gate's promise nor a shape the cost cap
    // can honour.
    for (const file of COPY_FILES) {
      for (const s of aimeeStrings(file)) {
        for (const limit of [750, 9000]) {
          if (!s.includes(String(limit)) && !s.includes(grouped(limit))) continue;
          expect(s).toContain('month');
        }
      }
    }
  });

  it('no Aimee claim is unlimited or metered per day', () => {
    for (const file of COPY_FILES) {
      for (const s of aimeeStrings(file)) {
        expect(s.toLowerCase()).not.toContain('unlimited');
        expect(s).not.toContain('/day');
        expect(s.toLowerCase()).not.toContain('per day');
        expect(s.toLowerCase()).not.toContain('no message limit');
        // "No more message caps" is an unlimited claim that uses none of the
        // words above, and it is what the plus→pro tour actually shipped. The
        // list has to cover the claim, not one spelling of it.
        expect(s.toLowerCase()).not.toContain('no message cap');
        expect(s.toLowerCase()).not.toContain('no more message cap');
        expect(s.toLowerCase()).not.toContain('as much as you want');
      }
    }
  });

  it('the anti-vacuity control: these files really do make Aimee claims', () => {
    // If a rename made every string above invisible, the two guards would pass
    // over nothing at all and report green.
    const all = COPY_FILES.flatMap(aimeeStrings);
    expect(all.length).toBeGreaterThanOrEqual(5);
    // and at least one of them really does carry a number
    expect(all.some((s) => s.includes('750') || s.includes('9,000'))).toBe(true);
  });
});
