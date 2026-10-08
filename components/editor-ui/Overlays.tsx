"use client";

import { TriangleAlert, UploadCloud } from "lucide-react";
import { useT } from "@/lib/i18n";

export function UnsupportedBrowserBanner() {
  const t = useT();
  return (
    <p role="alert" className="flex items-start gap-2 border-b bg-destructive/10 px-5 py-2.5 text-sm text-destructive">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      {t("header.unsupported")}
    </p>
  );
}

/** Full-window hint while files are dragged over the page. */
export function DropHint() {
  const t = useT();
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary bg-card px-12 py-10 text-center shadow-2xl">
        <UploadCloud className="size-10 text-primary" strokeWidth={1.6} />
        <p className="font-heading text-lg font-semibold">{t("dropzone.dropHint")}</p>
      </div>
    </div>
  );
}
