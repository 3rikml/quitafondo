"use client";

import type { ShadowConfig, ShadowKind } from "@/lib/types";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ShadowPanelProps {
  value: ShadowConfig;
  onChange: (shadow: ShadowConfig) => void;
}

const KIND_LABELS: Record<ShadowKind, string> = {
  none: "Sin sombra",
  soft: "Suave",
  contact: "Contacto",
};

export function ShadowPanel({ value, onChange }: ShadowPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Sombra</h3>
      <Tabs value={value.kind} onValueChange={(kind) => onChange({ ...value, kind: kind as ShadowKind })}>
        <TabsList className="grid w-full grid-cols-3">
          {(Object.keys(KIND_LABELS) as ShadowKind[]).map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {value.kind !== "none" && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Intensidad ({value.intensity}%)</span>
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
        {value.kind === "contact"
          ? "Una sombra en el suelo, ideal para productos."
          : value.kind === "soft"
            ? "Una sombra difusa detrás del sujeto que le da profundidad."
            : "Añade profundidad sobre fondos de color o degradados."}
      </p>
    </div>
  );
}
