"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundConfig } from "@/lib/types";
import { loadSelectedJobId, saveSelectedJobId } from "@/lib/storage/db";
import { copyRenderedImage, downloadRenderedImage } from "@/lib/image/downloadImage";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useBatchQueue } from "@/hooks/useBatchQueue";
import { useGlobalImageInput } from "@/hooks/useGlobalImageInput";
import { useRetouch } from "@/hooks/useRetouch";
import { useEditorHistory } from "@/hooks/useEditorHistory";
import { useCanvasGestures } from "@/hooks/useCanvasGestures";
import { useCropTool } from "@/hooks/useCropTool";
import { useSubjectTransform } from "@/hooks/useSubjectTransform";
import { magicStatusText, useMagicSelect } from "@/hooks/useMagicSelect";
import { eraserStatusText, useMagicEraser } from "@/hooks/useMagicEraser";
import { useZipExport } from "@/hooks/useZipExport";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { toast } from "@/components/ui/toast";
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
import { resolveShortcut } from "@/lib/editor/shortcuts";

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
  // Before/after comparison: null while off, otherwise the 0-1 divider position.
  const [compareSplit, setCompareSplit] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  // Bumped by EditorCanvas after every render: overlays measure the real
  // canvas, which only has fresh layout once the async cutout decode drew it.
  const [canvasRenderTick, setCanvasRenderTick] = useState(0);

  const canvasHandleRef = useRef<EditorCanvasHandle>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  // The room the photo may take on the stage, kept current as the window or panels change.
  const [stageArea, setStageArea] = useState<HTMLDivElement | null>(null);
  const [fitArea, setFitArea] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!stageArea) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFitArea((current) => (current?.width === width && current.height === height ? current : { width, height }));
    });
    observer.observe(stageArea);
    return () => observer.disconnect();
  }, [stageArea]);
  const retouch = useRetouch(selectedJob?.id ?? null, canvasHandleRef);
  // Retouching is on exactly while the Retoque tool is open.
  const retouchActive = activeTool === "retouch";
  const history = useEditorHistory(selectedJob, updateJob, retouch.overridesByJobIdRef, retouch.scheduleRedraw);
  const editorDeps = { selectedJob, updateJob, canvasHandleRef, canvasWrapperRef, canvasRenderTick, history };
  const crop = useCropTool(editorDeps);
  const subject = useSubjectTransform(editorDeps);
  const eraser = useMagicEraser({ selectedJob, canvasHandleRef, replaceJobImages });
  const erasing = retouchActive && retouch.tool === "eraser";
  const magic = useMagicSelect({
    selectedJob,
    active: retouchActive && retouch.tool === "magic",
    overridesByJobIdRef: retouch.overridesByJobIdRef,
    history,
    onOverridesChanged: retouch.scheduleRedraw,
  });
  const zip = useZipExport(jobs, (jobId) => retouch.overridesByJobIdRef.current.get(jobId));
  const gestures = useCanvasGestures({
    selectedJob,
    canvasHandleRef,
    cropActive: crop.active,
    retouchActive,
    erasing,
    retouch,
    eraser,
    magic,
    history,
    subject,
  });
  const stageNav = useStageNavigation(stageElement, gestures.onPointerUp);
  const { view } = stageNav;

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
  // With images but none (or a stale id, e.g. the selected one was removed or
  // never persisted), show the first.
  if (!selectedJob && jobs.length > 0) {
    setSelectedJobId(jobs[0].id);
  }

  // Restore the last-viewed image from a previous session; `selectedJob`
  // simply resolves to null until the persisted jobs finish loading.
  const selectionRestoredRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    loadSelectedJobId().then((id) => {
      if (cancelled) return;
      selectionRestoredRef.current = true;
      if (id) setSelectedJobId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Not before the restore finished: the initial `null` would overwrite the saved id.
  useEffect(() => {
    if (selectionRestoredRef.current) saveSelectedJobId(selectedJobId);
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
    } catch {
      toast.add({ title: t("download.failed"), type: "error" });
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

  // Keyboard shortcuts (listed in the preferences menu); the key map lives in lib/editor/shortcuts.ts.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const action = resolveShortcut(e, {
        cropActive: crop.active,
        editing: Boolean(editing && selectedJob),
        canCompare: Boolean(selectedJob?.originalUrl),
        comparing: compareSplit !== null,
        retouchActive,
        toolOpen: activeTool !== null,
        // Menus, lists and dialogs use letters/digits for their own typeahead.
        inOverlay: Boolean(target?.closest('select, [role="menu"], [role="listbox"], [role="combobox"], [role="dialog"]')),
        tools: TOOLS,
      });
      if (!action) return;
      const brush = retouch.toolbarProps;
      switch (action.type) {
        case "crop-apply": crop.apply(); break;
        case "crop-cancel": crop.cancel(); break;
        case "undo": undo(); break;
        case "redo": redo(); break;
        case "copy": handleCopy(); break;
        case "download": handleQuickDownload(); break;
        case "toggle-compare": setCompareSplit((split) => (split === null ? 0.5 : null)); break;
        case "close-compare": setCompareSplit(null); break;
        case "close-tool": closeTool(); break;
        case "select-tool": selectTool(action.tool as EditorTool); break;
        case "zoom-fit": stageNav.fit(); break;
        case "zoom-in": stageNav.setZoom(view.zoom * 1.25); break;
        case "zoom-out": stageNav.setZoom(view.zoom / 1.25); break;
        case "brush-smaller": brush.onBrushSizeChange(Math.max(4, brush.brushSize - 4)); break;
        case "brush-larger": brush.onBrushSizeChange(Math.min(120, brush.brushSize + 4)); break;
      }
      e.preventDefault();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // Undo entries (framing in pixels, mask sized for the old photo) no longer
  // fit a swapped photo. A different photo (scale 1) also drops the old strokes;
  // an enlargement keeps them, upsampled by `getOverrideBuffer`.
  const handleReplaceJobFile = useCallback(
    (id: string, file: File, sourceScale = 1) => {
      const error = replaceJobFile(id, file, sourceScale);
      if (!error) {
        history.forget(id);
        if (sourceScale === 1) retouch.overridesByJobIdRef.current.delete(id);
      }
      return error;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `forget` and the override map only touch refs
    [replaceJobFile]
  );

  const handleRemoveJob = useCallback(
    (id: string) => {
      const removed = jobs.find((job) => job.id === id);
      if (removed?.background.kind === "image") {
        const { url } = removed.background;
        // "Aplicar a todas" shares one URL between jobs: only the last user frees it.
        if (!jobs.some((job) => job.id !== id && job.background.kind === "image" && job.background.url === url)) {
          URL.revokeObjectURL(url);
        }
      }
      retouch.overridesByJobIdRef.current.delete(id);
      history.forget(id);
      eraser.forget(id);
      setSelectedJobId((current) => (current === id ? null : current));
      removeJob(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the override map is a stable ref; `forget` only touches refs
    [removeJob, jobs]
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
    jobs.forEach((job) => {
      if (job.status !== "done") return;
      if (setting === "canvas") {
        // Only what the Size panel sets. Framing (crop, offsets, scale, rotation)
        // is in each photo's own pixels, and shadow/edge/adjust are separate panels.
        const { preset, widthPx, heightPx, marginPercent, centerSubject } = selectedJob.canvas;
        updateJob(job.id, { canvas: { ...job.canvas, preset, widthPx, heightPx, marginPercent, centerSubject } });
      } else {
        updateJob(job.id, { [setting]: selectedJob[setting] });
      }
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
          replaceJobFile={handleReplaceJobFile}
          onBackgroundChange={handleBackgroundChange}
          onApplyToAll={applyToAll}
          crop={crop}
          retouch={{
            ...retouch.toolbarProps,
            magic: {
              mode: magic.mode,
              onModeChange: magic.setMode,
              statusText: magicStatusText(magic.status),
              sizes: magic.sizes,
              onSizeChange: magic.chooseSize,
            },
            eraser: {
              canErase: eraser.hasMask,
              canUndo: eraser.canUndo,
              busy: eraser.status.kind === "working",
              needsDownload: eraser.needsDownload,
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
                    ref={setStageArea}
                    onPointerDown={gestures.onPointerDown}
                    onPointerMove={gestures.onPointerMove}
                    onPointerUp={gestures.onPointerUp}
                    onPointerLeave={gestures.onPointerUp}
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
                        fitArea={fitArea}
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
