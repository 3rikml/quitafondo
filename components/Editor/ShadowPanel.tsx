"use client";

import type { ShadowConfig, ShadowKind } from "@/lib/types";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{t("shadow.title")}</h3>
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
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("shadow.intensity", { value: value.intensity })}</span>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[value.intensity]}
            onValueChange={(values) => {
              const intensity = Array.isArray(values) ? values[0] : values;
              onChange({ ...value, intensity });
            }}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {t(value.kind === "contact" ? "shadow.hintContact" : value.kind === "soft" ? "shadow.hintSoft" : "shadow.hintNone")}
      </p>
    </div>
  );
}
