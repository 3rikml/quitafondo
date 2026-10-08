"use client";

import { useEffect, useRef, useState } from "react";
import { Replace, Sparkles } from "lucide-react";
import type { ImageJob } from "@/lib/types";
import { MAX_UPSCALE_PIXELS, UPSCALE_FACTOR, upscaleImage } from "@/hooks/useImageUpscale";
import { Button } from "@/components/ui/button";
import { PanelHint, PanelSection } from "@/components/editor-ui/PanelSection";
import { useT } from "@/lib/i18n";

interface SourceImagePanelProps {
  job: ImageJob;
  /** Swaps the job's source photo and re-runs background removal; returns a validation error, if any. */
  replaceJobFile: (id: string, file: File, sourceScale?: number) => string | null;
}

/** Replace the source photo, or upscale it with AI and re-run background removal on the result. */
export function SourceImagePanel({ job, replaceJobFile }: SourceImagePanelProps) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [upscaleProgress, setUpscaleProgress] = useState(0);
  const [upscaleError, setUpscaleError] = useState<string | null>(null);
  const [originalPixels, setOriginalPixels] = useState<number | null>(null);

  // The photo's size decides whether upscaling makes sense (see MAX_UPSCALE_PIXELS).
  useEffect(() => {
    if (!job.originalUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setOriginalPixels(img.naturalWidth * img.naturalHeight);
    };
    img.src = job.originalUrl;
    return () => {
      cancelled = true;
    };
  }, [job.originalUrl]);
  const tooLargeToUpscale = originalPixels !== null && originalPixels > MAX_UPSCALE_PIXELS;

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (file) setReplaceError(replaceJobFile(job.id, file));
  }

  /**
   * Upscales the pre-removal original (not the cutout — see `upscaleImage`)
   * and feeds the sharper photo back through `replaceJobFile`, which keeps
   * every background/canvas/export setting (crop and offsets scaled 2x).
   */
  async function handleImproveQuality() {
    if (!job.originalUrl || isUpscaling) return;
    setUpscaleError(null);
    setUpscaleProgress(0);
    setIsUpscaling(true);
    try {
      const originalBlob = await fetch(job.originalUrl).then((r) => r.blob());
      const upscaledBlob = await upscaleImage(originalBlob, setUpscaleProgress);
      const upscaledFile = new File([upscaledBlob], job.fileName, { type: upscaledBlob.type });
      setUpscaleError(replaceJobFile(job.id, upscaledFile, UPSCALE_FACTOR));
    } catch (error) {
      setUpscaleError(error instanceof Error ? error.message : t("source.improveFailed"));
    } finally {
      setIsUpscaling(false);
    }
  }

  return (
    <>
      <PanelSection title={t("source.improveTitle")}>
        <Button variant="secondary" onClick={handleImproveQuality} disabled={isUpscaling || tooLargeToUpscale}>
          <Sparkles />
          {isUpscaling ? t("source.improving", { percent: Math.round(upscaleProgress * 100) }) : t("source.improve")}
        </Button>
        <PanelHint>{t(tooLargeToUpscale ? "source.tooLarge" : "source.improveHint")}</PanelHint>
        {upscaleError && <p className="text-xs text-destructive">{upscaleError}</p>}
      </PanelSection>
      <PanelSection title={t("source.replace")}>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Replace />
          {t("source.replace")}
        </Button>
        <PanelHint>{t("source.replaceHint")}</PanelHint>
        {replaceError && <p className="text-xs text-destructive">{replaceError}</p>}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChosen} />
      </PanelSection>
    </>
  );
}
