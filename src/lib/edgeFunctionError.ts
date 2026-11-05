/**
 * What an edge function actually said when supabase-js rejected the call.
 *
 * supabase-js v2 turns every non-2xx into a FunctionsHttpError whose `message`
 * is always "Edge Function returned a non-2xx status code". The status and the
 * function's own JSON body ({ error, upgrade, ... }) live on `error.context`,
 * which is a fetch Response. `error.status` does not exist and `context.body`
 * is a ReadableStream, not text.
 *
 * Reading the wrong field showed users the wrong thing: lab scan said "Vision
 * OCR is rolling out" for a daily limit, the meal scanner said "check your
 * connection", and pantry screens never showed their upgrade prompt because
 * they searched that generic message for "Pro tier". Several screens had each
 * worked this out on their own (meal-plan, pantry/scan, referrals, community);
 * this is the one place for it.
 */
export interface EdgeFunctionError {
  /** HTTP status, or null for a network failure / non-HTTP error. */
  status: number | null;
  /** The function's own `error` text, if it sent one. */
  message: string | null;
  /** The function flagged this as a tier/upgrade refusal. */
  upgrade: boolean;
  /** The parsed JSON body, when there was one. */
  body: Record<string, unknown> | null;
}

const GENERIC = /non-2xx status code/i;

export async function readEdgeFunctionError(error: unknown): Promise<EdgeFunctionError> {
  const err = (error ?? {}) as { context?: unknown; message?: unknown; status?: unknown };
  const ctx = err.context as
    | { status?: number; clone?: () => { text: () => Promise<string> }; text?: () => Promise<string>; body?: unknown }
    | undefined;

  const status =
    typeof ctx?.status === 'number' ? ctx.status : typeof err.status === 'number' ? (err.status as number) : null;

  let body: Record<string, unknown> | null = null;
  try {
    let text: string | null = null;
    if (ctx && typeof ctx.clone === 'function') text = await ctx.clone().text();
    else if (ctx && typeof ctx.text === 'function') text = await ctx.text();
    else if (typeof ctx?.body === 'string') text = ctx.body;
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
    }
  } catch {
    /* not JSON, or already read — fall through with what we have */
  }

  const fromBody = typeof body?.error === 'string' && body.error.trim() ? (body.error as string) : null;
  const fromErr =
    typeof err.message === 'string' && err.message && !GENERIC.test(err.message) ? (err.message as string) : null;

  return {
    status,
    message: fromBody ?? fromErr,
    upgrade: body?.upgrade === true || status === 403,
    body,
  };
}
