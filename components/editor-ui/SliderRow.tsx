"use client";

import { Slider } from "@/components/ui/slider";

interface SliderRowProps {
  label: string;
  value: number;
  /** Shown on the right; defaults to the number itself. */
  display?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/** A labeled slider with its current value aligned to the right. */
export function SliderRow({ label, value, display, min, max, step = 1, onChange, disabled }: SliderRowProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-foreground/90">{label}</span>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{display ?? value}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        aria-label={label}
        onValueChange={(values) => onChange(Array.isArray(values) ? values[0] : (values as number))}
      />
    </div>
  );
}
