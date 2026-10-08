"use client";

import { useRef, useState, type CSSProperties } from "react";
import { Aperture, Ban, Blend, CopyCheck, ImageIcon, PaintBucket } from "lucide-react";
import type { BackgroundConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useT, type MessageKey } from "@/lib/i18n";

/** One-click starting points; every one stays fully editable in its tab below. */
const PRESETS: { label: MessageKey; config: BackgroundConfig }[] = [
  { label: "background.preset.white", config: { kind: "solid", color: "#ffffff" } },
  { label: "background.preset.lightGray", config: { kind: "solid", color: "#eceae6" } },
  { label: "background.preset.black", config: { kind: "solid", color: "#111111" } },
  { label: "background.preset.sand", config: { kind: "solid", color: "#e9dcc7" } },
  { label: "background.preset.pink", config: { kind: "solid", color: "#f6d6dc" } },
  { label: "background.preset.sky", config: { kind: "solid", color: "#cfe3f5" } },
  { label: "background.preset.mint", config: { kind: "solid", color: "#d3eedf" } },
  { label: "background.preset.sunset", config: { kind: "gradient", from: "#ffb88c", to: "#de6262", angleDeg: 135 } },
  { label: "background.preset.ocean", config: { kind: "gradient", from: "#a1c4fd", to: "#2b5876", angleDeg: 160 } },
  { label: "background.preset.peach", config: { kind: "gradient", from: "#fff1eb", to: "#f5c6a5", angleDeg: 90 } },
  { label: "background.preset.lavender", config: { kind: "gradient", from: "#e0c3fc", to: "#8ec5fc", angleDeg: 135 } },
  { label: "background.preset.studio", config: { kind: "gradient", from: "#fafafa", to: "#cfcfcf", angleDeg: 90 } },
];

function swatchStyle(config: BackgroundConfig): CSSProperties {
  if (config.kind === "solid") return { background: config.color };
  if (config.kind === "gradient") {
    // Canvas angles start at "pointing right"; CSS ones at "pointing up".
    return { background: `linear-gradient(${config.angleDeg + 90}deg, ${config.from}, ${config.to})` };
  }
  return {};
}

function isSameBackground(a: BackgroundConfig, b: BackgroundConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface BackgroundPanelProps {
  value: BackgroundConfig;
  onChange: (config: BackgroundConfig) => void;
  onApplyToAll: () => void;
}

export function BackgroundPanel({ value, onChange, onApplyToAll }: BackgroundPanelProps) {
  const t = useT();
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
        <h3 className="text-sm font-semibold">{t("background.title")}</h3>
        <Button size="sm" variant="ghost" onClick={onApplyToAll}>
          <CopyCheck />
          {t("common.applyToAll")}
        </Button>
      </div>

      <div className="grid grid-cols-6 gap-1.5" role="group" aria-label={t("background.presets")}>
        {PRESETS.map(({ label, config }) => (
          <button
            key={label}
            type="button"
            title={t(label)}
            aria-label={t(label)}
            aria-pressed={isSameBackground(value, config)}
            onClick={() => onChange(config)}
            className={cn(
              "aspect-square rounded-md border shadow-xs transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              isSameBackground(value, config) && "ring-2 ring-primary ring-offset-1 ring-offset-background"
            )}
            style={swatchStyle(config)}
          />
        ))}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(kind) => {
          setActiveTab(kind as BackgroundConfig["kind"]);
          handleTabChange(kind as BackgroundConfig["kind"]);
        }}
      >
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="transparent" title={t("background.tab.transparent")} aria-label={t("background.tab.transparent")}>
            <Ban />
          </TabsTrigger>
          <TabsTrigger value="solid" title={t("background.tab.solid")} aria-label={t("background.tab.solid")}>
            <PaintBucket />
          </TabsTrigger>
          <TabsTrigger value="gradient" title={t("background.tab.gradient")} aria-label={t("background.tab.gradient")}>
            <Blend />
          </TabsTrigger>
          <TabsTrigger value="image" title={t("background.tab.image")} aria-label={t("background.tab.image")}>
            <ImageIcon />
          </TabsTrigger>
          <TabsTrigger value="blur" title={t("background.tab.blur")} aria-label={t("background.tab.blur")}>
            <Aperture />
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

        <TabsContent value="blur" className="flex flex-col gap-1 pt-2">
          <span className="text-xs text-muted-foreground">
            {t("background.blurAmount", { amount: value.kind === "blur" ? value.amount : 50 })}
          </span>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[value.kind === "blur" ? value.amount : 50]}
            onValueChange={(values) => {
              const amount = Array.isArray(values) ? values[0] : values;
              onChange({ kind: "blur", amount });
            }}
          />
        </TabsContent>

        <TabsContent value="image" className="pt-2">
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            {t("background.chooseImage")}
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
    if (kind === "blur" && value.kind !== "blur") onChange({ kind: "blur", amount: 50 });
    // "image" commits nothing: there is no URL until the user picks a file, so
    // the previous background stays applied while its file picker is on screen.
    // Only `activeTab` moves (see the Tabs `onValueChange` above).
  }
}
