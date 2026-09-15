import {
  FileSourceError,
  basename,
  dirname,
  joinPath,
  normalizePath,
  type DirectoryEntry,
  type FileContent,
  type FileSource,
} from './types';

/**
 * A FileSource over the File System Access API
 * (.project/decision-log.md D3).
 *
 * The handle arrives from a **drop**, never from `showDirectoryPicker()`,
 * which has long-standing reliability problems in extension contexts. Drag and
 * drop hands over a handle without invoking the picker, sidestepping the
 * problem entirely.
 *
 * Handles are structured-cloneable, so this is the only source that can be
 * persisted and reopened across a browser restart (FR-18).
 *
 * The types below are structural rather than the DOM ones, so this module can
 * be tested in Node against a fake tree.
 */

export interface FileLike {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly lastModified: number;
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}

export interface FileHandleLike {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<FileLike>;
}

export interface DirectoryHandleLike {
  readonly kind: 'directory';
  readonly name: string;
  entries(): AsyncIterableIterator<[string, FileHandleLike | DirectoryHandleLike]>;
  getFileHandle(name: string): Promise<FileHandleLike>;
  getDirectoryHandle(name: string): Promise<DirectoryHandleLike>;
}

/** Turns a File into a URL the document can display. */
export type BlobUrlFactory = (file: FileLike) => Promise<string>;

export class HandleSource implements FileSource {
  readonly kind = 'handle' as const;
  readonly canPersist = true;
  readonly canRefresh = true;

  readonly #root: DirectoryHandleLike;
  readonly #toUrl: BlobUrlFactory;
  readonly #listings = new Map<string, DirectoryEntry[]>();

  constructor(root: DirectoryHandleLike, toUrl: BlobUrlFactory) {
    this.#root = root;
    this.#toUrl = toUrl;
  }

  get displayName(): string {
    return this.#root.name || 'Folder';
  }

  /** Walks to the directory handle for a path, or throws not-found. */
  async #directoryAt(path: string): Promise<DirectoryHandleLike> {
    const normalized = normalizePath(path);
    if (normalized === '/' || normalized === '') return this.#root;

    let current = this.#root;
    for (const segment of normalized.split('/').filter(Boolean)) {
      try {
        current = await current.getDirectoryHandle(segment);
      } catch {
        throw new FileSourceError({
          code: 'not-found',
          message: `Folder not found: ${path}`,
        });
      }
    }
    return current;
  }

  async #fileAt(path: string): Promise<FileLike> {
    const parent = await this.#directoryAt(dirname(path));
    const name = basename(path);
    try {
      const handle = await parent.getFileHandle(name);
      return await handle.getFile();
    } catch (err) {
      if (err instanceof FileSourceError) throw err;
      throw new FileSourceError({ code: 'not-found', message: `Not found: ${path}` });
    }
  }

  async readFile(path: string, options: { binary?: boolean } = {}): Promise<FileContent> {
    const file = await this.#fileAt(path);

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
    const key = normalizePath(path) || '/';
    const cached = this.#listings.get(key);
    if (cached) return cached;

    const handle = await this.#directoryAt(key);
    const entries: DirectoryEntry[] = [];

    for await (const [name, child] of handle.entries()) {
      const childPath = joinPath(key, name);
      if (child.kind === 'directory') {
        entries.push({
          name,
          kind: 'directory',
          path: childPath,
          size: null,
          modifiedAt: null,
        });
        continue;
      }
      // Reading every file's metadata up front would mean a getFile() per
      // entry; the size and timestamp are not worth that on a large folder.
      entries.push({
        name,
        kind: 'file',
        path: childPath,
        size: null,
        modifiedAt: null,
      });
    }

    this.#listings.set(key, entries);
    return entries;
  }

  resolve(fromPath: string, relative: string): string {
    return joinPath(dirname(fromPath), relative);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.#fileAt(path);
      return true;
    } catch {
      try {
        await this.#directoryAt(path);
        return true;
      } catch {
        return false;
      }
    }
  }

  invalidate(path?: string): void {
    if (path === undefined) {
      this.#listings.clear();
      return;
    }
    this.#listings.delete(normalizePath(path) || '/');
  }
}
