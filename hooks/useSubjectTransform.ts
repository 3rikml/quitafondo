"use client";

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { ImageJob } from "@/lib/types";
import { boxToPercentRect, canvasPixelsPerCssPixel, type HandleRectPercent } from "@/lib/editor/handles";
import type { EditorCanvasHandle } from "@/components/Editor/EditorCanvas";
import type { HistoryEntry } from "@/hooks/useEditorHistory";

const MIN_MANUAL_SCALE = 0.1;
const MAX_MANUAL_SCALE = 5;

interface SubjectTransformDeps {
  selectedJob: ImageJob | null;
  updateJob: (id: string, patch: Partial<ImageJob>) => void;
  canvasHandleRef: RefObject<EditorCanvasHandle | null>;
  canvasWrapperRef: RefObject<HTMLDivElement | null>;
  canvasRenderTick: number;
  history: {
    snapshot: (job: ImageJob) => HistoryEntry;
    record: (jobId: string, before: HistoryEntry) => void;
  };
}

/**
 * Moving the subject by dragging it and resizing it from its corner handles.
 * Both read the gesture as a delta from a frozen start state, so fast pointer
 * moves never drift, and both record one undo step per gesture.
 */
export function useSubjectTransform({
  selectedJob,
  updateJob,
  canvasHandleRef,
  canvasWrapperRef,
  canvasRenderTick,
  history,
}: SubjectTransformDeps) {
  // The subject's corners on screen (pre-rotation, like the canvas fit), plus
  // the rotation to apply to the handle overlay so it wraps the rotated subject.
  const [handleRect, setHandleRect] = useState<HandleRectPercent | null>(null);
  const [handleRotation, setHandleRotation] = useState<{ deg: number; originXPct: number; originYPct: number } | null>(
    null
  );
  const dragRef = useRef<{ clientX: number; clientY: number; offsetX: number; offsetY: number; before: HistoryEntry } | null>(
    null
  );
  const resizeRef = useRef<{
    pointerId: number;
    centerClientX: number;
    centerClientY: number;
    startDistance: number;
    startScale: number;
    before: HistoryEntry;
  } | null>(null);

  // `canvasRenderTick` (not just `selectedJob`) because the cutout decodes
  // asynchronously: on a job's first selection, `selectedJob` is final before
  // EditorCanvas has drawn anything to measure.
  useEffect(() => {
    const canvas = canvasWrapperRef.current?.querySelector("canvas");
    const fit = canvasHandleRef.current?.getFit();
    const sourceSize = canvasHandleRef.current?.getSourceSize();
    const box = selectedJob?.canvas.cropBox ?? canvasHandleRef.current?.getSubjectBox();
    if (!canvas || !fit || !sourceSize || canvas.width === 0 || canvas.height === 0) {
      setHandleRect(null);
      setHandleRotation(null);
      return;
    }
    const effectiveBox = box ?? { x: 0, y: 0, width: sourceSize.width, height: sourceSize.height };
    setHandleRect(boxToPercentRect(effectiveBox, fit, canvas.width, canvas.height));
    setHandleRotation({
      deg: fit.rotationDeg,
      originXPct: (fit.anchorX / canvas.width) * 100,
      originYPct: (fit.anchorY / canvas.height) * 100,
    });
  }, [selectedJob, canvasRenderTick, canvasHandleRef, canvasWrapperRef]);

  function startDrag(clientX: number, clientY: number) {
    if (!selectedJob) return;
    dragRef.current = {
      clientX,
      clientY,
      offsetX: selectedJob.canvas.offsetX,
      offsetY: selectedJob.canvas.offsetY,
      before: history.snapshot(selectedJob),
    };
  }

  /** Converts the pointer's movement since the drag began into canvas pixels and adds it to the start offset. */
  function moveDrag(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const start = dragRef.current;
    const ratio = canvasPixelsPerCssPixel(canvas);
    if (!start || !selectedJob || !ratio) return;
    updateJob(selectedJob.id, {
      canvas: {
        ...selectedJob.canvas,
        offsetX: start.offsetX + (clientX - start.clientX) * ratio.x,
        offsetY: start.offsetY + (clientY - start.clientY) * ratio.y,
      },
    });
  }

  function endDrag() {
    const start = dragRef.current;
    dragRef.current = null;
    if (start && selectedJob) history.record(selectedJob.id, start.before);
  }

  /**
   * Corner handles scale around the subject's on-screen center: dragging a
   * corner twice as far from the center as where it started doubles the scale.
   */
  function resizeStart(e: PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!selectedJob) return;
    const canvas = canvasWrapperRef.current?.querySelector("canvas");
    const fit = canvasHandleRef.current?.getFit();
    const sourceSize = canvasHandleRef.current?.getSourceSize();
    if (!canvas || !fit || !sourceSize) return;

    const box = canvasHandleRef.current?.getSubjectBox() ?? { x: 0, y: 0, width: sourceSize.width, height: sourceSize.height };
    const centerCanvasX = fit.offsetX + (box.x + box.width / 2) * fit.scale;
    const centerCanvasY = fit.offsetY + (box.y + box.height / 2) * fit.scale;
    const rect = canvas.getBoundingClientRect();
    const centerClientX = rect.left + (centerCanvasX / canvas.width) * rect.width;
    const centerClientY = rect.top + (centerCanvasY / canvas.height) * rect.height;

    resizeRef.current = {
      pointerId: e.pointerId,
      centerClientX,
      centerClientY,
      startDistance: Math.hypot(e.clientX - centerClientX, e.clientY - centerClientY) || 1,
      startScale: selectedJob.canvas.manualScale,
      before: history.snapshot(selectedJob),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function resizeMove(e: PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const start = resizeRef.current;
    if (!start || !selectedJob) return;
    const distance = Math.hypot(e.clientX - start.centerClientX, e.clientY - start.centerClientY);
    const manualScale = Math.min(
      MAX_MANUAL_SCALE,
      Math.max(MIN_MANUAL_SCALE, start.startScale * (distance / start.startDistance))
    );
    updateJob(selectedJob.id, { canvas: { ...selectedJob.canvas, manualScale } });
  }

  function resizeEnd(e: PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const start = resizeRef.current;
    resizeRef.current = null;
    if (!start || !selectedJob) return;
    e.currentTarget.releasePointerCapture(start.pointerId);
    history.record(selectedJob.id, start.before);
  }

  return {
    handleRect,
    handleRotation,
    startDrag,
    moveDrag,
    endDrag,
    resizeHandlers: { resizeStart, resizeMove, resizeEnd },
  };
}
