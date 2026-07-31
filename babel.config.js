module.exports = function (api) {
  const isWeb = api.caller((caller) => Boolean(caller && caller.platform === 'web'));
  api.cache.using(() => (isWeb ? 'web' : 'native'));

  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // Web bundles are served as classic scripts, so a stray `import.meta` in a
    // dependency is a SyntaxError that blanks the page before React mounts.
    // See babel-plugin-strip-import-meta.js. Native bundles are untouched.
    plugins: isWeb ? ['./babel-plugin-strip-import-meta.js'] : [],
  };
};
