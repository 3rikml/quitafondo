/** What a key press means for the editor. `null` from `resolveShortcut` means "not ours". */
export type ShortcutAction =
  | { type: "crop-apply" }
  | { type: "crop-cancel" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "copy" }
  | { type: "download" }
  | { type: "toggle-compare" }
  | { type: "close-compare" }
  | { type: "close-tool" }
  | { type: "select-tool"; tool: string }
  | { type: "zoom-fit" }
  | { type: "zoom-in" }
  | { type: "zoom-out" }
  | { type: "brush-smaller" }
  | { type: "brush-larger" };

export interface KeyInfo {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface ShortcutState {
  cropActive: boolean;
  /** A finished image is open (single-key shortcuts only act then). */
  editing: boolean;
  /** The image has an original to compare against. */
  canCompare: boolean;
  comparing: boolean;
  retouchActive: boolean;
  toolOpen: boolean;
  /** Focus is in a menu, list or dialog, which use letters and digits for their own typeahead. */
  inOverlay?: boolean;
  /** Tools reachable by number key, as `{ key: "1", id: "background" }`. */
  tools: readonly { key: string; id: string }[];
}

/** Maps a key press to an editor action. Pure, so every shortcut can be tested without a DOM. */
export function resolveShortcut(e: KeyInfo, state: ShortcutState): ShortcutAction | null {
  const key = e.key.toLowerCase();
  const modifier = e.ctrlKey || e.metaKey;

  if (state.cropActive && (e.key === "Enter" || e.key === "Escape")) {
    return { type: e.key === "Enter" ? "crop-apply" : "crop-cancel" };
  }
  if (modifier && key === "z") return { type: e.shiftKey ? "redo" : "undo" };
  if (modifier && key === "y") return { type: "redo" };
  if (state.inOverlay) return null;
  if (!state.editing) return null;
  if (modifier && e.shiftKey && key === "c") return { type: "copy" };
  if (modifier || e.altKey) return null;

  const tool = state.tools.find((item) => item.key === e.key);
  if (tool) return { type: "select-tool", tool: tool.id };
  if (key === "d") return { type: "download" };
  if (key === "c" && state.canCompare) return { type: "toggle-compare" };
  if (key === "b") return { type: "select-tool", tool: "retouch" };
  if (e.key === "0") return { type: "zoom-fit" };
  if (e.key === "+" || e.key === "=") return { type: "zoom-in" };
  if (e.key === "-") return { type: "zoom-out" };
  if (e.key === "[" && state.retouchActive) return { type: "brush-smaller" };
  if (e.key === "]" && state.retouchActive) return { type: "brush-larger" };
  if (e.key === "Escape") {
    if (state.comparing) return { type: "close-compare" };
    if (state.toolOpen) return { type: "close-tool" };
  }
  return null;
}
