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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const INDEX = 'dist/index.html';
const MARKER = '<!-- pwa:injected -->';

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

// 3) Register the service worker right before </body>.
html = html.replace('</body>', `  ${SW_SCRIPT}\n</body>`);

writeFileSync(INDEX, html);
console.log('[inject-pwa] stamped manifest + PWA meta + service worker into', INDEX);
