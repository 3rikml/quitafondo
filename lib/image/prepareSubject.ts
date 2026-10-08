import type { CanvasConfig } from "../types";
import { applyAdjustments } from "./colorAdjust";
import { refineCutout } from "./edgeRefine";
import type { PixelBuffer } from "./pixelBuffer";

/**
 * Everything applied to the model's cutout before manual retouch, shared by
 * the editor and the exporters so previews and downloads match:
 * 1. edge refinement (uses the untouched original to remove color halos),
 * 2. light/color adjustments.
 * `restoreSource` is the original photo with the same adjustments, so pixels a
 * "Restaurar" stroke brings back match the adjusted subject around them.
 */
export function prepareSubject(
  cutout: PixelBuffer,
  original: PixelBuffer | null,
  config: Pick<CanvasConfig, "edge" | "adjust">
): { cutout: PixelBuffer; restoreSource: PixelBuffer | null } {
  const refined = refineCutout(cutout, original, config.edge);
  return {
    cutout: applyAdjustments(refined, config.adjust),
    restoreSource: original ? applyAdjustments(original, config.adjust) : null,
  };
}
