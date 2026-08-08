/**
 * alertDispatch — PURE decision logic for rendering a React Native
 * `Alert.alert()` through browser dialogs.
 *
 * WHY THIS EXISTS
 * `react-native-web`'s Alert is literally:
 *
 *     class Alert { static alert() {} }
 *
 * An empty function. On the PWA every one of the app's ~256 `Alert.alert()`
 * calls did nothing: no message, and — far worse — **no button callback ever
 * fired**. Any flow that advanced from an Alert button was a dead end. The
 * clearest casualty was signup: `app/onboarding.tsx` shows
 * "Check your email" with `[{ text: 'OK', onPress: () => router.replace('/auth') }]`,
 * so a new web user saw no message AND was never sent to the login screen —
 * they just sat on the onboarding form with no feedback at all.
 *
 * This module holds only the mapping decision so it can be unit-tested without
 * a DOM. `alert.web.ts` wires it to window.alert / window.confirm; native keeps
 * React Native's real Alert untouched.
 *
 * MAPPING RULES — chosen so no action is ever silently dropped:
 *   - 0 or 1 action, no cancel  → notify(), then run that action.
 *   - 1 action + cancel(s)      → confirm(); accepted runs the action,
 *                                 dismissed runs the cancel button.
 *   - 2+ actions                → ask about each action in order (a browser
 *                                 dialog cannot present a 3-way choice). The
 *                                 first accepted one wins; if the user declines
 *                                 them all, the cancel button runs.
 *
 * The multi-action case is clunky by nature, but it is REACHABLE, which is the
 * whole point — silently picking one action for the user would just replace a
 * dead button with a wrong one.
 */

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export interface AlertButtonLike {
  text?: string;
  onPress?: (() => void) | undefined;
  style?: AlertButtonStyle;
}

export interface AlertIO {
  /** Show a message with a single acknowledgement (window.alert). */
  notify: (text: string) => void;
  /** Ask a yes/no question (window.confirm). `true` = accepted. */
  confirm: (text: string) => boolean;
}

/**
 * Compose the title and message the way a native alert stacks them, skipping
 * empties so we never render a stray newline or the string "undefined".
 */
export function composeBody(title?: string, message?: string): string {
  return [title, message].filter((s) => typeof s === 'string' && s.length > 0).join('\n\n');
}

/** Label shown on a confirm() prompt for a specific action button. */
function promptFor(body: string, button: AlertButtonLike, multi: boolean): string {
  // With a single action the body alone is the question. With several, name the
  // action too, otherwise consecutive identical prompts are indistinguishable.
  if (!multi) return body;
  const label = button.text && button.text.length > 0 ? button.text : 'OK';
  return body ? `${body}\n\n${label}?` : `${label}?`;
}

export function dispatchAlert(
  title: string | undefined,
  message: string | undefined,
  buttons: AlertButtonLike[] | undefined,
  io: AlertIO,
): void {
  const body = composeBody(title, message);
  const all = Array.isArray(buttons) ? buttons : [];
  const cancels = all.filter((b) => b?.style === 'cancel');
  const actions = all.filter((b) => b?.style !== 'cancel');

  // Nothing actionable — a plain informational alert.
  if (actions.length === 0 && cancels.length === 0) {
    io.notify(body);
    return;
  }

  // Only a cancel button was supplied: it is the acknowledgement.
  if (actions.length === 0) {
    io.notify(body);
    cancels[0]?.onPress?.();
    return;
  }

  // Single action and no way to decline — acknowledge, then run it. Using
  // confirm() here would invent a "Cancel" the caller never offered, and a
  // dismissed dialog would swallow the action.
  if (actions.length === 1 && cancels.length === 0) {
    io.notify(body);
    actions[0]?.onPress?.();
    return;
  }

  // One action plus a cancel — the natural confirm().
  if (actions.length === 1) {
    if (io.confirm(promptFor(body, actions[0], false))) actions[0]?.onPress?.();
    else cancels[0]?.onPress?.();
    return;
  }

  // Several actions: offer each in turn until one is accepted.
  for (const action of actions) {
    if (io.confirm(promptFor(body, action, true))) {
      action.onPress?.();
      return;
    }
  }
  cancels[0]?.onPress?.();
}
