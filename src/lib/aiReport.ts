/**
 * Reporting one of Aimee's replies.
 *
 * Google Play's generative-AI policy requires an in-app way to flag offensive
 * or unsafe AI output. There was none: neither app/(tabs)/peptalk.tsx nor
 * src/components/ChatBubble.tsx had any report or flag affordance, and the
 * community report path could not name an AI message even if one had existed.
 *
 * WHAT A REPORT CARRIES, AND WHY IT IS AN ALLOWLIST
 * A `ChatMessage` is not just text. It can also hold `journalEntry` (a written
 * journal entry with mood and peptide ids), `toolResults` and `pendingActions`
 * (proposed dose / meal / workout logs, with values), `dataAction`, and
 * `relatedPeptideIds`. Spreading a message into a request body would put doses,
 * weights and compound names into a moderation queue — health data the user
 * never agreed to send for that purpose, and in some cases refused to send at
 * all.
 *
 * So this reads exactly two fields, named below, and builds the body through
 * buildReportBody's allowlist. Adding a field is a deliberate edit here, in one
 * place, and the tests pin it.
 *
 * CONSENT
 * `canSendToCloud()` governs whether the user's HEALTH PROFILE may be attached
 * to a cloud call. A report attaches no profile context under any consent
 * state, so this module does not read the flag and its output cannot vary with
 * it — which is the point. Reporting must keep working when a user has turned
 * cloud AI off (Play requires the affordance, not a consent-gated version of
 * it), and it must not become the one path that leaks profile context when
 * they have turned it on. The message text itself is the user's own thread and
 * is the thing under review; without it there is nothing to moderate.
 *
 * Pure, RN-free, unit-tested.
 */

import type { CommunityReportReason } from '../types/community';
import { buildReportBody, type BuildResult } from './reportTargets';

/**
 * The only fields of a ChatMessage a report may read. Kept as data so the test
 * can assert the builder's output against it rather than restating the rule.
 */
export const AI_REPORT_MESSAGE_FIELDS = ['content', 'timestamp'] as const;

/** Structurally the part of ChatMessage this module is allowed to see. */
export interface AiReportMessage {
  role?: string;
  content?: string;
  timestamp?: string;
}

/**
 * Only Aimee's own replies are reportable. Reporting your own message back to
 * the moderation queue is meaningless, and the user can already delete or
 * clear their chat.
 */
export function isReportableAiMessage(message: AiReportMessage | null | undefined): boolean {
  if (!message) return false;
  if (message.role !== 'bot') return false;
  return typeof message.content === 'string' && message.content.trim().length > 0;
}

/**
 * Build the report body for an Aimee reply.
 *
 * Reads `content` and `timestamp` and nothing else — see AI_REPORT_MESSAGE_FIELDS.
 */
export function buildAiMessageReport(
  message: AiReportMessage | null | undefined,
  reason: CommunityReportReason,
): BuildResult {
  if (!isReportableAiMessage(message)) {
    return { ok: false, error: 'Nothing to report — that message is empty.' };
  }
  return buildReportBody(
    {
      kind: 'ai_message',
      text: String(message!.content),
      at: typeof message!.timestamp === 'string' ? message!.timestamp : '',
    },
    reason,
  );
}
