"use client";

import { useRef, type PointerEvent, type RefObject } from "react";
import type { ImageJob } from "@/lib/types";
import { flipMagicMode } from "@/lib/ai/samMask";
import { canvasToSourceCoords } from "@/components/Editor/RetouchToolbar";
import type { EditorCanvasHandle } from "@/components/Editor/EditorCanvas";
import type { HistoryEntry, useEditorHistory } from "./useEditorHistory";
import type { useRetouch } from "./useRetouch";
import type { useMagicEraser } from "./useMagicEraser";
import type { useMagicSelect } from "./useMagicSelect";
import type { useSubjectTransform } from "./useSubjectTransform";

interface CanvasGesturesDeps {
  selectedJob: ImageJob | null;
  canvasHandleRef: RefObject<EditorCanvasHandle | null>;
  cropActive: boolean;
  /** A retouch tool is open (brush, magic selection or eraser). */
  retouchActive: boolean;
  /** The eraser is the open retouch tool. */
  erasing: boolean;
  retouch: ReturnType<typeof useRetouch>;
  eraser: ReturnType<typeof useMagicEraser>;
  magic: ReturnType<typeof useMagicSelect>;
  history: ReturnType<typeof useEditorHistory>;
  subject: ReturnType<typeof useSubjectTransform>;
}

/**
 * What a pointer does on the canvas: paint eraser or brush strokes, click to
 * select an object, or drag the subject. A brush stroke is recorded as one
 * undo step when the pointer lifts.
 */
export function useCanvasGestures({
  selectedJob,
  canvasHandleRef,
  cropActive,
  retouchActive,
  erasing,
  retouch,
  eraser,
  magic,
  history,
  subject,
}: CanvasGesturesDeps) {
  // State right before the current brush stroke, recorded as one undo step on pointerup.
  const strokeStartRef = useRef<HistoryEntry | null>(null);
  // True while the pointer is down painting eraser strokes.
  const eraserStrokeRef = useRef(false);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (cropActive || !selectedJob) return;
    // Right/middle clicks open the context menu or pan: no stroke, no drag.
    if (e.button !== 0) return;
    const canvas = e.currentTarget.querySelector("canvas");
    if (erasing) {
      if (!canvas) return;
      eraserStrokeRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId); // the stroke ends even if released off the stage
      eraser.paintAt(canvas, e.clientX, e.clientY, retouch.toolbarProps.brushSize, true);
      return;
    }
    if (retouchActive && retouch.tool === "magic") {
      const fit = canvasHandleRef.current?.getFit();
      if (!canvas || !fit) return;
      const { x, y } = canvasToSourceCoords(canvas, fit, e.clientX, e.clientY);
      // Alt/Option flips the action, so both are one click away.
      magic.selectAt(x, y, flipMagicMode(magic.mode, e.altKey));
      return;
    }
    if (retouchActive) {
      magic.forget(); // a size change after this stroke would overwrite it
      strokeStartRef.current = history.snapshot(selectedJob);
      e.currentTarget.setPointerCapture(e.pointerId);
      if (canvas) retouch.paintAt(canvas, e.clientX, e.clientY, true);
      return;
    }
    subject.startDrag(e.clientX, e.clientY);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const canvas = e.currentTarget.querySelector("canvas");
    if (!canvas) return;
    // A button release we never saw (context menu, alt-tab) must not leave a stroke running.
    if ((eraserStrokeRef.current || strokeStartRef.current) && !(e.buttons & 1)) {
      onPointerUp();
      return;
    }
    if (erasing) {
      if (eraserStrokeRef.current) eraser.paintAt(canvas, e.clientX, e.clientY, retouch.toolbarProps.brushSize);
      return;
    }
    if (retouchActive) {
      if (strokeStartRef.current) retouch.paintAt(canvas, e.clientX, e.clientY);
      return;
    }
    subject.moveDrag(canvas, e.clientX, e.clientY);
  }

  function onPointerUp() {
    eraserStrokeRef.current = false;
    const strokeStart = strokeStartRef.current;
    strokeStartRef.current = null;
    if (strokeStart && selectedJob) history.record(selectedJob.id, strokeStart);
    subject.endDrag();
  }

  return { onPointerDown, onPointerMove, onPointerUp };
}
