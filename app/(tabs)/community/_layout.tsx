/**
 * Community tab Stack layout.
 *
 * The Community tab landing screen is `community/index.tsx`. From there
 * users push into nested screens — compose, post detail, live event chat,
 * user profiles, etc. Wrapping them in a Stack lets each one push on top
 * of the previous with a swipe-back gesture, while the underlying tab
 * bar stays visible. Without this layout, expo-router would render the
 * sub-routes as siblings to the tab landing, which breaks back-stack
 * behaviour.
 *
 * All sub-routes use their own in-screen headers (custom back chevron +
 * title pattern that matches the rest of the app), so headerShown: false
 * here.
 */

import { Stack } from 'expo-router';

export default function CommunityStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
