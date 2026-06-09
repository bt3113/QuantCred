import type { Workspace } from "../core/types";

const DB_NAME = "quantcred-local";
const DB_VERSION = 1;
const WORKSPACES = "workspaces";

export function openQuantCredDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKSPACES)) {
        db.createObjectStore(WORKSPACES, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const db = await openQuantCredDb();
  await txPut(db, WORKSPACES, { ...workspace, updatedAt: new Date().toISOString() });
  db.close();
}

export async function loadWorkspace(id: string): Promise<Workspace | null> {
  const db = await openQuantCredDb();
  const workspace = await txGet<Workspace>(db, WORKSPACES, id);
  db.close();
  return workspace;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const db = await openQuantCredDb();
  const workspaces = await txAll<Workspace>(db, WORKSPACES);
  db.close();
  return workspaces.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteWorkspace(id: string): Promise<void> {
  const db = await openQuantCredDb();
  await txDelete(db, WORKSPACES, id);
  db.close();
}

export async function clearQuantCredData(): Promise<void> {
  const db = await openQuantCredDb();
  await txClear(db, WORKSPACES);
  db.close();
}

function txPut<T>(db: IDBDatabase, storeName: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function txGet<T>(db: IDBDatabase, storeName: string, id: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(id);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

function txAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

function txDelete(db: IDBDatabase, storeName: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function txClear(db: IDBDatabase, storeName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
