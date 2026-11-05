/**
 * Cancel a user's Square web subscriptions — shared by square-cancel (the
 * user's own "cancel" button) and delete-user (account deletion).
 *
 * delete-user used to delete the subscription rows and the account without
 * telling Square, so a deleted user went on being billed with no account to
 * cancel from. It now cancels here first and refuses to delete if Square does
 * not confirm.
 */

export interface WebSubRow {
  product_id: string;
  original_transaction_id: string;
  expires_at?: string | null;
}

export interface CancelResult {
  productId: string;
  subscriptionId: string;
  ok: boolean;
  canceledDate: string | null;
  error?: string;
}

export function squareBase(env: string | undefined): string {
  return env === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}

/** Rows that can still bill: active web subscriptions not already past their period. */
export function billableWebSubs<T extends WebSubRow>(rows: T[], now = new Date()): T[] {
  return rows.filter((r) => {
    if (!r.original_transaction_id) return false;
    if (!r.expires_at) return true;
    const t = Date.parse(r.expires_at);
    return !Number.isFinite(t) || t > now.getTime();
  });
}

export async function cancelSquareSubscriptions(
  rows: WebSubRow[],
  opts: { token: string; base: string; fetchImpl?: typeof fetch; tag?: string },
): Promise<CancelResult[]> {
  const f = opts.fetchImpl ?? fetch;
  const results: CancelResult[] = [];
  for (const row of rows) {
    try {
      const res = await f(
        `${opts.base}/v2/subscriptions/${encodeURIComponent(row.original_transaction_id)}/cancel`,
        {
          method: 'POST',
          headers: {
            'Square-Version': '2024-07-17',
            Authorization: `Bearer ${opts.token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) console.error(`[${opts.tag ?? 'square'}] cancel failed`, row.original_transaction_id, JSON.stringify(data));
      results.push({
        productId: row.product_id,
        subscriptionId: row.original_transaction_id,
        ok: res.ok,
        canceledDate: data?.subscription?.canceled_date ?? null,
        ...(res.ok ? {} : { error: data?.errors?.[0]?.detail ?? `HTTP ${res.status}` }),
      });
    } catch (e) {
      results.push({
        productId: row.product_id,
        subscriptionId: row.original_transaction_id,
        ok: false,
        canceledDate: null,
        error: (e as Error).message,
      });
    }
  }
  return results;
}
