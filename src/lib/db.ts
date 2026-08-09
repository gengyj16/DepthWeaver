
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SpatialAssetMetadata } from './spatial-photo';

const DB_NAME = 'DepthWeaverDB';
const HISTORY_STORE = 'history';
const SPATIAL_ASSET_STORE = 'spatialAssets';
const DB_VERSION = 2;

export interface HistoryDbEntry {
  id: number;
  image: File;
  depthMap: File;
  createdAt: string;
}

export interface SpatialAssetsDbEntry extends SpatialAssetMetadata {
  historyId: number;
  background: Blob;
  mask: Blob;
  updatedAt: string;
}

interface DepthWeaverSchema extends DBSchema {
  [HISTORY_STORE]: {
    key: number;
    value: HistoryDbEntry;
    indexes: { createdAt: string };
  };
  [SPATIAL_ASSET_STORE]: {
    key: number;
    value: SpatialAssetsDbEntry;
  };
}

let dbPromise: Promise<IDBPDatabase<DepthWeaverSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<DepthWeaverSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<DepthWeaverSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          const store = db.createObjectStore(HISTORY_STORE, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(SPATIAL_ASSET_STORE)) {
          db.createObjectStore(SPATIAL_ASSET_STORE, { keyPath: 'historyId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function addHistory(entry: Omit<HistoryDbEntry, 'id'>): Promise<number> {
  const db = await getDb();
  return db.add(HISTORY_STORE, entry as HistoryDbEntry);
}

export async function getHistory(): Promise<HistoryDbEntry[]> {
  const db = await getDb();
  // Sort by createdAt index in descending order to get the newest first
  return db.getAllFromIndex(HISTORY_STORE, 'createdAt').then(items => items.reverse());
}

export async function deleteHistory(id: number): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction([HISTORY_STORE, SPATIAL_ASSET_STORE], 'readwrite');
  await Promise.all([
    transaction.objectStore(HISTORY_STORE).delete(id),
    transaction.objectStore(SPATIAL_ASSET_STORE).delete(id),
  ]);
  await transaction.done;
}

export async function clearHistory(): Promise<void> {
  const db = await getDb();
  const transaction = db.transaction([HISTORY_STORE, SPATIAL_ASSET_STORE], 'readwrite');
  await Promise.all([
    transaction.objectStore(HISTORY_STORE).clear(),
    transaction.objectStore(SPATIAL_ASSET_STORE).clear(),
  ]);
  await transaction.done;
}

export async function getSpatialAssets(historyId: number): Promise<SpatialAssetsDbEntry | undefined> {
  const db = await getDb();
  return db.get(SPATIAL_ASSET_STORE, historyId);
}

export async function saveSpatialAssets(
  entry: Omit<SpatialAssetsDbEntry, 'updatedAt'>,
): Promise<void> {
  const db = await getDb();
  await db.put(SPATIAL_ASSET_STORE, {
    ...entry,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteSpatialAssets(historyId: number): Promise<void> {
  const db = await getDb();
  await db.delete(SPATIAL_ASSET_STORE, historyId);
}
