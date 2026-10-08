"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";

export type BrushCursorVariant = "erase" | "restore" | "eraser";

interface BrushCursorProps {
  /** The area where the brush can paint; the cursor shows while the pointer is over it. */
  areaRef: RefObject<HTMLElement | null>;
  /** Brush radius in on-screen pixels, read on every move (it depends on fit and zoom). */
  getScreenRadius: () => number | null;
  variant: BrushCursorVariant;
}

const VARIANT_CLASS: Record<BrushCursorVariant, string> = {
  erase: "border-red-400 bg-red-400/10",
  restore: "border-emerald-400 bg-emerald-400/10",
  eraser: "border-red-400 bg-red-500/30",
};

/**
 * A circle that follows the pointer with the brush's real size, so you see
 * what a stroke will cover before painting. It listens to the pointer
 * itself and is the only thing that re-renders on every move.
 */
export function BrushCursor({ areaRef, getScreenRadius, variant }: BrushCursorProps) {
  const [position, setPosition] = useState<{ x: number; y: number; radius: number } | null>(null);
  // Keep the latest radius reader without re-binding the listeners.
  const getRadiusRef = useRef(getScreenRadius);
  useEffect(() => {
    getRadiusRef.current = getScreenRadius;
  }, [getScreenRadius]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const move = (event: PointerEvent) => {
      // A pen or finger has no hover: the circle would only lag behind the stroke.
      if (event.pointerType === "touch") return;
      const radius = getRadiusRef.current();
      setPosition(radius ? { x: event.clientX, y: event.clientY, radius } : null);
    };
    const leave = () => setPosition(null);
    area.addEventListener("pointermove", move);
    area.addEventListener("pointerleave", leave);
    return () => {
      area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerleave", leave);
    };
  }, [areaRef]);

  if (!position) return null;
  const size = position.radius * 2;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed z-40 rounded-full border-2 shadow-[0_0_0_1px_rgb(0_0_0/0.45)]",
        VARIANT_CLASS[variant]
      )}
      style={{ left: position.x - position.radius, top: position.y - position.radius, width: size, height: size }}
    >
      <span className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]" />
    </div>
  );
}
