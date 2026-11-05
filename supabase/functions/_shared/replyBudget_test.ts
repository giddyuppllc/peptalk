import { assertEquals } from 'jsr:@std/assert@1';
import { replyMaxTokens, wasCutOff, REASONING_HEADROOM_TOKENS } from './replyBudget.ts';

Deno.test('budget adds reasoning headroom to the visible target', () => {
  assertEquals(replyMaxTokens(350), 350 + REASONING_HEADROOM_TOKENS);
  assertEquals(replyMaxTokens(1200), 1200 + REASONING_HEADROOM_TOKENS);
});

Deno.test('a reply stopped at the cap is reported as cut off', () => {
  assertEquals(wasCutOff({ choices: [{ finish_reason: 'length' }] }), true);
  assertEquals(wasCutOff({ choices: [{ finish_reason: 'stop' }] }), false);
  assertEquals(wasCutOff({}), false);
});
