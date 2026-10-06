import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @imgly/background-removal needs SharedArrayBuffer to run its WASM model
  // multi-threaded; without these two headers it silently falls back to
  // single-threaded (slower, no crash). The app never loads cross-origin
  // resources (only local blob: URLs for user-picked backgrounds), so the
  // stricter cross-origin isolation this enables has no downside here.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
