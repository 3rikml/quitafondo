"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/** Shown instead of a blank page when a render error escapes the editor. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <TriangleAlert className="size-10 text-destructive" strokeWidth={1.6} />
      <h1 className="font-heading text-xl font-semibold">{t("boundary.title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("boundary.body")}</p>
      <div className="flex gap-2">
        <Button onClick={reset}>{t("boundary.retry")}</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t("boundary.reload")}
        </Button>
      </div>
    </main>
  );
}
