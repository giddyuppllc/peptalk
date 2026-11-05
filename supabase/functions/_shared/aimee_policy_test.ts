// Deno tests for Aimee's per-platform prescription rules, the paywall-notice
// filter, and token accounting.  Run: npm run test:edge
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import { buildAimeeSystemPrompt as streamPrompt } from '../aimee-chat-stream/_prompt.ts';
import { buildAimeeSystemPrompt as legacyPrompt } from '../aimee-chat/_prompt.ts';
import { normalizePlatform, RX_FACTUAL_SECTION, usesStrictRxRules } from './rxPolicy.ts';
import { isSystemNoticeText } from './chatNotices.ts';
import { usageFromWire } from '../aimee-chat-stream/_grok.ts';

const base = { tier: 'pro', hasConsent: true };
// Dose lines for compounds tagged [Rx] in the dosing reference.
const RX_DOSE_LINES = [
  'Semaglutide — [Rx]',
  'Tirzepatide — [Rx]',
  'Retatrutide (5 mg vial) — [Rx]',
  'Testosterone — [Rx]',
  'HCG — [Rx]',
];

Deno.test('platform: only android and web relax the rules; anything else is strict', () => {
  for (const v of ['ios', undefined, null, '', 'IOS', 'windows', 42]) {
    assert(usesStrictRxRules(normalizePlatform(v)), `strict for ${String(v)}`);
  }
  assertFalse(usesStrictRxRules('web'));
  assertFalse(usesStrictRxRules('android'));
});

Deno.test('iOS prompt is exactly the original (missing platform = iOS)', () => {
  const noPlatform = streamPrompt(base);
  assertEquals(streamPrompt({ ...base, platform: 'ios' }), noPlatform);
  assertEquals(streamPrompt({ ...base, platform: 'unknown' }), noPlatform);
  // The App-Review-safe wording is still there.
  assert(noPlatform.includes('it requires a doctor\'s prescription'));
  for (const l of RX_DOSE_LINES) assert(noPlatform.includes(l), `iOS keeps ${l}`);
  assertFalse(noPlatform.includes(RX_FACTUAL_SECTION));
  assertEquals(legacyPrompt({ ...base, platform: 'ios' }), legacyPrompt(base));
});

Deno.test('web/android prompt: factual discussion, no prescribing, no doses, no sourcing', () => {
  for (const platform of ['web', 'android'] as const) {
    const p = streamPrompt({ ...base, platform });
    assert(p.includes(RX_FACTUAL_SECTION));
    assert(/MUST NOT prescribe or recommend any prescription compound/.test(p));
    assert(/MUST NOT give doses, dose ranges, titration schedules, cycles, reconstitution instructions, or protocols/.test(p));
    assert(/MUST NOT say where or how to obtain them/.test(p));
    assert(/licensed clinician/.test(p));
    // The numbers are gone, not just discouraged.
    for (const l of RX_DOSE_LINES) assertFalse(p.includes(l), `${platform} drops ${l}`);
    assertFalse(/Semaglutide \(peptide: semaglutide\)/.test(p), 'no semaglutide protocol template');
    // Non-prescription peptides keep their reference.
    assert(p.includes('L-Carnitine — 300-1000 mg'));
    assert(/BPC-157/.test(p));
    const legacy = legacyPrompt({ ...base, platform });
    assert(legacy.includes(RX_FACTUAL_SECTION));
    assertFalse(/peptide: tirzepatide\)/.test(legacy));
  }
});

Deno.test('paywall notices are recognised; Aimee answers are not', () => {
  for (const t of [
    'AI chat requires PepTalk+ or Pro subscription',
    'AI chat requires PepTalk+ or Pro subscription.',
    "You've used your 3 free Aimee messages this month. Upgrade to PepTalk+ or Pro to keep going.",
    'Monthly message limit reached (750). It resets at the start of next month.',
    'I had trouble responding. Please try again.',
  ]) assert(isSystemNoticeText(t), t);
  for (const t of [
    "I'll pull your 14-day trends now.",
    'Tirzepatide is a dual GIP/GLP-1 receptor agonist.',
    'Plus and Pro both include Aimee — AI chat requires a subscription on some features.',
  ]) assertFalse(isSystemNoticeText(t), t);
});

Deno.test('usage: output counts every non-prompt token, reasoning included', () => {
  // Provider reports a total that includes reasoning not in completion_tokens.
  assertEquals(usageFromWire({ prompt_tokens: 10000, completion_tokens: 300, total_tokens: 12300 }), {
    input_tokens: 10000,
    output_tokens: 2300,
  });
  // Provider folds reasoning into completion_tokens.
  assertEquals(usageFromWire({ prompt_tokens: 10000, completion_tokens: 2300, total_tokens: 12300 }), {
    input_tokens: 10000,
    output_tokens: 2300,
  });
  // No total: add reasoning (over-charging the allowance is the safe error).
  assertEquals(
    usageFromWire({ prompt_tokens: 100, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 200 } }),
    { input_tokens: 100, output_tokens: 250 },
  );
  assertEquals(usageFromWire(undefined), { input_tokens: 0, output_tokens: 0 });
});
