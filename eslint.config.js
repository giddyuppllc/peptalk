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
    },
  },
]);
