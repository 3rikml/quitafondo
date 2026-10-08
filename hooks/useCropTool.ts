"use client";

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { ImageJob } from "@/lib/types";
import { clampCropBox, type BoundingBox } from "@/lib/image/boundingBox";
import {
  boxToPercentRect,
  canvasPixelsPerCssPixel,
  dragCropBox,
  type CornerKey,
  type HandleRectPercent,
} from "@/lib/editor/handles";
import type { EditorCanvasHandle } from "@/components/Editor/EditorCanvas";
import type { HistoryEntry } from "@/hooks/useEditorHistory";

interface CropToolDeps {
  selectedJob: ImageJob | null;
  updateJob: (id: string, patch: Partial<ImageJob>) => void;
  canvasHandleRef: RefObject<EditorCanvasHandle | null>;
  canvasWrapperRef: RefObject<HTMLDivElement | null>;
  /** Bumped after every EditorCanvas render, so the overlay follows the real layout. */
  canvasRenderTick: number;
  history: {
    snapshot: (job: ImageJob) => HistoryEntry;
    record: (jobId: string, before: HistoryEntry) => void;
  };
}

/**
 * The crop tool: a draggable rectangle (source-image pixels) that is only
 * written to `canvas.cropBox` when the user applies it.
 */
export function useCropTool({
  selectedJob,
  updateJob,
  canvasHandleRef,
  canvasWrapperRef,
  canvasRenderTick,
  history,
}: CropToolDeps) {
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState<BoundingBox | null>(null);
  const [handleRect, setHandleRect] = useState<HandleRectPercent | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    mode: "move" | CornerKey;
    clientX: number;
    clientY: number;
    startBox: BoundingBox;
  } | null>(null);

  // Switching images mid-crop would otherwise keep editing a rectangle that
  // belongs to the previous job ("adjust state during render", no effect).
  const jobId = selectedJob?.id ?? null;
  const [lastJobId, setLastJobId] = useState(jobId);
  if (jobId !== lastJobId) {
    setLastJobId(jobId);
    setActive(false);
    setDraft(null);
  }

  // Positions the overlay on the draft rectangle, measured against the real
  // DOM canvas (hence an effect rather than a render-time computation).
  useEffect(() => {
    const canvas = canvasWrapperRef.current?.querySelector("canvas");
    const fit = canvasHandleRef.current?.getFit();
    if (!active || !draft || !canvas || !fit || canvas.width === 0 || canvas.height === 0) {
      setHandleRect(null);
      return;
    }
    setHandleRect(boxToPercentRect(draft, fit, canvas.width, canvas.height));
  }, [active, draft, canvasRenderTick, canvasHandleRef, canvasWrapperRef]);

  function autoDetectedBox(): BoundingBox | null {
    const handle = canvasHandleRef.current;
    const sourceSize = handle?.getSourceSize();
    return handle?.getSubjectBox() ?? (sourceSize ? { x: 0, y: 0, width: sourceSize.width, height: sourceSize.height } : null);
  }

  /** Seeds the rectangle from an existing crop (to keep refining it), else the detected subject. */
  function start() {
    if (!selectedJob) return;
    const box = selectedJob.canvas.cropBox ?? autoDetectedBox();
    if (!box) return;
    setDraft(box);
    setActive(true);
  }

  /** Back to auto-detection, without leaving the tool or touching the applied crop. */
  function resetDraft() {
    const box = autoDetectedBox();
    if (box) setDraft(box);
  }

  function cancel() {
    setActive(false);
    setDraft(null);
    dragRef.current = null;
  }

  function commit(nextCropBox: BoundingBox | null) {
    if (!selectedJob) return;
    const before = history.snapshot(selectedJob);
    updateJob(selectedJob.id, { canvas: { ...selectedJob.canvas, cropBox: nextCropBox } });
    history.record(selectedJob.id, before);
  }

  function apply() {
    if (!draft) return;
    commit(draft);
    setActive(false);
    setDraft(null);
  }

  /** Removes an applied crop (only reachable outside the tool, see `CanvasSizePanel`). */
  function clear() {
    commit(null);
  }

  function dragStart(mode: "move" | CornerKey) {
    return (e: PointerEvent<HTMLElement>) => {
      e.stopPropagation();
      if (!draft) return;
      dragRef.current = { pointerId: e.pointerId, mode, clientX: e.clientX, clientY: e.clientY, startBox: draft };
      e.currentTarget.setPointerCapture(e.pointerId);
    };
  }

  function dragMove(e: PointerEvent<HTMLElement>) {
    e.stopPropagation();
    const drag = dragRef.current;
    const sourceSize = canvasHandleRef.current?.getSourceSize();
    const fit = canvasHandleRef.current?.getFit();
    const canvas = canvasWrapperRef.current?.querySelector("canvas");
    const ratio = canvas ? canvasPixelsPerCssPixel(canvas) : null;
    if (!drag || !sourceSize || !fit || !ratio) return;
    // Screen delta -> canvas pixels -> source pixels (crop coords are pre-scale).
    const deltaX = ((e.clientX - drag.clientX) * ratio.x) / fit.scale;
    const deltaY = ((e.clientY - drag.clientY) * ratio.y) / fit.scale;
    setDraft(clampCropBox(dragCropBox(drag.startBox, drag.mode, deltaX, deltaY), sourceSize.width, sourceSize.height));
  }

  function dragEnd(e: PointerEvent<HTMLElement>) {
    e.stopPropagation();
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag) e.currentTarget.releasePointerCapture(drag.pointerId);
  }

  return {
    active,
    handleRect,
    start,
    resetDraft,
    cancel,
    apply,
    clear,
    overlayHandlers: { dragStart, dragMove, dragEnd },
  };
}
