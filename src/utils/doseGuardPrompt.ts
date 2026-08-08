import { Alert } from '../lib/alert';
import type { DoseGuardWarning } from '../services/doseSafety';

/**
 * Show one confirmation per dose guard, in order, then run `onProceed`.
 *
 * This is the single prompt implementation for every screen that writes a dose.
 * It exists because the guards themselves were duplicated inline in Tracker and
 * absent from Calculator entirely — the two drifted, and Calculator ended up
 * writing doses (and whole cycles) with no checks at all.
 *
 * Behaviour is Tracker's, preserved exactly:
 *   • warnings are INFORMATIONAL, never hard blocks — a user may have a valid
 *     reason for an unusual dose, so every prompt has a proceed option;
 *   • cancelling any step aborts the whole write;
 *   • the proceed button is destructive-styled and defaults to "Log anyway".
 *
 * `confirmLabel` exists only so a non-logging caller can say what it is really
 * about to do (Calculator's cycle scheduler says "Continue"). Do not use it to
 * soften the wording of a logging action.
 */
export function confirmDoseGuards(
  warnings: DoseGuardWarning[],
  onProceed: () => void,
  confirmLabel: string = 'Log anyway',
): void {
  const step = (i: number): void => {
    if (i >= warnings.length) {
      onProceed();
      return;
    }
    const w = warnings[i];
    Alert.alert(w.title, w.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: () => step(i + 1) },
    ]);
  };
  step(0);
}
