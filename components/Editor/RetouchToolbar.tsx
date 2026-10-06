"use client";

import { Eraser, PaintbrushVertical, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { PixelBuffer } from "@/lib/image/pixelBuffer";

export type RetouchMode = "erase" | "restore";

interface RetouchToolbarProps {
  active: boolean;
  onActiveChange: (active: boolean) => void;
  mode: RetouchMode;
  onModeChange: (mode: RetouchMode) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  hardness: number;
  onHardnessChange: (hardness: number) => void;
  /** "Varita mágica": instead of painting a plain circle, each dab flood-fills
   * outward from the pointer, staying within color/alpha similarity of the
   * pixel clicked — so one dab clears (or restores) a whole similarly-colored
   * patch instead of a hard-edged disc, without spilling onto the subject. */
  smart: boolean;
  onSmartChange: (smart: boolean) => void;
  /** 0-100: how different a neighboring pixel's color/alpha may be from the
   * seed pixel and still be included in the flood fill. */
  tolerance: number;
  onToleranceChange: (tolerance: number) => void;
}

export function RetouchToolbar({
  active,
  onActiveChange,
  mode,
  onModeChange,
  brushSize,
  onBrushSizeChange,
  hardness,
  onHardnessChange,
  smart,
  onSmartChange,
  tolerance,
  onToleranceChange,
}: RetouchToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Retoque manual</h3>
        <Button size="sm" variant={active ? "default" : "outline"} onClick={() => onActiveChange(!active)}>
          <Wand2 />
          {active ? "Retocando" : "Activar"}
        </Button>
      </div>

      {active && (
        <>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === "erase" ? "default" : "outline"}
              onClick={() => onModeChange("erase")}
              className="flex-1"
            >
              <Eraser />
              Borrar
            </Button>
            <Button
              size="sm"
              variant={mode === "restore" ? "default" : "outline"}
              onClick={() => onModeChange("restore")}
              className="flex-1"
            >
              <PaintbrushVertical />
              Restaurar
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Tamaño de pincel ({brushSize}px)</span>
            <Slider
              min={4}
              max={120}
              step={1}
              value={[brushSize]}
              onValueChange={(values) => {
                const size = Array.isArray(values) ? values[0] : values;
                onBrushSizeChange(size);
              }}
            />
          </div>
          {!smart && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Dureza del pincel ({Math.round(hardness * 100)}%)</span>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[Math.round(hardness * 100)]}
                onValueChange={(values) => {
                  const percent = Array.isArray(values) ? values[0] : values;
                  onHardnessChange(percent / 100);
                }}
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label htmlFor="smart-retouch" className="text-xs text-muted-foreground">
              Detección automática de bordes
            </Label>
            <Switch id="smart-retouch" checked={smart} onCheckedChange={onSmartChange} />
          </div>
          {smart && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Sensibilidad ({tolerance}%)</span>
              <Slider
                min={1}
                max={100}
                step={1}
                value={[tolerance]}
                onValueChange={(values) => {
                  const value = Array.isArray(values) ? values[0] : values;
                  onToleranceChange(value);
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Paints a circular brush stroke directly into an override buffer.
 * `mode === "erase"` forces alpha toward 0; `mode === "restore"` forces alpha
 * toward 255. Restore deliberately does NOT fall back to the model's alpha: in
 * exactly the places a user wants to recover (hair, fingers the model
 * over-erased) the model's alpha is already 0, so falling back would undo
 * nothing. Forcing full opacity recovers those subject pixels — `EditorCanvas`
 * separately recovers their real RGB from the original photo (see
 * `lib/image/restoreRgb.ts`), since the cutout's own RGB is unusable there.
 *
 * `hardness` (0-1) controls the edge: `1` is the original hard-edged circle
 * (every pixel inside the radius gets the full target value). Below 1, pixels
 * between `radius * hardness` and `radius` blend toward the target instead of
 * snapping to it, producing a feathered edge. The blend target at the rim is
 * the *opposite* extreme of the stroke's own target (erase fades toward fully
 * visible, restore fades toward fully erased) — the model's actual alpha
 * isn't known here without also threading it through, and fading toward the
 * opposite extreme is what "soft brush" means in most paint tools anyway.
 */
export function paintBrushStroke(
  overrideAlpha: Int16Array,
  bufferWidth: number,
  bufferHeight: number,
  centerX: number,
  centerY: number,
  radius: number,
  mode: RetouchMode,
  hardness = 1
) {
  const clampedHardness = Math.min(Math.max(hardness, 0), 1);
  const target = mode === "erase" ? 0 : 255;
  const rimTarget = mode === "erase" ? 255 : 0;
  const falloffStart = radius * clampedHardness;

  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(bufferWidth - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(bufferHeight - 1, Math.ceil(centerY + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      const index = y * bufferWidth + x;
      if (dist <= falloffStart) {
        overrideAlpha[index] = target;
      } else {
        const t = (radius - dist) / (radius - falloffStart); // 1 at falloffStart, 0 at radius
        overrideAlpha[index] = Math.round(target * t + rimTarget * (1 - t));
      }
    }
  }
}

/**
 * Reusable workspace for `paintSmartBrushStroke`'s flood fill, so each dab
 * doesn't allocate a full-image-sized buffer. Call `forSize` once per paint
 * session (it only reallocates when the pixel count actually changes, e.g.
 * on switching jobs).
 */
export interface SmartBrushScratch {
  visited: Uint8Array;
}

export function createSmartBrushScratch(pixelCount: number): SmartBrushScratch {
  return { visited: new Uint8Array(pixelCount) };
}

function ensureScratchSize(scratch: SmartBrushScratch, pixelCount: number): Uint8Array {
  if (scratch.visited.length !== pixelCount) scratch.visited = new Uint8Array(pixelCount);
  return scratch.visited;
}

/**
 * The "varita mágica" brush: flood-fills outward from `(centerX, centerY)`
 * (clamped to `radius`) through pixels whose RGBA is close enough to the
 * clicked pixel's own color — rather than painting every pixel inside a plain
 * circle. One dab near a ragged, semi-transparent edge therefore clears (or
 * restores) that whole similarly-colored fringe without also grabbing
 * dissimilar pixels (e.g. the subject itself) just because they fall inside
 * the brush radius.
 *
 * `sourcePixels` is the model's own RGBA output (unaffected by prior
 * overrides) — flood-filling against the *current* overridden alpha would let
 * an earlier erase/restore stroke's edge leak into this one's similarity
 * test. `tolerance` (0-100) is a percentage of the maximum possible per-pixel
 * RGBA distance (510, i.e. two 255-magnitude channel deltas); higher spreads
 * further into less-similar neighboring pixels.
 */
export function paintSmartBrushStroke(
  overrideAlpha: Int16Array,
  sourcePixels: PixelBuffer,
  centerX: number,
  centerY: number,
  radius: number,
  mode: RetouchMode,
  tolerance: number,
  scratch: SmartBrushScratch
) {
  const { width, height, data } = sourcePixels;
  const pixelCount = width * height;
  const visited = ensureScratchSize(scratch, pixelCount);

  const seedX = Math.round(centerX);
  const seedY = Math.round(centerY);
  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return;

  const seedIndex = seedY * width + seedX;
  const seedOffset = seedIndex * 4;
  const seedR = data[seedOffset];
  const seedG = data[seedOffset + 1];
  const seedB = data[seedOffset + 2];
  const seedA = data[seedOffset + 3];

  const target = mode === "erase" ? 0 : 255;
  const radiusSq = radius * radius;
  const maxDist = (Math.min(Math.max(tolerance, 0), 100) / 100) * 510;

  const stack: number[] = [seedIndex];
  const visitedList: number[] = [seedIndex];
  visited[seedIndex] = 1;

  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % width;
    const y = (index / width) | 0;

    const dx = x - seedX;
    const dy = y - seedY;
    if (dx * dx + dy * dy > radiusSq) continue;

    const offset = index * 4;
    const dr = data[offset] - seedR;
    const dg = data[offset + 1] - seedG;
    const db = data[offset + 2] - seedB;
    const da = data[offset + 3] - seedA;
    if (Math.sqrt(dr * dr + dg * dg + db * db + da * da) > maxDist) continue;

    overrideAlpha[index] = target;

    if (x > 0) pushNeighbor(index - 1);
    if (x < width - 1) pushNeighbor(index + 1);
    if (y > 0) pushNeighbor(index - width);
    if (y < height - 1) pushNeighbor(index + width);
  }

  function pushNeighbor(neighborIndex: number) {
    if (visited[neighborIndex]) return;
    visited[neighborIndex] = 1;
    visitedList.push(neighborIndex);
    stack.push(neighborIndex);
  }

  // Reset only the pixels this call touched, so the scratch buffer is clean
  // for the next dab without clearing (and re-zeroing the cost of) the whole
  // image every time.
  for (const index of visitedList) visited[index] = 0;
}

/**
 * Converts a pointer event's client (viewport) coordinates into source-image
 * pixel coordinates, accounting for the canvas's on-screen scaling (CSS size
 * vs. `canvas.width`/`height`) AND the fit transform `EditorCanvas` applied
 * when drawing the source image (see `EditorCanvasHandle.getFit()`). Plain
 * function, not a hook: callers already have `fit` fresh from a ref read at
 * event time, so no memoization/dependency tracking is needed.
 */
export function canvasToSourceCoords(
  canvas: HTMLCanvasElement,
  fit: { scale: number; offsetX: number; offsetY: number },
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const canvasX = ((clientX - rect.left) / rect.width) * canvas.width;
  const canvasY = ((clientY - rect.top) / rect.height) * canvas.height;
  const sourceX = (canvasX - fit.offsetX) / fit.scale;
  const sourceY = (canvasY - fit.offsetY) / fit.scale;
  return { x: sourceX, y: sourceY };
}
