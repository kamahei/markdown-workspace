import {
  FileSourceError,
  dirname,
  joinPath,
  normalizePath,
  type DirectoryEntry,
  type FileContent,
  type FileSource,
} from './types';
import type { BlobUrlFactory, FileLike } from './handle-source';

/**
 * A FileSource over a flat snapshot of files
 * (.project/decision-log.md D3).
 *
 * The floor of the fallback chain: `<input webkitdirectory>` and
 * `webkitGetAsEntry()` both yield a one-time list of File objects with
 * relative paths. It cannot be persisted and cannot see changes made on disk
 * afterwards.
 *
 * It is worse than the other two, and it always works. Degrading to it beats
 * an empty sidebar — but the capability flags say so honestly, so the UI hides
 * the controls that would do nothing rather than offering dead actions.
 */

export interface SnapshotEntry {
  /** Path relative to the dropped folder, e.g. `docs/guide.md`. */
  relativePath: string;
  file: FileLike;
}

export class SnapshotSource implements FileSource {
  readonly kind = 'snapshot' as const;
  readonly canPersist = false;
  readonly canRefresh = false;

  readonly #files = new Map<string, FileLike>();
  readonly #directories = new Set<string>();
  readonly #toUrl: BlobUrlFactory;

  constructor(
    readonly displayName: string,
    entries: SnapshotEntry[],
    toUrl: BlobUrlFactory,
  ) {
    this.#toUrl = toUrl;
    // The root exists even when the folder is empty; registering it only
    // while iterating would make an empty drop report "folder not found".
    this.#directories.add('/');

    for (const { relativePath, file } of entries) {
      const path = normalizePath(`/${relativePath}`);
      this.#files.set(path, file);

      // Directories are implied by the paths; record every ancestor so an
      // empty-looking intermediate folder is still listable.
      let parent = dirname(path);
      while (parent && parent !== '/') {
        this.#directories.add(parent);
        parent = dirname(parent);
      }
    }
  }

  async readFile(path: string, options: { binary?: boolean } = {}): Promise<FileContent> {
    const file = this.#files.get(normalizePath(path));
    if (!file) {
      throw new FileSourceError({ code: 'not-found', message: `Not found: ${path}` });
    }

    if (options.binary) {
      return {
        text: null,
        url: await this.#toUrl(file),
        mimeType: file.type || null,
        size: file.size,
      };
    }

    try {
      return {
        text: await file.text(),
        url: null,
        mimeType: file.type || null,
        size: file.size,
      };
    } catch {
      throw new FileSourceError({
        code: 'not-readable',
        message: `Could not decode ${path} as text.`,
      });
    }
  }

  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    const dir = normalizePath(path) || '/';
    if (!this.#directories.has(dir)) {
      throw new FileSourceError({
        code: 'not-found',
        message: `Folder not found: ${path}`,
      });
    }

    const prefix = dir === '/' ? '/' : `${dir}/`;
    const seen = new Map<string, DirectoryEntry>();

    for (const [filePath, file] of this.#files) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      if (!rest) continue;

      const slash = rest.indexOf('/');
      if (slash === -1) {
        seen.set(rest, {
          name: rest,
          kind: 'file',
          path: filePath,
          size: file.size,
          modifiedAt: file.lastModified || null,
        });
      } else {
        const name = rest.slice(0, slash);
        if (!seen.has(name)) {
          seen.set(name, {
            name,
            kind: 'directory',
            path: `${prefix}${name}`,
            size: null,
            modifiedAt: null,
          });
        }
      }
    }

    return [...seen.values()];
  }

  resolve(fromPath: string, relative: string): string {
    return joinPath(dirname(fromPath), relative);
  }

  async exists(path: string): Promise<boolean> {
    const normalized = normalizePath(path);
    return this.#files.has(normalized) || this.#directories.has(normalized);
  }

  invalidate(): void {
    // A snapshot has nothing to re-read; saying so is the honest answer.
  }
}
