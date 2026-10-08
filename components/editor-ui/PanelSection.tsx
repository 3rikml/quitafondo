import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelSectionProps {
  title: string;
  /** Small control on the right of the title (e.g. "Aplicar a todas", "Restablecer"). */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** One titled group inside a tool panel; consecutive sections are separated by a hairline. */
export function PanelSection({ title, action, className, children }: PanelSectionProps) {
  return (
    <section className={cn("flex flex-col gap-3 border-t border-border/70 pt-4 first:border-t-0 first:pt-0", className)}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Muted helper text under a control. */
export function PanelHint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs leading-relaxed text-muted-foreground", className)}>{children}</p>;
}
