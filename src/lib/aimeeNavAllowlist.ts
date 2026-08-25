/**
 * aimeeNavAllowlist — PURE allowlist for navigation paths Aimee may send.
 *
 * Extracted from app/(tabs)/peptalk.tsx so BOTH the app and
 * `npm run verify:aimee` evaluate the same function. It previously lived
 * inside the screen component, which meant the verifier would have had to
 * re-declare the regexes — and a copy of a security allowlist is a copy that
 * drifts. When it drifts, the failure is silent in the worst direction: either
 * the app quietly refuses a legitimate screen Aimee offered, or the check
 * quietly blesses a path the app rejects.
 *
 * The server already maps known screen names through SCREEN_TO_PATH; this is
 * the second, independent check that refuses anything unexpected, so a
 * prompt-injection escape cannot land a user on /admin/* or /dev-*.
 *
 * Keep it deny-by-default: an unrecognised path returns false.
 */

/** Paths Aimee is permitted to navigate the user to. Deny by default. */
export function isAllowedNavigationPath(path: string): boolean {
  if (typeof path !== 'string' || path.length > 200) return false;
  if (path.startsWith('//') || path.includes('..')) return false;
  // No /admin/, no /dev-, no internal-only routes.
  if (/^\/?(admin|dev-)/.test(path)) return false;
  return ALLOWED.some((rx) => rx.test(path));
}

const ALLOWED: RegExp[] = [
  /^\/?$/,
  /^\/?\(tabs\)\/?$/,
  /^\/?\(tabs\)\/(home|my-stacks|peptalk|nutrition|workouts|community|check-in|calendar|profile|stack-builder)(\?|\/|$)/,
  /^\/?calculators(\/[\w-]+)?(\?.*)?$/,
  /^\/?peptide\/[\w-]+(\?.*)?$/,
  /^\/?subscription(\?.*)?$/,
  /^\/?auth(\?.*)?$/,
  /^\/?learn(\/.*)?$/,
  /^\/?nutrition(\/[\w-]+)*(\?.*)?$/,
  /^\/?workouts(\/[\w-]+)*(\?.*)?$/,
  // v3 surfaces — added after the v3 refactor so navigate_to_screen can reach
  // the new drill-ins, doses sub-routes, labs, body comp, pantry, aimee
  // reports, community-v2, etc.
  /^\/?tracker(\/[\w-]+)*(\?.*)?$/,
  /^\/?doses(\/[\w-]+)*(\?.*)?$/,
  /^\/?activity(\/[\w-]+)*(\?.*)?$/,
  /^\/?labs(\/[\w-]+)*(\?.*)?$/,
  /^\/?body-composition(\/[\w-]+)*(\?.*)?$/,
  // /body-map — the aimee-chat prompt has offered this route all along
  // (aimee-chat/_prompt.ts), but the allowlist is deny-by-default and had no
  // pattern for it, so the streaming path refused every attempt while the
  // legacy path let it through. Two navigation paths, two different answers
  // for the same destination. The screen is now reachable from the dosing hub.
  /^\/?body-map(\?.*)?$/,
  /^\/?pantry(\/[\w-]+)*(\?.*)?$/,
  /^\/?aimee(\/[\w-]+)*(\?.*)?$/,
  /^\/?community(\/[\w-]+)*(\?.*)?$/,
  // /plan — Aimee's own copy promises "I can create a plan combining: weekly
  // workout schedule · meal plan framework · peptide protocol timing · daily
  // check-in reminders". Until the screen existed she could not send anyone to
  // it, so the promise had nowhere to land.
  /^\/?plan(\/[\w-]+)*(\?.*)?$/,
  // /insights — Aimee already quotes these correlations in chat via
  // buildCorrelationSummaryForBot. Until the screen existed she could cite the
  // numbers and had nowhere to send anyone to see them.
  /^\/?insights(\?.*)?$/,
  /^\/?journal(\/[\w-]+)*(\?.*)?$/,
  /^\/?cycle(\/[\w-]+)*(\?.*)?$/,
  /^\/?settings(\/[\w-]+)*(\?.*)?$/,
  /^\/?profile(\/[\w-]+)*(\?.*)?$/,
  /^\/?onboarding(\?.*)?$/,
  /^\/?health-profile(\?.*)?$/,
];
