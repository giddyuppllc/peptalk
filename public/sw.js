/* PepTalk PWA service worker.
 *
 * Deliberately conservative: it caches only the static app shell (Expo's hashed
 * JS/CSS/fonts under /_expo/ + icons) so the PWA installs and cold-loads fast /
 * offline. It NEVER intercepts cross-origin requests (Supabase, R2 video, the AI
 * providers) or non-GET requests — those always go straight to the network, so
 * auth, AI streaming, and video are never served stale. Hashed asset filenames
 * change every deploy, so cache-first on them is safe.
 */

const CACHE = 'peptalk-shell-v2';

/** The single key every navigation is cached under and falls back to. */
const SHELL_URL = '/index.html';

/**
 * Warm the shell at install time.
 *
 * The header above claimed this worker "caches the static app shell so the PWA
 * installs and cold-loads fast / offline". It did not: install only called
 * skipWaiting(), and the fetch handler below writes to the cache exclusively
 * for isShellAsset() requests — a navigation never matched that path. So
 * caches.match(SHELL_URL) in the navigate fallback could never hit, and the
 * app failed to boot offline at ANY point, not just immediately after install.
 *
 * Fetching the shell is not enough on its own either: index.html only
 * references Expo's hashed bundles, so an offline first launch would render an
 * empty document. Parse the URLs out and pull them in too.
 *
 * Every step is best-effort. A rejected install leaves the PWA with no service
 * worker at all, which is strictly worse than a slow first load.
 */
async function precacheShell() {
  try {
    const cache = await caches.open(CACHE);
    const res = await fetch(SHELL_URL, { cache: 'reload' });
    if (!res || res.status !== 200) return;
    await cache.put(SHELL_URL, res.clone());

    const html = await res.text();
    const assets = new Set();
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const path = match[1];
      if (path.startsWith('/_expo/') || path.startsWith('/assets/')) assets.add(path);
    }
    // allSettled: one 404 must not abort the rest of the precache.
    await Promise.allSettled([...assets].map((path) => cache.add(path)));
  } catch {
    /* offline or blocked at install time — the fetch handler will fill in later */
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precacheShell());
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
      fetch(req)
        .then((res) => {
          // Refresh the offline shell on every successful navigation, so the
          // fallback below tracks the deployed build instead of going stale at
          // whatever install-time snapshot happened to be cached.
          if (res && res.status === 200) {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((cache) => cache.put(SHELL_URL, copy))
              .catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(SHELL_URL).then((r) => r || caches.match('/'))),
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

/* ── Dose reminders (web push) ────────────────────────────────────────────
 * Sent by the web-dose-reminders edge function. The payload is JSON:
 *   { title, body, url, tag }
 * Same wording as the native reminder. Clicking opens (or focuses) the app on
 * the dose calendar — the screen native reminders route to.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Dose Reminder';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Time to take your scheduled dose.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // One notification per dose: a re-send for the same dose replaces it.
      tag: data.tag || undefined,
      data: { url: data.url || '/calendar' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/calendar', self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === target.origin && 'focus' in w) {
          if ('navigate' in w) w.navigate(target.href).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target.href) : undefined;
    }),
  );
});
