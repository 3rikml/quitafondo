"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createOverrideBuffer } from "@/lib/image/alphaCompose";
import {
  canvasToSourceCoords,
  createSmartBrushScratch,
  paintBrushStroke,
  paintSmartBrushStroke,
  type RetouchMode,
  type RetouchTool,
} from "@/components/Editor/RetouchToolbar";
import type { EditorCanvasHandle } from "@/components/Editor/EditorCanvas";

/**
 * Brush state and the per-job alpha override buffers the brush paints into.
 * The buffers live here, keyed by job id, so switching to another image and
 * back keeps that image's strokes.
 */
export function useRetouch(selectedJobId: string | null, canvasHandleRef: RefObject<EditorCanvasHandle | null>) {
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<RetouchMode>("erase");
  const [tool, setTool] = useState<RetouchTool>("brush");
  const [brushSize, setBrushSize] = useState(24);
  const [hardness, setHardness] = useState(1);
  const [smart, setSmart] = useState(false);
  const [tolerance, setTolerance] = useState(30);
  /** Bumped once per animation frame while painting, to make EditorCanvas recomposite. */
  const [version, setVersion] = useState(0);

  const overridesByJobIdRef = useRef<Map<string, Int16Array>>(new Map());
  // One flood-fill workspace is enough even across jobs: it self-resizes to
  // the current pixel count and is fully reset after every dab.
  const smartScratchRef = useRef(createSmartBrushScratch(0));
  const rafRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  /** Hands EditorCanvas this job's buffer, creating it only if the job was never retouched. */
  const getOverrideBuffer = useCallback(
    (pixelCount: number) => {
      if (!selectedJobId) return createOverrideBuffer(pixelCount);
      const existing = overridesByJobIdRef.current.get(selectedJobId);
      if (existing && existing.length === pixelCount) return existing;
      const created = createOverrideBuffer(pixelCount);
      overridesByJobIdRef.current.set(selectedJobId, created);
      return created;
    },
    [selectedJobId]
  );

  /**
   * Pointer events fire far more often than the display refreshes, and every
   * bump recomposites the whole image. Collapsing the bumps into one per
   * animation frame caps that cost at the refresh rate while keeping the
   * stroke visually live.
   */
  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setVersion((v) => v + 1);
    });
  }, []);

  function paintAt(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const handle = canvasHandleRef.current;
    const fit = handle?.getFit();
    const sourceSize = handle?.getSourceSize();
    const overrides = selectedJobId ? overridesByJobIdRef.current.get(selectedJobId) : undefined;
    if (!handle || !overrides || !fit || !sourceSize) return;

    const { x, y } = canvasToSourceCoords(canvas, fit, clientX, clientY);
    const sourcePixels = smart ? handle.getSourcePixels() : null;
    if (smart && sourcePixels) {
      paintSmartBrushStroke(overrides, sourcePixels, x, y, brushSize, mode, tolerance, smartScratchRef.current);
    } else {
      paintBrushStroke(overrides, sourceSize.width, sourceSize.height, x, y, brushSize, mode, hardness);
    }
    scheduleRedraw();
  }

  return {
    active,
    setActive,
    tool,
    version,
    overridesByJobIdRef,
    getOverrideBuffer,
    scheduleRedraw,
    paintAt,
    /** Props for `<RetouchToolbar>`. */
    toolbarProps: {
      active,
      onActiveChange: setActive,
      mode,
      onModeChange: setMode,
      brushSize,
      onBrushSizeChange: setBrushSize,
      hardness,
      onHardnessChange: setHardness,
      smart,
      onSmartChange: setSmart,
      tolerance,
      onToleranceChange: setTolerance,
      tool,
      onToolChange: setTool,
    },
  };
}
