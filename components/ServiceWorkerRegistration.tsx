"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw.js` so the app can be installed and opened offline.
 * Skipped in development, where a cache-first worker would keep serving
 * stale bundles between edits.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error) => {
      console.warn("No se pudo registrar el service worker; la app seguirá funcionando sin modo offline.", error);
    });
  }, []);

  return null;
}
