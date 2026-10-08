// QuitaFondo service worker: makes the app open and work offline after the
// first visit. It only caches this site's own files — the AI model and the
// ONNX Runtime binaries are already kept in Cache Storage by Transformers.js.
//
// - Build assets under /_next/static/ have content hashes in their names, so
//   they are served cache-first and never go stale.
// - Pages and everything else same-origin are network-first, falling back to
//   the cached copy when offline, so a new deploy shows up on the next visit.

const CACHE = "quitafondo-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
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
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
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
