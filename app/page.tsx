"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Columns2,
  Download,
  ImagePlus,
  LoaderCircle,
  Redo2,
  Replace,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Undo2,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createOverrideBuffer } from "@/lib/image/alphaCompose";
import { clampCropBox, type BoundingBox } from "@/lib/image/boundingBox";
import type { BackgroundConfig, CanvasConfig } from "@/lib/types";
import { loadSelectedJobId, saveSelectedJobId } from "@/lib/storage/db";
import { useBatchQueue } from "@/hooks/useBatchQueue";
import { useGlobalImageInput } from "@/hooks/useGlobalImageInput";
import { downloadRenderedImage } from "@/lib/image/downloadImage";
import { ImageDropzone } from "@/components/ImageDropzone";
import { BatchQueue } from "@/components/BatchQueue";
import { EditorCanvas, type EditorCanvasHandle } from "@/components/Editor/EditorCanvas";
import { BackgroundPanel } from "@/components/Editor/BackgroundPanel";
import { CanvasSizePanel } from "@/components/Editor/CanvasSizePanel";
import {
  RetouchToolbar,
  paintBrushStroke,
  paintSmartBrushStroke,
  createSmartBrushScratch,
  canvasToSourceCoords,
  type RetouchMode,
} from "@/components/Editor/RetouchToolbar";
import { upscaleImage } from "@/hooks/useImageUpscale";
import { ExportPanel } from "@/components/Editor/ExportPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconButton } from "@/components/IconButton";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

/** Snapshot of everything undo/redo can restore for one job: its position
 * (`CanvasConfig`, which also carries the manual offsetX/offsetY from
 * drag-to-reposition) and its retouch mask at that moment. */
interface HistoryEntry {
  canvas: CanvasConfig;
  overrideSnapshot: Int16Array;
}

/** Capped per job: each entry clones a full-resolution Int16Array, so an
 * unbounded stack could grow into hundreds of MB on large photos. */
const HISTORY_LIMIT = 20;

const RESIZE_HANDLE_MIN_SCALE = 0.1;
const RESIZE_HANDLE_MAX_SCALE = 5;

interface HandleRectPercent {
  leftPct: number;
  topPct: number;
  rightPct: number;
  bottomPct: number;
}

const RESIZE_HANDLES: { key: string; x: "leftPct" | "rightPct"; y: "topPct" | "bottomPct"; cursor: string }[] = [
  { key: "tl", x: "leftPct", y: "topPct", cursor: "nwse-resize" },
  { key: "tr", x: "rightPct", y: "topPct", cursor: "nesw-resize" },
  { key: "bl", x: "leftPct", y: "bottomPct", cursor: "nesw-resize" },
  { key: "br", x: "rightPct", y: "bottomPct", cursor: "nwse-resize" },
];

/** Which edges of the crop box a given corner handle drag should move —
 * shares its corner naming ("tl"/"tr"/"bl"/"br") with `RESIZE_HANDLES`. */
type CropHandleKey = "tl" | "tr" | "bl" | "br";

/** Projects a source-image-space box through a fit into a percentage rect
 * (relative to the canvas's own pixel size) — shared by the subject-handle
 * and crop-handle positioning effects below. */
function boxToPercentRect(
  box: BoundingBox,
  fit: { scale: number; offsetX: number; offsetY: number },
  canvasWidth: number,
  canvasHeight: number
): HandleRectPercent {
  const left = fit.offsetX + box.x * fit.scale;
  const top = fit.offsetY + box.y * fit.scale;
  const right = fit.offsetX + (box.x + box.width) * fit.scale;
  const bottom = fit.offsetY + (box.y + box.height) * fit.scale;
  return {
    leftPct: (left / canvasWidth) * 100,
    topPct: (top / canvasHeight) * 100,
    rightPct: (right / canvasWidth) * 100,
    bottomPct: (bottom / canvasHeight) * 100,
  };
}

export default function Home() {
  const { jobs, addFiles, updateJob, retryJob, removeJob, replaceJobFile, isSupported } = useBatchQueue();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [retouchActive, setRetouchActive] = useState(false);
  const [retouchMode, setRetouchMode] = useState<RetouchMode>("erase");
  const [brushSize, setBrushSize] = useState(24);
  const [brushHardness, setBrushHardness] = useState(1);
  const [smartRetouch, setSmartRetouch] = useState(false);
  const [retouchTolerance, setRetouchTolerance] = useState(30);
  const [retouchVersion, setRetouchVersion] = useState(0);
  const [zoom, setZoom] = useState(1);
  // Before/after comparison: null while off, otherwise the 0-1 position of
  // the divider (original photo to its left, result to its right).
  const [compareSplit, setCompareSplit] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  // Below the `lg` breakpoint the image list and the edit panel become
  // slide-over drawers instead of permanent side columns (there's no room
  // for three columns on a phone) — these track whether each is open. They
  // have no effect at `lg` and up, where both asides are always visible.
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);
  // Bumped whenever a job's undo/redo stack changes, purely so the
  // undo/redo buttons re-render enabled/disabled — the stacks themselves
  // live in a ref and don't otherwise trigger React updates.
  const [historyVersion, setHistoryVersion] = useState(0);
  // On-screen position of the subject's four corners, as a percentage of the
  // canvas's own rendered box — recomputed (in an effect, since it needs the
  // real DOM canvas element) whenever the subject might have moved/resized.
  const [handleRect, setHandleRect] = useState<HandleRectPercent | null>(null);
  // The subject's current rotation, as a CSS transform to apply to the resize
  // handle overlay so it keeps wrapping the (rotated) subject — the handle
  // positions themselves (`handleRect`) are computed pre-rotation, same as
  // the canvas's own `fit`, so the overlay needs this to visually match.
  const [handleRotation, setHandleRotation] = useState<{
    deg: number;
    originXPct: number;
    originYPct: number;
  } | null>(null);
  // Bumped by EditorCanvas's onRender callback — see the effect below for why
  // this can't just be `selectedJob`: the cutout's decode is async, so the
  // FIRST time a job is selected, selectedJob already has its final value
  // before EditorCanvas has actually drawn anything yet.
  const [canvasRenderTick, setCanvasRenderTick] = useState(0);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [upscaleError, setUpscaleError] = useState<string | null>(null);
  // Crop tool: `cropMode` shows the draggable overlay; `cropDraft` is the
  // in-progress rectangle (source-image pixel coords) it edits, uncommitted
  // until "Aplicar" writes it to `canvas.cropBox`.
  const [cropMode, setCropMode] = useState(false);
  const [cropDraft, setCropDraft] = useState<BoundingBox | null>(null);
  const [cropHandleRect, setCropHandleRect] = useState<HandleRectPercent | null>(null);

  const canvasHandleRef = useRef<EditorCanvasHandle>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const resizeStartRef = useRef<{
    pointerId: number;
    centerClientX: number;
    centerClientY: number;
    startDistance: number;
    startScale: number;
    snapshot: HistoryEntry;
  } | null>(null);
  // Retouch overrides live here, one buffer per job id, so switching to another
  // image and back preserves that image's strokes.
  const overridesByJobIdRef = useRef<Map<string, Int16Array>>(new Map());
  // Scratch workspace for the "smart" retouch brush's flood fill. One shared
  // buffer is enough even across jobs: it self-resizes to the current job's
  // pixel count and is fully reset after every dab (see `paintSmartBrushStroke`).
  const smartBrushScratchRef = useRef(createSmartBrushScratch(0));
  const historyByJobIdRef = useRef<Map<string, { past: HistoryEntry[]; future: HistoryEntry[] }>>(new Map());
  // The state right before the CURRENT gesture (retouch stroke or drag)
  // started, captured on pointerdown and only committed to history on
  // pointerup — never per pointermove, or every brush dab would be its own
  // undo step.
  const gestureStartRef = useRef<HistoryEntry | null>(null);
  const isPaintingRef = useRef(false);
  const retouchRafRef = useRef<number | null>(null);
  // Drag-to-reposition state: the pointer's start position and the subject's
  // offset at that moment, so the drag reads as a delta rather than drifting
  // if the pointer moves faster than the resulting re-renders.
  const dragStartRef = useRef<{ clientX: number; clientY: number; offsetX: number; offsetY: number } | null>(null);
  // Crop drag state: which handle (or "move" for the box body) started the
  // gesture, the pointer's start position, and the box as it was then — the
  // same "read the drag as a delta from a frozen start" shape as the other
  // drag refs above.
  const cropDragRef = useRef<{
    pointerId: number;
    mode: "move" | CropHandleKey;
    clientX: number;
    clientY: number;
    startBox: BoundingBox;
  } | null>(null);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? null, [jobs, selectedJobId]);
  const selectedJobIdForOverrides = selectedJob?.id ?? null;

  const getOverrideBuffer = useCallback(
    (pixelCount: number) => {
      if (!selectedJobIdForOverrides) return createOverrideBuffer(pixelCount);
      const existing = overridesByJobIdRef.current.get(selectedJobIdForOverrides);
      if (existing && existing.length === pixelCount) return existing;
      const created = createOverrideBuffer(pixelCount);
      overridesByJobIdRef.current.set(selectedJobIdForOverrides, created);
      return created;
    },
    [selectedJobIdForOverrides]
  );

  // Don't leave a queued frame behind when the page unmounts.
  useEffect(
    () => () => {
      if (retouchRafRef.current !== null) cancelAnimationFrame(retouchRafRef.current);
    },
    []
  );

  // Restore the last-viewed image from a previous session. Setting the id
  // before `jobs` finishes loading is fine: `selectedJob`'s useMemo just
  // resolves to null until a matching job shows up, then resolves normally.
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

  // Closes whichever mobile drawer is open on Escape, matching the backdrop
  // click and the in-drawer close button.
  useEffect(() => {
    if (!mobileLeftOpen && !mobileRightOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setMobileLeftOpen(false);
      setMobileRightOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileLeftOpen, mobileRightOpen]);

  // Switching images mid-crop would otherwise keep editing a rectangle that
  // belongs to the job the user just navigated away from. Resetting during
  // render (the "adjusting state when a prop changes" pattern) instead of in
  // an effect avoids an extra commit.
  const [lastSelectedJobId, setLastSelectedJobId] = useState(selectedJobId);
  if (selectedJobId !== lastSelectedJobId) {
    setLastSelectedJobId(selectedJobId);
    setCropMode(false);
    setCropDraft(null);
    setCompareSplit(null);
  }

  // Positions the resize handles on the subject's actual on-screen corners.
  // Needs the real DOM <canvas> (for its rendered box) AND EditorCanvas's
  // internal fit/subject-box refs to already reflect the current job — which
  // `canvasRenderTick` (bumped by EditorCanvas's onRender) guarantees and a
  // plain `selectedJob` dependency would not: the cutout's decode is async,
  // so on the FIRST selection of a job, `selectedJob` already holds its final
  // value before EditorCanvas has drawn anything at all.
  useEffect(() => {
    const canvas = canvasWrapperRef.current?.querySelector("canvas");
    const fit = canvasHandleRef.current?.getFit();
    const sourceSize = canvasHandleRef.current?.getSourceSize();
    const box = selectedJob?.canvas.cropBox ?? canvasHandleRef.current?.getSubjectBox();
    if (!canvas || !fit || !sourceSize || canvas.width === 0 || canvas.height === 0) {
      setHandleRect(null);
      setHandleRotation(null);
      return;
    }
    const effectiveBox = box ?? { x: 0, y: 0, width: sourceSize.width, height: sourceSize.height };
    setHandleRect(boxToPercentRect(effectiveBox, fit, canvas.width, canvas.height));
    setHandleRotation({
      deg: fit.rotationDeg,
      originXPct: (fit.anchorX / canvas.width) * 100,
      originYPct: (fit.anchorY / canvas.height) * 100,
    });
  }, [selectedJob, canvasRenderTick]);

  // Positions the crop overlay's own corner handles/body, same idea as the
  // effect above but driven by the in-progress `cropDraft` instead of the
  // subject box, and only while the crop tool is actually open.
  useEffect(() => {
    if (!cropMode || !cropDraft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing with the DOM canvas's measured size, not derivable during render
      setCropHandleRect(null);
      return;
    }
    const canvas = canvasWrapperRef.current?.querySelector("canvas");
    const fit = canvasHandleRef.current?.getFit();
    if (!canvas || !fit || canvas.width === 0 || canvas.height === 0) {
      setCropHandleRect(null);
      return;
    }
    setCropHandleRect(boxToPercentRect(cropDraft, fit, canvas.width, canvas.height));
  }, [cropMode, cropDraft, canvasRenderTick]);

  // Jump straight to the first new image, so the user watches it being
  // processed instead of having to find and click it in the list.
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

  const handleQuickDownload = useCallback(async () => {
    const pixels = canvasHandleRef.current?.getRenderedPixelBuffer();
    if (!pixels || !selectedJob) return;
    setIsDownloading(true);
    try {
      await downloadRenderedImage(pixels, selectedJob.exportConfig, selectedJob.fileName.replace(/\.[^.]+$/, ""));
    } finally {
      setIsDownloading(false);
    }
  }, [selectedJob]);

  function getHistory(jobId: string) {
    let history = historyByJobIdRef.current.get(jobId);
    if (!history) {
      history = { past: [], future: [] };
      historyByJobIdRef.current.set(jobId, history);
    }
    return history;
  }

  function snapshotJob(job: NonNullable<typeof selectedJob>): HistoryEntry {
    const overrides = overridesByJobIdRef.current.get(job.id);
    return { canvas: job.canvas, overrideSnapshot: (overrides ?? new Int16Array(0)).slice() };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (cropMode) return;
    if (selectedJob) gestureStartRef.current = snapshotJob(selectedJob);

    if (retouchActive) {
      isPaintingRef.current = true;
      paintAtEvent(e);
      return;
    }
    if (!selectedJob) return;
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      offsetX: selectedJob.canvas.offsetX,
      offsetY: selectedJob.canvas.offsetY,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (retouchActive) {
      if (isPaintingRef.current) paintAtEvent(e);
      return;
    }
    dragSubjectAtEvent(e);
  }

  function handlePointerUp() {
    const hadGesture = isPaintingRef.current || dragStartRef.current !== null;
    isPaintingRef.current = false;
    dragStartRef.current = null;

    if (hadGesture && selectedJob && gestureStartRef.current) {
      const history = getHistory(selectedJob.id);
      history.past.push(gestureStartRef.current);
      if (history.past.length > HISTORY_LIMIT) history.past.shift();
      history.future = [];
      setHistoryVersion((v) => v + 1);
    }
    gestureStartRef.current = null;
  }

  /**
   * Converts the pointer's on-screen movement since the drag started into a
   * canvas-pixel delta (accounting for the canvas being displayed smaller or
   * larger than its own pixel dimensions) and writes it into the job's
   * `canvas.offsetX/offsetY`, on top of whatever position it started the drag
   * at — so repeated drags accumulate instead of resetting each time.
   */
  function dragSubjectAtEvent(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start || !selectedJob) return;
    const canvas = e.currentTarget.querySelector("canvas");
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const deltaX = (e.clientX - start.clientX) * scaleX;
    const deltaY = (e.clientY - start.clientY) * scaleY;

    updateJob(selectedJob.id, {
      canvas: { ...selectedJob.canvas, offsetX: start.offsetX + deltaX, offsetY: start.offsetY + deltaY },
    });
  }

  /**
   * Resize handles scale the subject relative to its own on-screen center,
   * measured as distance-from-center in viewport pixels: dragging a corner
   * twice as far from center as where the drag started doubles the scale.
   * `stopPropagation` keeps these events from also reaching the wrapper's
   * drag-to-reposition handlers.
   */
  function handleResizeHandlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!selectedJob) return;
    const canvas = canvasWrapperRef.current?.querySelector("canvas");
    const fit = canvasHandleRef.current?.getFit();
    const sourceSize = canvasHandleRef.current?.getSourceSize();
    const box = canvasHandleRef.current?.getSubjectBox();
    if (!canvas || !fit || !sourceSize) return;

    const effectiveBox = box ?? { x: 0, y: 0, width: sourceSize.width, height: sourceSize.height };
    const centerCanvasX = fit.offsetX + (effectiveBox.x + effectiveBox.width / 2) * fit.scale;
    const centerCanvasY = fit.offsetY + (effectiveBox.y + effectiveBox.height / 2) * fit.scale;
    const rect = canvas.getBoundingClientRect();
    const centerClientX = rect.left + (centerCanvasX / canvas.width) * rect.width;
    const centerClientY = rect.top + (centerCanvasY / canvas.height) * rect.height;
    const startDistance = Math.hypot(e.clientX - centerClientX, e.clientY - centerClientY) || 1;

    resizeStartRef.current = {
      pointerId: e.pointerId,
      centerClientX,
      centerClientY,
      startDistance,
      startScale: selectedJob.canvas.manualScale,
      snapshot: snapshotJob(selectedJob),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleResizeHandlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const start = resizeStartRef.current;
    if (!start || !selectedJob) return;
    const currentDistance = Math.hypot(e.clientX - start.centerClientX, e.clientY - start.centerClientY);
    const newScale = Math.min(
      RESIZE_HANDLE_MAX_SCALE,
      Math.max(RESIZE_HANDLE_MIN_SCALE, start.startScale * (currentDistance / start.startDistance))
    );
    updateJob(selectedJob.id, { canvas: { ...selectedJob.canvas, manualScale: newScale } });
  }

  function handleResizeHandlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const start = resizeStartRef.current;
    resizeStartRef.current = null;
    if (!start || !selectedJob) return;
    e.currentTarget.releasePointerCapture(start.pointerId);

    const history = getHistory(selectedJob.id);
    history.past.push(start.snapshot);
    if (history.past.length > HISTORY_LIMIT) history.past.shift();
    history.future = [];
    setHistoryVersion((v) => v + 1);
  }

  /**
   * Enters crop mode, seeding the draggable rectangle from whatever is
   * already "the subject": an existing crop (so re-opening the tool edits
   * it further rather than starting over), else the auto-detected alpha
   * bounding box, else the whole image.
   */
  function handleStartCrop() {
    if (!selectedJob) return;
    const sourceSize = canvasHandleRef.current?.getSourceSize();
    const box =
      selectedJob.canvas.cropBox ??
      canvasHandleRef.current?.getSubjectBox() ??
      (sourceSize ? { x: 0, y: 0, width: sourceSize.width, height: sourceSize.height } : null);
    if (!box) return;
    setCropDraft(box);
    setCropMode(true);
  }

  /** Resets the in-progress rectangle back to auto-detection, without
   * leaving crop mode or touching the job's already-applied `cropBox`. */
  function handleResetCropDraft() {
    const sourceSize = canvasHandleRef.current?.getSourceSize();
    const box =
      canvasHandleRef.current?.getSubjectBox() ??
      (sourceSize ? { x: 0, y: 0, width: sourceSize.width, height: sourceSize.height } : null);
    if (box) setCropDraft(box);
  }

  function handleCancelCrop() {
    setCropMode(false);
    setCropDraft(null);
    cropDragRef.current = null;
  }

  function commitCropChange(nextCropBox: BoundingBox | null) {
    if (!selectedJob) return;
    const snapshot = snapshotJob(selectedJob);
    updateJob(selectedJob.id, { canvas: { ...selectedJob.canvas, cropBox: nextCropBox } });
    const history = getHistory(selectedJob.id);
    history.past.push(snapshot);
    if (history.past.length > HISTORY_LIMIT) history.past.shift();
    history.future = [];
    setHistoryVersion((v) => v + 1);
  }

  function handleApplyCrop() {
    if (!cropDraft) return;
    commitCropChange(cropDraft);
    setCropMode(false);
    setCropDraft(null);
  }

  /** Clears an already-applied crop, going back to automatic subject
   * detection. Only reachable outside crop mode (see `CanvasSizePanel`). */
  function handleClearCrop() {
    commitCropChange(null);
  }

  /**
   * Pointer handlers for the crop overlay's corner handles and its
   * draggable body — same "freeze the start state, read the drag as a
   * delta" shape as the subject resize handles above, but moving/resizing
   * an independent rectangle instead of scaling around a fixed center.
   */
  function handleCropDragPointerDown(mode: "move" | CropHandleKey) {
    return (e: React.PointerEvent<HTMLButtonElement | HTMLDivElement>) => {
      e.stopPropagation();
      if (!cropDraft) return;
      // eslint-disable-next-line react-hooks/refs -- this write only runs inside the returned pointerdown closure (an event handler), never during render
      cropDragRef.current = {
        pointerId: e.pointerId,
        mode,
        clientX: e.clientX,
        clientY: e.clientY,
        startBox: cropDraft,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    };
  }

  function handleCropDragPointerMove(e: React.PointerEvent<HTMLButtonElement | HTMLDivElement>) {
    e.stopPropagation();
    const drag = cropDragRef.current;
    const sourceSize = canvasHandleRef.current?.getSourceSize();
    const fit = canvasHandleRef.current?.getFit();
    const canvas = canvasWrapperRef.current?.querySelector("canvas");
    if (!drag || !sourceSize || !fit || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    // Canvas-pixel delta, then down to source-pixel delta (crop coords live
    // pre-scale, in source-image space).
    const deltaX = ((e.clientX - drag.clientX) * scaleX) / fit.scale;
    const deltaY = ((e.clientY - drag.clientY) * scaleY) / fit.scale;

    const next = { ...drag.startBox };
    if (drag.mode === "move") {
      next.x += deltaX;
      next.y += deltaY;
    } else {
      if (drag.mode.includes("l")) {
        next.x += deltaX;
        next.width -= deltaX;
      }
      if (drag.mode.includes("r")) next.width += deltaX;
      if (drag.mode.includes("t")) {
        next.y += deltaY;
        next.height -= deltaY;
      }
      if (drag.mode.includes("b")) next.height += deltaY;
    }
    setCropDraft(clampCropBox(next, sourceSize.width, sourceSize.height));
  }

  function handleCropDragPointerUp(e: React.PointerEvent<HTMLButtonElement | HTMLDivElement>) {
    e.stopPropagation();
    const drag = cropDragRef.current;
    cropDragRef.current = null;
    if (drag) e.currentTarget.releasePointerCapture(drag.pointerId);
  }

  function handleReplaceImageClick() {
    replaceFileInputRef.current?.click();
  }

  function handleReplaceFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file || !selectedJob) return;
    setReplaceError(replaceJobFile(selectedJob.id, file));
  }

  /**
   * Runs AI super-resolution on the job's pre-removal original (not the
   * cutout — see `upscaleImage`'s doc comment) and feeds the sharper result
   * back through `replaceJobFile`, which re-runs background removal on it and
   * keeps every other setting (background/canvas/export) untouched.
   */
  async function handleImproveQuality() {
    if (!selectedJob || !selectedJob.originalUrl || isUpscaling) return;
    setUpscaleError(null);
    setIsUpscaling(true);
    try {
      const originalBlob = await fetch(selectedJob.originalUrl).then((r) => r.blob());
      const upscaledBlob = await upscaleImage(originalBlob);
      const upscaledFile = new File([upscaledBlob], selectedJob.fileName, { type: upscaledBlob.type });
      setUpscaleError(replaceJobFile(selectedJob.id, upscaledFile));
    } catch (error) {
      setUpscaleError(
        error instanceof Error ? error.message : "No se pudo mejorar la calidad de la imagen."
      );
    } finally {
      setIsUpscaling(false);
    }
  }

  function paintAtEvent(e: React.PointerEvent<HTMLDivElement>) {
    const canvas = e.currentTarget.querySelector("canvas");
    const fit = canvasHandleRef.current?.getFit();
    const sourceSize = canvasHandleRef.current?.getSourceSize();
    const overrides = selectedJob ? overridesByJobIdRef.current.get(selectedJob.id) : undefined;
    if (!canvas || !overrides || !selectedJob || !fit || !sourceSize) return;

    const { x, y } = canvasToSourceCoords(canvas, fit, e.clientX, e.clientY);

    const sourcePixels = smartRetouch ? canvasHandleRef.current?.getSourcePixels() : null;
    if (smartRetouch && sourcePixels) {
      paintSmartBrushStroke(
        overrides,
        sourcePixels,
        x,
        y,
        brushSize,
        retouchMode,
        retouchTolerance,
        smartBrushScratchRef.current
      );
    } else {
      paintBrushStroke(overrides, sourceSize.width, sourceSize.height, x, y, brushSize, retouchMode, brushHardness);
    }
    scheduleRetouchRedraw();
  }

  /**
   * Pointer events fire far more often than the display refreshes, and every
   * bump recomposites the whole image. Collapsing the bumps into one per
   * animation frame caps that cost at the refresh rate while keeping the stroke
   * visually live.
   */
  function scheduleRetouchRedraw() {
    if (retouchRafRef.current !== null) return;
    retouchRafRef.current = requestAnimationFrame(() => {
      retouchRafRef.current = null;
      setRetouchVersion((v) => v + 1);
    });
  }

  function applyHistoryEntry(job: NonNullable<typeof selectedJob>, entry: HistoryEntry) {
    updateJob(job.id, { canvas: entry.canvas });
    overridesByJobIdRef.current.set(job.id, entry.overrideSnapshot.slice());
    scheduleRetouchRedraw();
  }

  function undo() {
    if (!selectedJob) return;
    const history = getHistory(selectedJob.id);
    const previous = history.past.pop();
    if (!previous) return;
    history.future.push(snapshotJob(selectedJob));
    applyHistoryEntry(selectedJob, previous);
    setHistoryVersion((v) => v + 1);
  }

  function redo() {
    if (!selectedJob) return;
    const history = getHistory(selectedJob.id);
    const next = history.future.pop();
    if (!next) return;
    history.past.push(snapshotJob(selectedJob));
    applyHistoryEntry(selectedJob, next);
    setHistoryVersion((v) => v + 1);
  }

  // historyVersion is a bump-only counter: reading it here (rather than just
  // depending on it) is what makes this recompute when the ref-backed stacks
  // change, since mutating a ref alone doesn't trigger a re-render.
  const { canUndo, canRedo } = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs -- read intentionally: historyVersion (below) forces a recompute whenever this ref-backed stack actually changes
    const history = selectedJob ? historyByJobIdRef.current.get(selectedJob.id) : undefined;
    return { canUndo: (history?.past.length ?? 0) > 0, canRedo: (history?.future.length ?? 0) > 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- historyVersion is a synthetic dependency: the stacks live in a ref, not in state
  }, [selectedJob, historyVersion]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      if (cropMode && (e.key === "Enter" || e.key === "Escape")) {
        e.preventDefault();
        if (e.key === "Enter") handleApplyCrop();
        else handleCancelCrop();
        return;
      }

      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- undo/redo/handleApplyCrop/handleCancelCrop close over selectedJob/cropDraft, already covered by their own deps
  }, [selectedJob, cropMode, cropDraft]);

  const handleRemoveJob = useCallback(
    (id: string) => {
      overridesByJobIdRef.current.delete(id);
      historyByJobIdRef.current.delete(id);
      setSelectedJobId((current) => (current === id ? null : current));
      removeJob(id);
    },
    [removeJob]
  );

  /**
   * Revokes the previous background-image object URL before committing a
   * new one — but only if no OTHER job's background still points at that
   * same URL string, which "Aplicar a todas" can produce by copying it
   * across jobs. Revoking a still-referenced URL would silently break that
   * other job's preview.
   */
  const handleBackgroundChange = useCallback(
    (background: BackgroundConfig) => {
      if (!selectedJob) return;
      const previous = selectedJob.background;
      const replacingAUrl = previous.kind === "image" && (background.kind !== "image" || background.url !== previous.url);
      if (replacingAUrl) {
        const stillReferenced = jobs.some(
          (job) => job.id !== selectedJob.id && job.background.kind === "image" && job.background.url === previous.url
        );
        if (!stillReferenced) URL.revokeObjectURL((previous as { kind: "image"; url: string }).url);
      }
      updateJob(selectedJob.id, { background });
    },
    [selectedJob, jobs, updateJob]
  );

  function applyBackgroundToAll() {
    if (!selectedJob) return;
    jobs.forEach((job) => {
      if (job.status === "done") updateJob(job.id, { background: selectedJob.background });
    });
  }

  function applyCanvasConfigToAll() {
    if (!selectedJob) return;
    jobs.forEach((job) => {
      if (job.status === "done") updateJob(job.id, { canvas: selectedJob.canvas });
    });
  }

  function applyExportConfigToAll() {
    if (!selectedJob) return;
    jobs.forEach((job) => {
      if (job.status === "done") updateJob(job.id, { exportConfig: selectedJob.exportConfig });
    });
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3.5 sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Scissors className="size-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 leading-tight">
          <h1 className="font-heading text-lg font-semibold tracking-tight">QuitaFondo</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Quita fondos de tus imágenes, 100% local y privado.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1 lg:hidden">
          <IconButton label="Ver imágenes" onClick={() => setMobileLeftOpen(true)}>
            <ImagePlus />
          </IconButton>
          <IconButton label="Ver controles de edición" onClick={() => setMobileRightOpen(true)}>
            <SlidersHorizontal />
          </IconButton>
        </div>
        <ThemeToggle className="lg:ml-auto" />
      </header>

      {!isSupported && (
        <p
          role="alert"
          className="flex items-start gap-2 border-b bg-destructive/10 px-5 py-2.5 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          Tu navegador no es compatible: QuitaFondo necesita WebAssembly para quitar los fondos. Prueba con una versión
          reciente de Chrome, Edge, Firefox o Safari.
        </p>
      )}

      <div className="relative flex flex-1 overflow-hidden">
        {mobileLeftOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileLeftOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[85vw] max-w-xs overflow-y-auto border-r bg-background p-4 shadow-xl transition-transform duration-200 lg:static lg:z-auto lg:w-72 lg:max-w-none lg:translate-x-0 lg:shadow-none",
            mobileLeftOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <h2 className="text-sm font-semibold">Imágenes</h2>
            <IconButton label="Cerrar" onClick={() => setMobileLeftOpen(false)}>
              <X />
            </IconButton>
          </div>
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
              getRetouchOverride={(jobId) => overridesByJobIdRef.current.get(jobId)}
            />
          </div>
        </aside>

        <section className="relative flex flex-1 items-center justify-center overflow-auto bg-muted/30 p-4 lg:p-8">
          {selectedJob?.status === "done" && selectedJob.cutoutBlob ? (
            <>
              <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-wrap items-start justify-between gap-2 [&>*]:pointer-events-auto">
                <div className="flex items-center gap-1.5">
                  <Button size="sm" onClick={handleQuickDownload} disabled={isDownloading}>
                    <Download />
                    {isDownloading ? "Descargando…" : `Descargar ${selectedJob.exportConfig.format.toUpperCase()}`}
                  </Button>
                  <Button
                    size="sm"
                    variant={compareSplit === null ? "outline" : "secondary"}
                    aria-pressed={compareSplit !== null}
                    onClick={() => setCompareSplit((split) => (split === null ? 0.5 : null))}
                    disabled={!selectedJob.originalUrl}
                  >
                    <Columns2 />
                    Comparar
                  </Button>
                </div>
                <div className="flex items-center gap-0.5 rounded-lg border bg-background/95 p-1 shadow-sm">
                  <IconButton
                    label="Alejar"
                    className="size-7"
                    disabled={zoom <= ZOOM_MIN}
                    onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100))}
                  >
                    <ZoomOut />
                  </IconButton>
                  <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">
                    {Math.round(zoom * 100)}%
                  </span>
                  <IconButton
                    label="Acercar"
                    className="size-7"
                    disabled={zoom >= ZOOM_MAX}
                    onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100))}
                  >
                    <ZoomIn />
                  </IconButton>
                  <IconButton
                    label="Restablecer zoom (100%)"
                    className="size-7"
                    disabled={zoom === 1}
                    onClick={() => setZoom(1)}
                  >
                    <RotateCcw />
                  </IconButton>
                </div>
              </div>
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className={`flex h-full w-full items-center justify-center ${
                  retouchActive ? "cursor-crosshair" : "cursor-move"
                }`}
                style={{ transform: `scale(${zoom})` }}
              >
                <div ref={canvasWrapperRef} className="relative">
                  <EditorCanvas
                    ref={canvasHandleRef}
                    cutoutBlob={selectedJob.cutoutBlob}
                    originalUrl={selectedJob.originalUrl}
                    background={selectedJob.background}
                    canvasConfig={selectedJob.canvas}
                    getOverrideBuffer={getOverrideBuffer}
                    retouchVersion={retouchVersion}
                    onRender={() => setCanvasRenderTick((t) => t + 1)}
                    compareSplit={compareSplit}
                  />
                  {compareSplit !== null && (
                    <div
                      className="absolute inset-0"
                      // Keep the canvas's own drag-to-move / retouch handlers out of it.
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div
                        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                        style={{ left: `${compareSplit * 100}%` }}
                      >
                        <span className="absolute top-1/2 left-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-700 shadow">
                          <Columns2 className="size-3.5" />
                        </span>
                      </div>
                      <span className="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                        Original
                      </span>
                      <span className="pointer-events-none absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                        Resultado
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={0.5}
                        value={compareSplit * 100}
                        onChange={(e) => setCompareSplit(Number(e.target.value) / 100)}
                        aria-label="Comparar original y resultado"
                        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                      />
                    </div>
                  )}
                  {!retouchActive && !cropMode && compareSplit === null && handleRect && (
                    <div
                      className="absolute inset-0"
                      style={
                        handleRotation
                          ? {
                              transform: `rotate(${handleRotation.deg}deg)`,
                              transformOrigin: `${handleRotation.originXPct}% ${handleRotation.originYPct}%`,
                            }
                          : undefined
                      }
                    >
                      {RESIZE_HANDLES.map(({ key, x, y, cursor }) => (
                        <button
                          key={key}
                          type="button"
                          aria-label="Redimensionar el sujeto"
                          className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-primary bg-background shadow"
                          style={{ left: `${handleRect[x]}%`, top: `${handleRect[y]}%`, cursor }}
                          onPointerDown={handleResizeHandlePointerDown}
                          onPointerMove={handleResizeHandlePointerMove}
                          onPointerUp={handleResizeHandlePointerUp}
                        />
                      ))}
                    </div>
                  )}
                  {cropMode && cropHandleRect && (
                    <>
                      <div
                        className="absolute cursor-move border-2 border-dashed border-primary bg-primary/10"
                        style={{
                          left: `${cropHandleRect.leftPct}%`,
                          top: `${cropHandleRect.topPct}%`,
                          width: `${cropHandleRect.rightPct - cropHandleRect.leftPct}%`,
                          height: `${cropHandleRect.bottomPct - cropHandleRect.topPct}%`,
                        }}
                        onPointerDown={handleCropDragPointerDown("move")}
                        onPointerMove={handleCropDragPointerMove}
                        onPointerUp={handleCropDragPointerUp}
                      />
                      {RESIZE_HANDLES.map(({ key, x, y, cursor }) => (
                        <button
                          key={key}
                          type="button"
                          aria-label="Ajustar la zona de recorte"
                          className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-primary bg-background shadow"
                          style={{ left: `${cropHandleRect[x]}%`, top: `${cropHandleRect[y]}%`, cursor }}
                          onPointerDown={handleCropDragPointerDown(key as CropHandleKey)}
                          onPointerMove={handleCropDragPointerMove}
                          onPointerUp={handleCropDragPointerUp}
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>
            </>
          ) : selectedJob && selectedJob.status !== "done" && selectedJob.originalUrl ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4">
              <div className="relative max-h-[70%] overflow-hidden rounded-lg shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URL, nothing for next/image to optimize */}
                <img
                  src={selectedJob.originalUrl}
                  alt={selectedJob.fileName}
                  className={cn(
                    "block max-h-[60vh] max-w-full object-contain",
                    selectedJob.status !== "error" && "opacity-60 saturate-50"
                  )}
                />
                {selectedJob.status !== "error" && (
                  <div className="qf-scan pointer-events-none absolute inset-x-0 h-1/3" aria-hidden="true" />
                )}
              </div>
              {selectedJob.status === "error" ? (
                <div className="flex max-w-sm flex-col items-center gap-2 text-center">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                    <TriangleAlert className="size-4" strokeWidth={2} />
                    No se pudo quitar el fondo
                  </p>
                  <p className="text-xs text-muted-foreground">{selectedJob.errorMessage}</p>
                  <Button size="sm" variant="outline" onClick={() => retryJob(selectedJob.id)}>
                    <RotateCcw />
                    Reintentar
                  </Button>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                  <LoaderCircle className="size-4 animate-spin" />
                  {selectedJob.status === "pending"
                    ? "En espera…"
                    : selectedJob.progress != null && selectedJob.progress < 0.9
                      ? `Descargando el modelo de IA (solo la primera vez)… ${Math.round((selectedJob.progress / 0.9) * 100)}%`
                      : "Quitando el fondo…"}
                </p>
              )}
            </div>
          ) : (
            <div className="flex max-w-xs flex-col items-center gap-3 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
                <ImagePlus className="size-5" strokeWidth={1.75} />
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Sube una imagen para empezar</p>
                <p className="text-sm text-muted-foreground">
                  Arrástrala a cualquier parte de la ventana, pégala con{" "}
                  <kbd className="rounded border bg-background px-1 font-mono text-xs">Ctrl</kbd>+
                  <kbd className="rounded border bg-background px-1 font-mono text-xs">V</kbd> o elígela desde el panel
                  izquierdo.
                </p>
              </div>
            </div>
          )}
        </section>

        {mobileRightOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileRightOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside
          className={cn(
            "fixed inset-y-0 right-0 z-50 w-[85vw] max-w-xs overflow-y-auto border-l bg-background p-4 shadow-xl transition-transform duration-200 lg:static lg:z-auto lg:w-80 lg:max-w-none lg:translate-x-0 lg:shadow-none",
            mobileRightOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <h2 className="text-sm font-semibold">Editar</h2>
            <IconButton label="Cerrar" onClick={() => setMobileRightOpen(false)}>
              <X />
            </IconButton>
          </div>
          {selectedJob?.status === "done" ? (
            <div className="flex flex-col gap-4">
              <Card size="sm" className="gap-3 p-3">
                <div className="flex flex-col gap-1.5">
                  <Button size="sm" variant="outline" className="self-start" onClick={handleReplaceImageClick}>
                    <Replace />
                    Reemplazar imagen
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Usa la misma foto/fondo/tamaño configurados, solo cambia la imagen fuente.
                  </p>
                  {replaceError && <p className="text-xs text-destructive">{replaceError}</p>}
                  <input
                    ref={replaceFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleReplaceFileChosen}
                  />
                </div>
                <Separator />
                <div className="flex flex-col gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="self-start"
                    onClick={handleImproveQuality}
                    disabled={isUpscaling}
                  >
                    <Sparkles />
                    {isUpscaling ? "Mejorando…" : "Mejorar calidad (IA)"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Duplica la resolución y afina el detalle con IA, luego vuelve a quitar el fondo. Puede tardar unos
                    segundos.
                  </p>
                  {upscaleError && <p className="text-xs text-destructive">{upscaleError}</p>}
                </div>
              </Card>

              <Card size="sm" className="p-3">
                <BackgroundPanel
                  key={selectedJob.id}
                  value={selectedJob.background}
                  onChange={handleBackgroundChange}
                  onApplyToAll={applyBackgroundToAll}
                />
              </Card>

              <Card size="sm" className="p-3">
                <CanvasSizePanel
                  value={selectedJob.canvas}
                  onChange={(canvas) => updateJob(selectedJob.id, { canvas })}
                  onApplyToAll={applyCanvasConfigToAll}
                  cropActive={cropMode}
                  onStartCrop={handleStartCrop}
                  onApplyCrop={handleApplyCrop}
                  onCancelCrop={handleCancelCrop}
                  onResetCropDraft={handleResetCropDraft}
                  onClearCrop={handleClearCrop}
                />
              </Card>

              <Card size="sm" className="gap-3 p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Historial</h3>
                  <div className="flex gap-1.5">
                    <IconButton label="Deshacer (Ctrl+Z)" size="icon-sm" variant="outline" disabled={!canUndo} onClick={undo}>
                      <Undo2 />
                    </IconButton>
                    <IconButton
                      label="Rehacer (Ctrl+Shift+Z)"
                      size="icon-sm"
                      variant="outline"
                      disabled={!canRedo}
                      onClick={redo}
                    >
                      <Redo2 />
                    </IconButton>
                  </div>
                </div>
                <Separator />
                <RetouchToolbar
                  active={retouchActive}
                  onActiveChange={setRetouchActive}
                  mode={retouchMode}
                  onModeChange={setRetouchMode}
                  brushSize={brushSize}
                  onBrushSizeChange={setBrushSize}
                  hardness={brushHardness}
                  onHardnessChange={setBrushHardness}
                  smart={smartRetouch}
                  onSmartChange={setSmartRetouch}
                  tolerance={retouchTolerance}
                  onToleranceChange={setRetouchTolerance}
                />
              </Card>

              <Card size="sm" className="p-3">
                <ExportPanel
                  value={selectedJob.exportConfig}
                  onChange={(exportConfig) => updateJob(selectedJob.id, { exportConfig })}
                  onApplyToAll={applyExportConfigToAll}
                  getRenderedPixelBuffer={() => canvasHandleRef.current?.getRenderedPixelBuffer() ?? null}
                  fileNameBase={selectedJob.fileName.replace(/\.[^.]+$/, "")}
                />
              </Card>
            </div>
          ) : (
            <div className="flex max-w-56 flex-col items-center gap-3 py-10 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <SlidersHorizontal className="size-5" strokeWidth={1.75} />
              </span>
              <p className="text-sm text-muted-foreground">
                Los controles de fondo, tamaño y exportación aparecerán aquí cuando selecciones una imagen lista.
              </p>
            </div>
          )}
        </aside>
      </div>
      {isDraggingFiles && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-primary/10 p-6 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-background/95 px-10 py-8 text-center shadow-lg">
            <UploadCloud className="size-8 text-primary" strokeWidth={1.75} />
            <p className="text-base font-medium">Suelta tus imágenes para quitarles el fondo</p>
          </div>
        </div>
      )}
    </main>
  );
}
