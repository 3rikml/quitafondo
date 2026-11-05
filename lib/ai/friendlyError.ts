import { t } from "../i18n";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "";
}

/** True when the failure looks like a dropped or blocked connection, not a bug in the model. */
export function isNetworkError(error: unknown): boolean {
  return /failed to fetch|networkerror|load failed|no se pudo descargar el modelo|network/i.test(messageOf(error));
}

/**
 * Turns the raw error from the AI worker or the model download into a message
 * a person can act on. Unknown errors keep their original text.
 */
export function friendlyAiError(error: unknown): string {
  const message = messageOf(error);
  if (/out of memory|allocation|alloc|memory access out of bounds|RangeError|buffer.*too large/i.test(message)) {
    return t("error.outOfMemory");
  }
  if (isNetworkError(error)) {
    return typeof navigator !== "undefined" && navigator.onLine === false ? t("error.offline") : t("error.network");
  }
  return message || t("error.unknown");
}
