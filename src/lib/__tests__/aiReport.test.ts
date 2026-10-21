/**
 * Reporting an Aimee reply — what goes, and what must never go with it.
 *
 * A ChatMessage carries far more than text: journal entries with mood and
 * peptide ids, tool results and pending actions holding doses, weights and
 * meals. The whole point of buildAiMessageReport is that a moderation report
 * is not a side channel for any of it.
 */

import { buildAiMessageReport, isReportableAiMessage, AI_REPORT_MESSAGE_FIELDS } from '../aiReport';
import { REPORT_BODY_KEYS, targetKindOf } from '../reportTargets';

/** A bot reply loaded with everything a real one can carry. */
const loadedMessage = {
  id: 'bot-1',
  role: 'bot',
  content: 'Try 5mg twice a week.',
  timestamp: '2026-09-16T10:00:00.000Z',
  relatedPeptideIds: ['tirzepatide', 'bpc-157'],
  quickReplies: ['Tell me more'],
  navAction: '/doses/calculator',
  dataAction: { type: 'dose', data: { peptideId: 'tirzepatide', mg: 5 } },
  journalEntry: {
    category: 'dose',
    title: 'Dose logged',
    content: 'Weight 214lb, felt nauseous',
    tags: ['tirzepatide'],
    mood: 3,
  },
  toolResults: [{ tool: 'summarize_pattern', data: { avgWeightLbs: 214, restingHr: 58 } }],
  pendingActions: [{ id: 'pa-1', tool: 'log_dose', preview: { mg: 5, peptideId: 'tirzepatide' } }],
} as never;

describe('isReportableAiMessage', () => {
  it('accepts a bot message with text', () => {
    expect(isReportableAiMessage({ role: 'bot', content: 'hi', timestamp: '' })).toBe(true);
  });

  it("rejects the user's own message — there is nothing to moderate", () => {
    expect(isReportableAiMessage({ role: 'user', content: 'hi', timestamp: '' })).toBe(false);
  });

  it('rejects an empty or whitespace-only reply', () => {
    expect(isReportableAiMessage({ role: 'bot', content: '', timestamp: '' })).toBe(false);
    expect(isReportableAiMessage({ role: 'bot', content: '   ', timestamp: '' })).toBe(false);
  });

  it('rejects nothing at all', () => {
    expect(isReportableAiMessage(null)).toBe(false);
    expect(isReportableAiMessage(undefined)).toBe(false);
  });
});

describe('buildAiMessageReport', () => {
  it('records the report as an ai_message with the text and the timestamp', () => {
    const r = buildAiMessageReport(loadedMessage, 'unsafe_medical_advice');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(targetKindOf(r.body)).toBe('ai_message');
    expect(r.body.aiMessageText).toBe('Try 5mg twice a week.');
    expect(r.body.aiMessageAt).toBe('2026-09-16T10:00:00.000Z');
    expect(r.body.reason).toBe('unsafe_medical_advice');
  });

  it('carries no health data beyond the message itself', () => {
    const r = buildAiMessageReport(loadedMessage, 'unsafe_medical_advice');
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Key-level: only the wire allowlist.
    for (const k of Object.keys(r.body)) {
      expect(REPORT_BODY_KEYS).toContain(k as never);
    }

    // Value-level: nothing from journalEntry / toolResults / pendingActions /
    // dataAction / relatedPeptideIds reaches the serialised body. Checking the
    // JSON, not the keys, is what catches a value nested somewhere new.
    const wire = JSON.stringify(r.body);
    for (const leak of [
      'journalEntry',
      'Weight 214lb',
      '214',
      'restingHr',
      '58',
      'bpc-157',
      'log_dose',
      'summarize_pattern',
      'pendingActions',
      'navAction',
      'quickReplies',
    ]) {
      expect(wire).not.toContain(leak);
    }
    // 'tirzepatide' appears only in the stripped fields, never in the reply text.
    expect(wire).not.toContain('tirzepatide');
  });

  it('reads only the fields AI_REPORT_MESSAGE_FIELDS names', () => {
    // Drive it from the constant so the doc and the behaviour cannot disagree:
    // a message reduced to just those fields must build the same body.
    const reduced: Record<string, unknown> = { role: 'bot' };
    for (const f of AI_REPORT_MESSAGE_FIELDS) {
      reduced[f] = (loadedMessage as Record<string, unknown>)[f];
    }
    const full = buildAiMessageReport(loadedMessage, 'other');
    const thin = buildAiMessageReport(reduced as never, 'other');
    expect(full.ok && thin.ok).toBe(true);
    if (!full.ok || !thin.ok) return;
    expect(thin.body).toEqual(full.body);
  });

  it('refuses a user message and an empty reply', () => {
    expect(buildAiMessageReport({ role: 'user', content: 'hi', timestamp: '' }, 'spam').ok).toBe(false);
    expect(buildAiMessageReport({ role: 'bot', content: '  ', timestamp: '' }, 'spam').ok).toBe(false);
  });

  it('still builds a report when the reply has no usable timestamp', () => {
    const r = buildAiMessageReport({ role: 'bot', content: 'hi', timestamp: 'nope' }, 'other');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.aiMessageText).toBe('hi');
    expect(r.body.aiMessageAt).toBeUndefined();
  });
});

describe('consent', () => {
  /**
   * canSendToCloud() gates whether the HEALTH PROFILE may be attached to a
   * cloud call. A report attaches no profile context under either state, so
   * its output must not vary with the flag: reporting keeps working for a user
   * who turned cloud AI off, and leaks nothing for one who did not. If a
   * future change makes the report consent-dependent, this fails.
   */
  it('produces the same body whether or not cloud AI consent is given', () => {
    jest.isolateModules(() => {
      const run = (consent: boolean) => {
        jest.resetModules();
        jest.doMock('../../services/privacyGuard', () => ({
          canSendToCloud: () => consent,
          sanitizeForLLM: () => ({ hasConsent: consent, systemContext: '' }),
        }));

        const mod = require('../aiReport');
        const res = mod.buildAiMessageReport(loadedMessage, 'other');
        return res.ok ? JSON.stringify(res.body) : `refused:${res.error}`;
      };
      expect(run(true)).toBe(run(false));
      expect(run(false)).toContain('aiMessageText');
    });
  });
});
