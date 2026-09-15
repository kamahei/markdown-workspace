import { describe, expect, it } from 'vitest';
import {
  ancestorsOf,
  createTreeState,
  flattenTree,
  indexOfPath,
  pendingLoads,
  visibleWindow,
  type TreeOptions,
  type TreeState,
} from '@core/fs/tree';
import type { DirectoryEntry } from '@core/fs/types';

const OPTIONS: TreeOptions = {
  showHidden: false,
  excludedDirectories: ['node_modules', '.git'],
  sortBy: 'name',
};

const file = (dir: string, name: string): DirectoryEntry => ({
  name,
  kind: 'file',
  path: `${dir}/${name}`,
  size: 1,
  modifiedAt: null,
});

const dir = (parent: string, name: string): DirectoryEntry => ({
  name,
  kind: 'directory',
  path: `${parent}/${name}`,
  size: null,
  modifiedAt: null,
});

function stateWith(children: Record<string, DirectoryEntry[]>, root = '/r'): TreeState {
  const state = createTreeState(root);
  for (const [path, entries] of Object.entries(children)) {
    state.children.set(path, entries);
  }
  return state;
}

describe('flattenTree — structure (FR-15)', () => {
  it('lists the root when nothing is expanded', () => {
    const state = stateWith({
      '/r': [dir('/r', 'docs'), file('/r', 'readme.md')],
    });
    const rows = flattenTree(state, OPTIONS);
    expect(rows.map((r) => r.name)).toEqual(['docs', 'readme.md']);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
  });

  it('sorts directories before files, then by name', () => {
    const state = stateWith({
      '/r': [
        file('/r', 'a.md'),
        dir('/r', 'zeta'),
        file('/r', 'b.md'),
        dir('/r', 'alpha'),
      ],
    });
    expect(flattenTree(state, OPTIONS).map((r) => r.name)).toEqual([
      'alpha',
      'zeta',
      'a.md',
      'b.md',
    ]);
  });

  it('sorts numerically so 10 follows 9', () => {
    const state = stateWith({
      '/r': [file('/r', 'ch10.md'), file('/r', 'ch2.md'), file('/r', 'ch1.md')],
    });
    expect(flattenTree(state, OPTIONS).map((r) => r.name)).toEqual([
      'ch1.md',
      'ch2.md',
      'ch10.md',
    ]);
  });

  it('shows children only when a directory is expanded (FR-19)', () => {
    const state = stateWith({
      '/r': [dir('/r', 'docs')],
      '/r/docs': [file('/r/docs', 'guide.md')],
    });

    // Loaded but collapsed: the child must not appear.
    expect(flattenTree(state, OPTIONS).map((r) => r.name)).toEqual(['docs']);

    state.expanded.add('/r/docs');
    const rows = flattenTree(state, OPTIONS);
    expect(rows.map((r) => r.name)).toEqual(['docs', 'guide.md']);
    expect(rows[1]!.depth).toBe(1);
  });

  it('marks Markdown files distinctly', () => {
    const state = stateWith({
      '/r': [file('/r', 'a.md'), file('/r', 'b.txt'), file('/r', 'c.markdown')],
    });
    const rows = flattenTree(state, OPTIONS);
    expect(rows.map((r) => r.isMarkdown)).toEqual([true, false, true]);
  });

  it('marks the active document', () => {
    const state = stateWith({ '/r': [file('/r', 'a.md'), file('/r', 'b.md')] });
    state.activePath = '/r/b.md';
    const rows = flattenTree(state, OPTIONS);
    expect(rows.find((r) => r.name === 'b.md')!.active).toBe(true);
    expect(rows.find((r) => r.name === 'a.md')!.active).toBe(false);
  });

  it('surfaces per-directory loading and error state', () => {
    const state = stateWith({ '/r': [dir('/r', 'a'), dir('/r', 'b')] });
    state.loading.add('/r/a');
    state.errors.set('/r/b', 'Permission denied');

    const rows = flattenTree(state, OPTIONS);
    expect(rows.find((r) => r.name === 'a')!.loading).toBe(true);
    // One failed directory must not take the tree down with it.
    expect(rows.find((r) => r.name === 'b')!.error).toBe('Permission denied');
  });
});

describe('flattenTree — exclusions (FR-20)', () => {
  it('hides excluded directories by default', () => {
    const state = stateWith({
      '/r': [dir('/r', 'node_modules'), dir('/r', 'src'), dir('/r', '.git')],
    });
    expect(flattenTree(state, OPTIONS).map((r) => r.name)).toEqual(['src']);
  });

  it('hides dotfiles by default and shows them when asked', () => {
    const state = stateWith({ '/r': [file('/r', '.env'), file('/r', 'a.md')] });
    expect(flattenTree(state, OPTIONS).map((r) => r.name)).toEqual(['a.md']);
    expect(
      flattenTree(state, { ...OPTIONS, showHidden: true }).map((r) => r.name),
    ).toEqual(['.env', 'a.md']);
  });

  it('does not exclude a file that shares an excluded directory name', () => {
    const state = stateWith({ '/r': [file('/r', 'node_modules')] });
    expect(flattenTree(state, OPTIONS).map((r) => r.name)).toEqual(['node_modules']);
  });
});

describe('flattenTree — filtering (FR-17)', () => {
  const state = () => {
    const s = stateWith({
      '/r': [dir('/r', 'docs'), file('/r', 'readme.md'), file('/r', 'notes.txt')],
      '/r/docs': [file('/r/docs', 'guide.md'), file('/r/docs', 'api.md')],
    });
    return s;
  };

  it('keeps only matching names', () => {
    const s = state();
    s.filter = 'readme';
    expect(flattenTree(s, OPTIONS).map((r) => r.name)).toEqual(['readme.md']);
  });

  it('is case insensitive', () => {
    const s = state();
    s.filter = 'README';
    expect(flattenTree(s, OPTIONS).map((r) => r.name)).toEqual(['readme.md']);
  });

  it('reveals a collapsed directory containing a match', () => {
    const s = state();
    s.filter = 'guide';
    const rows = flattenTree(s, OPTIONS);
    expect(rows.map((r) => r.name)).toEqual(['docs', 'guide.md']);
  });

  it('shows everything again when the filter is cleared', () => {
    const s = state();
    s.filter = 'guide';
    s.filter = '';
    expect(flattenTree(s, OPTIONS).map((r) => r.name)).toEqual([
      'docs',
      'notes.txt',
      'readme.md',
    ]);
  });

  it('returns nothing when nothing matches', () => {
    const s = state();
    s.filter = 'zzz-no-match';
    expect(flattenTree(s, OPTIONS)).toEqual([]);
  });
});

describe('flattenTree — pathological trees', () => {
  it('does not recurse forever on a symlink cycle (Q7)', () => {
    const state = stateWith({
      '/r': [dir('/r', 'loop')],
      '/r/loop': [dir('/r/loop', 'back')],
      '/r/loop/back': [dir('/r/loop/back', 'loop')],
    });
    state.expanded.add('/r/loop');
    state.expanded.add('/r/loop/back');
    state.expanded.add('/r/loop/back/loop');

    expect(() => flattenTree(state, OPTIONS)).not.toThrow();
    expect(flattenTree(state, OPTIONS).length).toBeLessThan(100);
  });

  it('flattens a large directory quickly', () => {
    const entries = Array.from({ length: 5000 }, (_, i) => file('/r', `f-${i}.md`));
    const state = stateWith({ '/r': entries });

    const started = Date.now();
    const rows = flattenTree(state, OPTIONS);
    expect(rows).toHaveLength(5000);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('pendingLoads', () => {
  it('asks for the root first', () => {
    expect(pendingLoads(createTreeState('/r'))).toEqual(['/r']);
  });

  it('asks only for expanded directories that are not loaded', () => {
    const state = stateWith({ '/r': [dir('/r', 'a'), dir('/r', 'b')] });
    state.expanded.add('/r/a');
    expect(pendingLoads(state)).toEqual(['/r/a']);
  });

  it('does not re-ask while loading or after an error', () => {
    const state = stateWith({ '/r': [dir('/r', 'a'), dir('/r', 'b')] });
    state.expanded.add('/r/a');
    state.expanded.add('/r/b');
    state.loading.add('/r/a');
    state.errors.set('/r/b', 'denied');
    // Retrying a failed directory forever would hammer the service worker.
    expect(pendingLoads(state)).toEqual([]);
  });
});

describe('ancestorsOf', () => {
  it('lists the chain from root to the containing directory', () => {
    expect(ancestorsOf('/r', '/r/docs/api/ref.md')).toEqual([
      '/r',
      '/r/docs',
      '/r/docs/api',
    ]);
  });

  it('returns just the root for a file directly inside it', () => {
    expect(ancestorsOf('/r', '/r/a.md')).toEqual(['/r']);
  });

  it('returns the root for a path outside the tree', () => {
    expect(ancestorsOf('/r', '/elsewhere/a.md')).toEqual(['/r']);
  });
});

describe('visibleWindow', () => {
  it('returns an empty window for an empty list', () => {
    expect(visibleWindow(0, 0, 500, 24)).toEqual({ start: 0, end: 0 });
  });

  it('renders only a window of a large list', () => {
    const { start, end } = visibleWindow(5000, 0, 480, 24);
    expect(start).toBe(0);
    // 20 visible rows plus overscan, not 5000.
    expect(end).toBeLessThan(60);
  });

  it('follows the scroll position', () => {
    const { start, end } = visibleWindow(5000, 2400, 480, 24);
    expect(start).toBeLessThanOrEqual(100);
    expect(start).toBeGreaterThan(80);
    expect(end).toBeGreaterThan(start);
  });

  it('clamps at the end of the list', () => {
    expect(visibleWindow(30, 100000, 480, 24).end).toBe(30);
  });
});

describe('indexOfPath', () => {
  it('finds a row and reports -1 otherwise', () => {
    const state = stateWith({ '/r': [file('/r', 'a.md'), file('/r', 'b.md')] });
    const rows = flattenTree(state, OPTIONS);
    expect(indexOfPath(rows, '/r/b.md')).toBe(1);
    expect(indexOfPath(rows, '/r/zz.md')).toBe(-1);
    expect(indexOfPath(rows, null)).toBe(-1);
  });
});
