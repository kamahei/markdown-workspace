import { describe, expect, it } from 'vitest';
import { FileSourceError, type FileSource } from '@core/fs/types';

/**
 * The shared FileSource conformance suite (T3.1).
 *
 * Three implementations backed by entirely different mechanisms must be
 * interchangeable. The only way to keep them so is to hold them to identical
 * assertions: same path resolution, same error codes, same behaviour on a
 * missing file. Written before any implementation, on purpose.
 *
 * A source under test must expose this fixture tree:
 *
 *   /readme.md          "# Readme"
 *   /notes.txt          "plain text"
 *   /docs/guide.md      "# Guide"
 *   /docs/api/ref.md    "# Ref"
 *   /docs/img/pic.png   (any content)
 *   /設定.md            "# 設定"
 *   /my notes/a.md      "# A"
 */
export interface ConformanceContext {
  /** Fresh source over the fixture tree above. */
  create: () => Promise<FileSource> | FileSource;
  /** Root path the tree is mounted at, e.g. '/' or '/tmp/xyz'. */
  root: string;
  /** Capabilities this implementation claims. */
  expected: {
    kind: FileSource['kind'];
    canPersist: boolean;
    canRefresh: boolean;
  };
}

export function runFileSourceConformance(name: string, ctx: ConformanceContext) {
  const p = (relative: string) =>
    ctx.root === '/' ? `/${relative}` : `${ctx.root}/${relative}`;

  describe(`FileSource conformance: ${name}`, () => {
    describe('capabilities', () => {
      it('declares its kind and capabilities accurately', async () => {
        const src = await ctx.create();
        expect(src.kind).toBe(ctx.expected.kind);
        expect(src.canPersist).toBe(ctx.expected.canPersist);
        expect(src.canRefresh).toBe(ctx.expected.canRefresh);
      });

      it('has a non-empty display name', async () => {
        const src = await ctx.create();
        expect(src.displayName).toBeTruthy();
      });
    });

    describe('readFile', () => {
      it('reads a file at the root', async () => {
        const src = await ctx.create();
        const content = await src.readFile(p('readme.md'));
        expect(content.text).toContain('# Readme');
        expect(content.size).toBeGreaterThan(0);
      });

      it('reads a file in a subdirectory', async () => {
        const src = await ctx.create();
        expect((await src.readFile(p('docs/guide.md'))).text).toContain('# Guide');
      });

      it('reads a deeply nested file', async () => {
        const src = await ctx.create();
        expect((await src.readFile(p('docs/api/ref.md'))).text).toContain('# Ref');
      });

      it('reads a file whose name is not ASCII', async () => {
        const src = await ctx.create();
        expect((await src.readFile(p('設定.md'))).text).toContain('# 設定');
      });

      it('reads a file whose name contains a space', async () => {
        const src = await ctx.create();
        expect((await src.readFile(p('my notes/a.md'))).text).toContain('# A');
      });

      it('throws not-found for a missing file', async () => {
        const src = await ctx.create();
        await expect(src.readFile(p('nope.md'))).rejects.toThrow(FileSourceError);
        await expect(src.readFile(p('nope.md'))).rejects.toMatchObject({
          code: 'not-found',
        });
      });

      it('returns a URL instead of text in binary mode', async () => {
        const src = await ctx.create();
        const content = await src.readFile(p('docs/img/pic.png'), { binary: true });
        expect(content.url).toBeTruthy();
        expect(content.text).toBeNull();
      });
    });

    describe('listDirectory', () => {
      it('lists the root', async () => {
        const src = await ctx.create();
        const names = (await src.listDirectory(ctx.root)).map((e) => e.name).sort();
        expect(names).toContain('readme.md');
        expect(names).toContain('docs');
        expect(names).toContain('設定.md');
      });

      it('marks directories and files correctly', async () => {
        const src = await ctx.create();
        const byName = Object.fromEntries(
          (await src.listDirectory(ctx.root)).map((e) => [e.name, e]),
        );
        expect(byName['docs']!.kind).toBe('directory');
        expect(byName['readme.md']!.kind).toBe('file');
      });

      it('lists only immediate children, never recursively', async () => {
        const src = await ctx.create();
        const names = (await src.listDirectory(ctx.root)).map((e) => e.name);
        // Eagerly walking the tree is what makes a node_modules folder hang
        // the sidebar (FR-19).
        expect(names).not.toContain('guide.md');
        expect(names).not.toContain('ref.md');
      });

      it('lists a subdirectory', async () => {
        const src = await ctx.create();
        const names = (await src.listDirectory(p('docs'))).map((e) => e.name).sort();
        expect(names).toEqual(['api', 'guide.md', 'img']);
      });

      it('gives every entry a path that can be read back', async () => {
        const src = await ctx.create();
        const entry = (await src.listDirectory(ctx.root)).find(
          (e) => e.name === 'readme.md',
        )!;
        expect((await src.readFile(entry.path)).text).toContain('# Readme');
      });

      it('gives a directory entry a path that can be listed', async () => {
        const src = await ctx.create();
        const entry = (await src.listDirectory(ctx.root)).find((e) => e.name === 'docs')!;
        expect((await src.listDirectory(entry.path)).length).toBeGreaterThan(0);
      });

      it('throws not-found for a missing directory', async () => {
        const src = await ctx.create();
        await expect(src.listDirectory(p('nowhere'))).rejects.toMatchObject({
          code: 'not-found',
        });
      });
    });

    describe('resolve', () => {
      it('resolves a sibling', async () => {
        const src = await ctx.create();
        expect(src.resolve(p('docs/guide.md'), 'other.md')).toBe(p('docs/other.md'));
      });

      it('resolves an explicit ./ prefix', async () => {
        const src = await ctx.create();
        expect(src.resolve(p('docs/guide.md'), './other.md')).toBe(p('docs/other.md'));
      });

      it('resolves a parent traversal', async () => {
        const src = await ctx.create();
        expect(src.resolve(p('docs/api/ref.md'), '../guide.md')).toBe(p('docs/guide.md'));
      });

      it('resolves repeated parent traversal', async () => {
        const src = await ctx.create();
        expect(src.resolve(p('docs/api/ref.md'), '../../readme.md')).toBe(p('readme.md'));
      });

      it('resolves into a subdirectory', async () => {
        const src = await ctx.create();
        expect(src.resolve(p('readme.md'), 'docs/guide.md')).toBe(p('docs/guide.md'));
      });

      it('clamps traversal above the root rather than escaping', async () => {
        const src = await ctx.create();
        const escaped = src.resolve(p('readme.md'), '../../../../../../etc/passwd');
        expect(escaped.startsWith('/')).toBe(true);
        expect(escaped).not.toContain('..');
      });
    });

    describe('exists', () => {
      it('is true for a file and a directory, false otherwise', async () => {
        const src = await ctx.create();
        expect(await src.exists(p('readme.md'))).toBe(true);
        expect(await src.exists(p('docs'))).toBe(true);
        expect(await src.exists(p('nope.md'))).toBe(false);
      });
    });

    describe('invalidate', () => {
      it('is safe to call with and without a path', async () => {
        const src = await ctx.create();
        expect(() => src.invalidate()).not.toThrow();
        expect(() => src.invalidate(ctx.root)).not.toThrow();
        // Reads still work afterwards.
        expect((await src.readFile(p('readme.md'))).text).toContain('# Readme');
      });
    });
  });
}

/** The fixture tree every implementation must expose. */
export const CONFORMANCE_TREE: Record<string, string> = {
  'readme.md': '# Readme\n',
  'notes.txt': 'plain text\n',
  'docs/guide.md': '# Guide\n',
  'docs/api/ref.md': '# Ref\n',
  'docs/img/pic.png': 'PNGDATA',
  '設定.md': '# 設定\n',
  'my notes/a.md': '# A\n',
};
