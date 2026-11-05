import { describe, it, expect } from "vitest";
import { isConstrainedDevice } from "../deviceHints";

describe("isConstrainedDevice", () => {
  it("treats unknown browsers as capable", () => {
    expect(isConstrainedDevice(undefined)).toBe(false);
    expect(isConstrainedDevice({})).toBe(false);
  });

  it("flags 4 GB of RAM or less", () => {
    expect(isConstrainedDevice({ deviceMemory: 4 })).toBe(true);
    expect(isConstrainedDevice({ deviceMemory: 2 })).toBe(true);
    expect(isConstrainedDevice({ deviceMemory: 8 })).toBe(false);
  });

  it("flags data saver and slow connections", () => {
    expect(isConstrainedDevice({ connection: { saveData: true } })).toBe(true);
    expect(isConstrainedDevice({ connection: { effectiveType: "3g" } })).toBe(true);
    expect(isConstrainedDevice({ connection: { effectiveType: "4g" } })).toBe(false);
  });
});
