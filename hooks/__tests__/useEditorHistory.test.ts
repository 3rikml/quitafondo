// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { DEFAULT_BACKGROUND, DEFAULT_CANVAS, DEFAULT_EXPORT, type ImageJob } from "@/lib/types";
import { useEditorHistory } from "../useEditorHistory";

const job = (offsetX: number): ImageJob => ({
  id: "j1",
  fileName: "a.png",
  originalUrl: "blob:a",
  status: "done",
  background: DEFAULT_BACKGROUND,
  canvas: { ...DEFAULT_CANVAS, offsetX },
  exportConfig: DEFAULT_EXPORT,
});

function setup() {
  const overrides = { current: new Map<string, Int16Array>() };
  const updateJob = vi.fn();
  const redraw = vi.fn();
  let current = job(0);
  const hook = renderHook(() => useEditorHistory(current, updateJob, overrides, redraw));
  return { hook, overrides, updateJob, redraw, setJob: (j: ImageJob) => { current = j; hook.rerender(); } };
}

describe("useEditorHistory", () => {
  it("starts with nothing to undo or redo", () => {
    const { hook } = setup();
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(false);
  });

  it("undoes to the recorded state and redoes forward", () => {
    const { hook, updateJob, setJob } = setup();
    const before = hook.result.current.snapshot(job(0));
    act(() => hook.result.current.record("j1", before));
    setJob(job(40));
    expect(hook.result.current.canUndo).toBe(true);

    act(() => hook.result.current.undo());
    expect(updateJob).toHaveBeenLastCalledWith("j1", { canvas: before.canvas });
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(true);

    act(() => hook.result.current.redo());
    expect(updateJob).toHaveBeenLastCalledWith("j1", { canvas: expect.objectContaining({ offsetX: 40 }) });
  });

  it("restores the retouch mask into the existing buffer", () => {
    const { hook, overrides } = setup();
    const buffer = new Int16Array([5, 5, 5]);
    overrides.current.set("j1", buffer);
    const before = hook.result.current.snapshot(job(0));
    buffer.set([9, 9, 9]);
    act(() => hook.result.current.record("j1", before));
    act(() => hook.result.current.undo());
    expect(overrides.current.get("j1")).toBe(buffer);
    expect(Array.from(buffer)).toEqual([5, 5, 5]);
  });

  it("a new edit clears the redo stack", () => {
    const { hook } = setup();
    const before = hook.result.current.snapshot(job(0));
    act(() => hook.result.current.record("j1", before));
    act(() => hook.result.current.undo());
    expect(hook.result.current.canRedo).toBe(true);
    act(() => hook.result.current.record("j1", before));
    expect(hook.result.current.canRedo).toBe(false);
  });

  it("keeps at most 20 steps per job", () => {
    const { hook } = setup();
    const before = hook.result.current.snapshot(job(0));
    for (let i = 0; i < 25; i++) act(() => hook.result.current.record("j1", before));
    let undone = 0;
    while (hook.result.current.canUndo) {
      act(() => hook.result.current.undo());
      undone++;
    }
    expect(undone).toBe(20);
  });
});
