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
import { botDosingMode } from '../../lib/rxCompounds';
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

describe('dosing follows the main chat\'s policy (supabase/functions/_shared/rxPolicy.ts)', () => {
  const q = 'How much bac water to add to 15mg vial of Tirzepatide'; // production 08-11

  it('iOS: approved drug — no label dosing (label info off by default on iOS)', () => {
    const r = generateLocalBotResponse(q, ctx({ platform: 'ios' }));
    expect(r.content).not.toMatch(/Dosing range|Typical Range|Reconstitution:|Titration|prescribing information:/i);
    expect(r.content).toMatch(/licensed clinician/);
  });

  it('web / android: approved drug — the cited label summary, with the disclaimer', () => {
    for (const platform of ['web', 'android']) {
      const r = generateLocalBotResponse('what dose of semaglutide', ctx({ platform }));
      expect(r.content).toMatch(/Per the US prescribing information/);
      expect(r.content).toMatch(/0\.25 mg weekly for 4 weeks/);
      expect(r.content).toMatch(/I'm not a doctor — follow your prescriber's instructions\./);
      expect(r.content).not.toMatch(/Dosing range|Typical Range|Reconstitution:/);
    }
  });

  it('every platform: research compounds get facts, never doses or protocols', () => {
    for (const platform of ['ios', 'android', 'web', undefined]) {
      for (const msg of ['BPC-157 dosing', 'how much TB-500 should I take', 'retatrutide protocol']) {
        const r = generateLocalBotResponse(msg, ctx({ platform }));
        expect(r.content).toMatch(/doesn't provide dosing or protocols for research compounds/);
        expect(r.content).not.toMatch(/Dosing range|Typical Range|Reconstitution:|Titration|Cycle length/i);
        expect(r.content).not.toMatch(DOSE_FIGURE);
      }
    }
  });

  it('never personalised: no "for you" dose language in any dosing reply', () => {
    for (const platform of ['ios', 'web']) {
      const r = generateLocalBotResponse('what dose of tirzepatide for me, I weigh 200 lbs', ctx({ platform }));
      expect(r.content).not.toMatch(/your dose is|you should take|for your weight/i);
    }
  });

  it('uses the server policy module itself, not a copy', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'rxCompounds.ts'), 'utf8');
    expect(src).toMatch(/from '\.\.\/\.\.\/supabase\/functions\/_shared\/rxPolicy'/);
    expect(botDosingMode('semaglutide', 'ios').labelAllowed).toBe(false);
    expect(botDosingMode('semaglutide', 'web').labelAllowed).toBe(true);
    expect(botDosingMode('bpc-157', 'web').kind).toBe('research');
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
