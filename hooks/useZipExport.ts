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
      if (entries.length === 0) {
        setError(t("queue.zipNoneProcessed"));
        return;
      }
      const url = URL.createObjectURL(await buildZipFromBlobs(entries));
      const link = document.createElement("a");
      link.href = url;
      link.download = "quitafondo.zip";
      link.click();
      URL.revokeObjectURL(url);
      const failed = results.length - entries.length;
      if (failed > 0) setError(t("queue.zipPartial", { failed, total: results.length }));
    } catch {
      setError(t("queue.zipFailed"));
    } finally {
      setIsZipping(false);
    }
  }

  return { downloadAll, isZipping, error, doneCount: doneJobs.length };
}
