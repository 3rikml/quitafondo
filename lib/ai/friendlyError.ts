import { t } from "../i18n";

/**
 * Turns the raw error from the AI worker or the model download into a message
 * a person can act on. Unknown errors keep their original text.
 */
export function friendlyAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/out of memory|allocation|alloc|memory access out of bounds|RangeError|buffer.*too large/i.test(message)) {
    return t("error.outOfMemory");
  }
  if (/failed to fetch|networkerror|load failed|no se pudo descargar el modelo|network/i.test(message)) {
    return t("error.network");
  }
  return message || t("error.unknown");
}
