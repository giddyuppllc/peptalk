/**
 * Jest configuration for PepTalk.
 *
 * Uses the `jest-expo` preset (the Expo/React-Native standard) so RN/Expo
 * module imports resolve and transform correctly. The current suite targets
 * the PURE, security-critical money/entitlement logic (src/lib/* and the
 * Square shared helpers), which needs no RN runtime — but the preset keeps the
 * door open for component tests later without reconfiguration.
 */
module.exports = {
  preset: 'jest-expo',
  // Only run our own unit tests; ignore build output + native folders.
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/ios/', '/android/'],
  // The Square helpers live under supabase/functions/_shared and are plain TS;
  // include that path so their transform (via babel-preset-expo) applies.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))',
  ],
  clearMocks: true,
};
