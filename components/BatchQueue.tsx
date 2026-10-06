"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, FileWarning, Loader2, PackageOpen, RotateCcw, Trash2 } from "lucide-react";
import type { ImageJob } from "@/lib/types";
import { buildZipFromBlobs } from "@/lib/image/zipExport";
import { renderJobToBlob } from "@/lib/image/renderJob";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface BatchQueueProps {
  jobs: ImageJob[];
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
  onRetryJob: (id: string) => void;
  onRemoveJob: (id: string) => void;
  /** Manual retouch overrides (erase/restore strokes) for a job, if any — these
   * live outside `ImageJob` (see `app/page.tsx`), so the ZIP export needs this
   * to apply them the same way the single-image download does. */
  getRetouchOverride: (jobId: string) => Int16Array | undefined;
}

const STATUS_LABEL: Record<ImageJob["status"], string> = {
  pending: "En espera",
  processing: "Procesando…",
  done: "Listo",
  error: "Error",
};

const STATUS_ICON: Record<ImageJob["status"], typeof Clock> = {
  pending: Clock,
  processing: Loader2,
  done: CheckCircle2,
  error: AlertCircle,
};

const STATUS_ICON_CLASS: Record<ImageJob["status"], string> = {
  pending: "text-muted-foreground",
  processing: "text-primary animate-spin",
  done: "text-emerald-600 dark:text-emerald-400",
  error: "text-destructive",
};

export function BatchQueue({
  jobs,
  selectedJobId,
  onSelectJob,
  onRetryJob,
  onRemoveJob,
  getRetouchOverride,
}: BatchQueueProps) {
  const [isZipping, setIsZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const doneJobs = jobs.filter((job) => job.status === "done" && job.cutoutBlob);

  async function handleDownloadAll() {
    setIsZipping(true);
    setZipError(null);
    try {
      // Render each job with ITS OWN background / canvas / export settings, the
      // same way the editor previews it — zipping the raw cutout would discard
      // everything the user configured (including "Aplicar a todas").
      // allSettled (not all): one bad job shouldn't sink a batch where every
      // other image rendered fine.
      const results = await Promise.allSettled(
        doneJobs.map(async (job) => ({
          name: `${job.fileName.replace(/\.[^.]+$/, "")}.${job.exportConfig.format}`,
          blob: await renderJobToBlob(
            job.cutoutBlob as Blob,
            job.background,
            job.canvas,
            job.exportConfig,
            getRetouchOverride(job.id),
            job.originalUrl
          ),
        }))
      );
      const entries = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      const failedCount = results.length - entries.length;

      if (entries.length === 0) {
        setZipError("No se pudo generar el ZIP: ninguna imagen se pudo procesar.");
        return;
      }

      const zipBlob = await buildZipFromBlobs(entries);
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "quitafondo.zip";
      link.click();
      URL.revokeObjectURL(url);

      if (failedCount > 0) {
        setZipError(
          `${failedCount} de ${results.length} imagen(es) no se pudieron incluir en el ZIP.`
        );
      }
    } catch {
      setZipError("No se pudo generar el ZIP. Intenta de nuevo.");
    } finally {
      setIsZipping(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">Imágenes ({jobs.length})</h2>
        <Button size="sm" variant="secondary" disabled={doneJobs.length < 2 || isZipping} onClick={handleDownloadAll}>
          <PackageOpen />
          {isZipping ? "Empaquetando…" : "Descargar todo"}
        </Button>
      </div>
      {zipError && <p className="text-xs text-destructive">{zipError}</p>}
      <ul className="flex flex-col gap-2">
        {jobs.map((job) => {
          const StatusIcon = STATUS_ICON[job.status];
          return (
            <li key={job.id} className="flex flex-col gap-1">
              <button
                onClick={() => onSelectJob(job.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors",
                  selectedJobId === job.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"
                )}
              >
                {job.originalUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={job.originalUrl}
                    alt={job.fileName}
                    className="h-12 w-12 rounded object-cover ring-1 ring-border"
                  />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground ring-1 ring-border">
                    <FileWarning className="size-5" strokeWidth={1.75} />
                  </span>
                )}
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium">{job.fileName}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <StatusIcon className={cn("size-3.5", STATUS_ICON_CLASS[job.status])} strokeWidth={2} />
                    <span>{STATUS_LABEL[job.status]}</span>
                  </div>
                  {job.status === "processing" && (
                    <Progress value={job.progress != null ? job.progress * 100 : null} className="mt-1 h-1" />
                  )}
                  {job.status === "error" && <p className="text-xs text-destructive">{job.errorMessage}</p>}
                </div>
              </button>
              <div className="ml-2 flex gap-1.5">
                {job.status === "error" && (
                  <Button size="sm" variant="outline" onClick={() => onRetryJob(job.id)}>
                    <RotateCcw />
                    Reintentar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onRemoveJob(job.id)}
                  aria-label={`Quitar ${job.fileName} de la lista`}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
