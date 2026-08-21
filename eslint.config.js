// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'dist2/*', '.expo/*', 'node_modules/*'],
  },
  {
    rules: {
      /**
       * OFF for React Native.
       *
       * This rule exists because in HTML an unescaped `'`, `"`, `>` or `}` in
       * markup can be ambiguous to a parser. React Native has no HTML parser —
       * <Text> renders the string as-is — so escaping "Couldn't" to
       * "Couldn&apos;t" makes the source harder to read and proofread while
       * changing nothing a user sees.
       *
       * It accounted for 114 of the 115 lint errors in this project, which is
       * why lint had never been enforced. Turning it off for a platform it does
       * not apply to is what makes the rest of the linter usable in CI.
       */
      'react/no-unescaped-entities': 'off',

      /**
       * OFF for React Native.
       *
       * 88 of these, and converting them would break the app. The pattern they
       * flag is the standard way to load an optional native module:
       *
       *   let NetInfo = null;
       *   try { NetInfo = require('@react-native-community/netinfo'); }
       *   catch { }        // web / Expo Go / jest — no native module present
       *
       * A static `import` is hoisted and cannot be wrapped in try/catch, so
       * rewriting these would turn a graceful degradation into a hard failure
       * on every platform that lacks the module. The rest are lazy requires
       * inside functions, deferring native work until it is actually needed.
       *
       * Same reasoning as no-unescaped-entities above: the rule encodes an
       * assumption (one module system, everything statically resolvable) that
       * does not hold on this platform. Left on, it is 88 permanent warnings
       * that train everyone to ignore the linter.
       */
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
