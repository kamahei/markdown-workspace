import type { DirectoryEntryPayload, FileError } from '../messaging';

/**
 * The file access abstraction (.project/decision-log.md D3).
 *
 * Folder access in an extension has no single reliable mechanism, so the rest
 * of the codebase never learns how a folder was obtained. Three
 * implementations satisfy this interface and are held to one shared
 * conformance suite.
 */

export type SourceKind = 'handle' | 'file-url' | 'snapshot';

export interface FileContent {
  text: string | null;
  /** Data or blob URL, for images referenced by the document. */
  url: string | null;
  mimeType: string | null;
  size: number;
}

export type DirectoryEntry = DirectoryEntryPayload;

export class FileSourceError extends Error {
  readonly code: FileError['code'];

  constructor(error: FileError) {
    super(error.message);
    this.name = 'FileSourceError';
    this.code = error.code;
  }
}

export interface FileSource {
  readonly kind: SourceKind;

  /** Human-readable name of the root, for the sidebar and recent list. */
  readonly displayName: string;

  /**
   * Whether this source survives a browser restart.
   *
   * The UI uses this to decide whether to offer "reopen from recent" at all.
   * Showing an action that cannot work is worse than showing none.
   */
  readonly canPersist: boolean;

  /** Whether re-reading sees changes made on disk since the source opened. */
  readonly canRefresh: boolean;

  /** Reads a file. `binary` returns a URL instead of text, for images. */
  readFile(path: string, options?: { binary?: boolean }): Promise<FileContent>;

  /** Lists one directory's immediate children. Never walks recursively. */
  listDirectory(path: string): Promise<DirectoryEntry[]>;

  /** Resolves a relative reference against a document's path. */
  resolve(fromPath: string, relative: string): string;

  /** True when the path exists and is readable. */
  exists(path: string): Promise<boolean>;

  /** Discards any cached listings so the next read hits the source. */
  invalidate(path?: string): void;
}

// --- Path helpers ---------------------------------------------------------

/** Normalizes `.`, `..` and duplicate separators. */
export function normalizePath(path: string): string {
  const absolute = path.startsWith('/');
  const parts: string[] = [];

  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      // Traversal past the root clamps rather than escaping it.
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
      else if (!absolute) parts.push('..');
      continue;
    }
    parts.push(segment);
  }

  const joined = parts.join('/');
  return absolute ? `/${joined}` : joined;
}

export function dirname(path: string): string {
  const normalized = normalizePath(path);
  const cut = normalized.lastIndexOf('/');
  if (cut <= 0) return normalized.startsWith('/') ? '/' : '';
  return normalized.slice(0, cut);
}

export function basename(path: string): string {
  const normalized = normalizePath(path).replace(/\/$/, '');
  const cut = normalized.lastIndexOf('/');
  return cut === -1 ? normalized : normalized.slice(cut + 1);
}

/** Joins a relative reference onto a base directory. */
export function joinPath(base: string, relative: string): string {
  if (relative.startsWith('/')) return normalizePath(relative);
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return normalizePath(`${prefix}${relative}`);
}

/** Sorts directories first, then by name, the way a file browser should. */
export function sortEntries(
  entries: DirectoryEntry[],
  sortBy: 'name' | 'modified' = 'name',
): DirectoryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    if (sortBy === 'modified') {
      const diff = (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0);
      if (diff !== 0) return diff;
    }
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

/** Whether an entry should be hidden from the tree (FR-20). */
export function isExcluded(
  entry: DirectoryEntry,
  options: { showHidden: boolean; excludedDirectories: string[] },
): boolean {
  if (!options.showHidden && entry.name.startsWith('.')) return true;
  if (entry.kind === 'directory' && options.excludedDirectories.includes(entry.name)) {
    return true;
  }
  return false;
}
