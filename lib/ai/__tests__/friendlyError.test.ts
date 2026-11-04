import { describe, it, expect } from "vitest";
import { friendlyAiError } from "../friendlyError";
import { t } from "../../i18n";

describe("friendlyAiError", () => {
  it("explains memory failures", () => {
    expect(friendlyAiError(new Error("RangeError: Array buffer allocation failed"))).toBe(t("error.outOfMemory"));
    expect(friendlyAiError(new Error("std::bad_alloc: out of memory"))).toBe(t("error.outOfMemory"));
  });

  it("explains download failures", () => {
    expect(friendlyAiError(new TypeError("Failed to fetch"))).toBe(t("error.network"));
    expect(friendlyAiError(new Error("No se pudo descargar el modelo (503)."))).toBe(t("error.network"));
  });

  it("keeps other messages and falls back for empty ones", () => {
    expect(friendlyAiError(new Error("boom"))).toBe("boom");
    expect(friendlyAiError(undefined)).toBe(t("error.unknown"));
  });
});
