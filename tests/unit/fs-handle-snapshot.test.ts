import { describe, expect, it } from 'vitest';
import {
  HandleSource,
  type DirectoryHandleLike,
  type FileHandleLike,
  type FileLike,
} from '@core/fs/handle-source';
import { SnapshotSource, type SnapshotEntry } from '@core/fs/snapshot-source';
import { CONFORMANCE_TREE, runFileSourceConformance } from './fs-conformance';

// --- Fakes ----------------------------------------------------------------

function fakeFile(name: string, content: string): FileLike {
  return {
    name,
    size: content.length,
    type: name.endsWith('.png') ? 'image/png' : 'text/plain',
    lastModified: 1_700_000_000_000,
    async text() {
      return content;
    },
  };
}

/** Builds a fake FileSystemDirectoryHandle tree from a flat path map. */
function fakeDirectory(name: string, tree: Record<string, string>): DirectoryHandleLike {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  for (const [path, content] of Object.entries(tree)) {
    files.set(path, content);
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
  }

  const build = (prefix: string, dirName: string): DirectoryHandleLike => {
    const scope = prefix ? `${prefix}/` : '';

    const childNames = () => {
      const seen = new Map<string, 'file' | 'directory'>();
      for (const path of files.keys()) {
        if (prefix && !path.startsWith(scope)) continue;
        const rest = prefix ? path.slice(scope.length) : path;
        const slash = rest.indexOf('/');
        if (slash === -1) seen.set(rest, 'file');
        else seen.set(rest.slice(0, slash), 'directory');
      }
      return seen;
    };

    return {
      kind: 'directory',
      name: dirName,
      async *entries() {
        for (const [childName, kind] of childNames()) {
          yield [
            childName,
            kind === 'directory'
              ? build(`${scope}${childName}`.replace(/\/$/, ''), childName)
              : ({
                  kind: 'file',
                  name: childName,
                  async getFile() {
                    return fakeFile(childName, files.get(`${scope}${childName}`) ?? '');
                  },
                } satisfies FileHandleLike),
          ] as [string, FileHandleLike | DirectoryHandleLike];
        }
      },
      async getFileHandle(childName: string) {
        const key = `${scope}${childName}`;
        if (!files.has(key)) throw new Error('NotFoundError');
        return {
          kind: 'file',
          name: childName,
          async getFile() {
            return fakeFile(childName, files.get(key) ?? '');
          },
        };
      },
      async getDirectoryHandle(childName: string) {
        const key = `${scope}${childName}`;
        if (!dirs.has(key)) throw new Error('NotFoundError');
        return build(key, childName);
      },
    };
  };

  return build('', name);
}

const toUrl = async (file: FileLike) =>
  `blob:fake/${encodeURIComponent(file.name)}#${file.size}`;

// --- Conformance ----------------------------------------------------------

runFileSourceConformance('HandleSource', {
  create: () => new HandleSource(fakeDirectory('tree', CONFORMANCE_TREE), toUrl),
  root: '/',
  expected: { kind: 'handle', canPersist: true, canRefresh: true },
});

runFileSourceConformance('SnapshotSource', {
  create: () => {
    const entries: SnapshotEntry[] = Object.entries(CONFORMANCE_TREE).map(
      ([relativePath, content]) => ({
        relativePath,
        file: fakeFile(relativePath.split('/').pop()!, content),
      }),
    );
    return new SnapshotSource('tree', entries, toUrl);
  },
  root: '/',
  expected: { kind: 'snapshot', canPersist: false, canRefresh: false },
});

// --- Implementation specifics --------------------------------------------

describe('HandleSource specifics', () => {
  const create = () =>
    new HandleSource(fakeDirectory('my-docs', CONFORMANCE_TREE), toUrl);

  it('takes its display name from the handle', () => {
    expect(create().displayName).toBe('my-docs');
  });

  it('caches a listing until invalidated', async () => {
    const src = create();
    const first = await src.listDirectory('/');
    const second = await src.listDirectory('/');
    expect(second).toBe(first);

    src.invalidate('/');
    expect(await src.listDirectory('/')).not.toBe(first);
  });

  it('does not fetch file metadata while listing', async () => {
    // A getFile() per entry would make a large folder crawl; size and
    // timestamp are simply reported as unknown instead.
    const entries = await create().listDirectory('/');
    const file = entries.find((e) => e.name === 'readme.md')!;
    expect(file.size).toBeNull();
    expect(file.modifiedAt).toBeNull();
  });
});

describe('SnapshotSource specifics', () => {
  const create = () =>
    new SnapshotSource(
      'dropped',
      Object.entries(CONFORMANCE_TREE).map(([relativePath, content]) => ({
        relativePath,
        file: fakeFile(relativePath.split('/').pop()!, content),
      })),
      toUrl,
    );

  it('declares honestly that it cannot persist or refresh', () => {
    // The UI reads these to hide reload and "recent folders", rather than
    // offering actions that silently do nothing.
    const src = create();
    expect(src.canPersist).toBe(false);
    expect(src.canRefresh).toBe(false);
  });

  it('reports sizes and timestamps, which it does have', async () => {
    const entries = await create().listDirectory('/');
    const file = entries.find((e) => e.name === 'readme.md')!;
    expect(file.size).toBeGreaterThan(0);
    expect(file.modifiedAt).toBe(1_700_000_000_000);
  });

  it('synthesizes intermediate directories from paths', async () => {
    const src = new SnapshotSource(
      'x',
      [{ relativePath: 'a/b/c/deep.md', file: fakeFile('deep.md', '# Deep\n') }],
      toUrl,
    );
    expect((await src.listDirectory('/')).map((e) => e.name)).toEqual(['a']);
    expect((await src.listDirectory('/a/b')).map((e) => e.name)).toEqual(['c']);
    expect((await src.readFile('/a/b/c/deep.md')).text).toContain('# Deep');
  });

  it('handles an empty snapshot without throwing', async () => {
    const src = new SnapshotSource('empty', [], toUrl);
    expect(await src.listDirectory('/')).toEqual([]);
  });
});
