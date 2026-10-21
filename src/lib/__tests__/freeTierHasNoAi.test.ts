/**
 * "Free has none of the AI features" has to mean every feature, not the one
 * that was named.
 *
 * Edward, 2026-09-18: "the free acc has none of the ai features otherwise".
 *
 * Setting `RATE_LIMITS.free = 0` in aimee-chat-stream closes the CHAT. It
 * closes nothing else. Recipes, workouts, food-scan, pantry-scan, pantry-meal,
 * lab interpretation and the rest do not read RATE_LIMITS at all — they route
 * through `_shared/aiAllowance.ts`, which measured COST and never looked at the
 * tier. A free account would have kept roughly 25 cents a month of every AI
 * feature in the app except the one that had been shut off.
 *
 * These assert the gate is in the shared path, so a new AI function inherits it
 * by using the same helper rather than by remembering a rule.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const ALLOWANCE = 'supabase/functions/_shared/aiAllowance.ts';
const CHAT = 'supabase/functions/aimee-chat-stream/index.ts';

describe('the shared allowance refuses a tier with no AI', () => {
  const src = read(ALLOWANCE);

  it('names the tiers in one place rather than testing a string inline', () => {
    expect(src).toMatch(/const TIERS_WITHOUT_AI = new Set\(\['free'\]\)/);
  });

  it('refuses BEFORE measuring cost', () => {
    // Order is the whole point. Measuring first and refusing second would
    // answer "you have used your monthly allowance" on a request that was
    // never going to be allowed — untrue, and nothing the user can act on.
    const gate = src.indexOf('TIERS_WITHOUT_AI.has(tier)');
    const cost = src.indexOf('await checkCostCap(');
    expect(gate).toBeGreaterThan(-1);
    expect(cost).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(cost);
  });

  it('answers 403 with the upgrade flag, not 429', () => {
    // 429 means "come back later". For a tier that will never have AI, later
    // does not arrive. 403 + upgrade is what the client turns into the lock
    // and the upgrade route.
    const block = src.slice(src.indexOf('TIERS_WITHOUT_AI.has(tier)'), src.indexOf('const cost = await checkCostCap('));
    expect(block).toContain('status: 403');
    expect(block).toContain('upgrade: true');
    expect(block).not.toContain('status: 429');
  });

  it('403 is a status the type allows, so this cannot be a lie in the types', () => {
    expect(src).toMatch(/status: 403 \| 429 \| 503;/);
  });
});

describe('every AI function is covered', () => {
  /** Functions that call an AI provider on the user's behalf. */
  const AI_FUNCTIONS = [
    'aimee-recipe',
    'aimee-workout',
    'aimee-plan',
    'aimee-lab-interpret',
    'aimee-pantry-meal',
    'aimee-pantry-scan',
    'aimee-pantry-parse',
    'aimee-report-rewrite',
    'food-scan',
    'lab-scan',
  ];

  it.each(AI_FUNCTIONS)('%s gates through the shared allowance', (fn) => {
    const rel = `supabase/functions/${fn}/index.ts`;
    if (!fs.existsSync(path.join(ROOT, rel))) return;
    const src = read(rel);
    // Either it uses the shared helper — and so inherits the tier gate — or it
    // is a deliberate exception that has to be argued for here.
    expect(src).toMatch(/aiAllowance|checkAiAllowance/);
  });

  it('the chat stream shuts free out too, by its own gate', () => {
    // The chat has a MESSAGE limit as well as a cost cap, so it refuses one
    // step earlier. Both routes have to close or free keeps one of them.
    const chat = read(CHAT);
    const limits = chat.slice(chat.indexOf('const RATE_LIMITS'), chat.indexOf('};', chat.indexOf('const RATE_LIMITS')));
    expect(limits).toMatch(/free: 0,/);
  });
});

describe('who is NOT caught by this', () => {
  it('beta testers and trial users resolve to pro before the gate sees them', () => {
    // resolveEffectiveTier returns 'pro' for a beta tester without a query, and
    // a trial is a real subscriptions row at tier 'pro'. Neither is 'free' by
    // the time checkAiAllowance runs, so neither is refused — and if that ever
    // changed, a paying trial user would be locked out of what they are being
    // shown.
    const tier = read('supabase/functions/_shared/effectiveTier.ts');
    expect(tier).toMatch(/if \(opts\.isBetaTester\) return 'pro';/);
    const migration = read('supabase/migrations/20260918130000_launch_trial_on_signup.sql');
    expect(migration).toContain("'pro'");
  });
});
