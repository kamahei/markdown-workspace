import { describe, expect, it, vi } from 'vitest';
import { MemorySource } from '@core/fs/memory-source';
import {
  DEFAULT_SEARCH_LIMITS,
  groupByFile,
  MIN_QUERY_LENGTH,
  searchFolder,
  type SearchOptions,
} from '@core/search';

/**
 * Searching every document in the open folder.
 *
 * The walk is the part that can go wrong quietly: skip the wrong folder and
 * results go missing, skip none and a repository hangs the browser. All of
 * that is reachable here, against an in-memory tree, with no browser.
 */

const search = (source: MemorySource, over: Partial<SearchOptions> = {}) =>
  searchFolder(source, {
    query: 'needle',
    root: '/',
    showHidden: false,
    excludedDirectories: ['node_modules', '.git'],
    ...over,
  });

const tree = (files: Record<string, string>) => new MemorySource('test', files);

describe('searchFolder', () => {
  it('finds a line, and says where it is', async () => {
    const source = tree({
      'a.md': 'First line.\nA needle here.\nThird.\n',
    });

    const report = await search(source);
    expect(report.matches).toEqual([
      { path: '/a.md', line: 2, text: 'A needle here.', start: 2, end: 8 },
    ]);
    expect(report.filesScanned).toBe(1);
    expect(report.truncated).toBe(false);
  });

  it('ignores case', async () => {
    const source = tree({ 'a.md': 'A NEEDLE here.\n' });
    const report = await search(source, { query: 'needle' });
    expect(report.matches).toHaveLength(1);

    const upper = await search(source, { query: 'NEEDLE' });
    expect(upper.matches).toHaveLength(1);
  });

  it('descends into subfolders', async () => {
    const source = tree({
      'top.md': 'needle\n',
      'sub/deep.md': 'needle\n',
      'sub/deeper/deepest.md': 'needle\n',
    });
    const report = await search(source);
    expect(report.matches.map((m) => m.path).sort()).toEqual([
      '/sub/deep.md',
      '/sub/deeper/deepest.md',
      '/top.md',
    ]);
  });

  it('skips the folders the tree skips', async () => {
    // The single most important bound. Without it, a search over any
    // checked-out repository reads tens of thousands of files.
    const source = tree({
      'keep.md': 'needle\n',
      'node_modules/pkg/readme.md': 'needle\n',
      '.git/notes.md': 'needle\n',
    });
    const report = await search(source);
    expect(report.matches.map((m) => m.path)).toEqual(['/keep.md']);
  });

  it('reaches hidden files when the reader has asked to see them', async () => {
    const source = tree({ '.hidden/notes.md': 'needle\n' });
    expect((await search(source)).matches).toEqual([]);
    expect((await search(source, { showHidden: true })).matches).toHaveLength(1);
  });

  it('opens only Markdown files', async () => {
    const source = tree({
      'doc.md': 'needle\n',
      'script.js': 'needle\n',
      'notes.txt': 'needle\n',
      'page.markdown': 'needle\n',
    });
    const report = await search(source);
    expect(report.matches.map((m) => m.path).sort()).toEqual([
      '/doc.md',
      '/page.markdown',
    ]);
  });

  it('does not match inside front matter', async () => {
    // "title" appears as a YAML key in most documents that have front
    // matter, and matching it would bury the real hits.
    const source = tree({
      'a.md': '---\ntitle: needle in the metadata\n---\n\nThe body.\n',
      'b.md': '---\ntitle: Something\n---\n\nA needle in the body.\n',
    });
    const report = await search(source);
    expect(report.matches.map((m) => m.path)).toEqual(['/b.md']);
  });

  it('numbers lines from the body, not from the file', async () => {
    const source = tree({
      'a.md': '---\ntitle: T\n---\nFirst body line.\nneedle\n',
    });
    const [match] = (await search(source)).matches;
    // The whole front matter block is gone, closing delimiter included, so
    // "First body line." is line 1 and the match is line 2. Counting from
    // the file instead would have said 5, and jumping there would land the
    // reader three lines past what they clicked on.
    expect(match?.line).toBe(2);
  });

  it('offers offsets that actually bracket the match', async () => {
    const source = tree({ 'a.md': 'xx needle yy\n' });
    const [match] = (await search(source)).matches;
    expect(match?.text.slice(match.start, match.end)).toBe('needle');
  });

  it('refuses a query too short to be worth a walk', async () => {
    const source = tree({ 'a.md': 'a\n' });
    const read = vi.spyOn(source, 'readFile');
    const report = await search(source, { query: 'a'.repeat(MIN_QUERY_LENGTH - 1) });
    expect(report.matches).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only query as empty', async () => {
    const source = tree({ 'a.md': 'needle\n' });
    expect((await search(source, { query: '   ' })).matches).toEqual([]);
  });

  it('keeps one enormous file from filling the results', async () => {
    const source = tree({
      'big.md': Array.from({ length: 50 }, () => 'needle').join('\n'),
      'small.md': 'needle\n',
    });
    const report = await search(source, { limits: { matchesPerFile: 3 } });
    expect(report.matches.filter((m) => m.path === '/big.md')).toHaveLength(3);
    expect(report.matches.filter((m) => m.path === '/small.md')).toHaveLength(1);
  });

  it('stops at the total match cap and says it was truncated', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 40; i += 1) files[`f${i}.md`] = 'needle\n';
    const report = await search(tree(files), { limits: { matches: 10 } });
    expect(report.matches).toHaveLength(10);
    expect(report.truncated).toBe(true);
  });

  it('stops at the file cap and says it was truncated', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 40; i += 1) files[`f${i}.md`] = 'needle\n';
    const report = await search(tree(files), { limits: { files: 5 } });
    expect(report.filesScanned).toBe(5);
    expect(report.truncated).toBe(true);
  });

  it('is not truncated when it simply finished', async () => {
    const report = await search(tree({ 'a.md': 'needle\n' }));
    expect(report.truncated).toBe(false);
    expect(report.aborted).toBe(false);
  });

  it('gives up when the caller aborts, and admits the results are partial', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 60; i += 1) files[`f${i}.md`] = 'needle\n';
    const signal = { aborted: false };

    const source = tree(files);
    // Abort once some reading has happened, the way a keystroke would.
    vi.spyOn(source, 'readFile').mockImplementation(async () => {
      signal.aborted = true;
      return { text: 'needle\n', url: null, mimeType: 'text/markdown', size: 7 };
    });

    const report = await searchFolder(source, {
      query: 'needle',
      root: '/',
      showHidden: false,
      excludedDirectories: [],
      limits: { concurrency: 2 },
      signal,
    });
    expect(report.aborted).toBe(true);
    expect(report.filesScanned).toBeLessThan(60);
  });

  it('survives a folder it cannot list', async () => {
    const source = tree({ 'ok.md': 'needle\n', 'bad/x.md': 'needle\n' });
    vi.spyOn(source, 'listDirectory').mockImplementation(async function (
      this: MemorySource,
      path: string,
    ) {
      if (path === '/bad') throw new Error('nope');
      return MemorySource.prototype.listDirectory.call(this, path);
    });

    const report = await search(source);
    expect(report.matches.map((m) => m.path)).toEqual(['/ok.md']);
  });

  it('survives a file it cannot read', async () => {
    const source = tree({ 'ok.md': 'needle\n', 'bad.md': 'needle\n' });
    vi.spyOn(source, 'readFile').mockImplementation(async function (
      this: MemorySource,
      path: string,
    ) {
      if (path === '/bad.md') throw new Error('nope');
      return MemorySource.prototype.readFile.call(this, path);
    });

    const report = await search(source);
    expect(report.matches.map((m) => m.path)).toEqual(['/ok.md']);
    expect(report.filesScanned).toBe(1);
  });

  it('reports progress as it goes', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i += 1) files[`f${i}.md`] = 'needle\n';
    const seen: number[] = [];
    await search(tree(files), {
      limits: { concurrency: 2 },
      onProgress: (n) => seen.push(n),
    });
    // Rising, and finishing at the total.
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen.at(-1)).toBe(10);
  });

  it('never has more reads in flight than the limit allows', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 30; i += 1) files[`f${i}.md`] = 'needle\n';
    const source = tree(files);

    let inFlight = 0;
    let peak = 0;
    vi.spyOn(source, 'readFile').mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
      return { text: 'needle\n', url: null, mimeType: 'text/markdown', size: 7 };
    });

    await search(source, { limits: { concurrency: 4 } });
    // In reader mode each of these is a round trip to the service worker.
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('finds the same text whether the file uses LF or CRLF', async () => {
    const lf = tree({ 'a.md': 'one\nA needle here.\n' });
    const crlf = tree({ 'a.md': 'one\r\nA needle here.\r\n' });
    const [a] = (await search(lf)).matches;
    const [b] = (await search(crlf)).matches;
    expect(b?.text).toBe(a?.text);
    expect(b?.line).toBe(a?.line);
  });
});

describe('the default limits', () => {
  it('are all finite and positive, so none of them is a nominal cap', () => {
    for (const [name, value] of Object.entries(DEFAULT_SEARCH_LIMITS)) {
      expect(Number.isFinite(value), name).toBe(true);
      expect(value, name).toBeGreaterThan(0);
    }
  });
});

describe('groupByFile', () => {
  it('collects a file’s matches together, keeping walk order', () => {
    const at = (path: string, line: number) => ({
      path,
      line,
      text: 'x',
      start: 0,
      end: 1,
    });
    expect(groupByFile([at('/b.md', 1), at('/a.md', 2), at('/b.md', 9)])).toEqual([
      { path: '/b.md', matches: [at('/b.md', 1), at('/b.md', 9)] },
      { path: '/a.md', matches: [at('/a.md', 2)] },
    ]);
  });

  it('gives nothing back for nothing', () => {
    expect(groupByFile([])).toEqual([]);
  });
});
