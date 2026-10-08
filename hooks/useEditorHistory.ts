"use client";

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import type { CanvasConfig, ImageJob } from "@/lib/types";
import { NO_OVERRIDE } from "@/lib/image/alphaCompose";

/**
 * Everything undo/redo can restore for one job: its position/framing
 * (`CanvasConfig`) and its retouch mask at that moment.
 */
export interface HistoryEntry {
  canvas: CanvasConfig;
  overrideSnapshot: Int16Array;
}

/** Capped per job: each entry clones a full-resolution Int16Array, so an
 * unbounded stack could grow into hundreds of MB on large photos. */
const HISTORY_LIMIT = 20;

interface Stacks {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export function useEditorHistory(
  selectedJob: ImageJob | null,
  updateJob: (id: string, patch: Partial<ImageJob>) => void,
  overridesByJobIdRef: RefObject<Map<string, Int16Array>>,
  onOverridesRestored: () => void
) {
  const stacksByJobIdRef = useRef<Map<string, Stacks>>(new Map());
  // The stacks live in a ref; this bump-only counter is what re-renders the
  // undo/redo buttons when they change.
  const [version, setVersion] = useState(0);

  function stacksFor(jobId: string): Stacks {
    let stacks = stacksByJobIdRef.current.get(jobId);
    if (!stacks) {
      stacks = { past: [], future: [] };
      stacksByJobIdRef.current.set(jobId, stacks);
    }
    return stacks;
  }

  const snapshot = useCallback(
    (job: ImageJob): HistoryEntry => {
      const overrides = overridesByJobIdRef.current.get(job.id);
      return { canvas: job.canvas, overrideSnapshot: (overrides ?? new Int16Array(0)).slice() };
    },
    [overridesByJobIdRef]
  );

  /** Records the state from BEFORE a finished gesture as one undo step. */
  function record(jobId: string, before: HistoryEntry) {
    const stacks = stacksFor(jobId);
    stacks.past.push(before);
    if (stacks.past.length > HISTORY_LIMIT) stacks.past.shift();
    stacks.future = [];
    setVersion((v) => v + 1);
  }

  /**
   * Restores the mask INTO the job's existing buffer rather than swapping in
   * a new array: EditorCanvas keeps a reference to that buffer from when it
   * decoded the cutout, so a replacement would leave it drawing (and the
   * brush painting into) two different arrays.
   */
  function apply(job: ImageJob, entry: HistoryEntry) {
    updateJob(job.id, { canvas: entry.canvas });
    const current = overridesByJobIdRef.current.get(job.id);
    const saved = entry.overrideSnapshot;
    if (current && current.length === saved.length) current.set(saved);
    else if (current && saved.length === 0) current.fill(NO_OVERRIDE); // saved before any retouch
    else overridesByJobIdRef.current.set(job.id, saved.slice());
    onOverridesRestored();
  }

  function undo() {
    if (!selectedJob) return;
    const stacks = stacksFor(selectedJob.id);
    const previous = stacks.past.pop();
    if (!previous) return;
    stacks.future.push(snapshot(selectedJob));
    apply(selectedJob, previous);
    setVersion((v) => v + 1);
  }

  function redo() {
    if (!selectedJob) return;
    const stacks = stacksFor(selectedJob.id);
    const next = stacks.future.pop();
    if (!next) return;
    stacks.past.push(snapshot(selectedJob));
    apply(selectedJob, next);
    setVersion((v) => v + 1);
  }

  function forget(jobId: string) {
    stacksByJobIdRef.current.delete(jobId);
  }

  const { canUndo, canRedo } = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs -- read intentionally: `version` forces a recompute whenever the ref-backed stacks change
    const stacks = selectedJob ? stacksByJobIdRef.current.get(selectedJob.id) : undefined;
    return { canUndo: (stacks?.past.length ?? 0) > 0, canRedo: (stacks?.future.length ?? 0) > 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is a synthetic dependency: the stacks live in a ref, not in state
  }, [selectedJob, version]);

  return { snapshot, record, undo, redo, forget, canUndo, canRedo };
}
