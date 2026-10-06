"use client";

import { useRef, useState } from "react";
import { Ban, Blend, CopyCheck, ImageIcon, PaintBucket } from "lucide-react";
import type { BackgroundConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";

interface BackgroundPanelProps {
  value: BackgroundConfig;
  onChange: (config: BackgroundConfig) => void;
  onApplyToAll: () => void;
}

export function BackgroundPanel({ value, onChange, onApplyToAll }: BackgroundPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Which tab is VISIBLE, tracked separately from the committed config: the
  // "Imagen" tab must be openable before a file exists (there is nothing to
  // commit yet), which a tab driven straight off `value.kind` cannot do.
  const [activeTab, setActiveTab] = useState<BackgroundConfig["kind"]>(value.kind);

  // Follow the committed config when it changes from the outside ("Aplicar a
  // todas", or a file finally chosen for an image background) so the panel
  // never shows a tab that disagrees with the applied background. This is the
  // "adjust state during render" pattern — no effect, no extra render pass.
  const [lastCommittedKind, setLastCommittedKind] = useState<BackgroundConfig["kind"]>(value.kind);
  if (lastCommittedKind !== value.kind) {
    setLastCommittedKind(value.kind);
    setActiveTab(value.kind);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Fondo</h3>
        <Button size="sm" variant="ghost" onClick={onApplyToAll}>
          <CopyCheck />
          Aplicar a todas
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(kind) => {
          setActiveTab(kind as BackgroundConfig["kind"]);
          handleTabChange(kind as BackgroundConfig["kind"]);
        }}
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="transparent" title="Sin fondo" aria-label="Sin fondo">
            <Ban />
          </TabsTrigger>
          <TabsTrigger value="solid" title="Color sólido" aria-label="Color sólido">
            <PaintBucket />
          </TabsTrigger>
          <TabsTrigger value="gradient" title="Degradado" aria-label="Degradado">
            <Blend />
          </TabsTrigger>
          <TabsTrigger value="image" title="Imagen" aria-label="Imagen">
            <ImageIcon />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="solid" className="flex items-center gap-2 pt-2">
          <input
            type="color"
            value={value.kind === "solid" ? value.color : "#ffffff"}
            onChange={(e) => onChange({ kind: "solid", color: e.target.value })}
            className="h-9 w-14 cursor-pointer rounded border"
          />
        </TabsContent>

        <TabsContent value="gradient" className="flex flex-col gap-3 pt-2">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.kind === "gradient" ? value.from : "#ffffff"}
              onChange={(e) =>
                onChange({
                  kind: "gradient",
                  from: e.target.value,
                  to: value.kind === "gradient" ? value.to : "#000000",
                  angleDeg: value.kind === "gradient" ? value.angleDeg : 90,
                })
              }
              className="h-9 w-14 cursor-pointer rounded border"
            />
            <input
              type="color"
              value={value.kind === "gradient" ? value.to : "#000000"}
              onChange={(e) =>
                onChange({
                  kind: "gradient",
                  from: value.kind === "gradient" ? value.from : "#ffffff",
                  to: e.target.value,
                  angleDeg: value.kind === "gradient" ? value.angleDeg : 90,
                })
              }
              className="h-9 w-14 cursor-pointer rounded border"
            />
          </div>
          <Slider
            min={0}
            max={360}
            step={1}
            value={[value.kind === "gradient" ? value.angleDeg : 90]}
            onValueChange={(values) => {
              const angleDeg = Array.isArray(values) ? values[0] : values;
              onChange({
                kind: "gradient",
                from: value.kind === "gradient" ? value.from : "#ffffff",
                to: value.kind === "gradient" ? value.to : "#000000",
                angleDeg,
              });
            }}
          />
        </TabsContent>

        <TabsContent value="image" className="pt-2">
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            Elegir imagen…
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onChange({ kind: "image", url: URL.createObjectURL(file) });
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );

  function handleTabChange(kind: BackgroundConfig["kind"]) {
    if (kind === "transparent") onChange({ kind: "transparent" });
    if (kind === "solid" && value.kind !== "solid") onChange({ kind: "solid", color: "#ffffff" });
    if (kind === "gradient" && value.kind !== "gradient") {
      onChange({ kind: "gradient", from: "#ffffff", to: "#000000", angleDeg: 90 });
    }
    // "image" commits nothing: there is no URL until the user picks a file, so
    // the previous background stays applied while its file picker is on screen.
    // Only `activeTab` moves (see the Tabs `onValueChange` above).
  }
}
