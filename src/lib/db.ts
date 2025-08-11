
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DB_NAME = 'DepthWeaverDB';
const STORE_NAME = 'history';
const DB_VERSION = 1;

export interface HistoryDbEntry {
  id: number;
  image: File;
  depthMap: File;
  createdAt: string;
}

interface DepthWeaverSchema extends DBSchema {
  [STORE_NAME]: {
    key: number;
    value: HistoryDbEntry;
    indexes: { createdAt: string };
  };
}

let dbPromise: Promise<IDBPDatabase<DepthWeaverSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<DepthWeaverSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<DepthWeaverSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('createdAt', 'createdAt');
      },
    });
  }
  return dbPromise;
}

export async function addHistory(entry: Omit<HistoryDbEntry, 'id'>): Promise<number> {
  const db = await getDb();
  return db.add(STORE_NAME, entry as HistoryDbEntry);
}

export async function getHistory(): Promise<HistoryDbEntry[]> {
  const db = await getDb();
  // Sort by createdAt index in descending order to get the newest first
  return db.getAllFromIndex(STORE_NAME, 'createdAt').then(items => items.reverse());
}

export async function deleteHistory(id: number): Promise<void> {
  const db = await getDb();
  return db.delete(STORE_NAME, id);
}

export async function clearHistory(): Promise<void> {
  const db = await getDb();
  return db.clear(STORE_NAME);
}
