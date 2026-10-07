"use client";

import { useEffect, useRef, useState } from "react";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA";
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

/**
 * Lets the user add images without aiming for the dropzone: paste with
 * Ctrl/Cmd+V (e.g. a screenshot) or drop files anywhere on the window.
 * Returns whether a file drag is currently over the page, so the caller can
 * show a full-screen drop hint.
 */
export function useGlobalImageInput(onFiles: (files: File[]) => void): boolean {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  }, [onFiles]);

  useEffect(() => {
    // dragenter/dragleave fire for every child element crossed, so a plain
    // boolean would flicker; count nesting depth instead.
    let dragDepth = 0;

    function onPaste(event: ClipboardEvent) {
      if (isEditableTarget(event.target)) return;
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/")
      );
      if (files.length === 0) return;
      event.preventDefault();
      onFilesRef.current(files);
    }

    function onDragEnter(event: DragEvent) {
      if (!hasFiles(event)) return;
      dragDepth += 1;
      setIsDraggingOver(true);
    }

    function onDragOver(event: DragEvent) {
      // Without this the browser opens the dropped file in the tab instead.
      if (hasFiles(event)) event.preventDefault();
    }

    function onDragLeave(event: DragEvent) {
      if (!hasFiles(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setIsDraggingOver(false);
    }

    function onDrop(event: DragEvent) {
      dragDepth = 0;
      setIsDraggingOver(false);
      // The dropzone component handles (and stops) drops aimed at it.
      if (event.defaultPrevented || !hasFiles(event)) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) onFilesRef.current(files);
    }

    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return isDraggingOver;
}
