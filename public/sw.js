// QuitaFondo service worker: makes the app open and work offline after the
// first visit. It only caches this site's own files — the AI model and the
// ONNX Runtime binaries are already kept in Cache Storage by Transformers.js.
//
// - Build assets under /_next/static/ have content hashes in their names, so
//   they are served cache-first and never go stale.
// - Pages and everything else same-origin are network-first, falling back to
//   the cached copy when offline, so a new deploy shows up on the next visit.

// The page registers this worker as /sw.js?v=<build id>, so every deploy gets
// its own cache and a fresh install (which precaches the new shell).
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `quitafondo-${VERSION}`;
// Pages and other same-origin files are kept for offline use; the oldest go first.
const MAX_ENTRIES = 80;

/** Stores a full (200) response only: a 206 partial one would throw in cache.put. */
async function remember(request, response) {
  if (response.status !== 200) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
    // Hashed build assets are what makes the app open offline: never trim those.
    const trimmable = (await cache.keys()).filter((key) => !new URL(key.url).pathname.startsWith("/_next/static/"));
    for (const key of trimmable.slice(0, Math.max(0, trimmable.length - MAX_ENTRIES))) await cache.delete(key);
  } catch {
    // Storage full or blocked: the app still works, just not offline.
  }
}

const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

// Caches the page, its hashed build assets and the icons up front, so the app
// opens offline even if the first visit was interrupted before everything
// loaded. Best-effort: a failed entry never blocks the install.
async function precacheShell() {
  const cache = await caches.open(CACHE);
  const add = async (url) => {
    try {
      const response = await fetch(url, { cache: "reload" });
      if (response.ok) {
        await cache.put(url, response.clone());
        return response;
      }
    } catch {}
    return null;
  };
  const results = await Promise.all(SHELL.map(add));
  const html = results[0] ? await results[0].text() : "";
  const assets = new Set(html.match(/\/_next\/static\/[^"'\s\\)]+/g) ?? []);
  await Promise.all([...assets].map(add));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().finally(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("quitafondo-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  remember(request, response.clone()); // not awaited: the page shouldn't wait for the cache write
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    remember(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(url.pathname.startsWith("/_next/static/") ? cacheFirst(request) : networkFirst(request));
});
