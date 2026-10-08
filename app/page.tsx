"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundConfig, ImageJob } from "@/lib/types";
import { loadSelectedJobId, saveSelectedJobId } from "@/lib/storage/db";
import { downloadRenderedImage } from "@/lib/image/downloadImage";
import { cn } from "@/lib/utils";
import { useBatchQueue } from "@/hooks/useBatchQueue";
import { useGlobalImageInput } from "@/hooks/useGlobalImageInput";
import { useRetouch } from "@/hooks/useRetouch";
import { useEditorHistory, type HistoryEntry } from "@/hooks/useEditorHistory";
import { useCropTool } from "@/hooks/useCropTool";
import { useSubjectTransform } from "@/hooks/useSubjectTransform";
import { ImageDropzone } from "@/components/ImageDropzone";
import { BatchQueue } from "@/components/BatchQueue";
import { AppHeader, DropHint, SidePanel, UnsupportedBrowserBanner } from "@/components/Layout";
import { EditorCanvas, type EditorCanvasHandle } from "@/components/Editor/EditorCanvas";
import { CanvasToolbar } from "@/components/Editor/CanvasToolbar";
import { CompareOverlay, CropOverlay, SubjectHandles } from "@/components/Editor/CanvasOverlays";
import { EmptyCanvasView, ProcessingView } from "@/components/Editor/ProcessingView";
import { EditorSidebar, EditorSidebarEmpty } from "@/components/Editor/EditorSidebar";

export default function Home() {
  const { jobs, addFiles, updateJob, retryJob, removeJob, replaceJobFile, isSupported } = useBatchQueue();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? null, [jobs, selectedJobId]);

  const [zoom, setZoom] = useState(1);
  // Before/after comparison: null while off, otherwise the 0-1 divider position.
  const [compareSplit, setCompareSplit] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
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

  // Canvas gestures: a brush stroke while retouching, otherwise dragging the subject.
  function handleCanvasPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (crop.active || !selectedJob) return;
    const canvas = e.currentTarget.querySelector("canvas");
    if (retouch.active) {
      strokeStartRef.current = history.snapshot(selectedJob);
      if (canvas) retouch.paintAt(canvas, e.clientX, e.clientY);
      return;
    }
    subject.startDrag(e.clientX, e.clientY);
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const canvas = e.currentTarget.querySelector("canvas");
    if (!canvas) return;
    if (retouch.active) {
      if (strokeStartRef.current) retouch.paintAt(canvas, e.clientX, e.clientY);
      return;
    }
    subject.moveDrag(canvas, e.clientX, e.clientY);
  }

  function handleCanvasPointerUp() {
    const strokeStart = strokeStartRef.current;
    strokeStartRef.current = null;
    if (strokeStart && selectedJob) history.record(selectedJob.id, strokeStart);
    subject.endDrag();
  }

  // Keyboard: Enter/Escape for the crop tool, Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z
  // for undo/redo, Escape to close a mobile drawer.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

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
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const handleRemoveJob = useCallback(
    (id: string) => {
      retouch.overridesByJobIdRef.current.delete(id);
      history.forget(id);
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
          title="Imágenes"
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
                  retouch.active ? "cursor-crosshair" : "cursor-move"
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
          title="Editar"
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
              history={history}
              retouch={retouch.toolbarProps}
              getRenderedPixelBuffer={() => canvasHandleRef.current?.getRenderedPixelBuffer() ?? null}
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
