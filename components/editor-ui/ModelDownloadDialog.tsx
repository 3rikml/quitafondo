"use client";

import { useSyncExternalStore } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  CONSENT_MODEL_MB,
  answerDownloadConsent,
  isDownloadConsentOpen,
  subscribeDownloadConsent,
} from "@/lib/ai/downloadConsent";
import { useT } from "@/lib/i18n";

/** Asks before downloading the AI model on a limited device (low memory, data saver, slow link). */
export function ModelDownloadDialog() {
  const t = useT();
  const open = useSyncExternalStore(subscribeDownloadConsent, isDownloadConsentOpen, () => false);

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !next && open && answerDownloadConsent(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl bg-popover p-6 text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-hidden transition-all data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <AlertDialog.Title className="font-heading text-lg font-semibold">{t("download.consent.title")}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-muted-foreground">
            {t("download.consent.body", { size: CONSENT_MODEL_MB })}
          </AlertDialog.Description>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => answerDownloadConsent(false)}>
              {t("download.consent.decline")}
            </Button>
            <Button onClick={() => answerDownloadConsent(true)}>{t("download.consent.accept")}</Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
