/**
 * One confirm-then-delete prompt, used by every "remove this record" affordance.
 *
 * WHY IT IS SHARED
 * PepTalk had a dozen stores exposing deletePeriod / deleteScan /
 * removeAppetite / removeReport and so on, and not one of them had a way to
 * reach it from the app. People could log a period on the wrong day, record a
 * body scan twice, or mistype an entry, and had no way to take it back. Those
 * mistakes are not cosmetic: a stray scan bends the body-composition trend, and
 * a stray period shifts every cycle prediction that follows it.
 *
 * Wiring twelve screens one at a time invites twelve slightly different
 * prompts, and a delete confirm that reads differently each time trains people
 * to stop reading it. So the wording, the destructive styling and the
 * cancel-by-default behaviour live here once.
 *
 * DESTRUCTIVE BY NAME. The prompt always says what is being deleted and that it
 * cannot be undone, because a generic "Are you sure?" gives someone nothing to
 * check their intent against.
 */

import { Alert } from './alert';

export interface ConfirmDeleteOptions {
  /**
   * What is being deleted, in the user's words and specific to the record:
   * "the period starting 3 March", not "this item".
   */
  subject: string;
  /** Extra consequence worth stating, e.g. that trends will be recalculated. */
  consequence?: string;
  /** Label for the destructive button. Defaults to "Delete". */
  confirmLabel?: string;
  onConfirm: () => void;
}

/**
 * Ask, then delete.
 *
 * Cancel is the default and is listed first, so an accidental tap on the
 * platform's default action does not destroy anything.
 */
export function confirmDelete({
  subject,
  consequence,
  confirmLabel = 'Delete',
  onConfirm,
}: ConfirmDeleteOptions): void {
  const body = consequence
    ? `${capitalize(subject)} will be deleted. ${consequence} This cannot be undone.`
    : `${capitalize(subject)} will be deleted. This cannot be undone.`;

  Alert.alert('Delete this entry?', body, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * "3 March 2026" — a date a person can match against what they meant to log.
 *
 * Takes a plain YYYY-MM-DD. Parsed as LOCAL noon rather than as an ISO
 * midnight: `new Date('2026-03-03')` is UTC midnight, which renders as the 2nd
 * for anyone west of Greenwich. A confirm prompt naming the wrong day is worse
 * than no prompt, because it tells the user to cancel a correct deletion.
 */
export function describeDate(ymd: string): string {
  if (!ymd) return 'this entry';
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  if (Number.isNaN(dt.getTime())) return ymd;
  return dt.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
