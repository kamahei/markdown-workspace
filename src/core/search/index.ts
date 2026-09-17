import { isExcluded, sortEntries, type FileSource } from '../fs/types';
import { isMarkdownPath, splitFrontMatter } from '../markdown';

/**
 * Searching every document in the open folder.
 *
 * **Why this is allowed to walk the tree, when FR-19 forbids it.** FR-19 is
 * about the *sidebar*: a folder containing `node_modules` must not be walked
 * because nobody asked for it, and doing so hangs the tree. A search is the
 * reader asking for exactly that walk, once, with a query. The distinction
 * is consent, not cost — so the cost is still bounded, hard, and reported.
 *
 * What bounds it:
 *
 * - The same exclusions the tree uses (`isExcluded`), so `node_modules`,
 *   `.git` and the rest are skipped here too. This is the single biggest
 *   reason a search over a repository finishes at all.
 * - Only Markdown files are opened. Reading a folder's worth of binaries to
 *   find text in them is not what this feature is for.
 * - Caps on directories, files, and matches, each of which stops the walk
 *   and says so rather than letting it run. A truncated answer the reader
 *   can see is better than a complete one that arrives after they gave up.
 * - An `AbortSignal`, because the next keystroke makes this walk pointless.
 * - A concurrency limit: in reader mode every read is a round trip to the
 *   service worker, and an unbounded fan-out buries it.
 *
 * Pure with respect to the platform: it takes a `FileSource` and nothing
 * else, so it runs against `MemorySource` in a unit test and against a real
 * folder in either surface.
 */

export interface SearchLimits {
  /** Directories listed before the walk stops. */
  directories: number;
  /** Files opened before the walk stops. */
  files: number;
  /** Matches collected in total. */
  matches: number;
  /** Matches kept from any one file, so one file cannot fill the results. */
  matchesPerFile: number;
  /** Files being read at once. */
  concurrency: number;
}

export const DEFAULT_SEARCH_LIMITS: SearchLimits = {
  directories: 2_000,
  files: 5_000,
  matches: 500,
  matchesPerFile: 20,
  concurrency: 8,
};

export interface SearchMatch {
  /** Absolute path within the source. */
  path: string;
  /** 1-based, counted in the body with front matter removed. */
  line: number;
  /** The whole line, trimmed of trailing whitespace. */
  text: string;
  /** Where the query sits in `text`, for highlighting. */
  start: number;
  end: number;
}

export interface SearchReport {
  matches: SearchMatch[];
  /** Files actually opened and scanned. */
  filesScanned: number;
  /** True when a cap stopped the walk before it finished. */
  truncated: boolean;
  /** True when the caller aborted; results are partial and usually stale. */
  aborted: boolean;
}

export interface SearchOptions {
  query: string;
  root: string;
  showHidden: boolean;
  excludedDirectories: string[];
  limits?: Partial<SearchLimits>;
  signal?: { aborted: boolean };
  /** Called as files are scanned, so a long search can show progress. */
  onProgress?: (filesScanned: number) => void;
}

/** The shortest query worth walking a folder for. */
export const MIN_QUERY_LENGTH = 2;

export async function searchFolder(
  source: FileSource,
  options: SearchOptions,
): Promise<SearchReport> {
  const limits = { ...DEFAULT_SEARCH_LIMITS, ...options.limits };
  const query = options.query.trim();
  const empty: SearchReport = {
    matches: [],
    filesScanned: 0,
    truncated: false,
    aborted: false,
  };
  if (query.length < MIN_QUERY_LENGTH) return empty;

  const needle = query.toLowerCase();
  const entryOptions = {
    showHidden: options.showHidden,
    excludedDirectories: options.excludedDirectories,
  };

  const matches: SearchMatch[] = [];
  let filesScanned = 0;
  let directoriesListed = 0;
  let truncated = false;
  const aborted = () => options.signal?.aborted === true;

  // Breadth first: the documents nearest the folder the reader opened are
  // the ones they most likely meant, so those results arrive first even if
  // a cap stops the walk later.
  const queue: string[] = [options.root];
  const files: string[] = [];

  while (queue.length > 0 && !aborted()) {
    const directory = queue.shift()!;
    if (directoriesListed >= limits.directories) {
      truncated = true;
      break;
    }
    directoriesListed += 1;

    let entries;
    try {
      entries = await source.listDirectory(directory);
    } catch {
      // One unreadable folder is not a failed search.
      continue;
    }

    for (const entry of sortEntries(entries, 'name')) {
      if (isExcluded(entry, entryOptions)) continue;
      if (entry.kind === 'directory') {
        queue.push(entry.path);
      } else if (isMarkdownPath(entry.name)) {
        if (files.length >= limits.files) {
          truncated = true;
          break;
        }
        files.push(entry.path);
      }
    }
  }

  // Read in bounded batches rather than all at once.
  for (let i = 0; i < files.length; i += limits.concurrency) {
    if (aborted() || matches.length >= limits.matches) {
      if (matches.length >= limits.matches && i < files.length) truncated = true;
      break;
    }

    const batch = files.slice(i, i + limits.concurrency);
    const texts = await Promise.all(
      batch.map(async (path) => {
        try {
          const content = await source.readFile(path);
          return { path, text: content.text ?? '' };
        } catch {
          return null;
        }
      }),
    );

    for (const file of texts) {
      if (!file) continue;
      filesScanned += 1;
      for (const match of matchesIn(file.path, file.text, needle, limits)) {
        if (matches.length >= limits.matches) {
          truncated = true;
          break;
        }
        matches.push(match);
      }
    }
    options.onProgress?.(filesScanned);
  }

  return { matches, filesScanned, truncated, aborted: aborted() };
}

/**
 * Lines of one document containing the query.
 *
 * Front matter is dropped first: a search for "title" should find the word
 * in the prose, not the YAML key in every file that has one.
 */
function matchesIn(
  path: string,
  source: string,
  needle: string,
  limits: SearchLimits,
): SearchMatch[] {
  const { body } = splitFrontMatter(source);
  const found: SearchMatch[] = [];

  // Split the way front matter does. A CRLF document with no front matter
  // reaches here unnormalized, and splitting on "\n" alone would leave a
  // carriage return on the end of every line.
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (found.length >= limits.matchesPerFile) break;
    const line = lines[i]!;
    const at = line.toLowerCase().indexOf(needle);
    if (at < 0) continue;

    // The whole line, so the reader sees the match in its sentence. Long
    // lines are the UI's problem to truncate, where it knows its own width.
    found.push({
      path,
      line: i + 1,
      text: line.replace(/\s+$/, ''),
      start: at,
      end: at + needle.length,
    });
  }

  return found;
}

/** Groups matches by file, keeping both files and lines in walk order. */
export function groupByFile(
  matches: SearchMatch[],
): Array<{ path: string; matches: SearchMatch[] }> {
  const groups = new Map<string, SearchMatch[]>();
  for (const match of matches) {
    const list = groups.get(match.path);
    if (list) list.push(match);
    else groups.set(match.path, [match]);
  }
  return [...groups].map(([path, list]) => ({ path, matches: list }));
}
