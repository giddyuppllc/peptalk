const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// WEB ONLY: force `zustand/middleware` to its CommonJS build. Package-exports
// resolution otherwise picks the ESM (`esm/middleware.mjs`), which bundles the
// devtools middleware containing `import.meta.env.MODE`. The browser then throws
// "Cannot use 'import.meta' outside a module" and the PWA white-screens. The CJS
// build (`middleware.js`) is functionally identical for our use (persist +
// createJSONStorage) and import.meta-free. Native resolution is untouched.
const zustandMiddlewareCjs = path.join(
  __dirname,
  'node_modules/zustand/middleware.js',
);
const prevResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'zustand/middleware') {
    return { type: 'sourceFile', filePath: zustandMiddlewareCjs };
  }
  return (prevResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

module.exports = withNativeWind(config, { input: './global.css' });
