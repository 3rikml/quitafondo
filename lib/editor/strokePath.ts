export interface Point {
  x: number;
  y: number;
}

/** Most dabs one pointer event may add, so a huge jump can't freeze the page. */
const MAX_DABS = 200;

/**
 * Calls `dab` along the segment `from` → `to`, `spacing` apart, ending exactly
 * on `to`. Pointer events can arrive further apart than the brush is wide
 * (fast strokes, big photos shown small); a single dab per event leaves gaps.
 * Without a `from` (the first point of a stroke) it dabs once.
 */
export function forEachDabAlong(from: Point | null, to: Point, spacing: number, dab: (point: Point) => void) {
  if (!from) return dab(to);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.min(MAX_DABS, Math.max(1, Math.ceil(distance / Math.max(spacing, 1))));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    dab({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
}
