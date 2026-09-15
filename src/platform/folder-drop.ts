import {
  HandleSource,
  type DirectoryHandleLike,
  type FileLike,
} from '@core/fs/handle-source';
import { SnapshotSource, type SnapshotEntry } from '@core/fs/snapshot-source';
import type { FileSource } from '@core/fs/types';

/**
 * Acquires a folder, degrading rather than failing (ui-spec.md, D3).
 *
 * Three tiers, tried in order:
 *
 *   1. `getAsFileSystemHandle()` — a live handle, persistable and refreshable.
 *      Comes from the *drop*, so it never invokes `showDirectoryPicker()` and
 *      never hits that API's reliability problems.
 *   2. `webkitGetAsEntry()` — the legacy filesystem API; a one-time snapshot.
 *   3. `<input webkitdirectory>` — always available, also a snapshot.
 *
 * The caller reads `source.canPersist` / `canRefresh` to decide what controls
 * to show, so a degraded source is visibly degraded rather than quietly
 * broken.
 */

const toBlobUrl = async (file: FileLike): Promise<string> => {
  // File already satisfies Blob at runtime; the structural type keeps core
  // free of DOM types.
  return URL.createObjectURL(file as unknown as Blob);
};

interface LegacyEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?(cb: (file: File) => void, err: (e: unknown) => void): void;
  createReader?(): {
    readEntries(cb: (entries: LegacyEntry[]) => void, err: (e: unknown) => void): void;
  };
}

export interface AcquiredFolder {
  source: FileSource;
  /** The live handle, when one was obtained, for persistence. */
  handle: DirectoryHandleLike | null;
}

/** Extracts a folder from a drop event, or null when it held no folder. */
export async function acquireFromDrop(
  dataTransfer: DataTransfer,
): Promise<AcquiredFolder | null> {
  const items = Array.from(dataTransfer.items).filter((item) => item.kind === 'file');
  if (items.length === 0) return null;

  // Tier 1: a real handle.
  for (const item of items) {
    const getHandle = (
      item as unknown as {
        getAsFileSystemHandle?: () => Promise<DirectoryHandleLike | null>;
      }
    ).getAsFileSystemHandle;
    if (typeof getHandle !== 'function') break;

    try {
      const handle = await getHandle.call(item);
      if (handle && handle.kind === 'directory') {
        return { source: new HandleSource(handle, toBlobUrl), handle };
      }
    } catch {
      // Fall through to the next tier rather than failing the drop.
    }
  }

  // Tier 2: the legacy entry API.
  for (const item of items) {
    const getEntry = (item as unknown as { webkitGetAsEntry?: () => LegacyEntry | null })
      .webkitGetAsEntry;
    if (typeof getEntry !== 'function') break;

    const entry = getEntry.call(item);
    if (entry?.isDirectory) {
      const files = await readLegacyDirectory(entry);
      return {
        source: new SnapshotSource(entry.name, files, toBlobUrl),
        handle: null,
      };
    }
  }

  return null;
}

/** Recursively reads a legacy directory entry into a flat snapshot. */
async function readLegacyDirectory(root: LegacyEntry): Promise<SnapshotEntry[]> {
  const out: SnapshotEntry[] = [];
  // A dropped folder normally reports fullPath "/name", but a root of "/"
  // is possible; adding one unconditionally would eat the first character of
  // every relative path.
  const rootPath = root.fullPath.endsWith('/') ? root.fullPath : `${root.fullPath}/`;
  const prefixLength = rootPath.length;

  const readAll = (entry: LegacyEntry): Promise<LegacyEntry[]> =>
    new Promise((resolve) => {
      const reader = entry.createReader?.();
      if (!reader) return resolve([]);

      const collected: LegacyEntry[] = [];
      const step = () => {
        reader.readEntries(
          (batch) => {
            // readEntries returns at most 100 per call and signals the end
            // with an empty batch.
            if (batch.length === 0) return resolve(collected);
            collected.push(...batch);
            step();
          },
          () => resolve(collected),
        );
      };
      step();
    });

  const walk = async (entry: LegacyEntry, depth: number): Promise<void> => {
    // A symlink loop would otherwise recurse forever.
    if (depth > 32) return;

    for (const child of await readAll(entry)) {
      if (child.isDirectory) {
        await walk(child, depth + 1);
        continue;
      }
      const file = await new Promise<File | null>((resolve) => {
        child.file?.(resolve, () => resolve(null));
      });
      if (file) {
        out.push({
          relativePath: child.fullPath.slice(prefixLength),
          file: file as unknown as FileLike,
        });
      }
    }
  };

  await walk(root, 0);
  return out;
}

/** Builds a snapshot from an `<input type="file" webkitdirectory>` selection. */
export function acquireFromInput(files: FileList): AcquiredFolder | null {
  if (files.length === 0) return null;

  const entries: SnapshotEntry[] = [];
  let rootName = 'Folder';

  for (const file of Array.from(files)) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    if (!relative) continue;

    const slash = relative.indexOf('/');
    if (slash > 0) rootName = relative.slice(0, slash);

    entries.push({
      // webkitRelativePath includes the dropped folder's own name; strip it so
      // paths are relative to the root the user chose.
      relativePath: slash === -1 ? relative : relative.slice(slash + 1),
      file: file as unknown as FileLike,
    });
  }

  if (entries.length === 0) return null;
  return { source: new SnapshotSource(rootName, entries, toBlobUrl), handle: null };
}

/** True when the drag carries something worth accepting. */
export function dragHasFolder(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.items ?? []).some((item) => item.kind === 'file');
}
