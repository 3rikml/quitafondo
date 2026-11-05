import { isConstrainedDevice, type DeviceHints } from "./deviceHints";
import { isSegmentModelCached } from "./modelCache";

/** The lighter cutout model's download, in MB, shown in the question (see COMPATIBLE_MODEL). */
export const CONSENT_MODEL_MB = 90;

/** Ask only on a limited device, when the model is not stored yet and the person has not agreed already. */
export function needsDownloadConsent(state: { constrained: boolean; cached: boolean; agreed: boolean }): boolean {
  return state.constrained && !state.cached && !state.agreed;
}

type Listener = () => void;
let open = false;
let agreed = false;
let waiting: Array<(accepted: boolean) => void> = [];
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeDownloadConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isDownloadConsentOpen(): boolean {
  return open;
}

/** Called by the dialog: the person accepted or declined the download. */
export function answerDownloadConsent(accepted: boolean): void {
  if (accepted) agreed = true;
  open = false;
  const answers = waiting;
  waiting = [];
  answers.forEach((resolve) => resolve(accepted));
  emit();
}

/**
 * Resolves true when the model may be downloaded: right away on a capable
 * device or when it is already stored, otherwise after the person answers the
 * dialog. Everything waiting shares the one question.
 */
export async function ensureModelDownloadConsent(): Promise<boolean> {
  const nav = typeof navigator === "undefined" ? undefined : (navigator as DeviceHints);
  const constrained = isConstrainedDevice(nav);
  if (!constrained || agreed) return true;
  if (!needsDownloadConsent({ constrained, cached: await isSegmentModelCached(), agreed })) return true;
  return new Promise<boolean>((resolve) => {
    waiting.push(resolve);
    if (!open) {
      open = true;
      emit();
    }
  });
}
