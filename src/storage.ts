// Everything stays on this device: the settings in localStorage, the photos and their layout in IndexedDB, so the
// sheet is back as it was on the next visit. Nothing is ever sent anywhere.

import {cleanSettings, type Crop, type Settings} from './layout';

export interface StoredPhoto {
  id: string;
  name: string;
  spanX: number;
  spanY: number;
  crop: Crop;
}

const SETTINGS_KEY = 'blotted.settings.v2';
const DATABASE = 'blotted';
const BLOBS = 'blobs';
const PROJECT = 'project';
const PHOTOS_KEY = 'photos';

export const loadSettings = (): Settings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);

    return cleanSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return cleanSettings({});
  }
};

export const saveSettings = (settings: Settings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private window or full storage: the settings last until the page closes.
  }
};

let database: Promise<IDBDatabase> | null = null;

const openDatabase = (): Promise<IDBDatabase> =>
  (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(BLOBS);
      request.result.createObjectStore(PROJECT);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));

const run = async <Result>(
  store: string,
  mode: IDBTransactionMode,
  action: (objects: IDBObjectStore) => IDBRequest | void,
): Promise<Result | undefined> => {
  const transaction = (await openDatabase()).transaction(store, mode);
  const request = action(transaction.objectStore(store));

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(request ? (request.result as Result) : undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
};

/** The kept photos, in order, each with its file. Photos whose file is gone are left out. */
export const loadPhotos = async (): Promise<(StoredPhoto & {blob: Blob})[]> => {
  try {
    const list = (await run<StoredPhoto[]>(PROJECT, 'readonly', objects => objects.get(PHOTOS_KEY))) ?? [];
    const withFiles = await Promise.all(
      list.map(async photo => ({...photo, blob: await run<Blob>(BLOBS, 'readonly', objects => objects.get(photo.id))})),
    );

    return withFiles.filter((photo): photo is StoredPhoto & {blob: Blob} => photo.blob instanceof Blob);
  } catch {
    return [];
  }
};

export const savePhotoList = async (photos: StoredPhoto[]): Promise<void> => {
  try {
    await run(PROJECT, 'readwrite', objects => objects.put(photos, PHOTOS_KEY));
  } catch {
    // Not kept: the sheet still works until the page closes.
  }
};

export const saveBlob = async (id: string, blob: Blob): Promise<void> => {
  try {
    await run(BLOBS, 'readwrite', objects => objects.put(blob, id));
  } catch {
    // Same as above.
  }
};

export const deleteBlob = async (id: string): Promise<void> => {
  try {
    await run(BLOBS, 'readwrite', objects => objects.delete(id));
  } catch {
    // Same as above.
  }
};
