import {
  FileSourceError,
  dirname,
  joinPath,
  normalizePath,
  type DirectoryEntry,
  type FileContent,
  type FileSource,
} from './types';

/**
 * An in-memory FileSource.
 *
 * Exists to give the conformance suite a reference implementation and to let
 * UI components be driven without a browser. It is production code rather than
 * a test helper because the components import it as a type-compatible stand-in
 * during development.
 */
export interface MemoryTree {
  [path: string]: string;
}

export class MemorySource implements FileSource {
  readonly kind = 'snapshot' as const;
  readonly canPersist = false;
  readonly canRefresh = false;

  readonly #files = new Map<string, string>();
  readonly #root: string;

  constructor(
    readonly displayName: string,
    tree: MemoryTree,
    root = '/',
  ) {
    this.#root = normalizePath(root) || '/';
    for (const [path, content] of Object.entries(tree)) {
      this.#files.set(normalizePath(joinPath(this.#root, path)), content);
    }
  }

  async readFile(path: string, options: { binary?: boolean } = {}): Promise<FileContent> {
    const key = normalizePath(path);
    const content = this.#files.get(key);
    if (content === undefined) {
      throw new FileSourceError({ code: 'not-found', message: `Not found: ${path}` });
    }
    if (options.binary) {
      return {
        text: null,
        url: `data:text/plain;base64,${btoa(unescape(encodeURIComponent(content)))}`,
        mimeType: 'text/plain',
        size: content.length,
      };
    }
    return { text: content, url: null, mimeType: 'text/plain', size: content.length };
  }

  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    const dir = normalizePath(path);
    const prefix = dir === '/' ? '/' : `${dir}/`;

    const seen = new Map<string, DirectoryEntry>();
    for (const [filePath, content] of this.#files) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      if (rest === '') continue;

      const slash = rest.indexOf('/');
      if (slash === -1) {
        seen.set(rest, {
          name: rest,
          kind: 'file',
          path: filePath,
          size: content.length,
          modifiedAt: null,
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

    if (seen.size === 0 && !this.#hasAnythingUnder(dir)) {
      throw new FileSourceError({
        code: 'not-found',
        message: `Not a directory: ${path}`,
      });
    }

    return [...seen.values()];
  }

  #hasAnythingUnder(dir: string): boolean {
    if (dir === this.#root) return true;
    const prefix = dir === '/' ? '/' : `${dir}/`;
    for (const filePath of this.#files.keys()) {
      if (filePath.startsWith(prefix)) return true;
    }
    return false;
  }

  resolve(fromPath: string, relative: string): string {
    return joinPath(dirname(fromPath), relative);
  }

  async exists(path: string): Promise<boolean> {
    const key = normalizePath(path);
    if (this.#files.has(key)) return true;
    return this.#hasAnythingUnder(key);
  }

  invalidate(): void {
    // Nothing is cached; a snapshot has nothing to re-read.
  }
}
