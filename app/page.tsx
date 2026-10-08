"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundConfig, ImageJob } from "@/lib/types";
import { loadSelectedJobId, saveSelectedJobId } from "@/lib/storage/db";
import { copyRenderedImage, downloadRenderedImage } from "@/lib/image/downloadImage";
import { cn } from "@/lib/utils";
import { useBatchQueue } from "@/hooks/useBatchQueue";
import { useGlobalImageInput } from "@/hooks/useGlobalImageInput";
import { useRetouch } from "@/hooks/useRetouch";
import { useEditorHistory, type HistoryEntry } from "@/hooks/useEditorHistory";
import { useCropTool } from "@/hooks/useCropTool";
import { useSubjectTransform } from "@/hooks/useSubjectTransform";
import { magicStatusText, useMagicSelect } from "@/hooks/useMagicSelect";
import { eraserStatusText, useMagicEraser } from "@/hooks/useMagicEraser";
import { canvasToSourceCoords } from "@/components/Editor/RetouchToolbar";
import { ImageDropzone } from "@/components/ImageDropzone";
import { BatchQueue } from "@/components/BatchQueue";
import { AppHeader, DropHint, SidePanel, UnsupportedBrowserBanner } from "@/components/Layout";
import { EditorCanvas, type EditorCanvasHandle } from "@/components/Editor/EditorCanvas";
import { CanvasToolbar, type CopyState } from "@/components/Editor/CanvasToolbar";
import { CompareOverlay, CropOverlay, SubjectHandles } from "@/components/Editor/CanvasOverlays";
import { EmptyCanvasView, ProcessingView } from "@/components/Editor/ProcessingView";
import { EditorSidebar, EditorSidebarEmpty } from "@/components/Editor/EditorSidebar";
import { useT } from "@/lib/i18n";

export default function Home() {
  const t = useT();
  const { jobs, addFiles, updateJob, retryJob, removeJob, replaceJobFile, replaceJobImages, isSupported } =
    useBatchQueue();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? null, [jobs, selectedJobId]);

  const [zoom, setZoom] = useState(1);
  // Before/after comparison: null while off, otherwise the 0-1 divider position.
  const [compareSplit, setCompareSplit] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Below `lg` the two side columns are slide-over drawers.
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);
  // Bumped by EditorCanvas after every render: overlays measure the real
  // canvas, which only has fresh layout once the async cutout decode drew it.
  const [canvasRenderTick, setCanvasRenderTick] = useState(0);

  const canvasHandleRef = useRef<EditorCanvasHandle>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  // State right before the current brush stroke, recorded as one undo step on pointerup.
  const strokeStartRef = useRef<HistoryEntry | null>(null);

  const retouch = useRetouch(selectedJob?.id ?? null, canvasHandleRef);
  const history = useEditorHistory(selectedJob, updateJob, retouch.overridesByJobIdRef, retouch.scheduleRedraw);
  const editorDeps = { selectedJob, updateJob, canvasHandleRef, canvasWrapperRef, canvasRenderTick, history };
  const crop = useCropTool(editorDeps);
  const subject = useSubjectTransform(editorDeps);
  const eraser = useMagicEraser({ selectedJob, canvasHandleRef, replaceJobImages });
  const erasing = retouch.active && retouch.tool === "eraser";
  // True while the pointer is down painting eraser strokes.
  const eraserStrokeRef = useRef(false);
  const magic = useMagicSelect({
    selectedJob,
    active: retouch.active && retouch.tool === "magic",
    overridesByJobIdRef: retouch.overridesByJobIdRef,
    history,
    onOverridesChanged: retouch.scheduleRedraw,
  });

  // Undo/redo change the mask under a pending magic-selection size choice, so drop it.
  function undo() {
    magic.forget();
    history.undo();
  }
  function redo() {
    magic.forget();
    history.redo();
  }

  // Comparison belongs to the image it was opened on ("adjust state during render").
  const [lastSelectedJobId, setLastSelectedJobId] = useState(selectedJobId);
  if (selectedJobId !== lastSelectedJobId) {
    setLastSelectedJobId(selectedJobId);
    setCompareSplit(null);
  }

  // Restore the last-viewed image from a previous session; `selectedJob`
  // simply resolves to null until the persisted jobs finish loading.
  useEffect(() => {
    let cancelled = false;
    loadSelectedJobId().then((id) => {
      if (!cancelled && id) setSelectedJobId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveSelectedJobId(selectedJobId);
  }, [selectedJobId]);

  // Jump straight to the first new image, so the user watches it being processed.
  const handleFilesSelected = useCallback(
    (files: File[]) => {
      const [firstId] = addFiles(files);
      if (firstId) {
        setSelectedJobId(firstId);
        setMobileLeftOpen(false);
      }
    },
    [addFiles]
  );
  const isDraggingFiles = useGlobalImageInput(handleFilesSelected);

  async function handleQuickDownload() {
    const pixels = canvasHandleRef.current?.getRenderedPixelBuffer();
    if (!pixels || !selectedJob) return;
    setIsDownloading(true);
    try {
      await downloadRenderedImage(pixels, selectedJob.exportConfig, selectedJob.fileName.replace(/\.[^.]+$/, ""));
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleCopy() {
    const pixels = canvasHandleRef.current?.getRenderedPixelBuffer();
    if (!pixels) return;
    setCopyState("copying");
    try {
      await copyRenderedImage(pixels);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    copyResetRef.current = setTimeout(() => setCopyState("idle"), 2000);
  }

  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    []
  );

  // Canvas gestures: a brush stroke while retouching, otherwise dragging the subject.
  function handleCanvasPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (crop.active || !selectedJob) return;
    const canvas = e.currentTarget.querySelector("canvas");
    if (erasing) {
      if (!canvas) return;
      eraserStrokeRef.current = true;
      eraser.paintAt(canvas, e.clientX, e.clientY, retouch.toolbarProps.brushSize);
      return;
    }
    if (retouch.active && retouch.tool === "magic") {
      const fit = canvasHandleRef.current?.getFit();
      if (!canvas || !fit) return;
      const { x, y } = canvasToSourceCoords(canvas, fit, e.clientX, e.clientY);
      // Alt/Option flips the action, so both are one click away.
      magic.selectAt(x, y, magic.add !== e.altKey);
      return;
    }
    if (retouch.active) {
      magic.forget(); // a size change after this stroke would overwrite it
      strokeStartRef.current = history.snapshot(selectedJob);
      if (canvas) retouch.paintAt(canvas, e.clientX, e.clientY);
      return;
    }
    subject.startDrag(e.clientX, e.clientY);
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const canvas = e.currentTarget.querySelector("canvas");
    if (!canvas) return;
    if (erasing) {
      if (eraserStrokeRef.current) eraser.paintAt(canvas, e.clientX, e.clientY, retouch.toolbarProps.brushSize);
      return;
    }
    if (retouch.active) {
      if (strokeStartRef.current) retouch.paintAt(canvas, e.clientX, e.clientY);
      return;
    }
    subject.moveDrag(canvas, e.clientX, e.clientY);
  }

  function handleCanvasPointerUp() {
    eraserStrokeRef.current = false;
    const strokeStart = strokeStartRef.current;
    strokeStartRef.current = null;
    if (strokeStart && selectedJob) history.record(selectedJob.id, strokeStart);
    subject.endDrag();
  }

  // Keyboard shortcuts (listed in CanvasToolbar's help popover). Ignored
  // while typing in a field; single-letter ones only act on a finished image.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const key = e.key.toLowerCase();
      const modifier = e.ctrlKey || e.metaKey;

      if (e.key === "Escape" && (mobileLeftOpen || mobileRightOpen)) {
        setMobileLeftOpen(false);
        setMobileRightOpen(false);
        return;
      }
      if (crop.active && (e.key === "Enter" || e.key === "Escape")) {
        e.preventDefault();
        if (e.key === "Enter") crop.apply();
        else crop.cancel();
        return;
      }
      if (modifier && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      const editing = selectedJob?.status === "done";
      if (!editing) return;
      if (modifier && e.shiftKey && key === "c") {
        e.preventDefault();
        handleCopy();
        return;
      }
      if (modifier || e.altKey) return;
      const brush = retouch.toolbarProps;
      if (key === "d") handleQuickDownload();
      else if (key === "c" && selectedJob.originalUrl) setCompareSplit((split) => (split === null ? 0.5 : null));
      else if (key === "b") retouch.setActive(!retouch.active);
      else if (e.key === "[" && retouch.active) brush.onBrushSizeChange(Math.max(4, brush.brushSize - 4));
      else if (e.key === "]" && retouch.active) brush.onBrushSizeChange(Math.min(120, brush.brushSize + 4));
      else if (e.key === "Escape") {
        if (compareSplit !== null) setCompareSplit(null);
        else if (retouch.active) retouch.setActive(false);
        else return;
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const handleRemoveJob = useCallback(
    (id: string) => {
      retouch.overridesByJobIdRef.current.delete(id);
      history.forget(id);
      eraser.forget(id);
      setSelectedJobId((current) => (current === id ? null : current));
      removeJob(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the override map is a stable ref; `history.forget` only touches its own ref
    [removeJob]
  );

  /**
   * Revokes the previous background-image object URL before committing a new
   * one — unless another job still uses that same URL ("Aplicar a todas"
   * copies it across jobs), which revoking would silently break.
   */
  function handleBackgroundChange(background: BackgroundConfig) {
    if (!selectedJob) return;
    const previous = selectedJob.background;
    if (previous.kind === "image" && (background.kind !== "image" || background.url !== previous.url)) {
      const stillReferenced = jobs.some(
        (job) => job.id !== selectedJob.id && job.background.kind === "image" && job.background.url === previous.url
      );
      if (!stillReferenced) URL.revokeObjectURL(previous.url);
    }
    updateJob(selectedJob.id, { background });
  }

  function applyToAll(setting: "background" | "canvas" | "exportConfig") {
    if (!selectedJob) return;
    const patch: Partial<ImageJob> = { [setting]: selectedJob[setting] };
    jobs.forEach((job) => {
      if (job.status === "done") updateJob(job.id, patch);
    });
  }

  const showSubjectHandles = !retouch.active && !crop.active && compareSplit === null && subject.handleRect;

  return (
    <main className="flex h-screen flex-col">
      <AppHeader onOpenImages={() => setMobileLeftOpen(true)} onOpenControls={() => setMobileRightOpen(true)} />
      {!isSupported && <UnsupportedBrowserBanner />}

      <div className="relative flex flex-1 overflow-hidden">
        <SidePanel
          side="left"
          title={t("panel.images")}
          open={mobileLeftOpen}
          onClose={() => setMobileLeftOpen(false)}
          className="lg:w-72"
        >
          <ImageDropzone onFilesSelected={handleFilesSelected} />
          <div className="mt-5">
            <BatchQueue
              jobs={jobs}
              selectedJobId={selectedJobId}
              onSelectJob={(id) => {
                setSelectedJobId(id);
                setMobileLeftOpen(false);
              }}
              onRetryJob={retryJob}
              onRemoveJob={handleRemoveJob}
              getRetouchOverride={(jobId) => retouch.overridesByJobIdRef.current.get(jobId)}
            />
          </div>
        </SidePanel>

        <section className="relative flex flex-1 items-center justify-center overflow-auto bg-muted/30 p-4 lg:p-8">
          {selectedJob?.status === "done" && selectedJob.cutoutBlob ? (
            <>
              <CanvasToolbar
                formatLabel={selectedJob.exportConfig.format.toUpperCase()}
                isDownloading={isDownloading}
                onDownload={handleQuickDownload}
                copyState={copyState}
                onCopy={handleCopy}
                isComparing={compareSplit !== null}
                canCompare={Boolean(selectedJob.originalUrl)}
                onToggleCompare={() => setCompareSplit((split) => (split === null ? 0.5 : null))}
                zoom={zoom}
                onZoomChange={setZoom}
              />
              <div
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerLeave={handleCanvasPointerUp}
                className={cn(
                  "flex h-full w-full items-center justify-center",
                  !retouch.active ? "cursor-move" : retouch.tool === "magic" ? "cursor-pointer" : "cursor-crosshair"
                )}
                style={{ transform: `scale(${zoom})` }}
              >
                <div ref={canvasWrapperRef} className="relative">
                  <EditorCanvas
                    ref={canvasHandleRef}
                    cutoutBlob={selectedJob.cutoutBlob}
                    originalUrl={selectedJob.originalUrl}
                    background={selectedJob.background}
                    canvasConfig={selectedJob.canvas}
                    getOverrideBuffer={retouch.getOverrideBuffer}
                    retouchVersion={retouch.version}
                    onRender={() => setCanvasRenderTick((t) => t + 1)}
                    compareSplit={compareSplit}
                    eraseMask={erasing ? eraser.mask : null}
                    eraseMaskVersion={eraser.version}
                  />
                  {compareSplit !== null && <CompareOverlay split={compareSplit} onSplitChange={setCompareSplit} />}
                  {showSubjectHandles && subject.handleRect && (
                    <SubjectHandles
                      rect={subject.handleRect}
                      rotation={subject.handleRotation}
                      onResizeStart={subject.resizeHandlers.resizeStart}
                      onResizeMove={subject.resizeHandlers.resizeMove}
                      onResizeEnd={subject.resizeHandlers.resizeEnd}
                    />
                  )}
                  {crop.active && crop.handleRect && <CropOverlay rect={crop.handleRect} {...crop.overlayHandlers} />}
                </div>
              </div>
            </>
          ) : selectedJob && selectedJob.originalUrl ? (
            <ProcessingView job={selectedJob} onRetry={() => retryJob(selectedJob.id)} />
          ) : (
            <EmptyCanvasView />
          )}
        </section>

        <SidePanel
          side="right"
          title={t("panel.edit")}
          open={mobileRightOpen}
          onClose={() => setMobileRightOpen(false)}
          className="lg:w-80"
        >
          {selectedJob?.status === "done" ? (
            <EditorSidebar
              job={selectedJob}
              updateJob={updateJob}
              replaceJobFile={replaceJobFile}
              onBackgroundChange={handleBackgroundChange}
              onApplyToAll={applyToAll}
              crop={crop}
              history={{ ...history, undo, redo }}
              retouch={{
                ...retouch.toolbarProps,
                magic: {
                  add: magic.add,
                  onAddChange: magic.setAdd,
                  statusText: magicStatusText(magic.status),
                  sizes: magic.sizes,
                  onSizeChange: magic.chooseSize,
                },
                eraser: {
                  canErase: eraser.hasMask,
                  canUndo: eraser.canUndo,
                  busy: eraser.status.kind === "working",
                  statusText: eraserStatusText(eraser.status),
                  onErase: eraser.erase,
                  onClear: eraser.clear,
                  onUndo: eraser.undo,
                },
              }}
              getRenderedPixelBuffer={() => canvasHandleRef.current?.getRenderedPixelBuffer() ?? null}
              getHarmonyStats={() => canvasHandleRef.current?.getHarmonyStats() ?? null}
            />
          ) : (
            <EditorSidebarEmpty />
          )}
        </SidePanel>
      </div>
      {isDraggingFiles && <DropHint />}
    </main>
  );
}
