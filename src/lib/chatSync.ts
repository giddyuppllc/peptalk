import type { ChatMessage } from '../types';

/**
 * Whether a chat message should be written to the cloud `chat_messages` table.
 *
 * A streamed Aimee reply starts as an empty `bot` placeholder that the SSE
 * deltas fill in locally (updateMessage never syncs). Syncing the placeholder at
 * addMessage time wrote one empty `bot` row per reply — every AI answer in
 * production had an empty twin beside the real `assistant` row the server
 * saves (seen 2026-11-05). Placeholders are skipped; a bot message that already
 * has text (the on-device bot, canned replies) still syncs.
 */
export function shouldCloudSyncMessage(message: Pick<ChatMessage, 'role' | 'content'>): boolean {
  if (message.role === 'bot' && !(message.content ?? '').trim()) return false;
  return true;
}
