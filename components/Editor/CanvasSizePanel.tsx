"use client";

import {
  CopyCheck,
  Crop,
  Maximize2,
  Move,
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

const PRESET_DIMENSIONS: Record<Exclude<CanvasPreset, "custom" | "original">, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  "portrait-4-5": { width: 1080, height: 1350 },
  "story-9-16": { width: 1080, height: 1920 },
};

const PRESET_LABELS: Record<CanvasPreset, string> = {
  square: "Cuadrado (1:1)",
  "portrait-4-5": "Retrato (4:5)",
  "story-9-16": "Historia (9:16)",
  original: "Tamaño original",
  custom: "Personalizado",
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
  /** Whether the crop overlay is currently shown over the canvas, letting the
   * user drag its corners/body. */
  cropActive: boolean;
  onStartCrop: () => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  /** Resets the in-progress crop rectangle back to the auto-detected subject,
   * without leaving crop mode. */
  onResetCropDraft: () => void;
  /** Clears an already-applied crop (`value.cropBox`), going back to
   * automatic subject detection. Only relevant outside crop mode. */
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
  function handlePresetChange(preset: CanvasPreset) {
    if (preset === "original" || preset === "custom") {
      onChange({ ...value, preset, widthPx: value.widthPx, heightPx: value.heightPx });
      return;
    }
    const dims = PRESET_DIMENSIONS[preset];
    onChange({ ...value, preset, widthPx: dims.width, heightPx: dims.height });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tamaño del lienzo</h3>
        <Button size="sm" variant="ghost" onClick={onApplyToAll}>
          <CopyCheck />
          Aplicar a todas
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(PRESET_LABELS) as CanvasPreset[]).map((preset) => {
          const PresetIcon = PRESET_ICONS[preset];
          return (
            <Button
              key={preset}
              size="sm"
              variant={value.preset === preset ? "default" : "outline"}
              onClick={() => handlePresetChange(preset)}
              className="justify-start"
            >
              <PresetIcon />
              {PRESET_LABELS[preset]}
            </Button>
          );
        })}
      </div>

      {value.preset === "custom" && (
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="canvas-width">Ancho (px)</Label>
            <Input
              id="canvas-width"
              type="number"
              min={1}
              value={value.widthPx}
              onChange={(e) => onChange({ ...value, widthPx: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="canvas-height">Alto (px)</Label>
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
        <Label htmlFor="center-subject">Centrar sujeto</Label>
        <Switch
          id="center-subject"
          checked={value.centerSubject}
          onCheckedChange={(centerSubject) => onChange({ ...value, centerSubject })}
        />
      </div>

      {value.centerSubject && (
        <div className="flex flex-col gap-1">
          <Label>Margen ({value.marginPercent}%)</Label>
          <Slider
            min={0}
            max={45}
            step={1}
            value={[value.marginPercent]}
            onValueChange={(values) => {
              const marginPercent = Array.isArray(values) ? values[0] : values;
              onChange({ ...value, marginPercent });
            }}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <Crop className="size-3.5" />
          Recortar
        </Label>
        {!cropActive && (
          <div className="flex gap-1.5">
            {value.cropBox && (
              <Button size="sm" variant="ghost" onClick={onClearCrop}>
                <RotateCcw />
                Quitar
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onStartCrop}>
              <Crop />
              {value.cropBox ? "Editar recorte" : "Recortar"}
            </Button>
          </div>
        )}
      </div>
      {cropActive && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Arrastra las esquinas o el recuadro sobre el lienzo para ajustar la zona que quieres conservar
            (Enter aplica, Esc cancela).
          </p>
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1" onClick={onApplyCrop}>
              Aplicar
            </Button>
            <Button size="sm" variant="outline" onClick={onResetCropDraft}>
              <RotateCcw />
              Restablecer
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelCrop}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <Move className="size-3.5" />
          Posición y tamaño
        </Label>
        <Button
          size="sm"
          variant="ghost"
          disabled={value.offsetX === 0 && value.offsetY === 0 && value.manualScale === 1}
          onClick={() => onChange({ ...value, offsetX: 0, offsetY: 0, manualScale: 1 })}
        >
          <RotateCcw />
          Restablecer
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Arrastra el sujeto o sus esquinas directamente sobre el lienzo para moverlo o cambiar su tamaño, o ajusta aquí.
      </p>
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="canvas-offset-x">X (px)</Label>
          <Input
            id="canvas-offset-x"
            type="number"
            step={1}
            value={Math.round(value.offsetX)}
            onChange={(e) => onChange({ ...value, offsetX: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="canvas-offset-y">Y (px)</Label>
          <Input
            id="canvas-offset-y"
            type="number"
            step={1}
            value={Math.round(value.offsetY)}
            onChange={(e) => onChange({ ...value, offsetY: Number(e.target.value) || 0 })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label>Tamaño del sujeto ({Math.round(value.manualScale * 100)}%)</Label>
        <Slider
          min={10}
          max={300}
          step={1}
          value={[Math.round(value.manualScale * 100)]}
          onValueChange={(values) => {
            const percent = Array.isArray(values) ? values[0] : values;
            onChange({ ...value, manualScale: percent / 100 });
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <RotateCw className="size-3.5" />
          Rotación
        </Label>
        <Button
          size="sm"
          variant="ghost"
          disabled={value.rotationDeg === 0}
          onClick={() => onChange({ ...value, rotationDeg: 0 })}
        >
          <RotateCcw />
          Restablecer
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Usa el control deslizante para enderezar una foto chueca, o los botones para girarla 90°.
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...value, rotationDeg: normalizeRotationDeg(value.rotationDeg - 90) })}
        >
          <RotateCcw />
          90° izquierda
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...value, rotationDeg: normalizeRotationDeg(value.rotationDeg + 90) })}
        >
          <RotateCw />
          90° derecha
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <Label>Ángulo ({Math.round(value.rotationDeg)}°)</Label>
        <Slider
          min={-180}
          max={180}
          step={1}
          value={[value.rotationDeg]}
          onValueChange={(values) => {
            const rotationDeg = Array.isArray(values) ? values[0] : values;
            onChange({ ...value, rotationDeg: normalizeRotationDeg(rotationDeg) });
          }}
        />
      </div>
    </div>
  );
}
