"use client";

import { RotateCcw, Wand } from "lucide-react";
import type { AdjustConfig } from "@/lib/types";
import { NEUTRAL_ADJUST, isNeutralAdjust } from "@/lib/image/colorAdjust";
import { Button } from "@/components/ui/button";
import { PanelHint, PanelSection } from "@/components/editor-ui/PanelSection";
import { SliderRow } from "@/components/editor-ui/SliderRow";
import { useT, type MessageKey } from "@/lib/i18n";

interface AdjustPanelProps {
  value: AdjustConfig;
  onChange: (adjust: AdjustConfig) => void;
  /** Sets the sliders to match the current background; null when there is no background to match. */
  onHarmonize: (() => void) | null;
}

const SLIDERS: { key: keyof AdjustConfig; label: MessageKey }[] = [
  { key: "brightness", label: "adjust.brightness" },
  { key: "contrast", label: "adjust.contrast" },
  { key: "saturation", label: "adjust.saturation" },
  { key: "temperature", label: "adjust.temperature" },
];

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

/** Light and color of the subject only (the background keeps its own look). */
export function AdjustPanel({ value, onChange, onHarmonize }: AdjustPanelProps) {
  const t = useT();
  return (
    <PanelSection
      title={t("adjust.title")}
      action={
        <Button size="xs" variant="ghost" disabled={isNeutralAdjust(value)} onClick={() => onChange(NEUTRAL_ADJUST)}>
          <RotateCcw />
          {t("common.reset")}
        </Button>
      }
    >
      <Button variant="secondary" disabled={!onHarmonize} onClick={() => onHarmonize?.()}>
        <Wand />
        {t("adjust.harmonize")}
      </Button>
      {!onHarmonize && <PanelHint className="-mt-1">{t("adjust.harmonizeNeedsBackground")}</PanelHint>}
      {SLIDERS.map(({ key, label }) => (
        <SliderRow
          key={key}
          label={t(label)}
          display={signed(value[key])}
          value={value[key]}
          min={-100}
          max={100}
          onChange={(next) => onChange({ ...value, [key]: next })}
        />
      ))}
    </PanelSection>
  );
}
