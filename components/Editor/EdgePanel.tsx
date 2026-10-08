"use client";

import type { EdgeConfig } from "@/lib/types";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

interface EdgePanelProps {
  value: EdgeConfig;
  onChange: (edge: EdgeConfig) => void;
}

function sliderValue(values: number | readonly number[]): number {
  return Array.isArray(values) ? values[0] : (values as number);
}

/** Fine-tunes the cutout edge: soften it, grow/shrink it, and remove color halos. */
export function EdgePanel({ value, onChange }: EdgePanelProps) {
  const shiftLabel = value.shift === 0 ? "sin cambio" : value.shift > 0 ? `+${value.shift} px` : `${value.shift} px`;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Borde</h3>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Suavizar ({value.feather} px)</span>
        <Slider
          min={0}
          max={10}
          step={1}
          value={[value.feather]}
          onValueChange={(values) => onChange({ ...value, feather: sliderValue(values) })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Contraer / expandir ({shiftLabel})</span>
        <Slider
          min={-5}
          max={5}
          step={1}
          value={[value.shift]}
          onValueChange={(values) => onChange({ ...value, shift: sliderValue(values) })}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="edge-decontaminate" className="text-xs text-muted-foreground">
          Quitar halo de color del fondo original
        </Label>
        <Switch
          id="edge-decontaminate"
          checked={value.decontaminate}
          onCheckedChange={(decontaminate) => onChange({ ...value, decontaminate })}
        />
      </div>
    </div>
  );
}
