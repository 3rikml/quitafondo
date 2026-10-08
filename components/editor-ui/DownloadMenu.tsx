"use client";

import { ChevronDown, Copy, Download, PackageOpen, TriangleAlert } from "lucide-react";
import type { ExportConfig, ExportFormat } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/lib/i18n";
import { SliderRow } from "./SliderRow";

interface DownloadMenuProps {
  exportConfig: ExportConfig | null;
  onExportConfigChange: (config: ExportConfig) => void;
  onDownload: () => void;
  isDownloading: boolean;
  onCopy: () => void;
  onDownloadAll: () => void;
  isZipping: boolean;
  /** Finished images; "Descargar todo" needs at least two. */
  doneCount: number;
  zipError: string | null;
}

/** Split button: one click downloads in the chosen format; the arrow opens format, quality, copy and ZIP. */
export function DownloadMenu({
  exportConfig,
  onExportConfigChange,
  onDownload,
  isDownloading,
  onCopy,
  onDownloadAll,
  isZipping,
  doneCount,
  zipError,
}: DownloadMenuProps) {
  const t = useT();
  const disabled = !exportConfig;
  const format = exportConfig?.format ?? "png";

  return (
    <div className="flex items-center">
      <Button
        onClick={onDownload}
        disabled={disabled || isDownloading}
        className="h-9 rounded-r-none px-3.5 font-semibold"
      >
        <Download />
        {isDownloading ? t("toolbar.downloading") : t("toolbar.download", { format: format.toUpperCase() })}
      </Button>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              aria-label={t("download.menu")}
              disabled={disabled && doneCount < 2}
              className="h-9 rounded-l-none border-l border-primary-foreground/20 px-2"
            />
          }
        >
          <ChevronDown />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 gap-4 p-4">
          {exportConfig && (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  {t("download.format")}
                </span>
                <Tabs
                  value={exportConfig.format}
                  onValueChange={(next) => onExportConfigChange({ ...exportConfig, format: next as ExportFormat })}
                >
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="png">PNG</TabsTrigger>
                    <TabsTrigger value="jpg">JPG</TabsTrigger>
                    <TabsTrigger value="webp">WebP</TabsTrigger>
                  </TabsList>
                </Tabs>
                {exportConfig.format === "jpg" && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    {t("export.jpgWarning")}
                  </p>
                )}
              </div>
              {exportConfig.format !== "png" && (
                <SliderRow
                  label={t("download.quality")}
                  value={exportConfig.quality}
                  min={1}
                  max={100}
                  onChange={(quality) => onExportConfigChange({ ...exportConfig, quality })}
                />
              )}
              <Button variant="outline" onClick={onCopy}>
                <Copy />
                {t("download.copy")}
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={onDownloadAll} disabled={doneCount < 2 || isZipping}>
            <PackageOpen />
            {isZipping ? t("queue.zipping") : doneCount >= 2 ? t("download.allCount", { count: doneCount }) : t("download.all")}
          </Button>
          {zipError && <p className="text-xs text-destructive">{zipError}</p>}
        </PopoverContent>
      </Popover>
    </div>
  );
}
