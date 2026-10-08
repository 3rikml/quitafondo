"use client";

import type { EdgeConfig } from "@/lib/types";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PanelSection } from "@/components/editor-ui/PanelSection";
import { SliderRow } from "@/components/editor-ui/SliderRow";
import { useT } from "@/lib/i18n";

interface EdgePanelProps {
  value: EdgeConfig;
  onChange: (edge: EdgeConfig) => void;
}

/** Fine-tunes the cutout edge: soften it, grow/shrink it, and remove color halos. */
export function EdgePanel({ value, onChange }: EdgePanelProps) {
  const t = useT();
  const shiftLabel = value.shift === 0 ? t("edge.shiftNone") : value.shift > 0 ? `+${value.shift} px` : `${value.shift} px`;
  return (
    <PanelSection title={t("edge.title")}>
      <SliderRow
        label={t("edge.feather")}
        display={`${value.feather} px`}
        value={value.feather}
        min={0}
        max={10}
        onChange={(feather) => onChange({ ...value, feather })}
      />
      <SliderRow
        label={t("edge.shift")}
        display={shiftLabel}
        value={value.shift}
        min={-5}
        max={5}
        onChange={(shift) => onChange({ ...value, shift })}
      />
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="edge-decontaminate" className="text-xs leading-snug font-normal text-foreground/90">
          {t("edge.decontaminate")}
        </Label>
        <Switch
          id="edge-decontaminate"
          checked={value.decontaminate}
          onCheckedChange={(decontaminate) => onChange({ ...value, decontaminate })}
        />
      </div>
    </PanelSection>
  );
}
