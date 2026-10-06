"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageDropzoneProps {
  onFilesSelected: (files: File[]) => void;
}

export function ImageDropzone({ onFilesSelected }: ImageDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      // Everything the user dropped is forwarded, including non-images: the
      // queue validates each file and shows a readable reason for the ones it
      // cannot process, which is clearer than dropping them silently.
      const files = Array.from(fileList);
      if (files.length > 0) onFilesSelected(files);
    },
    [onFilesSelected]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40"
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-full transition-colors",
          isDragging ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        <UploadCloud className="size-5" strokeWidth={1.75} />
      </span>
      <p className="text-sm font-medium">Arrastra tus imágenes aquí</p>
      <p className="text-xs text-muted-foreground">o haz clic para seleccionarlas (puedes elegir varias)</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
