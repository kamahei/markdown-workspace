import type { DirectoryHandleLike } from '@core/fs/handle-source';

/**
 * Recent folders and the handles behind them (FR-18, data-model.md).
 *
 * Handles go in IndexedDB rather than chrome.storage because a
 * `FileSystemDirectoryHandle` is structured-cloneable, not JSON.
 * chrome.storage serializes as JSON and would destroy it. That is the only
 * reason IndexedDB is in this project at all.
 *
 * A snapshot-backed folder is never recorded: it cannot be reopened, so
 * listing it would offer an action that could not work.
 */

const DB_NAME = 'markdown-workspace';
const DB_VERSION = 1;
const HANDLE_STORE = 'directoryHandles';
const RECENT_KEY = 'recentFolders';
const MAX_RECENT = 20;

export interface RecentFolder {
  id: string;
  kind: 'handle' | 'file-url';
  displayName: string;
  /** Set when kind is 'file-url'. */
  fileUrl?: string;
  /** IndexedDB key, set when kind is 'handle'. */
  handleKey?: string;
  lastOpenedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, mode);
      const request = fn(tx.objectStore(HANDLE_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function putHandle(key: string, handle: DirectoryHandleLike): Promise<void> {
  await withStore('readwrite', (store) => store.put(handle, key) as IDBRequest<unknown>);
}

export async function getHandle(key: string): Promise<DirectoryHandleLike | null> {
  try {
    const value = await withStore<unknown>('readonly', (store) => store.get(key));
    return (value as DirectoryHandleLike | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function deleteHandle(key: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(key) as IDBRequest<undefined>);
}

export async function listRecent(): Promise<RecentFolder[]> {
  const stored = await browser.storage.local.get(RECENT_KEY);
  const value = stored[RECENT_KEY];
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is RecentFolder => {
      if (typeof item !== 'object' || item === null) return false;
      const folder = item as Partial<RecentFolder>;
      return typeof folder.id === 'string' && typeof folder.displayName === 'string';
    })
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

async function saveRecent(folders: RecentFolder[]): Promise<void> {
  await browser.storage.local.set({ [RECENT_KEY]: folders.slice(0, MAX_RECENT) });
}

export async function rememberFolder(
  folder: Omit<RecentFolder, 'lastOpenedAt'>,
): Promise<RecentFolder[]> {
  const existing = await listRecent();
  const without = existing.filter((item) => item.id !== folder.id);
  const updated = [{ ...folder, lastOpenedAt: Date.now() }, ...without];
  await saveRecent(updated);
  return updated.slice(0, MAX_RECENT);
}

export async function forgetFolder(id: string): Promise<RecentFolder[]> {
  const existing = await listRecent();
  const target = existing.find((item) => item.id === id);
  if (target?.handleKey) await deleteHandle(target.handleKey).catch(() => {});

  const updated = existing.filter((item) => item.id !== id);
  await saveRecent(updated);
  return updated;
}

/**
 * Drops entries whose handle has disappeared.
 *
 * A stored handle can vanish if the database was cleared; leaving the entry
 * would offer a folder that cannot open.
 */
export async function pruneRecent(): Promise<RecentFolder[]> {
  const existing = await listRecent();
  const kept: RecentFolder[] = [];

  for (const folder of existing) {
    if (folder.kind !== 'handle') {
      kept.push(folder);
      continue;
    }
    if (folder.handleKey && (await getHandle(folder.handleKey))) kept.push(folder);
  }

  if (kept.length !== existing.length) await saveRecent(kept);
  return kept;
}

export type PermissionState = 'granted' | 'prompt' | 'denied';

/**
 * Checks a handle's permission without prompting.
 *
 * Existence is not access: a stored handle can be present, valid, and still
 * denied.
 */
export async function queryHandlePermission(
  handle: DirectoryHandleLike,
): Promise<PermissionState> {
  const query = (
    handle as unknown as {
      queryPermission?: (d: { mode: string }) => Promise<PermissionState>;
    }
  ).queryPermission;
  if (typeof query !== 'function') return 'granted';
  try {
    return await query.call(handle, { mode: 'read' });
  } catch {
    return 'prompt';
  }
}

/**
 * Requests permission for a handle.
 *
 * Must be called from a user gesture — Chrome refuses otherwise — so this is
 * always click-driven and never runs during startup restore.
 */
export async function requestHandlePermission(
  handle: DirectoryHandleLike,
): Promise<PermissionState> {
  const request = (
    handle as unknown as {
      requestPermission?: (d: { mode: string }) => Promise<PermissionState>;
    }
  ).requestPermission;
  if (typeof request !== 'function') return 'granted';
  try {
    return await request.call(handle, { mode: 'read' });
  } catch {
    return 'denied';
  }
}

export async function clearAll(): Promise<void> {
  await browser.storage.local.remove(RECENT_KEY);
  await withStore('readwrite', (store) => store.clear() as IDBRequest<undefined>).catch(
    () => {},
  );
}
