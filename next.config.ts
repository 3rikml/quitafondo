import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;
