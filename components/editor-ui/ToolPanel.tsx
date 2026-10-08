"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface ToolPanelProps {
  title: string;
  onClose: () => void;
  /** "side": desktop column next to the rail. "sheet": mobile bottom sheet under the stage (the photo shrinks above it). */
  variant: "side" | "sheet";
  children: ReactNode;
}

/** The open tool's controls: a column on desktop, a bottom sheet on phones. */
export function ToolPanel({ title, onClose, variant, children }: ToolPanelProps) {
  const t = useT();
  const sheet = variant === "sheet";
  return (
    <aside
      aria-label={title}
      className={cn(
        "flex flex-col bg-card",
        sheet
          ? "animate-in slide-in-from-bottom-4 fade-in-0 relative z-10 max-h-[46vh] shrink-0 rounded-t-2xl border-t shadow-[0_-12px_32px_-12px_rgb(0_0_0/0.5)] duration-200"
          : "animate-in slide-in-from-left-2 fade-in-0 w-[300px] shrink-0 border-r duration-150"
      )}
    >
      {sheet && <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />}
      <header className="flex h-12 shrink-0 items-center justify-between px-4">
        <h2 className="font-heading text-[15px] font-semibold tracking-tight">{title}</h2>
        <IconButton label={t("tool.close")} size="icon-sm" variant="ghost" onClick={onClose}>
          <X />
        </IconButton>
      </header>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pt-1 pb-5">{children}</div>
    </aside>
  );
}
