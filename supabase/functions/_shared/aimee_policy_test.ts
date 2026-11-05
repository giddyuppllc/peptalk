// Deno tests: Aimee's dosing policy, the per-platform switch, the paywall
// notice filter, and token accounting.  Run: npm run test:edge
import { assert, assertEquals, assertFalse, assertMatch } from 'jsr:@std/assert@1';
import { buildAimeeSystemPrompt as streamPrompt } from '../aimee-chat-stream/_prompt.ts';
import { buildAimeeSystemPrompt as legacyPrompt } from '../aimee-chat/_prompt.ts';
import {
  APPROVED_RX,
  DEFAULT_POLICY,
  classifyCompound,
  clearPolicyCache,
  defaultPolicyFor,
  loadAiPolicy,
  normalizePlatform,
  type AiPolicy,
} from './rxPolicy.ts';
import { isSystemNoticeText } from './chatNotices.ts';
import { usageFromWire } from '../aimee-chat-stream/_grok.ts';

const ctx = { tier: 'pro', hasConsent: true };
const ON: AiPolicy = { ...DEFAULT_POLICY, approvedRxLabelInfo: true };
const OFF: AiPolicy = { ...DEFAULT_POLICY, approvedRxLabelInfo: false };
const builders = [streamPrompt, legacyPrompt];

/** Figures that used to be in the prompts for research compounds. */
const RESEARCH_DOSE_SNIPPETS = [
  'Retatrutide (5 mg vial) — [Rx]', 'Start 1 mg (20 units) weekly', 'KLOW (GHK-Cu / KPV / BPC-157 / TB-500 blend) — 10 units',
  'PROTOCOL TEMPLATES', 'Titration: wks', 'Mild = min of typicalDose', 'typicalDose range', 'Aggressive',
  '9-ME-BC — 15-30 mg', 'MK-677 (Ibutamoren, oral) — [Rx] 10-25 mg',
];

Deno.test('classifier: approved drugs vs research compounds vs supplements', () => {
  for (const n of ['semaglutide', 'Wegovy', 'tirzepatide', 'Zepbound', 'PT-141', 'tesamorelin']) assertEquals(classifyCompound(n), 'approved_rx', n);
  for (const n of ['BPC-157', 'TB-500', 'retatrutide', 'GHK-Cu', 'ipamorelin', 'MK-677', 'something-unheard-of']) assertEquals(classifyCompound(n), 'research', n);
  for (const n of ['L-Carnitine', 'alpha-gpc', 'creatine']) assertEquals(classifyCompound(n), 'supplement', n);
});

Deno.test('every prompt, every setting: no research-compound protocols or doses', () => {
  for (const build of builders) {
    for (const policy of [ON, OFF]) {
      const p = build(ctx, policy);
      for (const s of RESEARCH_DOSE_SNIPPETS) assertFalse(p.includes(s), `prompt still contains: ${s}`);
      assertMatch(p, /RESEARCH \/ UNAPPROVED COMPOUNDS[\s\S]*MUST NOT give any human dose, dose range, frequency, cycle, titration, stack, reconstitution recipe or protocol/);
      assertMatch(p, /BPC-157/);
    }
  }
});

Deno.test('every prompt, every setting: never personalised', () => {
  for (const build of builders) {
    for (const policy of [ON, OFF]) {
      const p = build(ctx, policy);
      assertMatch(p, /NEVER PERSONALISE\. Never use the user's labs, weight, age, sex, medications, conditions, goals or any profile data to suggest, choose or adjust a dose/);
      assertFalse(/You CAN share specific dose figures/.test(p));
      assertFalse(/pick a tier "for them"/.test(p));
    }
  }
});

Deno.test('label info ON: approved drugs only, cited, with the disclaimer', () => {
  for (const build of builders) {
    const p = build(ctx, ON);
    assertMatch(p, /US prescribing information/);
    assertMatch(p, /per the Wegovy prescribing information/);
    assert(p.includes("I'm not a doctor — follow your prescriber's instructions."));
    for (const r of APPROVED_RX) assert(p.includes(`- ${r.display} — ${r.brands}: ${r.label}`), r.display);
    assertMatch(p, /0\.25 mg weekly for 4 weeks/);
  }
});

Deno.test('label info OFF for a platform removes the label section from that prompt', () => {
  for (const build of builders) {
    const p = build(ctx, OFF);
    assertFalse(p.includes('APPROVED DRUGS — LABEL SUMMARIES'));
    assertFalse(/0\.25 mg weekly for 4 weeks/.test(p));
    assertFalse(/2\.5 mg weekly for 4 weeks/.test(p));
    assertMatch(p, /give NO doses or titration on this platform/);
  }
});

function fakeDb(row: unknown, error: unknown = null) {
  let reads = 0;
  return {
    get reads() { return reads; },
    from: (_t: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => { reads++; return { data: row, error }; } }) }),
    }),
  };
}

Deno.test('defaults: iOS off, Android and web on, unknown = iOS', () => {
  assertFalse(defaultPolicyFor('ios').approvedRxLabelInfo);
  assertFalse(defaultPolicyFor('unknown').approvedRxLabelInfo);
  assert(defaultPolicyFor('android').approvedRxLabelInfo);
  assert(defaultPolicyFor('web').approvedRxLabelInfo);
  // A prompt built without a loaded policy uses the platform default.
  assertFalse(streamPrompt({ ...ctx, platform: 'ios' }).includes('APPROVED DRUGS — LABEL SUMMARIES'));
  assert(streamPrompt({ ...ctx, platform: 'web' }).includes('APPROVED DRUGS — LABEL SUMMARIES'));
});

Deno.test('settings: a missing table or row uses that platform\'s default', async () => {
  clearPolicyCache();
  assertEquals(await loadAiPolicy(fakeDb(null, { code: '42P01', message: 'relation does not exist' }), 'ios'), defaultPolicyFor('ios'));
  clearPolicyCache();
  assertEquals(await loadAiPolicy(fakeDb(null), 'web'), DEFAULT_POLICY);
  clearPolicyCache();
  assertEquals(await loadAiPolicy({ from: () => { throw new Error('network'); } }, 'android'), DEFAULT_POLICY);
});

Deno.test('data is kept; the prompt filters it', () => {
  const src = Deno.readTextFileSync(new URL('../aimee-chat-stream/_prompt.ts', import.meta.url));
  // The dosing reference is still in the file, unedited...
  for (const s of ['Retatrutide (5 mg vial) — [Rx]', 'KLOW (GHK-Cu / KPV / BPC-157 / TB-500 blend) — 10 units', 'L-Carnitine — 300-1000 mg']) {
    assert(src.includes(s), `data line missing from source: ${s}`);
  }
  // ...but only the over-the-counter supplement lines reach the model.
  const p = streamPrompt(ctx, ON);
  assert(p.includes('L-Carnitine — 300-1000 mg'));
  assertFalse(p.includes('Retatrutide (5 mg vial)'));
  assertFalse(p.includes('KLOW (GHK-Cu'));
  const pantry = Deno.readTextFileSync(new URL('../aimee-pantry-meal/index.ts', import.meta.url));
  assert(pantry.includes("'User is on ipamorelin: no high-glycemic carbs in the evening dose window.'"), 'pantry table unchanged');
});

Deno.test('settings: a row turns label info off, is cached, and unknown platforms read iOS', async () => {
  clearPolicyCache();
  const db = fakeDb({ approved_rx_label_info: false });
  assertFalse((await loadAiPolicy(db, 'ios')).approvedRxLabelInfo);
  await loadAiPolicy(db, 'ios');
  assertEquals(db.reads, 1);
  assertFalse((await loadAiPolicy(db, normalizePlatform('windows'))).approvedRxLabelInfo);
  assertEquals(db.reads, 1);
  // The two locked switches cannot be read as on.
  const p = await loadAiPolicy(fakeDb({ approved_rx_label_info: true, research_compound_protocols: true }), 'web');
  assertEquals(p.researchCompoundProtocols, false);
  assertEquals(p.personalisedRxDosing, false);
});

Deno.test('paywall notices are recognised; Aimee answers are not', () => {
  for (const t of [
    'AI chat requires PepTalk+ or Pro subscription',
    "You've used your 3 free Aimee messages this month. Upgrade to PepTalk+ or Pro to keep going.",
    'Monthly message limit reached (750). It resets at the start of next month.',
  ]) assert(isSystemNoticeText(t), t);
  for (const t of ["I'll pull your 14-day trends now.", 'Tirzepatide is a dual GIP/GLP-1 receptor agonist.']) assertFalse(isSystemNoticeText(t), t);
});

Deno.test('usage: output counts every non-prompt token, reasoning included', () => {
  assertEquals(usageFromWire({ prompt_tokens: 10000, completion_tokens: 300, total_tokens: 12300 }), { input_tokens: 10000, output_tokens: 2300 });
  assertEquals(usageFromWire({ prompt_tokens: 10000, completion_tokens: 2300, total_tokens: 12300 }), { input_tokens: 10000, output_tokens: 2300 });
  assertEquals(usageFromWire({ prompt_tokens: 100, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 200 } }), { input_tokens: 100, output_tokens: 250 });
});
