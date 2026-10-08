"use client";

import {
  CopyCheck,
  Crop,
  Maximize2,
  RectangleVertical,
  RotateCcw,
  RotateCw,
  Settings2,
  Smartphone,
  Square,
} from "lucide-react";
import type { CanvasConfig, CanvasPreset } from "@/lib/types";
import { normalizeRotationDeg } from "@/lib/image/canvasFit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PanelHint, PanelSection } from "@/components/editor-ui/PanelSection";
import { SliderRow } from "@/components/editor-ui/SliderRow";
import { useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PRESET_DIMENSIONS: Record<Exclude<CanvasPreset, "custom" | "original">, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  "portrait-4-5": { width: 1080, height: 1350 },
  "story-9-16": { width: 1080, height: 1920 },
};

const PRESET_LABELS: Record<CanvasPreset, MessageKey> = {
  original: "size.preset.original",
  square: "size.preset.square",
  "portrait-4-5": "size.preset.portrait",
  "story-9-16": "size.preset.story",
  custom: "size.preset.custom",
};

const PRESET_ICONS: Record<CanvasPreset, typeof Square> = {
  square: Square,
  "portrait-4-5": RectangleVertical,
  "story-9-16": Smartphone,
  original: Maximize2,
  custom: Settings2,
};

interface CanvasSizePanelProps {
  value: CanvasConfig;
  onChange: (config: CanvasConfig) => void;
  onApplyToAll: () => void;
  /** Whether the crop overlay is currently shown over the canvas. */
  cropActive: boolean;
  onStartCrop: () => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  /** Resets the in-progress crop rectangle back to the auto-detected subject, without leaving crop mode. */
  onResetCropDraft: () => void;
  /** Clears an already-applied crop, going back to automatic subject detection. */
  onClearCrop: () => void;
}

export function CanvasSizePanel({
  value,
  onChange,
  onApplyToAll,
  cropActive,
  onStartCrop,
  onApplyCrop,
  onCancelCrop,
  onResetCropDraft,
  onClearCrop,
}: CanvasSizePanelProps) {
  const t = useT();

  function handlePresetChange(preset: CanvasPreset) {
    if (preset === "original" || preset === "custom") {
      onChange({ ...value, preset });
      return;
    }
    const dims = PRESET_DIMENSIONS[preset];
    onChange({ ...value, preset, widthPx: dims.width, heightPx: dims.height });
  }

  const resetButton = (disabled: boolean, onClick: () => void) => (
    <Button size="xs" variant="ghost" disabled={disabled} onClick={onClick}>
      <RotateCcw />
      {t("common.reset")}
    </Button>
  );

  return (
    <>
      <PanelSection
        title={t("size.title")}
        action={
          <Button size="xs" variant="ghost" onClick={onApplyToAll}>
            <CopyCheck />
            {t("common.applyToAll")}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(PRESET_LABELS) as CanvasPreset[]).map((preset) => {
            const PresetIcon = PRESET_ICONS[preset];
            const selected = value.preset === preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={selected}
                onClick={() => handlePresetChange(preset)}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-lg border px-2.5 text-left text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary/60 bg-primary/12 text-foreground"
                    : "border-border bg-surface-2 text-muted-foreground hover:text-foreground"
                )}
              >
                <PresetIcon className={cn("size-3.5 shrink-0", selected && "text-primary")} />
                {t(PRESET_LABELS[preset])}
              </button>
            );
          })}
        </div>

        {value.preset === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="canvas-width" className="text-xs font-normal">{t("size.width")}</Label>
              <Input
                id="canvas-width"
                type="number"
                min={1}
                value={value.widthPx}
                onChange={(e) => onChange({ ...value, widthPx: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="canvas-height" className="text-xs font-normal">{t("size.height")}</Label>
              <Input
                id="canvas-height"
                type="number"
                min={1}
                value={value.heightPx}
                onChange={(e) => onChange({ ...value, heightPx: Number(e.target.value) })}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Label htmlFor="center-subject" className="text-xs font-normal text-foreground/90">{t("size.center")}</Label>
          <Switch
            id="center-subject"
            checked={value.centerSubject}
            onCheckedChange={(centerSubject) => onChange({ ...value, centerSubject })}
          />
        </div>
        {value.centerSubject && (
          <SliderRow
            label={t("size.margin")}
            display={`${value.marginPercent}%`}
            value={value.marginPercent}
            min={0}
            max={45}
            onChange={(marginPercent) => onChange({ ...value, marginPercent })}
          />
        )}
      </PanelSection>

      <PanelSection
        title={t("size.crop")}
        action={
          !cropActive && value.cropBox ? (
            <Button size="xs" variant="ghost" onClick={onClearCrop}>
              <RotateCcw />
              {t("size.removeCrop")}
            </Button>
          ) : undefined
        }
      >
        {cropActive ? (
          <>
            <PanelHint>{t("size.cropHint")}</PanelHint>
            <div className="flex gap-1.5">
              <Button size="sm" className="flex-1" onClick={onApplyCrop}>
                {t("common.apply")}
              </Button>
              <Button size="sm" variant="outline" onClick={onResetCropDraft}>
                <RotateCcw />
                {t("common.reset")}
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancelCrop}>
                {t("common.cancel")}
              </Button>
            </div>
          </>
        ) : (
          <Button variant="outline" onClick={onStartCrop}>
            <Crop />
            {value.cropBox ? t("size.editCrop") : t("size.crop")}
          </Button>
        )}
      </PanelSection>

      <PanelSection
        title={t("size.position")}
        action={resetButton(value.offsetX === 0 && value.offsetY === 0 && value.manualScale === 1, () =>
          onChange({ ...value, offsetX: 0, offsetY: 0, manualScale: 1 })
        )}
      >
        <PanelHint>{t("size.positionHint")}</PanelHint>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="canvas-offset-x" className="text-xs font-normal">X (px)</Label>
            <Input
              id="canvas-offset-x"
              type="number"
              step={1}
              value={Math.round(value.offsetX)}
              onChange={(e) => onChange({ ...value, offsetX: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="canvas-offset-y" className="text-xs font-normal">Y (px)</Label>
            <Input
              id="canvas-offset-y"
              type="number"
              step={1}
              value={Math.round(value.offsetY)}
              onChange={(e) => onChange({ ...value, offsetY: Number(e.target.value) || 0 })}
            />
          </div>
        </div>
        <SliderRow
          label={t("size.subjectSize")}
          display={`${Math.round(value.manualScale * 100)}%`}
          value={Math.round(value.manualScale * 100)}
          min={10}
          max={300}
          onChange={(percent) => onChange({ ...value, manualScale: percent / 100 })}
        />
      </PanelSection>

      <PanelSection
        title={t("size.rotation")}
        action={resetButton(value.rotationDeg === 0, () => onChange({ ...value, rotationDeg: 0 }))}
      >
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant="outline"
            onClick={() => onChange({ ...value, rotationDeg: normalizeRotationDeg(value.rotationDeg - 90) })}
          >
            <RotateCcw />
            {t("size.rotateLeft")}
          </Button>
          <Button
            variant="outline"
            onClick={() => onChange({ ...value, rotationDeg: normalizeRotationDeg(value.rotationDeg + 90) })}
          >
            <RotateCw />
            {t("size.rotateRight")}
          </Button>
        </div>
        <SliderRow
          label={t("size.angle")}
          display={`${Math.round(value.rotationDeg)}°`}
          value={value.rotationDeg}
          min={-180}
          max={180}
          onChange={(rotationDeg) => onChange({ ...value, rotationDeg: normalizeRotationDeg(rotationDeg) })}
        />
        <PanelHint>{t("size.rotationHint")}</PanelHint>
      </PanelSection>
    </>
  );
}
