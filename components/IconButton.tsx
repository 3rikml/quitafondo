"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * An icon-only `Button` with a matching tooltip, so the same short label
 * serves as both the tooltip text and the accessible name (`aria-label`) —
 * one source of truth instead of a button that's only labelled for screen
 * readers and unexplained for everyone else.
 */
export function IconButton({
  label,
  size = "icon",
  variant = "ghost",
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button size={size} variant={variant} aria-label={label} {...props} />} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
