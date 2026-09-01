// RECOVERED ORIGINAL SOURCE — extracted 2026-09-01 from the deployed bundle.
//
// This is NOT a reconstruction. Supabase's deployed ESZIP embeds source maps
// carrying `sourcesContent` — the original TypeScript, types and comments
// intact. The extraction was validated against a control: `_shared/effectiveTier.ts`,
// which the repo already had, came back BYTE-IDENTICAL.
//
// It went missing because it was deployed from a working copy and never
// committed. See supabase/functions/_recovered/README.md.

/**
 * Minimal Sentry reporter for edge functions.
 *
 * WHY THIS EXISTS
 * Fifty-eight edge functions and not one of them reported an error anywhere.
 * Every server-side failure — purchase validation, subscription webhooks,
 * Aimee, moderation, image upload — was invisible unless someone happened to
 * open the Supabase log viewer and knew what to search for. The client has had
 * Sentry since day one; the half of the system that handles money and health
 * data had nothing.
 *
 * This is the concrete cost: a card payment failed on the live PWA with
 * "failed to call the edge function" and there was no way to see which function
 * threw, or why, because nothing captured it.
 *
 * WHY NOT THE SENTRY SDK
 * The Deno SDK pulls a large dependency tree into every function's cold start,
 * for one feature: post a JSON envelope to an HTTPS endpoint. That is ~40 lines
 * of fetch. Cold-start latency on a payment path is worth more than the SDK's
 * extra features, and a dependency that can fail to import would take the
 * function down with it — a reporter must never be able to break the thing it
 * is reporting on.
 *
 * DESIGN RULES
 *   - Never throws. Every failure path returns silently. An error while
 *     reporting an error must not replace the original failure.
 *   - Never blocks the response. Callers fire and forget.
 *   - No-ops without SENTRY_DSN, so local and self-hosted runs stay quiet.
 *   - Sends no request bodies. Those carry card tokens, receipts, chat text and
 *     health data. Only the error, a tag set the caller chooses, and the
 *     function name.
 */

const DSN = Deno.env.get('SENTRY_DSN') ?? '';

interface ParsedDsn {
  envelopeUrl: string;
  publicKey: string;
}

/** Turn `https://<key>@<host>/<projectId>` into the envelope endpoint. */
function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, '');
    if (!u.username || !projectId) return null;
    return {
      envelopeUrl: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
      publicKey: u.username,
    };
  } catch {
    return null;
  }
}

const PARSED = DSN ? parseDsn(DSN) : null;

/** True when reporting is configured. Useful for a startup log line. */
export function sentryEnabled(): boolean {
  return PARSED !== null;
}

function errorParts(err: unknown): { type: string; value: string; stack?: string } {
  if (err instanceof Error) {
    return { type: err.name || 'Error', value: err.message || String(err), stack: err.stack };
  }
  // Non-Error throws are common in Deno (a string, a Response, a Postgrest
  // error object). Stringify defensively rather than losing the report.
  let value: string;
  try {
    value = typeof err === 'string' ? err : JSON.stringify(err);
  } catch {
    value = String(err);
  }
  return { type: 'NonError', value: value?.slice(0, 2000) ?? 'unknown' };
}

/**
 * Report an exception. Fire-and-forget: callers should NOT await this on a
 * request path, and must never let it change control flow.
 *
 * @param fn    the edge function's name, used as the Sentry transaction
 * @param err   whatever was thrown
 * @param tags  small, non-sensitive key/values (userId is fine, bodies are not)
 */
export function reportError(
  fn: string,
  err: unknown,
  tags: Record<string, string> = {},
): void {
  if (!PARSED) return;
  try {
    const { type, value, stack } = errorParts(err);
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const sentAt = new Date().toISOString();

    const header = JSON.stringify({
      event_id: eventId,
      sent_at: sentAt,
      dsn: DSN,
    });
    const itemHeader = JSON.stringify({ type: 'event' });
    const event = JSON.stringify({
      event_id: eventId,
      timestamp: sentAt,
      platform: 'javascript',
      level: 'error',
      logger: 'edge-function',
      server_name: fn,
      transaction: fn,
      environment: Deno.env.get('EXPO_PUBLIC_ENV') ?? 'production',
      tags: { function: fn, ...tags },
      exception: {
        values: [{
          type,
          value,
          stacktrace: stack ? { frames: [{ filename: fn, function: fn, context_line: stack.slice(0, 2000) }] } : undefined,
        }],
      },
    });

    const body = `${header}\n${itemHeader}\n${event}\n`;
    // No await: the response must not wait on Sentry, and a rejected promise
    // here must not surface as an unhandled rejection.
    fetch(PARSED.envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=peptalk-edge/1.0, sentry_key=${PARSED.publicKey}`,
      },
      body,
    }).catch(() => {});
  } catch {
    /* reporting must never throw */
  }
}

/**
 * Wrap an edge function handler so anything it throws is reported and turned
 * into a 500 instead of an opaque runtime failure.
 *
 * The response body deliberately carries the Sentry event id and nothing else —
 * enough to find the error, never enough to leak what caused it.
 */
export function withErrorReporting(
  fn: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      reportError(fn, err, { path: new URL(req.url).pathname });
      console.error(`[${fn}] unhandled:`, err);
      return new Response(
        JSON.stringify({ error: 'Internal error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  };
}
