"use client";

import { useRef } from "react";
import { AlertCircle, Plus, X } from "lucide-react";
import type { ImageJob } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface FilmstripProps {
  jobs: ImageJob[];
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAddFiles: (files: File[]) => void;
}

/** A progress ring drawn over a thumbnail while its background is removed. */
function ProgressRing({ value }: { value: number | undefined }) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const indeterminate = value === undefined;
  return (
    <svg viewBox="0 0 36 36" className={cn("size-8", indeterminate && "animate-spin")} aria-hidden="true">
      <circle cx="18" cy="18" r={radius} fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={indeterminate ? circumference * 0.7 : circumference * (1 - value)}
        transform="rotate(-90 18 18)"
        className="transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  );
}

/** The batch, as a strip of thumbnails under the stage, with an "add photos" tile. */
export function Filmstrip({ jobs, selectedJobId, onSelect, onRemove, onAddFiles }: FilmstripProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-[76px] shrink-0 items-center gap-2 overflow-x-auto border-t bg-card px-3">
      {jobs.map((job) => {
        const selected = job.id === selectedJobId;
        const busy = job.status === "pending" || job.status === "processing";
        return (
          <div key={job.id} className="group relative shrink-0">
            <button
              type="button"
              onClick={() => onSelect(job.id)}
              aria-pressed={selected}
              aria-label={t("strip.select", { name: job.fileName })}
              title={job.notice ?? job.errorMessage ?? job.fileName}
              className={cn(
                "relative block size-14 overflow-hidden rounded-lg bg-muted ring-offset-2 ring-offset-card transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "ring-2 ring-primary" : "opacity-80 hover:opacity-100"
              )}
            >
              {job.originalUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- local blob: URL, nothing for next/image to optimize
                <img src={job.originalUrl} alt="" className="size-full object-cover" />
              )}
              {busy && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/45">
                  <ProgressRing value={job.status === "processing" ? job.progress : undefined} />
                </span>
              )}
              {job.status === "error" && (
                <span className="absolute inset-0 flex items-center justify-center bg-destructive/50 text-white">
                  <AlertCircle className="size-5" />
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onRemove(job.id)}
              aria-label={t("queue.remove", { name: job.fileName })}
              className="absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full border bg-popover text-muted-foreground shadow group-hover:flex group-focus-within:flex hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-muted-foreground/40 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Plus className="size-4" />
        {t("strip.add")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) onAddFiles(files);
        }}
      />
    </div>
  );
}
