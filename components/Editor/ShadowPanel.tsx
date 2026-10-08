"use client";

import type { ShadowConfig, ShadowKind } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PanelHint, PanelSection } from "@/components/editor-ui/PanelSection";
import { SliderRow } from "@/components/editor-ui/SliderRow";
import { useT, type MessageKey } from "@/lib/i18n";

interface ShadowPanelProps {
  value: ShadowConfig;
  onChange: (shadow: ShadowConfig) => void;
}

const KIND_LABELS: Record<ShadowKind, MessageKey> = {
  none: "shadow.none",
  soft: "shadow.soft",
  contact: "shadow.contact",
};

export function ShadowPanel({ value, onChange }: ShadowPanelProps) {
  const t = useT();
  return (
    <PanelSection title={t("shadow.title")}>
      <Tabs value={value.kind} onValueChange={(kind) => onChange({ ...value, kind: kind as ShadowKind })}>
        <TabsList className="grid w-full grid-cols-3">
          {(Object.keys(KIND_LABELS) as ShadowKind[]).map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {t(KIND_LABELS[kind])}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {value.kind !== "none" && (
        <SliderRow
          label={t("shadow.intensity")}
          display={`${value.intensity}%`}
          value={value.intensity}
          min={0}
          max={100}
          onChange={(intensity) => onChange({ ...value, intensity })}
        />
      )}
      <PanelHint>
        {t(value.kind === "contact" ? "shadow.hintContact" : value.kind === "soft" ? "shadow.hintSoft" : "shadow.hintNone")}
      </PanelHint>
    </PanelSection>
  );
}
