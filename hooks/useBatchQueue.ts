"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ImageJob } from "@/lib/types";
import { DEFAULT_BACKGROUND, DEFAULT_CANVAS, DEFAULT_EXPORT } from "@/lib/types";
import { removeImageBackground } from "@/hooks/useBackgroundRemoval";
import { downscaleIfHuge } from "@/lib/image/downscale";
import { scaleCanvasConfig } from "@/lib/image/canvasFit";
import { t } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";
import { isBackgroundRemovalSupported, validateImageFile } from "@/lib/image/fileValidation";
import { toPersistedJob, fromPersistedJob } from "@/lib/storage/schema";
import { saveJob, loadAllJobs, deleteJob as deletePersistedJob } from "@/lib/storage/db";

/** How long to wait after the last edit to a `done` job before writing it to
 * IndexedDB — coalesces bursts like drag-to-reposition (many updates per
 * gesture) into one write instead of one per pointermove. */
const SAVE_DEBOUNCE_MS = 500;

const MAX_CONCURRENT_JOBS = 2;

/** Thrown inside a run that was superseded (photo replaced) or removed, to drop its result. */
class StaleRun extends Error {}

function createJobId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** WebAssembly support cannot change while the page is open, so there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {};
}

export function useBatchQueue() {
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  // Blob, not just File: a job rehydrated from a previous session (see the
  // mount effect below) only has its persisted originalBlob, not a real
  // File — but it still needs an entry here so later edits to that job can
  // be re-persisted (toPersistedJob needs the original bytes every time).
  const filesById = useRef<Map<string, File | Blob>>(new Map());
  const runningCount = useRef(0);
  const pendingIds = useRef<string[]>([]);
  const pumpRef = useRef<() => void>(() => {});
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // The latest jobs, for code that runs outside React's updaters (timers, callbacks).
  const jobsRef = useRef<ImageJob[]>([]);
  useEffect(() => {
    jobsRef.current = jobs;
  });
  // Which run of each job is current: replacing the photo (or removing the job)
  // invalidates the run still in flight so its result cannot land on the new photo.
  const runTokensRef = useRef<Map<string, number>>(new Map());
  const lastRunTokenRef = useRef(0);
  const warnedSaveFailureRef = useRef(false);

  // Restore whatever `done` jobs survived from a previous session, once, on
  // mount. Only `done` jobs are ever persisted (see lib/storage/schema.ts) —
  // there is nothing meaningful to resume for pending/processing/error jobs.
  useEffect(() => {
    let cancelled = false;
    loadAllJobs().then((persisted) => {
      if (cancelled || persisted.length === 0) return;
      persisted.forEach((p) => filesById.current.set(p.id, p.originalBlob));
      setJobs((prev) => [...prev, ...persisted.map(fromPersistedJob)]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      saveTimersRef.current.forEach((timer) => clearTimeout(timer));
    },
    []
  );

  const scheduleSave = useCallback((id: string) => {
    const existingTimer = saveTimersRef.current.get(id);
    if (existingTimer) clearTimeout(existingTimer);

    saveTimersRef.current.set(
      id,
      setTimeout(() => {
        saveTimersRef.current.delete(id);
        const job = jobsRef.current.find((j) => j.id === id);
        const file = filesById.current.get(id);
        const persisted = job && file ? toPersistedJob(job, file) : null;
        if (!job || !persisted) return;

        const save = (record: typeof persisted) =>
          saveJob(record).catch((error) => {
            console.warn("No se pudo guardar la imagen.", error);
            if (warnedSaveFailureRef.current) return;
            warnedSaveFailureRef.current = true;
            toast.add({ title: t("queue.saveFailed"), type: "error" });
          });
        if (job.background.kind === "image") {
          // The object URL won't outlive the page, so keep the image's bytes.
          fetch(job.background.url)
            .then((response) => response.blob())
            .then((backgroundBlob) => save({ ...persisted, backgroundBlob }))
            .catch(() => save(persisted));
        } else save(persisted);
      }, SAVE_DEBOUNCE_MS)
    );
  }, []);

  // One-time capability probe. Read through useSyncExternalStore (with a
  // "supported" server snapshot) so the server-rendered markup and hydration
  // agree, and the banner appears as soon as the client knows better.
  const isSupported = useSyncExternalStore(
    subscribeToNothing,
    isBackgroundRemovalSupported,
    () => true
  );

  const updateJob = useCallback(
    (id: string, patch: Partial<ImageJob>) => {
      setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, ...patch } : job)));
      // Harmless no-op for jobs that aren't `done` yet (toPersistedJob
      // returns null for those inside the scheduled save) — simplest to run
      // unconditionally here rather than have every call site opt in.
      scheduleSave(id);
    },
    [scheduleSave]
  );

  const runJob = useCallback(
    (id: string) => {
      const file = filesById.current.get(id);
      if (!file) return;

      const token = ++lastRunTokenRef.current; // never reused, so a deleted token can't match a new run
      runTokensRef.current.set(id, token);
      const assertCurrent = () => {
        if (runTokensRef.current.get(id) !== token) throw new StaleRun();
      };

      updateJob(id, { status: "processing", progress: undefined });

      // Reduce huge photos first, and use the reduced copy as the job's
      // original too: retouch color repair and edge cleanup need the original
      // and the cutout to have identical dimensions.
      downscaleIfHuge(file)
        .then((reduced) => {
          assertCurrent();
          if (!reduced) return file;
          filesById.current.set(id, reduced.blob);
          const originalUrl = URL.createObjectURL(reduced.blob);
          setJobs((prev) =>
            prev.map((job) => {
              if (job.id !== id) return job;
              // Revoking twice (StrictMode re-runs updaters) is harmless.
              if (job.originalUrl && job.originalUrl !== originalUrl) URL.revokeObjectURL(job.originalUrl);
              return {
                ...job,
                originalUrl,
                notice: t("queue.downscaled", { width: reduced.width, height: reduced.height }),
              };
            })
          );
          return reduced.blob;
        })
        .then((input) =>
          removeImageBackground(input, (ratio) => {
            if (runTokensRef.current.get(id) === token) updateJob(id, { progress: ratio });
          })
        )
        .then((cutoutBlob) => {
          assertCurrent();
          updateJob(id, { status: "done", cutoutBlob, progress: undefined });
        })
        .catch((error: unknown) => {
          if (error instanceof StaleRun || runTokensRef.current.get(id) !== token) return;
          updateJob(id, {
            status: "error",
            errorMessage: error instanceof Error ? error.message : t("error.unknown"),
            progress: undefined,
          });
        })
        .finally(() => {
          runningCount.current -= 1;
          pumpRef.current();
        });
    },
    [updateJob]
  );

  const pump = useCallback(() => {
    while (runningCount.current < MAX_CONCURRENT_JOBS && pendingIds.current.length > 0) {
      const nextId = pendingIds.current.shift();
      if (!nextId) break;
      runningCount.current += 1;
      runJob(nextId);
    }
  }, [runJob]);
  // Keep pumpRef pointed at the latest `pump` closure so runJob's `.finally()`
  // callback (created in an earlier render) can call the current version
  // without needing `pump` as a dependency (which would create a forward
  // reference). This is the standard "latest ref" pattern and is safe: it
  // does not affect what this render outputs.
  // eslint-disable-next-line react-hooks/refs -- intentional latest-ref pattern, not used during render
  pumpRef.current = pump;

  /** Queues the files and returns the new jobs' ids, in the same order. */
  const addFiles = useCallback(
    (files: File[]): string[] => {
      const queueableIds: string[] = [];

      const newJobs: ImageJob[] = files.map((file) => {
        const id = createJobId();
        filesById.current.set(id, file);

        // Reject unusable files up front: they still show up in the list, but
        // with a readable Spanish reason instead of a raw model/library error.
        const validationError = validateImageFile(file);
        if (!validationError) queueableIds.push(id);

        return {
          id,
          fileName: file.name,
          // No preview URL for a rejected file: it may not be a decodable
          // image at all, and a broken <img> looks worse than a placeholder.
          originalUrl: validationError ? "" : URL.createObjectURL(file),
          status: validationError ? "error" : "pending",
          errorMessage: validationError ?? undefined,
          background: DEFAULT_BACKGROUND,
          canvas: DEFAULT_CANVAS,
          exportConfig: DEFAULT_EXPORT,
        };
      });

      setJobs((prev) => [...prev, ...newJobs]);
      pendingIds.current.push(...queueableIds);
      pump();
      return newJobs.map((job) => job.id);
    },
    [pump]
  );

  /** Puts a failed job back in the queue so the user can try again without re-uploading. */
  const retryJob = useCallback(
    (id: string) => {
      const file = filesById.current.get(id);
      if (!file) return;
      const validationError = validateImageFile(file);
      if (validationError) {
        // Still invalid (e.g. still too large) — refresh the reason shown so
        // it's guaranteed current rather than an implicitly-stale message,
        // even though in practice nothing about the file changed.
        updateJob(id, { errorMessage: validationError });
        return;
      }
      if (pendingIds.current.includes(id)) return;

      updateJob(id, { status: "pending", errorMessage: undefined, cutoutBlob: undefined });
      pendingIds.current.push(id);
      pump();
    },
    [pump, updateJob]
  );

  /** Removes a job from the queue entirely: cancels no in-flight work (the
   * running job simply finishes and its result is discarded by `updateJob`
   * no-op'ing on a since-removed id), frees its original-photo object URL,
   * and forgets its file/queue bookkeeping. */
  const removeJob = useCallback((id: string) => {
    setJobs((prev) => {
      const job = prev.find((j) => j.id === id);
      if (job?.originalUrl) URL.revokeObjectURL(job.originalUrl);
      return prev.filter((j) => j.id !== id);
    });
    filesById.current.delete(id);
    runTokensRef.current.delete(id);
    pendingIds.current = pendingIds.current.filter((pendingId) => pendingId !== id);
    const pendingSave = saveTimersRef.current.get(id);
    if (pendingSave) {
      clearTimeout(pendingSave);
      saveTimersRef.current.delete(id);
    }
    deletePersistedJob(id);
  }, []);

  /**
   * Swaps a job's source photo for a different file WITHOUT resetting its
   * background/canvas/export configuration — unlike deleting and re-adding,
   * which always starts a new job from scratch. Returns a Spanish error
   * message (and changes nothing) if the new file fails validation;
   * returns null on success.
   */
  /**
   * Swaps a job's photo and re-runs background removal; every setting stays.
   * `sourceScale` says the new photo is the old one enlarged (e.g. 2 after
   * "Mejorar calidad"), so the crop and offsets in pixels are scaled to match.
   */
  const replaceJobFile = useCallback(
    (id: string, file: File, sourceScale = 1) => {
      const validationError = validateImageFile(file);
      if (validationError) return validationError;

      const previous = jobsRef.current.find((j) => j.id === id);
      if (!previous) return null;
      // Side effects stay out of the updater: React may run it twice.
      if (previous.originalUrl) URL.revokeObjectURL(previous.originalUrl);
      const originalUrl = URL.createObjectURL(file);
      runTokensRef.current.delete(id); // a run still in flight is for the old photo
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id
            ? {
                ...j,
                canvas: sourceScale === 1 ? j.canvas : scaleCanvasConfig(j.canvas, sourceScale),
                fileName: file.name,
                originalUrl,
                status: "pending",
                cutoutBlob: undefined,
                errorMessage: undefined,
                progress: undefined,
              }
            : j
        )
      );
      filesById.current.set(id, file);
      pendingIds.current = pendingIds.current.filter((pendingId) => pendingId !== id);
      pendingIds.current.push(id);
      pump();
      return null;
    },
    [pump]
  );

  /**
   * Swaps a finished job's photo and cutout for edited versions of the same
   * size (e.g. after the magic eraser) without re-running background
   * removal; every other setting stays. The photo is what gets persisted.
   */
  const replaceJobImages = useCallback(
    (id: string, original: Blob, cutoutBlob: Blob) => {
      filesById.current.set(id, original);
      const originalUrl = URL.createObjectURL(original);
      setJobs((prev) =>
        prev.map((job) => {
          if (job.id !== id) return job;
          if (job.originalUrl && job.originalUrl !== originalUrl) URL.revokeObjectURL(job.originalUrl);
          return { ...job, originalUrl, cutoutBlob };
        })
      );
      scheduleSave(id);
    },
    [scheduleSave]
  );

  return { jobs, addFiles, updateJob, retryJob, removeJob, replaceJobFile, replaceJobImages, isSupported };
}
