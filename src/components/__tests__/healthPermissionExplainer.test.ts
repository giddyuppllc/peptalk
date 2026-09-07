/**
 * App Review 5.1.1(iv) — the pre-permission explainer's control set.
 *
 * This flow was rejected four times. The fix before this one FAILED because it
 * read Apple's three faults inverted and added the two it should have removed:
 * it shipped a "Not Now" button and an "Open Health settings" link, having
 * recorded the defects as "there was no way to back out, and there was no route
 * to Settings".
 *
 * A rendering test would not have caught that — the component rendered
 * perfectly. What was wrong was the set of controls it offered. So this reads
 * the source and asserts on that set, which is the thing Apple actually
 * rejected, and which the next well-meaning fix is most likely to undo.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(
  join(__dirname, '..', 'HealthPermissionExplainer.tsx'),
  'utf8',
);

// Strip block and line comments: the file explains at length what it must not
// do, and those explanations must not read as violations.
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('HealthPermissionExplainer — Apple 5.1.1(iv)', () => {
  it('never routes to the Settings app', () => {
    // Fault (a): "you send users to Settings before showing the system prompt".
    // app-settings: opens PepTalk's own page, which has no Health toggle on it
    // at all — this also caused the separate 2.1(a) rejection.
    expect(code).not.toMatch(/app-settings:/);
    expect(code).not.toMatch(/openSettings/);
    expect(code).not.toMatch(/Linking\./);
  });

  it('offers no way out except continuing to the system sheet', () => {
    // Fault (c): "the pre-prompt has a Not Now escape — users must always
    // proceed to the system prompt".
    expect(code).not.toMatch(/Not Now/i);
    expect(code).not.toMatch(/onNotNow/);
    expect(code).not.toMatch(/\bCancel\b/i);
    expect(code).not.toMatch(/\bMaybe later\b/i);
    expect(code).not.toMatch(/\bSkip\b/i);
  });

  it('cannot be dismissed by the Android back button', () => {
    // onRequestClose is the hardware back button. Wiring it to a dismiss would
    // reinstate the escape on one platform while the UI looked compliant.
    expect(code).toMatch(/onRequestClose=\{\(\)\s*=>\s*\{\}\}/);
  });

  it('labels the forward control Continue, not Connect', () => {
    // Fault (b): Apple named Continue or Next.
    expect(code).toMatch(/>Continue</);
    expect(code).not.toMatch(/>Connect</);
  });

  it('exposes exactly one action to its caller', () => {
    const props = SRC.match(
      /export interface HealthPermissionExplainerProps \{([\s\S]*?)\n\}/,
    );
    expect(props).not.toBeNull();
    const handlers = [...props![1].matchAll(/^\s*(on[A-Z]\w*)/gm)].map((m) => m[1]);
    expect(handlers).toEqual(['onContinue']);
  });
});
