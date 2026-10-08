"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { ImageJob } from "@/lib/types";
import { runInpaint } from "@/lib/ai/client";
import { DOWNLOAD_PROGRESS_SHARE } from "@/lib/ai/protocol";
import { t } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { canvasToSourceCoords, paintBrushStroke } from "@/components/Editor/RetouchToolbar";
import type { EditorCanvasHandle } from "@/components/Editor/EditorCanvas";

export type EraserStatus =
  | { kind: "idle" }
  | { kind: "working"; progress: number }
  | { kind: "error"; message: string };

/** Previous photo/cutout pairs kept per image for "Deshacer borrado". */
const UNDO_LIMIT = 5;

interface MagicEraserDeps {
  selectedJob: ImageJob | null;
  canvasHandleRef: RefObject<EditorCanvasHandle | null>;
  replaceJobImages: (id: string, original: Blob, cutout: Blob) => void;
}

/**
 * Magic eraser: the user paints over something in the photo (a person in the
 * back, a logo, a stain) and LaMa fills it in. The result replaces the job's
 * photo and cutout (same size, same cutout alpha), so every other edit stays.
 */
export function useMagicEraser({ selectedJob, canvasHandleRef, replaceJobImages }: MagicEraserDeps) {
  const masksRef = useRef<Map<string, Int16Array>>(new Map());
  const undoRef = useRef<Map<string, { original: Blob; cutout: Blob }[]>>(new Map());
  const rafRef = useRef<number | null>(null);
  // Bumped to redraw the red mask overlay / re-read the ref-backed state.
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<EraserStatus>({ kind: "idle" });

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const jobId = selectedJob?.status === "done" ? selectedJob.id : null;

  function maskFor(id: string, pixelCount: number): Int16Array {
    let mask = masksRef.current.get(id);
    if (!mask || mask.length !== pixelCount) {
      mask = new Int16Array(pixelCount);
      masksRef.current.set(id, mask);
    }
    return mask;
  }

  function scheduleRedraw() {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setVersion((v) => v + 1);
    });
  }

  /** Paints the area to erase with a hard round brush of `radius` source pixels. */
  function paintAt(canvas: HTMLCanvasElement, clientX: number, clientY: number, radius: number) {
    const fit = canvasHandleRef.current?.getFit();
    const size = canvasHandleRef.current?.getSourceSize();
    if (!jobId || !fit || !size || status.kind === "working") return;
    const { x, y } = canvasToSourceCoords(canvas, fit, clientX, clientY);
    paintBrushStroke(maskFor(jobId, size.width * size.height), size.width, size.height, x, y, radius, "restore", 1);
    scheduleRedraw();
  }

  function clear() {
    if (!jobId) return;
    masksRef.current.get(jobId)?.fill(0);
    setVersion((v) => v + 1);
  }

  async function erase() {
    const job = selectedJob;
    const size = canvasHandleRef.current?.getSourceSize();
    const mask = job ? masksRef.current.get(job.id) : undefined;
    if (!job || !job.cutoutBlob || !size || !mask || status.kind === "working") return;

    const painted = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) painted[i] = mask[i] > 127 ? 255 : 0;
    setStatus({ kind: "working", progress: 0 });
    try {
      const original = await fetch(job.originalUrl).then((response) => response.blob());
      const result = await runInpaint(original, job.cutoutBlob, painted, size.width, size.height, (progress) =>
        setStatus({ kind: "working", progress })
      );
      const stack = undoRef.current.get(job.id) ?? [];
      stack.push({ original, cutout: job.cutoutBlob });
      if (stack.length > UNDO_LIMIT) stack.shift();
      undoRef.current.set(job.id, stack);
      mask.fill(0);
      replaceJobImages(job.id, result.original, result.cutout);
      setStatus({ kind: "idle" });
      // Erasing takes ~10 s, so say clearly when it is done.
      toast.add({ title: t("toast.eraseDone"), type: "success" });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
    setVersion((v) => v + 1);
  }

  function undo() {
    const previous = jobId ? undoRef.current.get(jobId)?.pop() : undefined;
    if (!jobId || !previous) return;
    replaceJobImages(jobId, previous.original, previous.cutout);
    setVersion((v) => v + 1);
  }

  function forget(id: string) {
    masksRef.current.delete(id);
    undoRef.current.delete(id);
  }

  /* eslint-disable react-hooks/refs -- read during render on purpose: `version` re-renders whenever these ref-backed values change */
  const mask = jobId ? (masksRef.current.get(jobId) ?? null) : null;
  const hasMask = mask !== null && mask.some((value) => value > 0);
  const canUndo = jobId !== null && (undoRef.current.get(jobId)?.length ?? 0) > 0;
  /* eslint-enable react-hooks/refs */

  return { mask, version, hasMask, canUndo, status, paintAt, clear, erase, undo, forget };
}

export function eraserStatusText(status: EraserStatus): string | null {
  if (status.kind === "error") return t("eraser.error", { message: status.message });
  if (status.kind !== "working") return null;
  const share = DOWNLOAD_PROGRESS_SHARE.inpaint;
  return status.progress < share
    ? t("eraser.downloading", { percent: Math.round((status.progress / share) * 100) })
    : t("eraser.working");
}
