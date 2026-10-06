"use client";

import { useState } from "react";
import { CopyCheck, Download, TriangleAlert } from "lucide-react";
import type { ExportConfig, ExportFormat } from "@/lib/types";
import { MIME_BY_FORMAT, requiresFlattening, flattenOnWhite } from "@/lib/image/exportFormat";
import type { PixelBuffer } from "@/lib/image/pixelBuffer";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ExportPanelProps {
  value: ExportConfig;
  onChange: (config: ExportConfig) => void;
  onApplyToAll: () => void;
  /**
   * The canvas as rendered on screen — background, canvas size, centering and
   * retouch strokes already applied. Exporting the source-space cutout instead
   * would silently throw all of those settings away.
   */
  getRenderedPixelBuffer: () => PixelBuffer | null;
  fileNameBase: string;
}

export function ExportPanel({ value, onChange, onApplyToAll, getRenderedPixelBuffer, fileNameBase }: ExportPanelProps) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleDownload() {
    const pixels = getRenderedPixelBuffer();
    if (!pixels) return;

    setIsExporting(true);
    try {
      const finalPixels = requiresFlattening(value.format) ? flattenOnWhite(pixels) : pixels;

      const canvas = document.createElement("canvas");
      canvas.width = finalPixels.width;
      canvas.height = finalPixels.height;
      const ctx = canvas.getContext("2d")!;
      const imageData = new ImageData(
        finalPixels.data as Uint8ClampedArray<ArrayBuffer>,
        finalPixels.width,
        finalPixels.height
      );
      ctx.putImageData(imageData, 0, 0);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, MIME_BY_FORMAT[value.format], value.quality / 100)
      );
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileNameBase}.${value.format}`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Exportar</h3>
        <Button size="sm" variant="ghost" onClick={onApplyToAll}>
          <CopyCheck />
          Aplicar a todas
        </Button>
      </div>

      <Tabs value={value.format} onValueChange={(format) => onChange({ ...value, format: format as ExportFormat })}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="png">PNG</TabsTrigger>
          <TabsTrigger value="jpg">JPG</TabsTrigger>
          <TabsTrigger value="webp">WebP</TabsTrigger>
        </TabsList>
      </Tabs>

      {value.format === "jpg" && (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
          JPG no soporta transparencia: el fondo se rellenará de blanco donde sea transparente.
        </p>
      )}

      {value.format !== "png" && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Calidad ({value.quality})</span>
          <Slider
            min={1}
            max={100}
            step={1}
            value={[value.quality]}
            onValueChange={(values) => {
              const quality = Array.isArray(values) ? values[0] : values;
              onChange({ ...value, quality });
            }}
          />
        </div>
      )}

      <Button onClick={handleDownload} disabled={isExporting}>
        <Download />
        {isExporting ? "Exportando…" : "Descargar imagen"}
      </Button>
    </div>
  );
}
