import type { DirectoryEntryPayload, FileError, Result } from '../messaging';
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
 * A FileSource over `file://` URLs (architecture.md C3).
 *
 * Reads go through an injected transport rather than `fetch` directly: a
 * content script on a `file://` page has an opaque origin and cannot fetch its
 * siblings, so the service worker does it. Core receives the transport and
 * never reaches for one, which is also what makes this testable in Node.
 */
export interface FileUrlTransport {
  readFile(
    url: string,
    binary: boolean,
  ): Promise<
    Result<{
      text: string | null;
      dataUrl: string | null;
      mimeType: string | null;
      size: number;
    }>
  >;
  listDirectory(url: string): Promise<Result<DirectoryEntryPayload[]>>;
}

function toError(error: FileError): FileSourceError {
  return new FileSourceError(error);
}

/** Percent-encodes a path for a file:// URL, preserving separators. */
export function pathToFileUrl(path: string): string {
  const encoded = normalizePath(path)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `file://${encoded}`;
}

export class FileUrlSource implements FileSource {
  readonly kind = 'file-url' as const;
  readonly canPersist = true;
  readonly canRefresh = true;

  readonly #transport: FileUrlTransport;
  readonly #root: string;
  readonly #listings = new Map<string, DirectoryEntry[]>();

  constructor(transport: FileUrlTransport, root: string) {
    this.#transport = transport;
    this.#root = normalizePath(root) || '/';
  }

  get displayName(): string {
    return basename(this.#root) || this.#root;
  }

  get root(): string {
    return this.#root;
  }

  async readFile(path: string, options: { binary?: boolean } = {}): Promise<FileContent> {
    const binary = options.binary ?? false;
    const result = await this.#transport.readFile(pathToFileUrl(path), binary);
    if (!result.ok) throw toError(result.error);

    const { text, dataUrl, mimeType, size } = result.value;
    return { text, url: dataUrl, mimeType, size };
  }

  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    const key = normalizePath(path);
    const cached = this.#listings.get(key);
    if (cached) return cached;

    // The trailing slash is what makes Chrome serve a listing rather than
    // attempting to read the directory as a file.
    const url = `${pathToFileUrl(key)}/`;
    const result = await this.#transport.listDirectory(url);
    if (!result.ok) throw toError(result.error);

    this.#listings.set(key, result.value);
    return result.value;
  }

  resolve(fromPath: string, relative: string): string {
    return joinPath(dirname(fromPath), relative);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.readFile(path);
      return true;
    } catch {
      try {
        await this.listDirectory(path);
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
    this.#listings.delete(normalizePath(path));
  }
}
