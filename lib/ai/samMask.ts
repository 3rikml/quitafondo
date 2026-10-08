/**
 * SAM answers every prompt with 3 candidate masks at different granularities
 * (e.g. a wheel's rim, the wheel, the whole car) plus a predicted IoU score
 * for each. The most confident one is not always the object the user meant,
 * so all non-empty candidates are kept — converted from the post-processed
 * boolean tensor (0/1, `[candidates, height, width]` order) to 0/255 masks
 * and sorted from smallest to largest — along with the index of the most
 * confident one.
 */
export function rankMasks(
  candidates: ArrayLike<number>,
  candidateCount: number,
  width: number,
  height: number,
  iouScores: ArrayLike<number>
): { masks: Uint8Array[]; best: number } {
  const size = width * height;
  const ranked: { mask: Uint8Array; area: number; score: number }[] = [];
  for (let k = 0; k < candidateCount; k++) {
    const mask = new Uint8Array(size);
    let area = 0;
    const offset = k * size;
    for (let i = 0; i < size; i++) {
      if (candidates[offset + i]) {
        mask[i] = 255;
        area++;
      }
    }
    if (area > 0) ranked.push({ mask, area, score: iouScores[k] });
  }
  ranked.sort((a, b) => a.area - b.area);
  let best = 0;
  for (let i = 1; i < ranked.length; i++) if (ranked[i].score > ranked[best].score) best = i;
  return { masks: ranked.map((r) => r.mask), best };
}

/**
 * Writes a magic-selection mask into a retouch override buffer: pixels inside
 * the mask are forced visible (adding) or hidden (removing); the rest keep
 * whatever they had. Returns how many pixels changed.
 */
export function applyMaskToOverrides(overrides: Int16Array, mask: Uint8Array, add: boolean): number {
  const value = add ? 255 : 0;
  let changed = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && overrides[i] !== value) {
      overrides[i] = value;
      changed++;
    }
  }
  return changed;
}
