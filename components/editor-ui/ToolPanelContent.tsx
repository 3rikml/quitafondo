"use client";

import type { BackgroundConfig, ImageJob } from "@/lib/types";
import { suggestHarmony, type ColorStats } from "@/lib/image/harmonize";
import { AdjustPanel } from "@/components/Editor/AdjustPanel";
import { BackgroundPanel } from "@/components/Editor/BackgroundPanel";
import { CanvasSizePanel } from "@/components/Editor/CanvasSizePanel";
import { EdgePanel } from "@/components/Editor/EdgePanel";
import { RetouchToolbar, type RetouchToolbarProps } from "@/components/Editor/RetouchToolbar";
import { ShadowPanel } from "@/components/Editor/ShadowPanel";
import { SourceImagePanel } from "@/components/Editor/SourceImagePanel";
import type { EditorTool } from "./tools";

interface ToolPanelContentProps {
  tool: EditorTool;
  job: ImageJob;
  updateJob: (id: string, patch: Partial<ImageJob>) => void;
  replaceJobFile: (id: string, file: File, sourceScale?: number) => string | null;
  onBackgroundChange: (background: BackgroundConfig) => void;
  /** Copies one of the selected job's settings to every finished job. */
  onApplyToAll: (setting: "background" | "canvas") => void;
  crop: {
    active: boolean;
    start: () => void;
    apply: () => void;
    cancel: () => void;
    resetDraft: () => void;
    clear: () => void;
  };
  retouch: RetouchToolbarProps;
  getHarmonyStats: () => { subject: ColorStats; background: ColorStats } | null;
}

/** The controls of one tool, for the selected (finished) image. */
export function ToolPanelContent({
  tool,
  job,
  updateJob,
  replaceJobFile,
  onBackgroundChange,
  onApplyToAll,
  crop,
  retouch,
  getHarmonyStats,
}: ToolPanelContentProps) {
  const setCanvas = (patch: Partial<ImageJob["canvas"]>) => updateJob(job.id, { canvas: { ...job.canvas, ...patch } });

  switch (tool) {
    case "background":
      return (
        <>
          <BackgroundPanel
            key={job.id}
            value={job.background}
            onChange={onBackgroundChange}
            onApplyToAll={() => onApplyToAll("background")}
          />
          <ShadowPanel value={job.canvas.shadow} onChange={(shadow) => setCanvas({ shadow })} />
        </>
      );
    case "adjust":
      return (
        <>
          <AdjustPanel
            value={job.canvas.adjust}
            onChange={(adjust) => setCanvas({ adjust })}
            onHarmonize={
              job.background.kind === "transparent"
                ? null
                : () => {
                    const stats = getHarmonyStats();
                    if (stats) setCanvas({ adjust: suggestHarmony(stats.subject, stats.background, job.canvas.adjust) });
                  }
            }
          />
          <EdgePanel value={job.canvas.edge} onChange={(edge) => setCanvas({ edge })} />
        </>
      );
    case "retouch":
      return <RetouchToolbar {...retouch} />;
    case "size":
      return (
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
      );
    case "image":
      return <SourceImagePanel key={job.id} job={job} replaceJobFile={replaceJobFile} />;
  }
}
