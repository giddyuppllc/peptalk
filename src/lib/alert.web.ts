/**
 * alert.web — the web half of the cross-platform Alert.
 *
 * Metro resolves this file (not alert.ts) for the web bundle. It presents the
 * alert through browser dialogs and, critically, RUNS THE BUTTON CALLBACKS —
 * which react-native-web's empty `Alert.alert() {}` never did.
 *
 * The decision logic lives in alertDispatch.ts so it is testable without a DOM.
 */
import { dispatchAlert, type AlertButtonLike } from './alertDispatch';

/**
 * Matches the shape of React Native's Alert closely enough for every call site
 * in this app. `options` (the 4th RN argument) has no browser equivalent and is
 * accepted-and-ignored so callers don't have to branch.
 */
export const Alert = {
  alert(
    title?: string,
    message?: string,
    buttons?: AlertButtonLike[],
    _options?: unknown,
  ): void {
    dispatchAlert(title, message, buttons, {
      notify: (text) => {
        // Guard for SSR / prerender, where `window` is absent. Dropping the
        // dialog is acceptable there; throwing would blank the page.
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(text);
        }
      },
      confirm: (text) => {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
          return window.confirm(text);
        }
        // No dialog available: treat as accepted so the primary action still
        // runs. A dead button is the bug we are fixing; failing closed here
        // would reintroduce it.
        return true;
      },
    });
  },
};
