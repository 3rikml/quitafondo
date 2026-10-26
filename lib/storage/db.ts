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
  try {
    const db = await getDb();
    return await db.getAll(STORE_JOBS);
  } catch (error) {
    // Blocked storage (private mode, policy): start empty instead of failing the page.
    console.warn("No se pudieron cargar las imágenes guardadas.", error);
    return [];
  }
}

export async function deleteJob(id: string): Promise<void> {
  if (!isAvailable()) return;
  try {
    const db = await getDb();
    await db.delete(STORE_JOBS, id);
  } catch (error) {
    console.warn("No se pudo borrar la imagen guardada.", error);
  }
}

export async function saveSelectedJobId(id: string | null): Promise<void> {
  if (!isAvailable()) return;
  try {
    const db = await getDb();
    await db.put(STORE_META, id, META_SELECTED_JOB_ID);
  } catch (error) {
    console.warn("No se pudo guardar la imagen seleccionada.", error);
  }
}

export async function loadSelectedJobId(): Promise<string | null> {
  if (!isAvailable()) return null;
  try {
    const db = await getDb();
    const value = await db.get(STORE_META, META_SELECTED_JOB_ID);
    return value ?? null;
  } catch (error) {
    console.warn("No se pudo leer la imagen seleccionada.", error);
    return null;
  }
}
