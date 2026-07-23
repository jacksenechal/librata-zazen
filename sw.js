/*
 * Librata Zazen — service worker.
 * Offline-first: precache the full app shell, serve cache-first, zero
 * runtime network dependency after install. See docs/ARCHITECTURE.md
 * for the file map this precache list is derived from.
 */

const CACHE_NAME = "zazen-v5";

const PRECACHE_URLS = [
  "./",
  "index.html",
  "manifest.webmanifest",

  "css/tokens.css",
  "css/app.css",

  "js/format.js",
  "js/store.js",
  "js/audio.js",
  "js/engine.js",
  "js/icons.js",
  "js/main.js",
  "js/ui/util.js",
  "js/ui/home.js",
  "js/ui/library.js",
  "js/ui/player.js",
  "js/ui/editor.js",
  "js/ui/sectionEditor.js",
  "js/ui/settings.js",

  "assets/fonts/fonts.css",
  "assets/fonts/cormorant/CormorantGaramond-Light.woff2",
  "assets/fonts/cormorant/CormorantGaramond-Regular.woff2",
  "assets/fonts/manrope/Manrope-Regular.woff2",
  "assets/fonts/manrope/Manrope-Medium.woff2",
  "assets/fonts/manrope/Manrope-SemiBold.woff2",

  "assets/logo/librata-app-icon.svg",
  "assets/logo/librata-mark.svg",
  "assets/logo/librata-wordmark.svg",

  "assets/icons/icon-carta.svg",
  "assets/icons/icon-dawn.svg",
  "assets/icons/icon-maskable.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Precache individually so one missing/renamed asset doesn't fail
      // the whole install (addAll aborts on any single 404).
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "no-store" });
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch (err) {
            // Missing asset at install time; fetch handler will retry
            // on first navigation and cache it then if it appears.
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // Offline and not in cache. For navigations, fall back to the
        // app shell so a deep reload still boots the app.
        if (request.mode === "navigate") {
          const shell = await caches.match("index.html");
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
