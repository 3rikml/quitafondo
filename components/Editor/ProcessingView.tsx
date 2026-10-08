"use client";

import { ImagePlus, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import type { ImageJob } from "@/lib/types";
import { DOWNLOAD_PROGRESS_SHARE } from "@/lib/ai/protocol";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function progressLabel(job: ImageJob): string {
  if (job.status === "pending") return "En espera…";
  const share = DOWNLOAD_PROGRESS_SHARE.segment;
  if (job.progress != null && job.progress < share) {
    const percent = Math.round((job.progress / share) * 100);
    return `Descargando el modelo de IA (solo la primera vez)… ${percent}%`;
  }
  return "Quitando el fondo…";
}

/** The original photo with a scanning animation while it is processed, or the error with a retry. */
export function ProcessingView({ job, onRetry }: { job: ImageJob; onRetry: () => void }) {
  const failed = job.status === "error";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="relative max-h-[70%] overflow-hidden rounded-lg shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URL, nothing for next/image to optimize */}
        <img
          src={job.originalUrl}
          alt={job.fileName}
          className={cn("block max-h-[60vh] max-w-full object-contain", !failed && "opacity-60 saturate-50")}
        />
        {!failed && <div className="qf-scan pointer-events-none absolute inset-x-0 h-1/3" aria-hidden="true" />}
      </div>
      {failed ? (
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <TriangleAlert className="size-4" strokeWidth={2} />
            No se pudo quitar el fondo
          </p>
          <p className="text-xs text-muted-foreground">{job.errorMessage}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCcw />
            Reintentar
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <LoaderCircle className="size-4 animate-spin" />
          {progressLabel(job)}
        </p>
      )}
    </div>
  );
}

/** Shown when no image is selected yet. */
export function EmptyCanvasView() {
  return (
    <div className="flex max-w-xs flex-col items-center gap-3 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
        <ImagePlus className="size-5" strokeWidth={1.75} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Sube una imagen para empezar</p>
        <p className="text-sm text-muted-foreground">
          Arrástrala a cualquier parte de la ventana, pégala con{" "}
          <kbd className="rounded border bg-background px-1 font-mono text-xs">Ctrl</kbd>+
          <kbd className="rounded border bg-background px-1 font-mono text-xs">V</kbd> o elígela desde el panel izquierdo.
        </p>
      </div>
    </div>
  );
}
