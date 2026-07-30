/* PepTalk PWA service worker.
 *
 * Deliberately conservative: it caches only the static app shell (Expo's hashed
 * JS/CSS/fonts under /_expo/ + icons) so the PWA installs and cold-loads fast /
 * offline. It NEVER intercepts cross-origin requests (Supabase, R2 video, the AI
 * providers) or non-GET requests — those always go straight to the network, so
 * auth, AI streaming, and video are never served stale. Hashed asset filenames
 * change every deploy, so cache-first on them is safe.
 */

const CACHE = 'peptalk-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isShellAsset(url) {
  return (
    url.pathname.startsWith('/_expo/') ||
    url.pathname.startsWith('/assets/') ||
    /\.(?:js|css|woff2?|ttf|png|jpg|jpeg|svg|ico|webmanifest)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only ever touch our own origin. Supabase / R2 / xAI etc. pass through.
  if (url.origin !== self.location.origin) return;

  // SPA navigations: network-first, fall back to the cached shell so a reload
  // (or offline launch) still boots the app; Expo Router handles the route.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match('/index.html').then((r) => r || caches.match('/')),
      ),
    );
    return;
  }

  // Static shell assets: stale-while-revalidate.
  if (isShellAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const network = fetch(req)
            .then((res) => {
              if (res && res.status === 200) cache.put(req, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || network;
        }),
      ),
    );
  }
});
