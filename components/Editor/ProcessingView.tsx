"use client";

import { LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import type { ImageJob } from "@/lib/types";
import { DOWNLOAD_PROGRESS_SHARE } from "@/lib/ai/protocol";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

function progressLabel(job: ImageJob, t: ReturnType<typeof useT>): string {
  if (job.status === "pending") return t("canvas.waiting");
  const share = DOWNLOAD_PROGRESS_SHARE.segment;
  if (job.progress != null && job.progress < share) {
    return t("canvas.downloadingModel", { percent: Math.round((job.progress / share) * 100) });
  }
  return t("canvas.removing");
}

/** The original photo with a scanning animation while it is processed, or the error with a retry. */
export function ProcessingView({ job, onRetry }: { job: ImageJob; onRetry: () => void }) {
  const t = useT();
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
            {t("canvas.failed")}
          </p>
          <p className="text-xs text-muted-foreground">{job.errorMessage}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCcw />
            {t("queue.retry")}
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <LoaderCircle className="size-4 animate-spin" />
          {progressLabel(job, t)}
        </p>
      )}
    </div>
  );
}
