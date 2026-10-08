"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { ImageJob } from "@/lib/types";
import { runMagicSelect } from "@/lib/ai/client";
import { applyMaskToOverrides } from "@/lib/ai/samMask";
import { NO_OVERRIDE } from "@/lib/image/alphaCompose";
import type { HistoryEntry } from "@/hooks/useEditorHistory";

export type MagicStatus =
  | { kind: "idle" }
  | { kind: "preparing"; progress: number }
  | { kind: "ready" }
  | { kind: "working" }
  | { kind: "error"; message: string };

interface MagicSelectDeps {
  selectedJob: ImageJob | null;
  /** Whether the magic-selection tool is the active retouch tool. */
  active: boolean;
  overridesByJobIdRef: RefObject<Map<string, Int16Array>>;
  history: {
    snapshot: (job: ImageJob) => HistoryEntry;
    record: (jobId: string, before: HistoryEntry) => void;
  };
  onOverridesChanged: () => void;
}

/** The last click's result, kept so the user can switch to another candidate size. */
interface LastSelection {
  jobId: string;
  /** The retouch mask right before the click; switching sizes re-applies onto it. */
  before: HistoryEntry;
  masks: Uint8Array[];
  index: number;
  add: boolean;
}

/**
 * Click-to-select with SlimSAM: each click removes (or adds back) the whole
 * object under the pointer. The mask is written into the same retouch
 * override buffer the brush uses, so undo/redo and every export just work.
 * SAM proposes up to 3 nested objects per click (e.g. rim, wheel, car); the
 * most confident is applied and the others stay one click away.
 */
export function useMagicSelect({ selectedJob, active, overridesByJobIdRef, history, onOverridesChanged }: MagicSelectDeps) {
  const [add, setAdd] = useState(false);
  const [status, setStatus] = useState<MagicStatus>({ kind: "idle" });
  const originalRef = useRef<{ url: string; blob: Promise<Blob> } | null>(null);
  const preparedKeyRef = useRef<string | null>(null);
  const [last, setLast] = useState<LastSelection | null>(null);

  const jobUrl = selectedJob?.status === "done" ? selectedJob.originalUrl : "";

  // A pending size choice only makes sense while the tool stays on the same image.
  const lastValid = last !== null && active && last.jobId === selectedJob?.id;

  function originalBlob(url: string): Promise<Blob> {
    if (originalRef.current?.url !== url) {
      originalRef.current = { url, blob: fetch(url).then((response) => response.blob()) };
    }
    return originalRef.current.blob;
  }

  // Analyze the photo as soon as the tool opens, so the first click is fast.
  useEffect(() => {
    if (!active || !jobUrl || preparedKeyRef.current === jobUrl) return;
    let cancelled = false;
    setStatus({ kind: "preparing", progress: 0 });
    originalBlob(jobUrl)
      .then((blob) =>
        runMagicSelect(jobUrl, blob, null, (progress) => {
          if (!cancelled) setStatus({ kind: "preparing", progress });
        })
      )
      .then(() => {
        preparedKeyRef.current = jobUrl;
        if (!cancelled) setStatus({ kind: "ready" });
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [active, jobUrl]);

  /** Re-applies a mask onto the state before the click, in place (EditorCanvas holds that buffer). */
  function applyOnto(jobId: string, before: HistoryEntry, mask: Uint8Array, addObject: boolean): boolean {
    const overrides = overridesByJobIdRef.current.get(jobId);
    if (!overrides || mask.length !== overrides.length) return false;
    if (before.overrideSnapshot.length === overrides.length) overrides.set(before.overrideSnapshot);
    else overrides.fill(NO_OVERRIDE);
    applyMaskToOverrides(overrides, mask, addObject);
    onOverridesChanged();
    return true;
  }

  /** Selects the object at source pixel (x, y) and removes it, or adds it back when `addObject`. */
  async function selectAt(x: number, y: number, addObject: boolean) {
    const job = selectedJob;
    if (!job || !jobUrl || status.kind === "working") return;
    setStatus({ kind: "working" });
    try {
      const { masks, best } = await runMagicSelect(jobUrl, await originalBlob(jobUrl), [
        { x: Math.round(x), y: Math.round(y), positive: true },
      ]);
      preparedKeyRef.current = jobUrl;
      const before = history.snapshot(job);
      if (masks.length > 0 && applyOnto(job.id, before, masks[best], addObject)) {
        history.record(job.id, before);
        setLast({ jobId: job.id, before, masks, index: best, add: addObject });
      }
      setStatus({ kind: "ready" });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  /** Swaps the last click's result for another candidate size (same undo step). */
  function chooseSize(index: number) {
    if (!lastValid || index === last.index || !last.masks[index]) return;
    if (applyOnto(last.jobId, last.before, last.masks[index], last.add)) setLast({ ...last, index });
  }

  /** Drops the pending size choice, e.g. after undo/redo changed the mask underneath it. */
  function forget() {
    setLast(null);
  }

  return {
    add,
    setAdd,
    status,
    selectAt,
    /** Size options for the last click, smallest first; null when there is nothing to adjust. */
    sizes: lastValid && last.masks.length > 1 ? { count: last.masks.length, index: last.index } : null,
    chooseSize,
    forget,
  };
}

export function magicStatusText(status: MagicStatus): string | null {
  switch (status.kind) {
    case "preparing":
      return `Analizando la imagen… ${Math.round(status.progress * 100)}%`;
    case "working":
      return "Seleccionando…";
    case "error":
      return `No se pudo usar la selección mágica: ${status.message}`;
    default:
      return null;
  }
}
