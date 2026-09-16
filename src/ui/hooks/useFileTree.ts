import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  ancestorsOf,
  createTreeState,
  pendingLoads,
  type TreeState,
} from '@core/fs/tree';
import { FileSourceError, type FileSource } from '@core/fs/types';
import type { FileErrorCode } from '@core/messaging';
import { t } from '@ui/i18n';

/**
 * Why a folder would not open, in the reader's language.
 *
 * Translated from the error's `code` rather than from its `message`. The
 * message is written in `src/core/`, which has no translator by design, so
 * rendering it put an English sentence in the tooltip and in the screen
 * reader's ear on a Japanese interface.
 */
function describeFileError(err: unknown): string {
  const code: FileErrorCode | null = err instanceof FileSourceError ? err.code : null;
  switch (code) {
    case 'file-access-denied':
      return t('localFilesBlocked');
    case 'not-found':
      return t('folderNoLongerThere');
    case 'unparseable-listing':
      return t('folderListingUnreadable');
    default:
      return t('folderCouldNotBeRead');
  }
}

/**
 * Drives a TreeState against a FileSource.
 *
 * Children load on expansion only, one directory at a time. The tree is never
 * walked up front: that is what keeps a folder containing node_modules from
 * hanging the sidebar (FR-19).
 *
 * In-flight loads are tracked in a ref rather than cancelled by effect
 * cleanup. Cleanup runs on every state change, and since loading *causes* a
 * state change, cancelling there aborts the very request that just started —
 * a deadlock where the root directory never finishes loading.
 */
export function useFileTree(source: FileSource | null, root: string | null) {
  const [state, setState] = useState<TreeState>(() => createTreeState(root ?? '/'));

  const sourceRef = useRef(source);
  sourceRef.current = source;

  /** Paths already requested for the current source, so none is fetched twice. */
  const requested = useRef(new Set<string>());
  /** Bumped when the source changes, so stale responses are discarded. */
  const generation = useRef(0);

  // A new source means a new tree; carrying state across would show the old
  // folder's expansion against the new folder's paths.
  useEffect(() => {
    generation.current += 1;
    requested.current = new Set();
    setState(createTreeState(root ?? '/'));
  }, [source, root]);

  useEffect(() => {
    const src = sourceRef.current;
    if (!src) return;

    const needed = pendingLoads(state).filter((path) => !requested.current.has(path));
    if (needed.length === 0) return;

    const run = generation.current;
    for (const path of needed) requested.current.add(path);

    setState((prev) => {
      const loading = new Set(prev.loading);
      for (const path of needed) loading.add(path);
      return { ...prev, loading };
    });

    for (const path of needed) {
      void (async () => {
        try {
          const entries = await src.listDirectory(path);
          if (run !== generation.current) return;
          setState((prev) => {
            const children = new Map(prev.children);
            children.set(path, entries);
            const loading = new Set(prev.loading);
            loading.delete(path);
            const errors = new Map(prev.errors);
            errors.delete(path);
            return { ...prev, children, loading, errors };
          });
        } catch (err) {
          if (run !== generation.current) return;
          // One unreadable directory must not take the tree down; the row
          // keeps its place with the reason attached.
          const message = describeFileError(err);
          setState((prev) => {
            const loading = new Set(prev.loading);
            loading.delete(path);
            const errors = new Map(prev.errors);
            errors.set(path, message);
            return { ...prev, loading, errors };
          });
        }
      })();
    }
  }, [state]);

  const toggle = useCallback((path: string) => {
    setState((prev) => {
      const expanded = new Set(prev.expanded);
      if (expanded.has(path)) {
        expanded.delete(path);
        return { ...prev, expanded };
      }

      expanded.add(path);
      // Expanding a directory that failed is an explicit retry, so clear the
      // error and let it be requested again.
      if (prev.errors.has(path)) {
        requested.current.delete(path);
        const errors = new Map(prev.errors);
        errors.delete(path);
        return { ...prev, expanded, errors };
      }
      return { ...prev, expanded };
    });
  }, []);

  const setFilter = useCallback((filter: string) => {
    setState((prev) => (prev.filter === filter ? prev : { ...prev, filter }));
  }, []);

  /** Expands the chain down to a path and marks it active. */
  const reveal = useCallback((path: string) => {
    setState((prev) => {
      if (prev.activePath === path) return prev;
      const expanded = new Set(prev.expanded);
      for (const ancestor of ancestorsOf(prev.root, path)) expanded.add(ancestor);
      return { ...prev, expanded, activePath: path };
    });
  }, []);

  const refresh = useCallback(() => {
    sourceRef.current?.invalidate();
    requested.current = new Set();
    setState((prev) => ({ ...prev, children: new Map(), errors: new Map() }));
  }, []);

  return { state, toggle, setFilter, reveal, refresh };
}
