import { openDB, type IDBPDatabase } from "idb";
import type { PersistedJob } from "./schema";

const DB_NAME = "quitafondo";
const DB_VERSION = 1;
const STORE_JOBS = "jobs";
const STORE_META = "meta";
const META_SELECTED_JOB_ID = "selectedJobId";

let dbPromise: Promise<IDBPDatabase> | null = null;

function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_JOBS)) db.createObjectStore(STORE_JOBS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      },
    });
  }
  return dbPromise;
}

export async function saveJob(persisted: PersistedJob): Promise<void> {
  if (!isAvailable()) return;
  const db = await getDb();
  await db.put(STORE_JOBS, persisted);
}

export async function loadAllJobs(): Promise<PersistedJob[]> {
  if (!isAvailable()) return [];
  const db = await getDb();
  return db.getAll(STORE_JOBS);
}

export async function deleteJob(id: string): Promise<void> {
  if (!isAvailable()) return;
  const db = await getDb();
  await db.delete(STORE_JOBS, id);
}

export async function saveSelectedJobId(id: string | null): Promise<void> {
  if (!isAvailable()) return;
  const db = await getDb();
  await db.put(STORE_META, id, META_SELECTED_JOB_ID);
}

export async function loadSelectedJobId(): Promise<string | null> {
  if (!isAvailable()) return null;
  const db = await getDb();
  const value = await db.get(STORE_META, META_SELECTED_JOB_ID);
  return value ?? null;
}
