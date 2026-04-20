# Accessibility Labels TODO

## Completed in this commit
- Added `accessibilityRole` + `accessibilityLabel` to destructive buttons (stack delete, dose delete)
- Created reusable `<BackButton />` component in `src/components/BackButton.tsx` with built-in a11y

## Pattern to follow

For every icon-only button, add:
```tsx
<TouchableOpacity
  onPress={handler}
  accessibilityRole="button"
  accessibilityLabel="Descriptive action"
>
  <Ionicons name="..." ... />
</TouchableOpacity>
```

## Remaining back buttons to convert (use BackButton component OR add labels inline)

Run this to find them all:
```
grep -rn "name=\"chevron-back\"\|name=\"arrow-back\"" app/ src/components/
```

Each of these ~30 locations currently lacks `accessibilityLabel="Go back"`.

## Remaining close/X buttons

Run:
```
grep -rn "name=\"close\"\|name=\"close-outline\"" app/ src/components/
```

Each needs `accessibilityLabel="Close"` or more specific like `"Close dose log"`.

## Migration strategy (pick one)

**Option A — Gradual:** Add labels inline to each TouchableOpacity you touch for other work.

**Option B — Batch:** Dedicate 1-2 hours to find/replace across the app using the patterns above. Would take ~30-45 minutes for all back buttons alone.

**Option C — Refactor:** Replace all back buttons with `<BackButton />` component. Biggest change but best long-term.

I recommend **Option C** — use the `BackButton` component going forward and gradually migrate old screens.

## Why this matters

Without labels, VoiceOver / TalkBack users hear "button" instead of "Close dose log" or "Go back". They navigate by feel — a frustrating experience.

Apple requires a reasonable accessibility pass for App Store approval (not blocking but flagged).
