/**
 * Pure helpers for clinical-review. No Deno or network imports, so jest can
 * load this file directly (src/lib/__tests__/clinicalReviewEditClear.test.ts).
 */

/**
 * True when an 'edit' payload carries no correction at all.
 *
 * This is how the workbench says "cleared". Its pushEdit builds the payload
 * from the non-empty fields only (`if (v) payload[f] = v`), and its store
 * deletes a key set to null or '', so clearing every field on a card posts
 * `{ payload: {} }`. Null and blank strings are treated the same way in case an
 * older copy of the page sends them. Any other value (a number, an object, a
 * non-blank string) is content and keeps the row.
 */
export function isClearedEditPayload(payload: Record<string, unknown>): boolean {
  return Object.values(payload).every(
    (v) => v == null || (typeof v === 'string' && v.trim() === ''),
  );
}
