#!/usr/bin/env node
/**
 * inject-pwa.mjs — stamp PWA tags into the Expo web export.
 *
 * `expo export -p web` uses `web.output: 'single'` (SPA), where Expo generates
 * index.html from a built-in template and ignores `app/+html.tsx` (that only
 * applies to static/server output, which would risk SSR-breaking this
 * native-heavy app). So we post-process dist/index.html to add the manifest,
 * theme color, mobile/standalone + apple meta, apple-touch-icon, and the
 * service-worker registration — making PepTalk installable from peptalk.bio.
 *
 * Idempotent: re-running (or running on an already-injected file) is a no-op.
 * Run after export:  expo export -p web && node scripts/inject-pwa.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const INDEX = 'dist/index.html';
const MARKER = '<!-- pwa:injected -->';

// Expo exports the Ionicons glyph font under dist/assets/node_modules/… and
// Vercel STRIPS any node_modules path from static output, so the font 404s and
// every icon renders as a tofu box. Copy it to a clean /fonts/ path and register
// it at runtime (a loaded FontFace wins over Expo's broken 404'd @font-face).
function relocateIconFont() {
  function find(dir, re) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { const f = find(p, re); if (f) return f; }
      else if (re.test(e.name)) return p;
    }
    return null;
  }
  const src = existsSync('dist/assets') ? find('dist/assets', /^Ionicons\..*\.ttf$/) : null;
  if (!src) { console.warn('[inject-pwa] Ionicons font not found — skipping relocate'); return false; }
  mkdirSync('dist/fonts', { recursive: true });
  copyFileSync(src, 'dist/fonts/ionicons.ttf');
  console.log('[inject-pwa] relocated Ionicons font ->', 'dist/fonts/ionicons.ttf');
  return true;
}

if (!existsSync(INDEX)) {
  console.error(`[inject-pwa] ${INDEX} not found — run "expo export -p web" first.`);
  process.exit(1);
}

let html = readFileSync(INDEX, 'utf8');

if (html.includes(MARKER)) {
  console.log('[inject-pwa] already injected — skipping.');
  process.exit(0);
}

const HEAD_TAGS = `${MARKER}
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#14b8a6" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="PepTalk" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />`;

const hasIconFont = relocateIconFont();

const ICON_FONT_SCRIPT = hasIconFont
  ? `<script>
// Register the relocated Ionicons font (Expo's node_modules-pathed one 404s on
// Vercel). A successfully-loaded FontFace wins over the broken @font-face.
try {
  var __ion = new FontFace('ionicons', "url(/fonts/ionicons.ttf) format('truetype')");
  __ion.load().then(function (f) { document.fonts.add(f); }).catch(function(){});
} catch (e) {}
</script>`
  : '';

const SW_SCRIPT = `<script>
if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (e) {
      console.warn('[pwa] service worker registration failed:', e);
    });
  });
}
</script>`;

// 1) Make the viewport app-like (cover the notch, block zoom bounce).
html = html.replace(
  /<meta name="viewport"[^>]*>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />',
);

// 2) Inject head tags right before </head>.
html = html.replace('</head>', `  ${HEAD_TAGS}\n  </head>`);

// 3) Register the service worker + icon font right before </body>.
html = html.replace('</body>', `  ${ICON_FONT_SCRIPT}\n  ${SW_SCRIPT}\n</body>`);

writeFileSync(INDEX, html);
console.log('[inject-pwa] stamped manifest + PWA meta + service worker into', INDEX);
