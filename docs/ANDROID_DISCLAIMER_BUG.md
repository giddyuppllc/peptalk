# RESOLVED — and it was never a product bug

**Filed 2026-08-31 as "the peptide disclaimer cannot be dismissed on Android".
Resolved the same day. The app was fine. The test environment was not.**

Keeping this because the misdiagnosis is more useful than the fix.

## What it looked like

On an Android debug build, `/doses/calculator` opens behind the
"Research & Education Only" gate. Ticking the box and tapping **Continue** did
nothing. The modal stayed up, so the Dose Calculator — a feature named in our
store listing — was unreachable. iOS was fine.

Every measurement said the app was broken:

- the checkbox genuinely ticked (`checked="true"` in the a11y tree);
- Continue was a real `android.widget.Button`, `enabled="true"`,
  `clickable="true"`, at sensible bounds;
- taps landed on its exact centre — via Maestro **and** raw `adb input tap`;
- no JS error of any kind;
- instrumenting both handlers showed the sibling checkbox firing every single
  time and Continue never firing;
- and `onPress` provably never ran: tap Continue, restart, revisit — the
  disclaimer came back, so `setAccepted` had never persisted.

## The actual cause

React Native's **LogBox banner** — "Open debugger to view warnings." — is a
**native overlay window**, not part of the React tree, and it **swallows touches
well beyond the area it visibly covers**. Dismissing it made Continue work
instantly.

Its visible bounds overlapped the button by **thirteen pixels** at the very
bottom edge, nowhere near the tap point. "Does it overlap?" was the wrong
question: it is a separate window and captures in its own layer.

**Debug builds only.** There is no LogBox in a release build. Nothing shipped to
a user was ever affected.

`.maestro/pro-account.yaml` already carried a note that this banner is a native
overlay covering the tab bar. That note was correct and would have saved hours.

## Three fixes were attempted on the wrong diagnosis

All reverted, because a behavioural change on a hunch is how the HealthKit
rejection shipped twice:

1. `pointerEvents="none"` on the decorative `LinearGradient` — plausible, wrong.
2. Removing `disabled={!checked}` and guarding inside `onPress` — changed
   behaviour, fixed nothing.
3. Keeping the `<Modal>` mounted so `visible={!accepted}` could animate closed
   instead of the component early-returning `null`. This one is a real Android
   hazard and matches the file's own note about a "Modal z-order edge case", but
   it changed nothing here and altered iOS too.

## What was kept

The accessibility props, because they were genuinely missing and are worth
having on their own merits. On a required legal consent gate:

- TalkBack never announced the checkbox as a checkbox, nor whether it was ticked;
- Android composed its label from the children as `", I understand and agree"`,
  leading comma included;
- the inner `<Text>` was exposed separately and was not clickable.

Now `accessibilityRole` / `accessibilityLabel` / `accessibilityState` on both
controls, verified in the Android a11y tree.

## What the harness now does

`.maestro/dismiss-logbox.yaml` waits for the app to settle and dismisses the
banner on Android, and every UI-driving flow runs it straight after `launchApp`.
Do not "fix" the app for this. Fix the harness.
