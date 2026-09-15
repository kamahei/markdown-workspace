import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  flattenTree,
  indexOfPath,
  visibleWindow,
  type TreeNode,
  type TreeOptions,
  type TreeState,
} from '@core/fs/tree';

const ROW_HEIGHT = 24;

interface FileTreeProps {
  state: TreeState;
  options: TreeOptions;
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
 */
export function FileTree({
  state,
  options,
  onToggle,
  onOpen,
  onFilterChange,
}: FileTreeProps) {
  const rows = useMemo(() => flattenTree(state, options), [state, options]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    observer.observe(el);
    setViewportHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  // Follow the active document when it changes from outside the tree.
  useEffect(() => {
    const index = indexOfPath(rows, state.activePath);
    if (index >= 0) setFocusIndex(index);
  }, [rows, state.activePath]);

  const { start, end } = visibleWindow(
    rows.length,
    scrollTop,
    viewportHeight,
    ROW_HEIGHT,
  );
  const window = rows.slice(start, end);

  const move = useCallback(
    (delta: number) => {
      setFocusIndex((current) => {
        const next = Math.min(Math.max(current + delta, 0), Math.max(rows.length - 1, 0));
        const el = scrollerRef.current;
        if (el) {
          const top = next * ROW_HEIGHT;
          if (top < el.scrollTop) el.scrollTop = top;
          else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
            el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
          }
        }
        return next;
      });
    },
    [rows.length],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const row = rows[focusIndex];
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          move(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          move(-1);
          break;
        case 'Home':
          event.preventDefault();
          setFocusIndex(0);
          break;
        case 'End':
          event.preventDefault();
          setFocusIndex(Math.max(rows.length - 1, 0));
          break;
        case 'ArrowRight':
          if (!row) break;
          event.preventDefault();
          if (row.kind === 'directory' && !row.expanded) onToggle(row.path);
          else move(1);
          break;
        case 'ArrowLeft':
          if (!row) break;
          event.preventDefault();
          if (row.kind === 'directory' && row.expanded) onToggle(row.path);
          else move(-1);
          break;
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
    [focusIndex, rows, move, onToggle, onOpen],
  );

  return (
    <div class="mw-tree-wrap">
      <div class="mw-tree-filter">
        <input
          type="search"
          class="mw-input"
          placeholder="Filter files…"
          aria-label="Filter files by name"
          value={state.filter}
          onInput={(e) => onFilterChange((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onFilterChange('');
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
            {state.filter ? 'No files match this filter.' : 'This folder is empty.'}
          </p>
        ) : (
          <div
            role="tree"
            aria-label="Files"
            class="mw-tree"
            tabIndex={0}
            onKeyDown={onKeyDown}
            style={{ height: `${rows.length * ROW_HEIGHT}px` }}
          >
            {/* Only the visible window is mounted; the spacer keeps the
                scrollbar honest about the full length. */}
            <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
              {window.map((row, i) => (
                <TreeRow
                  key={row.path}
                  row={row}
                  focused={start + i === focusIndex}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  onFocus={() => setFocusIndex(start + i)}
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
  row: TreeNode;
  focused: boolean;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onFocus: () => void;
}

function TreeRow({ row, focused, onToggle, onOpen, onFocus }: TreeRowProps) {
  const isDirectory = row.kind === 'directory';

  return (
    <div
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
