"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clampZoom, wheelZoomFactor, zoomAt, type Viewport } from "@/lib/editor/viewport";

const FIT: Viewport = { zoom: 1, panX: 0, panY: 0 };

/**
 * Zoom and pan of the editor's stage, Figma-style:
 * - Ctrl/⌘ + wheel or a trackpad pinch zooms toward the pointer;
 * - the wheel / two-finger scroll pans;
 * - Space + drag, or the middle mouse button, pans;
 * - a two-finger pinch on touch screens zooms and pans.
 *
 * Listeners are native and in the capture phase, so a pan or pinch never
 * reaches the canvas's own handlers (painting, dragging the subject).
 * `onGestureInterrupted` ends whatever one-finger gesture a pinch cut short.
 */
export function useStageNavigation(stage: HTMLElement | null, onGestureInterrupted: () => void) {
  const [view, setView] = useState<Viewport>(FIT);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const viewRef = useRef(view);
  const spaceRef = useRef(false);
  const interruptRef = useRef(onGestureInterrupted);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    interruptRef.current = onGestureInterrupted;
  }, [onGestureInterrupted]);

  // Space held = pan mode. Left alone on controls, where Space presses them.
  useEffect(() => {
    const isControl = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.closest("input, textarea, select, button, a, [role], [contenteditable]") !== null;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isControl(e.target)) return;
      e.preventDefault(); // no page scroll, no "click" on a focused button
      if (!spaceRef.current) {
        spaceRef.current = true;
        setSpaceHeld(true);
      }
    };
    const release = () => {
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
    };
  }, []);

  useEffect(() => {
    if (!stage) return;
    const center = () => {
      const rect = stage.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = center();
      const current = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinches arrive as ctrl + wheel too.
        setView(zoomAt(current, current.zoom * wheelZoomFactor(e.deltaY), e.clientX - c.x, e.clientY - c.y));
      } else {
        const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
        setView({ ...current, panX: current.panX - dx, panY: current.panY - dy });
      }
    };

    // Mouse/pen pan: Space + drag, or the middle button.
    let drag: { id: number; x: number; y: number; panX: number; panY: number } | null = null;
    // Touch: up to two fingers; two start a pinch.
    const touches = new Map<number, { x: number; y: number }>();
    let pinch: { distance: number; midX: number; midY: number; view: Viewport } | null = null;
    const pinchGeometry = () => {
      const [a, b] = [...touches.values()];
      const c = center();
      return {
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        midX: (a.x + b.x) / 2 - c.x,
        midY: (a.y + b.y) / 2 - c.y,
      };
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          interruptRef.current();
          pinch = { ...pinchGeometry(), view: viewRef.current };
          e.stopPropagation();
        }
        return;
      }
      if (!spaceRef.current && e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, panX: viewRef.current.panX, panY: viewRef.current.panY };
      stage.setPointerCapture(e.pointerId);
      setPanning(true);
    };

    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch" && touches.has(e.pointerId)) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && touches.size >= 2) {
          e.stopPropagation();
          const now = pinchGeometry();
          const zoomed = zoomAt(pinch.view, clampZoom(pinch.view.zoom * (now.distance / pinch.distance)), pinch.midX, pinch.midY);
          setView({ ...zoomed, panX: zoomed.panX + now.midX - pinch.midX, panY: zoomed.panY + now.midY - pinch.midY });
        }
        return;
      }
      if (!drag || e.pointerId !== drag.id) return;
      e.stopPropagation();
      setView({ ...viewRef.current, panX: drag.panX + e.clientX - drag.x, panY: drag.panY + e.clientY - drag.y });
    };

    const up = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        touches.delete(e.pointerId);
        if (pinch) {
          e.stopPropagation();
          if (touches.size < 2) pinch = null;
        }
        return;
      }
      if (!drag || e.pointerId !== drag.id) return;
      e.stopPropagation();
      if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      drag = null;
      setPanning(false);
    };

    stage.addEventListener("wheel", wheel, { passive: false });
    stage.addEventListener("pointerdown", down, true);
    stage.addEventListener("pointermove", move, true);
    stage.addEventListener("pointerup", up, true);
    stage.addEventListener("pointercancel", up, true);
    return () => {
      stage.removeEventListener("wheel", wheel);
      stage.removeEventListener("pointerdown", down, true);
      stage.removeEventListener("pointermove", move, true);
      stage.removeEventListener("pointerup", up, true);
      stage.removeEventListener("pointercancel", up, true);
    };
  }, [stage]);

  /** Zooms around the stage's center (for the zoom buttons). */
  const setZoom = useCallback((zoom: number) => setView((current) => zoomAt(current, zoom, 0, 0)), []);
  const fit = useCallback(() => setView(FIT), []);

  return { view, setZoom, fit, spaceHeld, panning };
}
