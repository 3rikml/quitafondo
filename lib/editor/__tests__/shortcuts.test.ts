import { describe, it, expect } from "vitest";
import { resolveShortcut, type KeyInfo, type ShortcutState } from "../shortcuts";

const state: ShortcutState = {
  cropActive: false,
  editing: true,
  canCompare: true,
  comparing: false,
  retouchActive: false,
  toolOpen: false,
  tools: [
    { key: "1", id: "background" },
    { key: "2", id: "retouch" },
  ],
};
const press = (key: string, extra: Partial<KeyInfo> = {}): KeyInfo => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...extra,
});

describe("resolveShortcut", () => {
  it("undoes and redoes with Ctrl/Cmd+Z, even before an image is finished", () => {
    const idle = { ...state, editing: false };
    expect(resolveShortcut(press("z", { ctrlKey: true }), idle)).toEqual({ type: "undo" });
    expect(resolveShortcut(press("Z", { metaKey: true, shiftKey: true }), idle)).toEqual({ type: "redo" });
  });

  it("ignores single keys until an image is finished", () => {
    expect(resolveShortcut(press("d"), { ...state, editing: false })).toBeNull();
  });

  it("opens tools by number and by B", () => {
    expect(resolveShortcut(press("1"), state)).toEqual({ type: "select-tool", tool: "background" });
    expect(resolveShortcut(press("b"), state)).toEqual({ type: "select-tool", tool: "retouch" });
  });

  it("lets Enter and Escape drive the crop", () => {
    const crop = { ...state, cropActive: true };
    expect(resolveShortcut(press("Enter"), crop)).toEqual({ type: "crop-apply" });
    expect(resolveShortcut(press("Escape"), crop)).toEqual({ type: "crop-cancel" });
  });

  it("only toggles the comparison when there is an original", () => {
    expect(resolveShortcut(press("c"), state)).toEqual({ type: "toggle-compare" });
    expect(resolveShortcut(press("c"), { ...state, canCompare: false })).toBeNull();
  });

  it("resizes the brush only while retouching", () => {
    expect(resolveShortcut(press("["), state)).toBeNull();
    expect(resolveShortcut(press("]"), { ...state, retouchActive: true })).toEqual({ type: "brush-larger" });
  });

  it("closes the comparison first, then the tool, with Escape", () => {
    const both = { ...state, comparing: true, toolOpen: true };
    expect(resolveShortcut(press("Escape"), both)).toEqual({ type: "close-compare" });
    expect(resolveShortcut(press("Escape"), { ...both, comparing: false })).toEqual({ type: "close-tool" });
    expect(resolveShortcut(press("Escape"), state)).toBeNull();
  });

  it("leaves browser shortcuts alone", () => {
    expect(resolveShortcut(press("d", { ctrlKey: true }), state)).toBeNull();
    expect(resolveShortcut(press("0", { altKey: true }), state)).toBeNull();
  });

  it("redoes with Ctrl/Cmd+Y", () => {
    expect(resolveShortcut(press("y", { ctrlKey: true }), state)).toEqual({ type: "redo" });
  });

  it("leaves letters and digits to menus and dialogs", () => {
    const inMenu = { ...state, inOverlay: true };
    expect(resolveShortcut(press("d"), inMenu)).toBeNull();
    expect(resolveShortcut(press("1"), inMenu)).toBeNull();
    expect(resolveShortcut(press("z", { ctrlKey: true }), inMenu)).toEqual({ type: "undo" });
  });

  it("copies with Ctrl/Cmd+Shift+C", () => {
    expect(resolveShortcut(press("C", { ctrlKey: true, shiftKey: true }), state)).toEqual({ type: "copy" });
  });
});
