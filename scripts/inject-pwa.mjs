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
import { execSync } from 'node:child_process';
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
    navigator.serviceWorker.register('/sw.js').then(function (reg) {
      // Ask the browser to re-check for a new worker.
      //
      // Registering alone is not enough for an INSTALLED PWA. In standalone
      // mode the app often stays resident for days without a full navigation,
      // and the browser only re-fetches sw.js on navigation or an explicit
      // update() call. Without this, someone with PepTalk on their home screen
      // could sit on an old build indefinitely after we ship a fix.
      var last = 0;
      function checkForUpdate() {
        // Throttle: at most once every 15 minutes. update() is a network
        // request, and a resumed app can fire visibilitychange repeatedly.
        var now = Date.now();
        if (now - last < 15 * 60 * 1000) return;
        last = now;
        reg.update().catch(function () {});
      }
      checkForUpdate();
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    }).catch(function (e) {
      console.warn('[pwa] service worker registration failed:', e);
    });

    // When a NEW worker takes over, reload once so the open page stops running
    // the old JS bundle. sw.js calls skipWaiting() + clients.claim(), so the new
    // worker controls this page immediately — but the already-parsed JavaScript
    // in it does not change until a reload.
    //
    // The guard matters: without it, claim() on first install would reload a
    // page that is already current, and on a flaky network that becomes a loop.
    var __reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (__reloading) return;
      __reloading = true;
      window.location.reload();
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

// 4) Stamp the commit this bundle was built from.
//
// dist/ is a build artifact with no memory of its source. On 2026-08-08 it sat
// four commits behind HEAD and looked complete — the dose-unit fix, the peptide
// back button, the TB-500 correction and the Aimee banner fix were all missing,
// and it was about to be deployed as "built and verified". Nothing in the
// artifact could contradict that. Now something can: `npm run verify:build`
// compares this stamp against HEAD and refuses a stale deploy.
let buildSha = 'unknown';
try {
  buildSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch {
  // Not a git checkout (CI tarball, etc.) — leave it 'unknown' rather than fail
  // the build; verify:build treats unknown as "cannot confirm", not "fresh".
}
html = html.replace(
  '</head>',
  `  <meta name="peptalk-build-commit" content="${buildSha}" />\n  </head>`,
);

writeFileSync(INDEX, html);

// Stamp the service worker too, and this is not cosmetic.
//
// A browser installs a new service worker ONLY when the bytes of sw.js change.
// This file is static and was byte-identical on every deploy, so after a push
// the browser fetched it, saw no difference, and never ran install/activate —
// meaning the activate handler that purges old caches never ran either, and a
// CACHE version bump would have had no effect at all.
//
// Navigations are network-first, so users did still get fresh JS on a reload.
// But an installed PWA that stays resident had no mechanism to notice a new
// build. Stamping the commit makes every deploy a genuine update.
const SW_PATH = 'dist/sw.js';
try {
  const sw = readFileSync(SW_PATH, 'utf8');
  const stamped = `// build: ${buildSha}\n` + sw.replace(/^\/\/ build: .*\n/, '');
  writeFileSync(SW_PATH, stamped);
  console.log(`[inject-pwa] stamped sw.js with build ${buildSha.slice(0, 7)}`);
} catch (err) {
  console.warn('[inject-pwa] could not stamp sw.js:', err.message);
}

console.log('[inject-pwa] stamped manifest + PWA meta + service worker into', INDEX);
console.log(`[inject-pwa] build commit: ${buildSha.slice(0, 7)}`);
