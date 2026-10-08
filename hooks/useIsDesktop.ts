"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * Whether the editor uses its desktop layout (tool rail + side panel) or the
 * phone layout (bottom bar + bottom sheet). Rendering one layout — instead of
 * both and hiding one with CSS — keeps each panel mounted only once.
 * The server renders the desktop layout.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => true);
}
