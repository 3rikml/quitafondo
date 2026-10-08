"use client";

import { Redo2, SlidersHorizontal, Undo2 } from "lucide-react";
import type { BackgroundConfig, ImageJob } from "@/lib/types";
import type { PixelBuffer } from "@/lib/image/pixelBuffer";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { IconButton } from "@/components/IconButton";
import { BackgroundPanel } from "@/components/Editor/BackgroundPanel";
import { CanvasSizePanel } from "@/components/Editor/CanvasSizePanel";
import { EdgePanel } from "@/components/Editor/EdgePanel";
import { ExportPanel } from "@/components/Editor/ExportPanel";
import { RetouchToolbar, type RetouchToolbarProps } from "@/components/Editor/RetouchToolbar";
import { ShadowPanel } from "@/components/Editor/ShadowPanel";
import { SourceImagePanel } from "@/components/Editor/SourceImagePanel";

interface EditorSidebarProps {
  job: ImageJob;
  updateJob: (id: string, patch: Partial<ImageJob>) => void;
  replaceJobFile: (id: string, file: File) => string | null;
  onBackgroundChange: (background: BackgroundConfig) => void;
  /** Copies one of the selected job's settings to every finished job. */
  onApplyToAll: (setting: "background" | "canvas" | "exportConfig") => void;
  crop: {
    active: boolean;
    start: () => void;
    apply: () => void;
    cancel: () => void;
    resetDraft: () => void;
    clear: () => void;
  };
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  retouch: RetouchToolbarProps;
  getRenderedPixelBuffer: () => PixelBuffer | null;
}

/** The right-hand column of editing controls for the selected, finished image. */
export function EditorSidebar({
  job,
  updateJob,
  replaceJobFile,
  onBackgroundChange,
  onApplyToAll,
  crop,
  history,
  retouch,
  getRenderedPixelBuffer,
}: EditorSidebarProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card size="sm" className="gap-3 p-3">
        <SourceImagePanel key={job.id} job={job} replaceJobFile={replaceJobFile} />
      </Card>

      <Card size="sm" className="gap-3 p-3">
        <BackgroundPanel
          key={job.id}
          value={job.background}
          onChange={onBackgroundChange}
          onApplyToAll={() => onApplyToAll("background")}
        />
        <Separator />
        <ShadowPanel
          value={job.canvas.shadow}
          onChange={(shadow) => updateJob(job.id, { canvas: { ...job.canvas, shadow } })}
        />
      </Card>

      <Card size="sm" className="p-3">
        <EdgePanel value={job.canvas.edge} onChange={(edge) => updateJob(job.id, { canvas: { ...job.canvas, edge } })} />
      </Card>

      <Card size="sm" className="p-3">
        <CanvasSizePanel
          value={job.canvas}
          onChange={(canvas) => updateJob(job.id, { canvas })}
          onApplyToAll={() => onApplyToAll("canvas")}
          cropActive={crop.active}
          onStartCrop={crop.start}
          onApplyCrop={crop.apply}
          onCancelCrop={crop.cancel}
          onResetCropDraft={crop.resetDraft}
          onClearCrop={crop.clear}
        />
      </Card>

      <Card size="sm" className="gap-3 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Historial</h3>
          <div className="flex gap-1.5">
            <IconButton
              label="Deshacer (Ctrl+Z)"
              size="icon-sm"
              variant="outline"
              disabled={!history.canUndo}
              onClick={history.undo}
            >
              <Undo2 />
            </IconButton>
            <IconButton
              label="Rehacer (Ctrl+Shift+Z)"
              size="icon-sm"
              variant="outline"
              disabled={!history.canRedo}
              onClick={history.redo}
            >
              <Redo2 />
            </IconButton>
          </div>
        </div>
        <Separator />
        <RetouchToolbar {...retouch} />
      </Card>

      <Card size="sm" className="p-3">
        <ExportPanel
          value={job.exportConfig}
          onChange={(exportConfig) => updateJob(job.id, { exportConfig })}
          onApplyToAll={() => onApplyToAll("exportConfig")}
          getRenderedPixelBuffer={getRenderedPixelBuffer}
          fileNameBase={job.fileName.replace(/\.[^.]+$/, "")}
        />
      </Card>
    </div>
  );
}

/** Placeholder for the sidebar while no finished image is selected. */
export function EditorSidebarEmpty() {
  return (
    <div className="flex max-w-56 flex-col items-center gap-3 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SlidersHorizontal className="size-5" strokeWidth={1.75} />
      </span>
      <p className="text-sm text-muted-foreground">
        Los controles de fondo, tamaño y exportación aparecerán aquí cuando selecciones una imagen lista.
      </p>
    </div>
  );
}
