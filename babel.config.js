module.exports = function (api) {
  // Vary the cache by platform so the web-only plugin below doesn't leak into
  // native builds (and vice-versa).
  const platform = api.caller((caller) => caller && caller.platform);
  api.cache.using(() => platform);

  const plugins = [];

  // WEB ONLY: rewrite `import.meta` so it doesn't reach the browser as a bare
  // token. A transitive dep (zustand devtools middleware) ships
  // `import.meta.env.MODE`, which babel-preset-expo leaves untouched and the
  // browser then rejects with "Cannot use 'import.meta' outside a module",
  // white-screening the PWA. Native (Hermes) never hits this path, so we scope
  // the transform to web to keep the live iOS/Android bundles unchanged.
  if (platform === 'web') {
    plugins.push('babel-plugin-transform-import-meta');
  }

  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins,
  };
};
