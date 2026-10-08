import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "cn"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  "aria-label": ariaLabel,
  fillFrom,
  ...props
}: SliderPrimitive.Root.Props & {
  /**
   * Draw the filled part from this value instead of from `min` — for
   * bipolar controls (-100..100) whose neutral point is in the middle.
   */
  fillFrom?: number
}) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-muted select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
        >
          {fillFrom === undefined ? (
            <SliderPrimitive.Indicator
              data-slot="slider-range"
              className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
            />
          ) : (
            <BipolarFill from={fillFrom} value={_values[0] ?? fillFrom} min={min} max={max} />
          )}
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            // The accessible name belongs on the thumb's input, not the root.
            getAriaLabel={ariaLabel ? () => ariaLabel : undefined}
            className="relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

/** Fill from `from` to `value` (either direction), plus a tick at `from`. Horizontal sliders only. */
function BipolarFill({ from, value, min, max }: { from: number; value: number; min: number; max: number }) {
  const pct = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100
  const start = Math.min(pct(from), pct(value))
  const end = Math.max(pct(from), pct(value))
  return (
    <>
      <span
        data-slot="slider-range"
        className="absolute inset-y-0 bg-primary"
        style={{ left: `${start}%`, width: `${end - start}%` }}
      />
      <span className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${pct(from)}%` }} aria-hidden="true" />
    </>
  )
}

export { Slider }
