/**
 * The stage's view transform: `translate(pan) scale(zoom)` around the
 * stage's center. Points are relative to that center, in screen pixels.
 */
export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;

export const clampZoom = (zoom: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

/**
 * Zooms to `nextZoom` keeping the content under `point` exactly where it is,
 * so zooming with the wheel or a pinch heads toward the pointer. A content
 * point c is drawn at pan + c·zoom; solving for the pan that keeps it at
 * `point` gives pan' = point − (point − pan)·nextZoom/zoom.
 */
export function zoomAt(view: Viewport, nextZoom: number, pointX: number, pointY: number): Viewport {
  const zoom = clampZoom(nextZoom);
  const ratio = zoom / view.zoom;
  return {
    zoom,
    panX: pointX - (pointX - view.panX) * ratio,
    panY: pointY - (pointY - view.panY) * ratio,
  };
}

/** Wheel delta (pixels) to a zoom factor: smooth for trackpads, ~10% per mouse notch. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0015);
}

/**
 * On-screen size of a `width`×`height` image shown whole inside a
 * `maxWidth`×`maxHeight` area: shrunk to fit, never enlarged past 100%.
 */
export function containSize(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}
