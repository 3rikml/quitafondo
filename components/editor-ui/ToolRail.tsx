"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { TOOLS, type EditorTool } from "./tools";

interface ToolRailProps {
  active: EditorTool | null;
  onSelect: (tool: EditorTool) => void;
  disabled?: boolean;
  /** "vertical": desktop rail on the left. "horizontal": mobile bar at the bottom. */
  orientation: "vertical" | "horizontal";
}

/** The tool picker. Selecting the open tool again closes its panel. */
export function ToolRail({ active, onSelect, disabled, orientation }: ToolRailProps) {
  const t = useT();
  const vertical = orientation === "vertical";
  return (
    <nav
      aria-label={t("panel.edit")}
      className={cn(
        "flex shrink-0 bg-card",
        vertical
          ? "w-[76px] flex-col items-center gap-1 border-r py-3"
          : "justify-around border-t px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
      )}
    >
      {TOOLS.map(({ id, label, icon: Icon, key }) => {
        const selected = active === id;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            title={t("tool.shortcut", { name: t(label), key })}
            onClick={() => onSelect(id)}
            className={cn(
              "group flex flex-col items-center justify-center gap-1 rounded-xl text-[10.5px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
              vertical ? "h-[60px] w-[64px]" : "h-[52px] min-w-[60px] flex-1",
              selected ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className={cn("size-5 transition-transform", selected && "scale-105")} strokeWidth={1.75} />
            {t(label)}
          </button>
        );
      })}
    </nav>
  );
}
