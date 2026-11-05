/**
 * The on-device fallback bot, against what production actually sent it.
 *
 * Cases are real messages from chat_messages (2026-08-07 .. 11-05) where the
 * fallback answered badly: Aimee's own chip prompts keyword-matched into
 * unrelated replies, an orb's observation line ("Last logged: retatrutide ·
 * 2.5 mg.") answered with a dosing reference, "Delete my protocols" read as a
 * dosing question, and dosing for prescription compounds on platforms where
 * PepTalk does not give it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateLocalBotResponse } from '../peptalkBot';
import { INTENT_PROMPTS } from '../../lib/aimeeIntentPrompts';
import { RX_COMPOUND_IDS } from '../../lib/rxCompounds';
import type { BotContext } from '../../types';

const today = new Date().toISOString().slice(0, 10);

function ctx(extra: Partial<BotContext> & Record<string, unknown> = {}): BotContext {
  return {
    userProfile: null,
    recentCheckIns: [
      { id: 'c1', date: today, createdAt: today, mood: 4, energy: 3, stress: 2, sleepQuality: 2, recovery: 3, appetite: 3 } as never,
    ],
    currentStack: [],
    savedStackNames: [],
    conversationHistory: [],
    recentDoses: [{ id: 'd1', peptideId: 'bpc-157', date: today, time: '08:00', amount: 250, unit: 'mcg', route: 'subcutaneous', createdAt: today }],
    activeProtocols: [],
    recentEffects: [],
    healthAlerts: [],
    healthProfile: null,
    ...extra,
  } as BotContext;
}

const DOSE_FIGURE = /\b\d+(\.\d+)?\s?(-|–)?\s?\d*\s?(mg|mcg|iu|units?)\b/i;

describe('chip prompts are answered from the user’s own data', () => {
  const prompts = Object.entries(INTENT_PROMPTS).filter(([, t]) => t);

  it('covers every chip prompt', () => {
    expect(prompts.length).toBeGreaterThan(15);
  });

  it.each(prompts)('%s', (_intent, prompt) => {
    const r = generateLocalBotResponse(prompt, ctx());
    expect(r.source).toBe('local');
    expect(r.content.trim().length).toBeGreaterThan(20);
    // No dosing text in any chip answer (dose LOG counts are fine, amounts are not).
    expect(r.content).not.toMatch(/Dosing range|Typical Range|research dosing reference/i);
    expect(r.content).not.toMatch(DOSE_FIGURE);
  });

  it('"What should I focus on tomorrow?" is about tomorrow, not a stack (production 08-21)', () => {
    const r = generateLocalBotResponse('What should I focus on tomorrow?', ctx());
    expect(r.content).not.toMatch(/Stack Suggestions|Nootropic/);
    expect(r.actions?.[0]?.route).toBe('/(tabs)/calendar');
    expect(r.content).toMatch(/sleep/i); // sleepQuality 2/5 this week
  });

  it('the trend prompt summarises logged check-ins and doses', () => {
    const r = generateLocalBotResponse('Show me my trend for the last 14 days.', ctx());
    expect(r.content).toMatch(/1 check-in/);
    expect(r.content).toMatch(/1 dose log/);
  });
});

describe('orb observations are screen copy, not questions', () => {
  it.each([
    'Last logged: retatrutide · 2.5 mg.',
    'Retatrutide at 3 mL vial — 1 mg per shot.',
    '79 peptides. Search by name, abbreviation, or goal.',
    'Pick a peptide and I will pre-fill the math.',
  ])('%s', (obs) => {
    const r = generateLocalBotResponse(obs, ctx({ fromObservation: true }));
    expect(r.content).not.toMatch(/Dosing range|research dosing reference|Typical Range/i);
    expect(r.quickReplies?.length).toBeGreaterThan(0);
  });
});

describe('requests to change the user’s data', () => {
  it('"Delete my protocols" points to My Stacks, not a dose warning (production 09-08)', () => {
    const r = generateLocalBotResponse('Delete my protocols', ctx());
    expect(r.content).not.toMatch(/exceeds|dose/i);
    expect(r.actions?.[0]?.route).toBe('/(tabs)/my-stacks');
  });

  it('editing a dose goes to the dose tracker', () => {
    expect(generateLocalBotResponse('how do I edit my last dose log', ctx()).actions?.[0]?.route).toBe('/doses/tracker');
  });
});

describe('goal questions', () => {
  it('"Is there a peptide that helps with low ferritin levels?" is not the generic menu (production 10-29)', () => {
    const r = generateLocalBotResponse('Is there a peptide that helps with low ferritin levels?', ctx());
    expect(r.content).not.toMatch(/^I'm Aimee, your health companion/);
  });
});

describe('prescription compounds', () => {
  const q = 'How much bac water to add to 15mg vial of Tirzepatide'; // production 08-11

  it('web: no dosing, ranges or reconstitution; points to a clinician', () => {
    const r = generateLocalBotResponse(q, ctx({ platform: 'web' }));
    expect(r.content).not.toMatch(/Dosing range|Typical Range|Reconstitution:|Titration/i);
    expect(r.content).toMatch(/licensed clinician/);
    expect(r.content).toMatch(/Tirzepatide/);
  });

  it('android: same as web', () => {
    const r = generateLocalBotResponse('what dose of semaglutide', ctx({ platform: 'android' }));
    expect(r.content).not.toMatch(/Dosing range|Typical Range/i);
  });

  it('iOS keeps the existing reply, exactly as the main chat does', () => {
    const r = generateLocalBotResponse(q, ctx({ platform: 'ios' }));
    expect(r.content).toMatch(/Dosing range|Typical Range/);
  });

  it('a non-prescription compound on web keeps its research reference', () => {
    const r = generateLocalBotResponse('BPC-157 dosing', ctx({ platform: 'web' }));
    expect(r.content).toMatch(/Dosing range|Typical Range/);
  });

  it('the list matches the main chat (supabase/functions/_shared/rxPolicy.ts)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'supabase', 'functions', '_shared', 'rxPolicy.ts'),
      'utf8',
    );
    const block = src.slice(src.indexOf('RX_PROTOCOL_IDS'), src.indexOf(']);', src.indexOf('RX_PROTOCOL_IDS')));
    const ids = [...block.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).sort();
    expect(ids.length).toBeGreaterThan(0);
    expect([...RX_COMPOUND_IDS].sort()).toEqual(ids);
  });
});

describe('fallback replies are not fed to the model as its own words', () => {
  const llm = fs.readFileSync(path.join(__dirname, '..', 'llmService.ts'), 'utf8');

  it('every history builder drops source: local', () => {
    const builders = llm.match(/conversationHistory[^\n]*slice\(-10\)/g) ?? [];
    expect(builders.length).toBe(2);
    for (const b of builders) expect(b).toContain("m.source !== 'local'");
  });

  it('every fallback reply is marked local', () => {
    for (const m of ['hello', 'tell me about BPC-157', 'I took my BPC this morning', 'zzz']) {
      expect(generateLocalBotResponse(m, ctx()).source).toBe('local');
    }
  });
});

describe('the fallback actually runs when the stream fails', () => {
  const llm = fs.readFileSync(path.join(__dirname, '..', 'llmService.ts'), 'utf8');
  const screen = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app', '(tabs)', 'peptalk.tsx'), 'utf8');

  it('the legacy endpoint’s tier 403 falls through to the on-device bot', () => {
    expect(llm).toMatch(/res\.status === 403\) \{[\s\S]{0,700}?return null;/);
  });

  it('a stream error with no text hands over to the fallbacks (except sign-in)', () => {
    expect(screen).toMatch(/!accumulated && ev\.message !== SIGN_IN_AGAIN[\s\S]{0,200}?return false;/);
  });
});
