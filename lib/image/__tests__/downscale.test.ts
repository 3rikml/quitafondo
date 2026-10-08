import { describe, it, expect } from "vitest";
import { fitWithin } from "../downscale";

describe("fitWithin", () => {
  it("leaves images that already fit alone", () => {
    expect(fitWithin(4096, 3000, 4096)).toBeNull();
    expect(fitWithin(100, 100, 4096)).toBeNull();
  });

  it("scales the longest side down to the limit, keeping the aspect ratio", () => {
    expect(fitWithin(8000, 6000, 4096)).toEqual({ width: 4096, height: 3072 });
    expect(fitWithin(3000, 9000, 4096)).toEqual({ width: 1365, height: 4096 });
  });

  it("never produces a zero-sized side", () => {
    expect(fitWithin(100000, 1, 4096)).toEqual({ width: 4096, height: 1 });
  });
});
