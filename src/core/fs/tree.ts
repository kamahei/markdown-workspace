import { isMarkdownPath } from '../markdown';
import { basename, isExcluded, sortEntries, type DirectoryEntry } from './types';

/**
 * Tree model for the file browser (FR-15, FR-17, FR-19, FR-20).
 *
 * Flattening to a visible-row list is what makes virtualization possible: the
 * renderer draws a window of rows and never touches the rest. Children load on
 * expansion, never eagerly — walking a tree up front is what makes a folder
 * containing node_modules hang the sidebar.
 */

export interface TreeNode {
  path: string;
  name: string;
  kind: 'file' | 'directory';
  depth: number;
  /** Directories only: whether children are currently shown. */
  expanded: boolean;
  /** Directories only: children are being fetched. */
  loading: boolean;
  /** Directories only: the last load failed with this message. */
  error: string | null;
  /** Whether this file is the document currently open. */
  active: boolean;
  /** Markdown files are visually distinct from other files. */
  isMarkdown: boolean;
}

export interface TreeOptions {
  showHidden: boolean;
  excludedDirectories: string[];
  sortBy: 'name' | 'modified';
}

export interface TreeState {
  root: string;
  /** Loaded children, keyed by directory path. */
  children: Map<string, DirectoryEntry[]>;
  expanded: Set<string>;
  loading: Set<string>;
  errors: Map<string, string>;
  activePath: string | null;
  filter: string;
}

export function createTreeState(root: string): TreeState {
  return {
    root,
    children: new Map(),
    expanded: new Set([root]),
    loading: new Set(),
    errors: new Map(),
    activePath: null,
    filter: '',
  };
}

/**
 * Directories whose contents are shown even when the name filter is active.
 *
 * Filtering only what is already loaded is a deliberate limit: searching the
 * whole tree would mean walking it, which is the thing the design avoids.
 */
function matchesFilter(name: string, filter: string): boolean {
  if (!filter) return true;
  return name.toLowerCase().includes(filter.toLowerCase());
}

/** Produces the flat list of rows the virtualizer draws. */
export function flattenTree(state: TreeState, options: TreeOptions): TreeNode[] {
  const rows: TreeNode[] = [];
  const filter = state.filter.trim();

  const walk = (dir: string, depth: number, ancestors: Set<string>) => {
    const entries = state.children.get(dir);
    if (!entries) return;

    const visible = sortEntries(entries, options.sortBy).filter(
      (entry) => !isExcluded(entry, options),
    );

    for (const entry of visible) {
      const isDirectory = entry.kind === 'directory';
      const expanded = state.expanded.has(entry.path);

      // A directory survives the filter when it matches, or when anything
      // loaded beneath it does.
      const selfMatches = matchesFilter(entry.name, filter);
      const childMatches =
        isDirectory && filter
          ? hasMatchingDescendant(state, entry.path, filter, options)
          : false;

      if (filter && !selfMatches && !childMatches) continue;

      rows.push({
        path: entry.path,
        name: entry.name,
        kind: entry.kind,
        depth,
        expanded: isDirectory && (expanded || (filter !== '' && childMatches)),
        loading: state.loading.has(entry.path),
        error: state.errors.get(entry.path) ?? null,
        active: entry.path === state.activePath,
        isMarkdown: !isDirectory && isMarkdownPath(entry.name),
      });

      if (!isDirectory) continue;
      // A symlink pointing at an ancestor would otherwise recurse forever.
      if (ancestors.has(entry.path)) continue;
      if (expanded || (filter !== '' && childMatches)) {
        walk(entry.path, depth + 1, new Set([...ancestors, entry.path]));
      }
    }
  };

  walk(state.root, 0, new Set([state.root]));
  return rows;
}

function hasMatchingDescendant(
  state: TreeState,
  dir: string,
  filter: string,
  options: TreeOptions,
  seen = new Set<string>(),
): boolean {
  if (seen.has(dir)) return false;
  seen.add(dir);

  const entries = state.children.get(dir);
  if (!entries) return false;

  for (const entry of entries) {
    if (isExcluded(entry, options)) continue;
    if (matchesFilter(entry.name, filter)) return true;
    if (
      entry.kind === 'directory' &&
      hasMatchingDescendant(state, entry.path, filter, options, seen)
    ) {
      return true;
    }
  }
  return false;
}

/** Directories that need loading to satisfy the current expansion state. */
export function pendingLoads(state: TreeState): string[] {
  const needed: string[] = [];
  for (const path of [state.root, ...state.expanded]) {
    if (
      !state.children.has(path) &&
      !state.loading.has(path) &&
      !state.errors.has(path)
    ) {
      needed.push(path);
    }
  }
  return [...new Set(needed)];
}

/** The ancestor chain of a path, root first, for revealing a document. */
export function ancestorsOf(root: string, path: string): string[] {
  if (!path.startsWith(root)) return [root];

  const relative = path.slice(root.length).replace(/^\//, '');
  const segments = relative.split('/').slice(0, -1);

  const out = [root];
  let current = root;
  for (const segment of segments) {
    current = `${current.replace(/\/$/, '')}/${segment}`;
    out.push(current);
  }
  return out;
}

/** Row index of a path in the flattened list, or -1. */
export function indexOfPath(rows: TreeNode[], path: string | null): number {
  if (!path) return -1;
  return rows.findIndex((row) => row.path === path);
}

/**
 * Row index of the parent of `index`, or -1 at the top level.
 *
 * The flattened list carries depth rather than parent links, so the parent is
 * the nearest row above that is shallower. `Left` on a leaf uses this: the
 * ARIA tree pattern moves to the parent there, not simply one row up, which
 * is what made arrow keys feel like they were wandering.
 */
export function parentIndex(rows: TreeNode[], index: number): number {
  const row = rows[index];
  if (!row || row.depth === 0) return -1;
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = rows[i];
    if (candidate && candidate.depth < row.depth) return i;
  }
  return -1;
}

/**
 * Row index of the first child of an expanded directory, or -1.
 *
 * Children follow their parent immediately in the flattened list, so this is
 * the next row when it is one level deeper. An expanded but empty directory
 * has none, which is why this can fail.
 */
export function firstChildIndex(rows: TreeNode[], index: number): number {
  const row = rows[index];
  if (!row || row.kind !== 'directory' || !row.expanded) return -1;
  const next = rows[index + 1];
  return next && next.depth === row.depth + 1 ? index + 1 : -1;
}

/**
 * The window of rows a virtualized list should render.
 *
 * Overscan keeps a few rows beyond the viewport mounted so scrolling does not
 * reveal blank space before the next frame.
 */
export function visibleWindow(
  total: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan = 8,
): { start: number; end: number } {
  if (total === 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const first = Math.floor(scrollTop / rowHeight);
  const count = Math.ceil(viewportHeight / rowHeight);
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(total, first + count + overscan),
  };
}

export { basename };
