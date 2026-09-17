import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { MIN_QUERY_LENGTH, searchFolder, type SearchReport } from '@core/search';
import type { FileSource } from '@core/fs/types';

/** How long typing has to stop before a walk begins. */
const DEBOUNCE_MS = 250;

export interface FolderSearchState {
  query: string;
  /** Null until the first search has produced something. */
  report: SearchReport | null;
  running: boolean;
  /** Files scanned so far, so a long search is visibly making progress. */
  scanned: number;
}

/**
 * Drives `searchFolder` from a text field.
 *
 * Three things keep a search over a real folder from being unpleasant:
 *
 * - **Debounce.** Typing "install" would otherwise start seven walks.
 * - **Abort.** Each new walk cancels the one before it. Without this the
 *   results of "ins" can land after the results of "install" and overwrite
 *   them, which looks exactly like a bug in the matcher.
 * - **A generation counter**, because aborting is cooperative: a walk that
 *   is already awaiting a read will still return, and its answer has to be
 *   thrown away rather than rendered.
 */
export function useFolderSearch(
  source: FileSource | null,
  /**
   * Folder to search from — the same root the tree is given.
   *
   * Passed in rather than assumed to be "/". A file:// source works in
   * absolute paths, so "/" there means the whole filesystem: the first
   * version of this hardcoded it and walked upwards out of the folder the
   * reader had opened.
   */
  root: string | null,
  options: { showHidden: boolean; excludedDirectories: string[] },
): FolderSearchState & { setQuery: (value: string) => void } {
  const [query, setQuery] = useState('');
  const [report, setReport] = useState<SearchReport | null>(null);
  const [running, setRunning] = useState(false);
  const [scanned, setScanned] = useState(0);

  /** Only the newest walk may write to state. */
  const generation = useRef(0);
  const signal = useRef({ aborted: false });

  // Read through a ref so a changed options object does not restart a walk
  // in progress; the values are read once, when a walk starts.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    generation.current += 1;
    signal.current.aborted = true;
    const run = generation.current;
    const mine = { aborted: false };
    signal.current = mine;

    const trimmed = query.trim();
    if (!source || !root || trimmed.length < MIN_QUERY_LENGTH) {
      setReport(null);
      setRunning(false);
      setScanned(0);
      return;
    }

    setRunning(true);
    setScanned(0);

    const timer = setTimeout(() => {
      void searchFolder(source, {
        query: trimmed,
        root,
        showHidden: optionsRef.current.showHidden,
        excludedDirectories: optionsRef.current.excludedDirectories,
        signal: mine,
        onProgress: (files) => {
          if (run === generation.current) setScanned(files);
        },
      })
        .then((result) => {
          // A walk that was overtaken still finishes; its answer is stale.
          if (run !== generation.current) return;
          setReport(result);
          setRunning(false);
        })
        .catch(() => {
          if (run !== generation.current) return;
          setReport(null);
          setRunning(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      mine.aborted = true;
    };
  }, [source, root, query]);

  const update = useCallback((value: string) => setQuery(value), []);

  return { query, report, running, scanned, setQuery: update };
}
