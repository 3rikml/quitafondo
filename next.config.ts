import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run dev` only accepts its own hostname by default, so opening it
  // from another device on the Wi-Fi (http://192.168.x.x:3000) loaded the
  // HTML but blocked the dev scripts: React never hydrated and no button
  // worked. Allow private LAN addresses and mDNS names (dev-only setting).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  // The ONNX Runtime WASM backend needs SharedArrayBuffer to run the model
  // multi-threaded; without cross-origin isolation it silently falls back to
  // single-threaded (slower, no crash). `credentialless` rather than
  // `require-corp`: the model weights and runtime come from the Hugging Face
  // Hub and jsDelivr, which send CORS headers but not
  // Cross-Origin-Resource-Policy, so `require-corp` would block them.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
      {
        // Always revalidate the service worker itself, so a new deploy's
        // worker is picked up on the next visit instead of being cached.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
