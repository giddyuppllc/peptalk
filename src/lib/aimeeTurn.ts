/**
 * One Aimee turn: AI first, the on-device bot only when no AI answer is
 * possible (James, 2026-11-05: "fallback should never interfere with AI use").
 *
 * The bot answers ONLY when:
 *   - AI cannot be asked at all (offline, no AI consent, no backend), or
 *   - the stream AND the backup endpoint both failed after their timeouts,
 *     and the AI put nothing on screen this turn.
 * It never races a live stream, never answers inside the stream's timeout, and
 * never adds anything after a reply the AI already started — a partial reply
 * stays as the AI wrote it. Nothing here looks at the message text, so no
 * keyword, chip, orb or "dosing" prompt can be routed to the bot while the AI
 * is reachable.
 *
 * Used by every send path on the chat screen (typed message, chip/orb
 * prefill, quick reply) so they cannot drift apart again.
 */

export type TurnOutcome = 'stream' | 'legacy' | 'kept-partial' | 'local';

export interface TurnDeps<M> {
  /** Backend configured and the user has given AI consent. */
  aiAllowed: boolean;
  online: boolean;
  /** Resolves true when the stream answered (text, tool cards or a notice). */
  stream: () => Promise<boolean>;
  /** True once the AI has put anything on screen this turn. */
  aiProducedOutput: () => boolean;
  abortStream: () => void;
  /** The non-streaming backup endpoint; null when it could not answer. */
  legacy: () => Promise<M | null>;
  showAiReply: (m: M) => void;
  /** The on-device bot. */
  local: () => void;
  streamCapMs: number;
  legacyCapMs: number;
}

function capped<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function runAimeeTurn<M>(d: TurnDeps<M>): Promise<TurnOutcome> {
  if (!d.aiAllowed || !d.online) {
    d.local();
    return 'local';
  }

  try {
    if (await capped(d.stream(), d.streamCapMs)) return 'stream';
  } catch {
    d.abortStream();
  }
  // The AI started a reply: keep it as written, add nothing.
  if (d.aiProducedOutput()) return 'kept-partial';

  try {
    const m = await capped(d.legacy(), d.legacyCapMs);
    if (m) {
      if (d.aiProducedOutput()) return 'kept-partial';
      d.showAiReply(m);
      return 'legacy';
    }
  } catch {
    /* backup failed too */
  }
  if (d.aiProducedOutput()) return 'kept-partial';

  d.local();
  return 'local';
}
