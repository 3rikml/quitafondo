"use client";

import { useState } from "react";
import type { ImageJob } from "@/lib/types";
import { buildZipFromBlobs } from "@/lib/image/zipExport";
import { renderJobToBlob } from "@/lib/image/renderJob";
import { useT } from "@/lib/i18n";

/**
 * "Descargar todo": renders every finished image with ITS OWN background,
 * canvas, edge, color and export settings (as the editor previews it) and
 * zips them. One image failing does not sink the rest of the batch.
 */
export function useZipExport(jobs: ImageJob[], getRetouchOverride: (jobId: string) => Int16Array | undefined) {
  const t = useT();
  const [isZipping, setIsZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doneJobs = jobs.filter((job) => job.status === "done" && job.cutoutBlob);

  async function downloadAll() {
    setIsZipping(true);
    setError(null);
    try {
      // One at a time: every render holds full-resolution pixel buffers, so
      // rendering the whole batch at once could exhaust memory.
      const entries: { name: string; blob: Blob }[] = [];
      for (const job of doneJobs) {
        try {
          entries.push({
            name: `${job.fileName.replace(/\.[^.]+$/, "")}.${job.exportConfig.format}`,
            blob: await renderJobToBlob(
              job.cutoutBlob as Blob,
              job.background,
              job.canvas,
              job.exportConfig,
              getRetouchOverride(job.id),
              job.originalUrl
            ),
          });
        } catch {
          // Counted as failed below.
        }
      }
      if (entries.length === 0) {
        setError(t("queue.zipNoneProcessed"));
        return;
      }
      const url = URL.createObjectURL(await buildZipFromBlobs(entries));
      const link = document.createElement("a");
      link.href = url;
      link.download = "quitafondo.zip";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000); // revoking at once can cancel the download in Safari
      const failed = doneJobs.length - entries.length;
      if (failed > 0) setError(t("queue.zipPartial", { failed, total: doneJobs.length }));
    } catch {
      setError(t("queue.zipFailed"));
    } finally {
      setIsZipping(false);
    }
  }

  return { downloadAll, isZipping, error, doneCount: doneJobs.length };
}
