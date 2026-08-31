# Open defect: the peptide disclaimer cannot be dismissed on Android

**Status: unresolved. Found 2026-08-31. Blocks the Dose Calculator on Android.**

## What happens

On Android, `/doses` and `/doses/calculator` open behind `PeptideDisclaimerModal`
("Research & Education Only"). Ticking **I understand and agree** and tapping
**Continue** does nothing. The modal stays up. There is no way past it, so the
Dose Calculator — a feature named in our own store listing — is unreachable.

Works correctly on iOS. `.maestro/calculator.yaml` passes there and fails here.

## What has been established

- The checkbox genuinely ticks: the a11y tree shows
  `class="android.widget.CheckBox" checked="true"`.
- Continue is a real, enabled, clickable node:
  `class="android.widget.Button" enabled="true" clickable="true"`.
- The tap lands. Reproduced with Maestro **and** with a raw
  `adb shell input tap` at the button's centre, inside its reported bounds.
- **`onPress` never runs.** Decisive test: tap Continue, force-stop the app,
  relaunch, navigate back to the calculator — the disclaimer reappears. If
  `setAccepted(true)` had run, `acceptedPeptideDisclaimer` would have persisted
  and it would not.
- No JS error of any kind in logcat at the moment of the tap.
- The store action is correct: `setAcceptedPeptideDisclaimer` does
  `set({ acceptedPeptideDisclaimer })`, and the field is in `partialize`, so it
  persists.

## What was tried and did NOT fix it

- **Accessibility props on the checkbox and the Continue button.** These were
  genuinely missing and are now added — see below — but they did not fix the
  dismissal.
- **Keeping the Modal mounted so `visible={!accepted}` can animate closed**
  instead of the component early-returning `null` the instant `accepted` flips.
  This was a plausible read of the file's own note about an "Android RN Modal
  z-order edge case", and it is a real hazard, but it changed nothing here and
  it alters iOS behaviour too, so it was reverted rather than left in on spec.

## What was kept, because it is worth keeping regardless

The checkbox and Continue button had **no accessibility props at all** — no
role, no label, no state — on a required legal consent gate:

- TalkBack never announced the checkbox as a checkbox, and never announced
  whether it was ticked.
- Android composed its label from the children as `", I understand and agree"`,
  leading comma included.
- The inner `<Text>` was exposed separately and was not clickable, so a tap
  aimed at the visible label hit dead space.

Now `accessibilityRole="checkbox"` / `accessibilityState={{ checked }}` and
`accessibilityRole="button"` / `accessibilityState={{ disabled: !checked }}`.
Verified in the Android a11y tree. A blind user could not previously tell
whether they had accepted a legal disclaimer.

## Where to look next

`onPress` not firing while the node is enabled and the tap is inside its bounds
points at touch handling rather than at logic. Worth checking, roughly in order:

1. Whether something transparent overlays the button — the RN `<Modal>` backdrop,
   `LinearGradient`, or a parent with `pointerEvents` set unhelpfully.
2. Whether `TouchableOpacity` inside `<Modal>` on this RN version needs the
   gesture handler's touchable instead, which is a known Android/RN pairing.
3. Whether the ScrollView above the row is capturing the gesture.
4. Reproducing in a release build — this was seen on a debug build with the
   LogBox banner present, though the banner sits below the button.

Reproduce with:

```
maestro --device emulator-5554 test .maestro/calculator.yaml
```
