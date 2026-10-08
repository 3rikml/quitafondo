"use client";

import { useEffect, useRef, useState } from "react";
import { Replace, Sparkles } from "lucide-react";
import type { ImageJob } from "@/lib/types";
import { MAX_UPSCALE_PIXELS, upscaleImage } from "@/hooks/useImageUpscale";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface SourceImagePanelProps {
  job: ImageJob;
  /** Swaps the job's source photo and re-runs background removal; returns a validation error, if any. */
  replaceJobFile: (id: string, file: File) => string | null;
}

/** Replace the source photo, or upscale it with AI and re-run background removal on the result. */
export function SourceImagePanel({ job, replaceJobFile }: SourceImagePanelProps) {
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
   * every background/canvas/export setting untouched.
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
      setUpscaleError(replaceJobFile(job.id, upscaledFile));
    } catch (error) {
      setUpscaleError(error instanceof Error ? error.message : "No se pudo mejorar la calidad de la imagen.");
    } finally {
      setIsUpscaling(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Button size="sm" variant="outline" className="self-start" onClick={() => fileInputRef.current?.click()}>
          <Replace />
          Reemplazar imagen
        </Button>
        <p className="text-xs text-muted-foreground">
          Usa la misma foto/fondo/tamaño configurados, solo cambia la imagen fuente.
        </p>
        {replaceError && <p className="text-xs text-destructive">{replaceError}</p>}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChosen} />
      </div>
      <Separator />
      <div className="flex flex-col gap-1.5">
        <Button size="sm" variant="outline" className="self-start" onClick={handleImproveQuality} disabled={isUpscaling || tooLargeToUpscale}>
          <Sparkles />
          {isUpscaling ? `Mejorando… ${Math.round(upscaleProgress * 100)}%` : "Mejorar calidad (IA)"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {tooLargeToUpscale
            ? "Esta foto ya tiene buena resolución; la mejora con IA es para fotos pequeñas (hasta ~1000×1000 px)."
            : "Duplica la resolución y afina el detalle con IA, luego vuelve a quitar el fondo. Puede tardar unos segundos."}
        </p>
        {upscaleError && <p className="text-xs text-destructive">{upscaleError}</p>}
      </div>
    </>
  );
}
