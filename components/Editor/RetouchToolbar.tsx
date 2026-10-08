"use client";

import { Bandage, Eraser, MousePointerClick, PaintbrushVertical, Sparkles, Trash2, Undo2, Wand2 } from "lucide-react";
import type { PixelBuffer } from "@/lib/image/pixelBuffer";
import { canvasPointToSource, type FitResult } from "@/lib/image/canvasFit";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/lib/i18n";

export type RetouchMode = "erase" | "restore";
/**
 * "brush": paint erase/restore strokes on the cutout. "magic": click an object
 * to remove or add it back. "eraser": paint over something in the photo and
 * let the AI fill it in.
 */
export type RetouchTool = "brush" | "magic" | "eraser";

export interface RetouchToolbarProps {
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
  tool: RetouchTool;
  onToolChange: (tool: RetouchTool) => void;
  /** Magic selection: whether a click adds the object back (vs. removing it), and its status line. */
  magic: {
    add: boolean;
    onAddChange: (add: boolean) => void;
    statusText: string | null;
    /** Candidate sizes for the last click (smallest first), when there is a choice. */
    sizes: { count: number; index: number } | null;
    onSizeChange: (index: number) => void;
  };
  /** Magic eraser actions and status. */
  eraser: {
    canErase: boolean;
    canUndo: boolean;
    busy: boolean;
    statusText: string | null;
    onErase: () => void;
    onClear: () => void;
    onUndo: () => void;
  };
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
  tool,
  onToolChange,
  magic,
  eraser,
}: RetouchToolbarProps) {
  const t = useT();
  const selectBrush = (brushMode: RetouchMode) => {
    onToolChange("brush");
    onModeChange(brushMode);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("retouch.title")}</h3>
        <Button
          size="sm"
          variant={active ? "default" : "outline"}
          onClick={() => onActiveChange(!active)}
        >
          <Wand2 className="size-4" />
          {active ? t("retouch.deactivate") : t("retouch.activate")}
        </Button>
      </div>

      {active && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              size="sm"
              variant={tool === "brush" && mode === "erase" ? "default" : "outline"}
              onClick={() => selectBrush("erase")}
            >
              <Eraser className="size-4" />
              {t("retouch.erase")}
            </Button>
            <Button
              size="sm"
              variant={tool === "brush" && mode === "restore" ? "default" : "outline"}
              onClick={() => selectBrush("restore")}
            >
              <PaintbrushVertical className="size-4" />
              {t("retouch.restore")}
            </Button>
            <Button size="sm" variant={tool === "magic" ? "default" : "outline"} onClick={() => onToolChange("magic")}>
              <Sparkles className="size-4" />
              {t("retouch.magic")}
            </Button>
            <Button size="sm" variant={tool === "eraser" ? "default" : "outline"} onClick={() => onToolChange("eraser")}>
              <Bandage className="size-4" />
              {t("retouch.eraser")}
            </Button>
          </div>

          {tool === "eraser" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">{t("eraser.hint")}</p>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t("retouch.brushSize", { value: brushSize })}</span>
                <Slider
                  min={4}
                  max={120}
                  step={1}
                  value={[brushSize]}
                  aria-label={t("shortcut.brushSize")}
                  onValueChange={(values) => onBrushSizeChange(Array.isArray(values) ? values[0] : (values as number))}
                />
              </div>
              <Button size="sm" onClick={eraser.onErase} disabled={!eraser.canErase || eraser.busy}>
                <Bandage />
                {t("eraser.apply")}
              </Button>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant="ghost" onClick={eraser.onClear} disabled={!eraser.canErase || eraser.busy}>
                  <Trash2 />
                  {t("eraser.clear")}
                </Button>
                <Button size="sm" variant="ghost" onClick={eraser.onUndo} disabled={!eraser.canUndo || eraser.busy}>
                  <Undo2 />
                  {t("eraser.undo")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {eraser.statusText ?? t("eraser.firstUse")}
              </p>
            </div>
          )}

          {tool === "magic" && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant={!magic.add ? "secondary" : "ghost"} onClick={() => magic.onAddChange(false)}>
                  {t("retouch.magicRemove")}
                </Button>
                <Button size="sm" variant={magic.add ? "secondary" : "ghost"} onClick={() => magic.onAddChange(true)}>
                  {t("retouch.magicAdd")}
                </Button>
              </div>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <MousePointerClick className="mt-0.5 size-3.5 shrink-0" />
                {t(magic.add ? "retouch.magicHintAdd" : "retouch.magicHintRemove")}
              </p>
              {magic.sizes && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{t("retouch.selectionSize")}</span>
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${magic.sizes.count}, 1fr)` }}>
                    {(magic.sizes.count === 2
                      ? [t("retouch.size.small"), t("retouch.size.large")]
                      : [t("retouch.size.small"), t("retouch.size.medium"), t("retouch.size.large")]
                    ).map(
                      (label, index) => (
                        <Button
                          key={label}
                          size="sm"
                          variant={magic.sizes?.index === index ? "secondary" : "outline"}
                          aria-pressed={magic.sizes?.index === index}
                          onClick={() => magic.onSizeChange(index)}
                        >
                          {label}
                        </Button>
                      )
                    )}
                  </div>
                </div>
              )}
              {magic.statusText && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {magic.statusText}
                </p>
              )}
            </div>
          )}

          {tool === "brush" && (
            <>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {t("retouch.brushSize", { value: brushSize })}
              </span>
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
                <span className="text-xs text-muted-foreground">
                  {t("retouch.hardness", { value: Math.round(hardness * 100) })}
                </span>
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
                {t("retouch.smart")}
              </Label>
              <Switch
                id="smart-retouch"
                checked={smart}
                onCheckedChange={onSmartChange}
              />
            </div>
            {smart && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {t("retouch.sensitivity", { value: tolerance })}
                </span>
                <Slider
                  min={1}
                  max={100}
                  step={1}
                  value={[tolerance]}
                  onValueChange={(values) => {
                    const t = Array.isArray(values) ? values[0] : values;
                    onToleranceChange(t);
                  }}
                />
              </div>
            )}
            </>
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
 * pixel coordinates: first from CSS pixels to canvas pixels (the canvas is
 * displayed scaled), then through the inverse of the fit `EditorCanvas` drew
 * the subject with (see `canvasPointToSource`).
 */
export function canvasToSourceCoords(
  canvas: HTMLCanvasElement,
  fit: FitResult,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const canvasX = (clientX - rect.left) * (canvas.width / rect.width);
  const canvasY = (clientY - rect.top) * (canvas.height / rect.height);
  return canvasPointToSource(canvasX, canvasY, fit);
}
