/**
 * Metro emits the web bundle as a classic script, so any `import.meta` in a
 * dependency is a hard SyntaxError that blanks the whole page before React
 * mounts. Nothing in this app uses it — it arrives via zustand/middleware,
 * whose barrel pulls in the `devtools` middleware we never call.
 *
 * Replacing the meta-property with `{}` keeps the guarded reads
 * (`import.meta.env ? import.meta.env.MODE : undefined`) working: they simply
 * resolve to undefined, which is what a production web build wants anyway.
 *
 * Web only — native bundles are unaffected.
 */
module.exports = function stripImportMeta() {
  return {
    name: 'strip-import-meta',
    visitor: {
      MetaProperty(path) {
        if (path.node.meta && path.node.meta.name === 'import') {
          path.replaceWith({ type: 'ObjectExpression', properties: [] });
        }
      },
    },
  };
};
