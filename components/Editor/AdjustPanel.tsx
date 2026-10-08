"use client";

import { RotateCcw } from "lucide-react";
import type { AdjustConfig } from "@/lib/types";
import { NEUTRAL_ADJUST, isNeutralAdjust } from "@/lib/image/colorAdjust";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useT, type MessageKey } from "@/lib/i18n";

interface AdjustPanelProps {
  value: AdjustConfig;
  onChange: (adjust: AdjustConfig) => void;
}

const SLIDERS: { key: keyof AdjustConfig; label: MessageKey }[] = [
  { key: "brightness", label: "adjust.brightness" },
  { key: "contrast", label: "adjust.contrast" },
  { key: "saturation", label: "adjust.saturation" },
  { key: "temperature", label: "adjust.temperature" },
];

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

/** Light and color of the subject only (the background keeps its own look). */
export function AdjustPanel({ value, onChange }: AdjustPanelProps) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("adjust.title")}</h3>
        <Button size="sm" variant="ghost" disabled={isNeutralAdjust(value)} onClick={() => onChange(NEUTRAL_ADJUST)}>
          <RotateCcw />
          {t("common.reset")}
        </Button>
      </div>
      {SLIDERS.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t(label)} ({signed(value[key])})
          </span>
          <Slider
            min={-100}
            max={100}
            step={1}
            value={[value[key]]}
            aria-label={t(label)}
            onValueChange={(values) => {
              const next = Array.isArray(values) ? values[0] : (values as number);
              onChange({ ...value, [key]: next });
            }}
          />
        </div>
      ))}
    </div>
  );
}
