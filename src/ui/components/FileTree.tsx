import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  firstChildIndex,
  flattenTree,
  indexOfPath,
  parentIndex,
  visibleWindow,
  type TreeNode,
  type TreeOptions,
  type TreeState,
} from '@core/fs/tree';
import { t } from '../i18n';

const ROW_HEIGHT = 24;

/** Stable per-index id, so aria-activedescendant can point at a row. */
const rowId = (index: number) => `mw-tree-row-${index}`;

interface FileTreeProps {
  state: TreeState;
  /** Set by the parent to focus the filter from a shortcut. */
  filterRef?: { current: HTMLInputElement | null };
  options: TreeOptions;
  /**
   * Put keyboard focus on the tree once it has rows.
   *
   * For surfaces where picking a file is the whole point of the page, and
   * for a reader arriving from the tree — opening a document is a full
   * navigation, so without this the cursor is lost on every Enter.
   */
  autoFocus?: boolean;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onFilterChange: (value: string) => void;
}

/**
 * The file tree (FR-15, FR-17, FR-19).
 *
 * Implements the ARIA `tree` pattern with roving tabindex: one row is in the
 * tab order and the arrow keys move within the tree, which is what makes it
 * usable without a pointer (NFR-7).
 *
 * Rows are virtualized. Only the visible window is mounted, so a folder with
 * thousands of entries costs the same as a small one.
 *
 * The cursor is tracked by **path**, not by row index. The flattened list
 * reorders whenever a folder expands or the filter changes, so an index
 * silently comes to mean a different file; a path does not.
 */
export function FileTree({
  state,
  filterRef,
  options,
  autoFocus = false,
  onToggle,
  onOpen,
  onFilterChange,
}: FileTreeProps) {
  const rows = useMemo(() => flattenTree(state, options), [state, options]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const [focusPath, setFocusPath] = useState<string | null>(null);

  // Falls back to the first row when the cursor's file is gone — filtered
  // out, or inside a folder that was just collapsed.
  const focusIndex = useMemo(() => {
    const index = indexOfPath(rows, focusPath);
    return index >= 0 ? index : 0;
  }, [rows, focusPath]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    observer.observe(el);
    setViewportHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  /**
   * Follow the active document, but only when it actually changes.
   *
   * This used to re-run on every change to `rows`, which meant expanding a
   * folder threw the cursor back to the open file — the user pressed Right
   * and the selection jumped somewhere else entirely.
   */
  const followed = useRef<string | null>(null);
  useEffect(() => {
    const path = state.activePath;
    if (path === followed.current) return;
    // Rows may not have loaded yet; leave it unfollowed and try again when
    // they arrive rather than giving up on this path.
    if (indexOfPath(rows, path) < 0) return;
    followed.current = path;
    setFocusPath(path);
  }, [rows, state.activePath]);

  // Keep the cursor on screen. Virtualization means an off-window row is not
  // merely out of sight, it is not mounted at all.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || rows.length === 0) return;
    const top = focusIndex * ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
    }
  }, [focusIndex, rows.length]);

  const hasRows = rows.length > 0;
  useEffect(() => {
    if (!autoFocus || !hasRows) return;
    const el = treeRef.current;
    const owner = el?.ownerDocument;
    if (!el || !owner) return;
    // Rows arrive asynchronously, so by now the user may have clicked
    // something. Never take focus away from a choice they made.
    const active = owner.activeElement;
    if (active && active !== owner.body && active !== owner.documentElement) return;
    el.focus();
  }, [autoFocus, hasRows]);

  const { start, end } = visibleWindow(
    rows.length,
    scrollTop,
    viewportHeight,
    ROW_HEIGHT,
  );
  const window = rows.slice(start, end);

  const moveTo = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(index, 0), Math.max(rows.length - 1, 0));
      const row = rows[clamped];
      if (row) setFocusPath(row.path);
    },
    [rows],
  );

  /**
   * Arrow keys, per the ARIA tree pattern.
   *
   * Right and Left are about the hierarchy, not about rows: on a leaf, Right
   * does nothing and Left goes to the containing folder. Treating them as
   * "down" and "up" made the cursor drift a row every time someone tried to
   * expand a file.
   */
  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const row = rows[focusIndex];
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveTo(focusIndex + 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveTo(focusIndex - 1);
          break;
        case 'Home':
          event.preventDefault();
          moveTo(0);
          break;
        case 'End':
          event.preventDefault();
          moveTo(rows.length - 1);
          break;
        case 'ArrowRight': {
          if (!row) break;
          event.preventDefault();
          if (row.kind !== 'directory') break;
          if (!row.expanded) {
            onToggle(row.path);
            break;
          }
          const child = firstChildIndex(rows, focusIndex);
          if (child >= 0) moveTo(child);
          break;
        }
        case 'ArrowLeft': {
          if (!row) break;
          event.preventDefault();
          if (row.kind === 'directory' && row.expanded) {
            onToggle(row.path);
            break;
          }
          const parent = parentIndex(rows, focusIndex);
          if (parent >= 0) moveTo(parent);
          break;
        }
        case 'Enter':
        case ' ':
          if (!row) break;
          event.preventDefault();
          if (row.kind === 'directory') onToggle(row.path);
          else onOpen(row.path);
          break;
        default:
          break;
      }
    },
    [focusIndex, rows, moveTo, onToggle, onOpen],
  );

  return (
    <div class="mw-tree-wrap">
      <div class="mw-tree-filter">
        <input
          ref={filterRef}
          type="search"
          class="mw-input"
          placeholder={t('filterFilesPlaceholder')}
          aria-label={t('filterFilesLabel')}
          value={state.filter}
          onInput={(e) => onFilterChange((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onFilterChange('');
            // Down out of the filter and into the list, so "/" is a complete
            // way in from the keyboard rather than a dead end.
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
              e.preventDefault();
              treeRef.current?.focus();
            }
          }}
        />
      </div>

      <div
        ref={scrollerRef}
        class="mw-tree-scroll"
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        {rows.length === 0 ? (
          <p class="mw-empty">
            {state.filter ? t('noFilesMatchFilter') : t('folderIsEmpty')}
          </p>
        ) : (
          <div
            ref={treeRef}
            id="mw-tree"
            role="tree"
            aria-label={t('filesNav')}
            class="mw-tree"
            tabIndex={0}
            onKeyDown={onKeyDown}
            aria-activedescendant={rows[focusIndex] ? rowId(focusIndex) : undefined}
            style={{ height: `${rows.length * ROW_HEIGHT}px` }}
          >
            {/* Only the visible window is mounted; the spacer keeps the
                scrollbar honest about the full length. */}
            <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
              {window.map((row, i) => (
                <TreeRow
                  key={row.path}
                  id={rowId(start + i)}
                  row={row}
                  focused={start + i === focusIndex}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  onFocus={() => setFocusPath(row.path)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface TreeRowProps {
  id: string;
  row: TreeNode;
  focused: boolean;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onFocus: () => void;
}

function TreeRow({ id, row, focused, onToggle, onOpen, onFocus }: TreeRowProps) {
  const isDirectory = row.kind === 'directory';

  return (
    <div
      id={id}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={isDirectory ? row.expanded : undefined}
      aria-selected={row.active}
      aria-busy={row.loading || undefined}
      class={[
        'mw-tree-row',
        row.active ? 'is-active' : '',
        focused ? 'is-focused' : '',
        row.isMarkdown ? 'is-markdown' : '',
        isDirectory ? 'is-directory' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ paddingLeft: `${row.depth * 12 + 6}px`, height: `${ROW_HEIGHT}px` }}
      onClick={() => {
        onFocus();
        if (isDirectory) onToggle(row.path);
        else onOpen(row.path);
      }}
      title={row.error ?? row.path}
    >
      <span class="mw-tree-chevron" aria-hidden="true">
        {isDirectory ? (row.expanded ? '▾' : '▸') : ''}
      </span>
      <span class="mw-tree-name">{row.name}</span>
      {row.loading ? <span class="mw-tree-note">…</span> : null}
      {/* A directory that failed to load stays in place with its reason
          attached, rather than vanishing or taking the tree down. */}
      {row.error ? (
        <span class="mw-tree-note mw-tree-error" role="img" aria-label={row.error}>
          !
        </span>
      ) : null}
    </div>
  );
}
