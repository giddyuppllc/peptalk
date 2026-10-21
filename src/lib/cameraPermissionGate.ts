/**
 * Camera permission — what a camera screen may show, kept pure so it is testable.
 *
 * App Review 5.1.1(iv) has rejected this app four times over the HealthKit
 * pre-permission explainer (see CLAUDE.md and HealthPermissionExplainer.tsx).
 * The three camera screens had the same defect: a custom screen shown BEFORE
 * the system prompt had ever appeared, with a non-neutral "Enable Camera"
 * button and a back/close control that let the user leave without ever seeing
 * the system sheet.
 *
 * The rule now:
 *
 *   loading   the permission status is still being read. Render nothing
 *             interactive.
 *   request   the OS can still ask. Call the system prompt directly, with no
 *             custom screen in front of it and no dismiss control — the
 *             system sheet carries the purpose string from app.json.
 *   granted   show the camera.
 *   denied    the system has answered no. Only now may a custom screen
 *             appear, with a way out and a route to Settings.
 *
 * `phase` records this screen's own request, so that after one system prompt
 * returns "not granted" we show the denied screen instead of prompting again in
 * a loop (Android keeps canAskAgain=true after the first denial).
 */

export interface CameraPermissionLike {
  granted: boolean;
  canAskAgain: boolean;
}

/** idle: not asked by this screen yet · requesting: system sheet is up · done: it returned. */
export type CameraRequestPhase = 'idle' | 'requesting' | 'done';

export type CameraGateState = 'loading' | 'request' | 'granted' | 'denied';

export function cameraGateState(
  permission: CameraPermissionLike | null | undefined,
  phase: CameraRequestPhase,
): CameraGateState {
  if (!permission) return 'loading';
  if (permission.granted) return 'granted';
  if (phase === 'requesting') return 'request';
  if (phase === 'idle' && permission.canAskAgain) return 'request';
  return 'denied';
}

/** Whether the screen should fire the system prompt now. */
export function shouldRequestCamera(state: CameraGateState, phase: CameraRequestPhase, enabled = true): boolean {
  return enabled && state === 'request' && phase === 'idle';
}

/** Whether a custom (non-system) permission screen with controls may render. */
export function mayShowCustomPermissionScreen(state: CameraGateState): boolean {
  return state === 'denied';
}
