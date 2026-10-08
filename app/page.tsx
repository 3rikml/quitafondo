"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundConfig, ImageJob } from "@/lib/types";
import { loadSelectedJobId, saveSelectedJobId } from "@/lib/storage/db";
import { copyRenderedImage, downloadRenderedImage } from "@/lib/image/downloadImage";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useBatchQueue } from "@/hooks/useBatchQueue";
import { useGlobalImageInput } from "@/hooks/useGlobalImageInput";
import { useRetouch } from "@/hooks/useRetouch";
import { useEditorHistory, type HistoryEntry } from "@/hooks/useEditorHistory";
import { useCropTool } from "@/hooks/useCropTool";
import { useSubjectTransform } from "@/hooks/useSubjectTransform";
import { magicStatusText, useMagicSelect } from "@/hooks/useMagicSelect";
import { eraserStatusText, useMagicEraser } from "@/hooks/useMagicEraser";
import { useZipExport } from "@/hooks/useZipExport";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { toast } from "@/components/ui/toast";
import { canvasToSourceCoords } from "@/components/Editor/RetouchToolbar";
import { EditorCanvas, type EditorCanvasHandle } from "@/components/Editor/EditorCanvas";
import { CompareOverlay, CropOverlay, SubjectHandles } from "@/components/Editor/CanvasOverlays";
import { ProcessingView } from "@/components/Editor/ProcessingView";
import { TopBar } from "@/components/editor-ui/TopBar";
import { DownloadMenu } from "@/components/editor-ui/DownloadMenu";
import { ToolRail } from "@/components/editor-ui/ToolRail";
import { ToolPanel } from "@/components/editor-ui/ToolPanel";
import { ToolPanelContent } from "@/components/editor-ui/ToolPanelContent";
import { Filmstrip } from "@/components/editor-ui/Filmstrip";
import { WelcomeView } from "@/components/editor-ui/WelcomeView";
import { StageHint, ZoomPill } from "@/components/editor-ui/StageControls";
import { BrushCursor, type BrushCursorVariant } from "@/components/editor-ui/BrushCursor";
import { useStageNavigation } from "@/hooks/useStageNavigation";
import { DropHint, UnsupportedBrowserBanner } from "@/components/editor-ui/Overlays";
import { TOOLS, type EditorTool } from "@/components/editor-ui/tools";

export default function Home() {
  const t = useT();
  const isDesktop = useIsDesktop();
  const { jobs, addFiles, updateJob, retryJob, removeJob, replaceJobFile, replaceJobImages, isSupported } =
    useBatchQueue();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? null, [jobs, selectedJobId]);
  const editing = selectedJob?.status === "done" && Boolean(selectedJob.cutoutBlob);

  // The open tool: on desktop a side panel (Fondo open by default), on phones
  // a bottom sheet (closed until tapped, so it does not hide the photo).
  const [desktopTool, setDesktopTool] = useState<EditorTool | null>("background");
  const [mobileTool, setMobileTool] = useState<EditorTool | null>(null);
  const activeTool = editing ? (isDesktop ? desktopTool : mobileTool) : null;

  // Zoom and pan of the stage (wheel, pinch, Space + drag).
  const [stageElement, setStageElement] = useState<HTMLElement | null>(null);
  const stageNav = useStageNavigation(stageElement, handleCanvasPointerUp);
  const { view } = stageNav;
  // Before/after comparison: null while off, otherwise the 0-1 divider position.
  const [compareSplit, setCompareSplit] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  // Bumped by EditorCanvas after every render: overlays measure the real
  // canvas, which only has fresh layout once the async cutout decode drew it.
  const [canvasRenderTick, setCanvasRenderTick] = useState(0);

  const canvasHandleRef = useRef<EditorCanvasHandle>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  // State right before the current brush stroke, recorded as one undo step on pointerup.
  const strokeStartRef = useRef<HistoryEntry | null>(null);

  const retouch = useRetouch(selectedJob?.id ?? null, canvasHandleRef);
  // Retouching is on exactly while the Retoque tool is open.
  const retouchActive = activeTool === "retouch";
  const history = useEditorHistory(selectedJob, updateJob, retouch.overridesByJobIdRef, retouch.scheduleRedraw);
  const editorDeps = { selectedJob, updateJob, canvasHandleRef, canvasWrapperRef, canvasRenderTick, history };
  const crop = useCropTool(editorDeps);
  const subject = useSubjectTransform(editorDeps);
  const eraser = useMagicEraser({ selectedJob, canvasHandleRef, replaceJobImages });
  const erasing = retouchActive && retouch.tool === "eraser";
  // True while the pointer is down painting eraser strokes.
  const eraserStrokeRef = useRef(false);
  const magic = useMagicSelect({
    selectedJob,
    active: retouchActive && retouch.tool === "magic",
    overridesByJobIdRef: retouch.overridesByJobIdRef,
    history,
    onOverridesChanged: retouch.scheduleRedraw,
  });
  const zip = useZipExport(jobs, (jobId) => retouch.overridesByJobIdRef.current.get(jobId));

  function selectTool(tool: EditorTool) {
    const current = isDesktop ? desktopTool : mobileTool;
    const next = current === tool ? null : tool;
    if (next !== "size" && crop.active) crop.cancel();
    if (isDesktop) setDesktopTool(next);
    else setMobileTool(next);
  }

  function closeTool() {
    if (crop.active) crop.cancel();
    if (isDesktop) setDesktopTool(null);
    else setMobileTool(null);
  }

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
    stageNav.fit();
  }
  // With images but none selected (e.g. the selected one was removed), show the first.
  if (!selectedJob && selectedJobId === null && jobs.length > 0) {
    setSelectedJobId(jobs[0].id);
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

  // Fit the brush to each image once it has been drawn (its pixel size is known then).
  const editingJobId = editing ? selectedJob?.id : undefined;
  const { fitBrushToImage } = retouch;
  useEffect(() => {
    const size = canvasHandleRef.current?.getSourceSize();
    if (editingJobId && size) fitBrushToImage(editingJobId, size.width, size.height);
  }, [editingJobId, canvasRenderTick, fitBrushToImage]);

  // Jump straight to the first new image, so the user watches it being processed.
  const handleFilesSelected = useCallback(
    (files: File[]) => {
      const [firstId] = addFiles(files);
      if (firstId) setSelectedJobId(firstId);
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
      toast.add({ title: t("download.done"), type: "success" });
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleCopy() {
    const pixels = canvasHandleRef.current?.getRenderedPixelBuffer();
    if (!pixels) return;
    try {
      await copyRenderedImage(pixels);
      toast.add({ title: t("download.copied"), type: "success" });
    } catch {
      toast.add({ title: t("toolbar.copyFailed"), type: "error" });
    }
  }

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
    if (retouchActive && retouch.tool === "magic") {
      const fit = canvasHandleRef.current?.getFit();
      if (!canvas || !fit) return;
      const { x, y } = canvasToSourceCoords(canvas, fit, e.clientX, e.clientY);
      // Alt/Option flips the action, so both are one click away.
      magic.selectAt(x, y, magic.add !== e.altKey);
      return;
    }
    if (retouchActive) {
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
    if (retouchActive) {
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

  // Keyboard shortcuts (listed in the preferences menu). Ignored while typing
  // in a field; single-key ones only act on a finished image.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const key = e.key.toLowerCase();
      const modifier = e.ctrlKey || e.metaKey;

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
      if (!editing || !selectedJob) return;
      if (modifier && e.shiftKey && key === "c") {
        e.preventDefault();
        handleCopy();
        return;
      }
      if (modifier || e.altKey) return;
      const brush = retouch.toolbarProps;
      const tool = TOOLS.find((item) => item.key === e.key);
      if (tool) selectTool(tool.id);
      else if (key === "d") handleQuickDownload();
      else if (key === "c" && selectedJob.originalUrl) setCompareSplit((split) => (split === null ? 0.5 : null));
      else if (key === "b") selectTool("retouch");
      else if (e.key === "0") stageNav.fit();
      else if (e.key === "+" || e.key === "=") stageNav.setZoom(view.zoom * 1.25);
      else if (e.key === "-") stageNav.setZoom(view.zoom / 1.25);
      else if (e.key === "[" && retouchActive) brush.onBrushSizeChange(Math.max(4, brush.brushSize - 4));
      else if (e.key === "]" && retouchActive) brush.onBrushSizeChange(Math.min(120, brush.brushSize + 4));
      else if (e.key === "Escape") {
        if (compareSplit !== null) setCompareSplit(null);
        else if (activeTool) closeTool();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the override map is a stable ref; `forget` only touches refs
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

  const showSubjectHandles = !retouchActive && !crop.active && compareSplit === null && subject.handleRect;
  // Painting tools show their real brush size under the pointer.
  const navCursor = stageNav.panning ? "cursor-grabbing" : stageNav.spaceHeld ? "cursor-grab" : null;
  const brushVariant: BrushCursorVariant | null = !retouchActive
    ? null
    : retouch.tool === "eraser"
      ? "eraser"
      : retouch.tool === "brush"
        ? retouch.toolbarProps.mode
        : null;
  const getBrushScreenRadius = () => {
    const canvas = canvasWrapperRef.current?.querySelector("canvas");
    const fit = canvasHandleRef.current?.getFit();
    if (!canvas || !fit || canvas.width === 0) return null;
    return retouch.toolbarProps.brushSize * fit.scale * (canvas.getBoundingClientRect().width / canvas.width);
  };
  const stageHint = crop.active
    ? t("stage.hint.crop")
    : retouchActive
      ? t(
          retouch.tool === "magic"
            ? "stage.hint.magic"
            : retouch.tool === "eraser"
              ? "stage.hint.eraser"
              : retouch.toolbarProps.mode === "erase"
                ? "stage.hint.erase"
                : "stage.hint.restore"
        )
      : null;

  const toolPanel =
    editing && selectedJob && activeTool ? (
      <ToolPanel
        title={t(TOOLS.find((tool) => tool.id === activeTool)!.label)}
        onClose={closeTool}
        variant={isDesktop ? "side" : "sheet"}
      >
        <ToolPanelContent
          tool={activeTool}
          job={selectedJob}
          updateJob={updateJob}
          replaceJobFile={replaceJobFile}
          onBackgroundChange={handleBackgroundChange}
          onApplyToAll={applyToAll}
          crop={crop}
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
          getHarmonyStats={() => canvasHandleRef.current?.getHarmonyStats() ?? null}
        />
      </ToolPanel>
    ) : null;

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar
        fileName={selectedJob?.fileName ?? null}
        canUndo={editing && history.canUndo}
        canRedo={editing && history.canRedo}
        onUndo={undo}
        onRedo={redo}
        isComparing={compareSplit !== null}
        canCompare={editing && Boolean(selectedJob?.originalUrl)}
        onToggleCompare={() => setCompareSplit((split) => (split === null ? 0.5 : null))}
        download={
          jobs.length > 0 && <DownloadMenu
            exportConfig={editing && selectedJob ? selectedJob.exportConfig : null}
            onExportConfigChange={(exportConfig) => selectedJob && updateJob(selectedJob.id, { exportConfig })}
            onDownload={handleQuickDownload}
            isDownloading={isDownloading}
            onCopy={handleCopy}
            onDownloadAll={zip.downloadAll}
            isZipping={zip.isZipping}
            doneCount={zip.doneCount}
            zipError={zip.error}
          />
        }
      />
      {!isSupported && <UnsupportedBrowserBanner />}

      {jobs.length === 0 ? (
        <div className="qf-stage min-h-0 flex-1">
          <WelcomeView onFiles={handleFilesSelected} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {isDesktop && <ToolRail orientation="vertical" active={activeTool} onSelect={selectTool} disabled={!editing} />}
          {isDesktop && toolPanel}

          <div className="relative flex min-w-0 flex-1 flex-col">
            <section
              ref={setStageElement}
              className="qf-stage relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden p-4 lg:p-10"
            >
              {editing && selectedJob?.cutoutBlob ? (
                <>
                  <div
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={handleCanvasPointerUp}
                    onPointerLeave={handleCanvasPointerUp}
                    className={cn(
                      "flex h-full w-full items-center justify-center",
                      navCursor ??
                        (!retouchActive ? "cursor-move" : retouch.tool === "magic" ? "cursor-pointer" : "cursor-crosshair")
                    )}
                    style={{ transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})` }}
                  >
                    <div
                      ref={canvasWrapperRef}
                      className={cn(
                        "relative shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)]",
                        brushVariant && !navCursor && "cursor-none"
                      )}
                    >
                      <EditorCanvas
                        ref={canvasHandleRef}
                        cutoutBlob={selectedJob.cutoutBlob}
                        originalUrl={selectedJob.originalUrl}
                        background={selectedJob.background}
                        canvasConfig={selectedJob.canvas}
                        getOverrideBuffer={retouch.getOverrideBuffer}
                        retouchVersion={retouch.version}
                        onRender={() => setCanvasRenderTick((tick) => tick + 1)}
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
                  {brushVariant && !navCursor && (
                    <BrushCursor areaRef={canvasWrapperRef} getScreenRadius={getBrushScreenRadius} variant={brushVariant} />
                  )}
                  {stageHint && (
                    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
                      <StageHint text={stageHint} />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
                    <ZoomPill view={view} onZoomChange={stageNav.setZoom} onFit={stageNav.fit} />
                  </div>
                </>
              ) : selectedJob && selectedJob.originalUrl ? (
                <ProcessingView job={selectedJob} onRetry={() => retryJob(selectedJob.id)} />
              ) : null}
            </section>

            {!isDesktop && toolPanel}
            {/* On phones the open tool's sheet takes the strip's place. */}
            {(isDesktop || !toolPanel) && (
              <Filmstrip
                jobs={jobs}
                selectedJobId={selectedJobId}
                onSelect={setSelectedJobId}
                onRemove={handleRemoveJob}
                onAddFiles={handleFilesSelected}
              />
            )}
            {!isDesktop && (
              <ToolRail orientation="horizontal" active={activeTool} onSelect={selectTool} disabled={!editing} />
            )}
          </div>
        </div>
      )}
      {isDraggingFiles && <DropHint />}
    </main>
  );
}
