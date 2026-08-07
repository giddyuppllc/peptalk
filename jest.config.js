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
  // '<rootDir>/.stryker-tmp/' is Stryker's sandbox: full copies of the project,
  // tests included. Without it here, any jest run during or after a mutation
  // run silently discovers those copies and reports roughly double the suites —
  // observed as 16 suites / 178 tests instead of 8 / 89. It is gitignored, but
  // jest does not read .gitignore.
  //
  // The <rootDir> anchor is load-bearing. A bare '/.stryker-tmp/' also matches
  // from INSIDE the sandbox, where Stryker runs jest with rootDir set to the
  // sandbox itself — every test path then contains '/.stryker-tmp/' and Stryker
  // dies with "No tests were found". Anchoring means the outer project skips the
  // copies while the sandbox still sees its own.
  //
  // 'dist2' is the alternate export target used because dist/ is held by a
  // stray file handle on this machine.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/dist2/',
    '/ios/',
    '/android/',
    '<rootDir>/.stryker-tmp/',
  ],
  // The Square helpers live under supabase/functions/_shared and are plain TS;
  // include that path so their transform (via babel-preset-expo) applies.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))',
  ],
  clearMocks: true,
};
