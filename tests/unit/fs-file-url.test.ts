import { describe, expect, it, vi } from 'vitest';
import {
  FileUrlSource,
  pathToFileUrl,
  type FileUrlTransport,
} from '@core/fs/file-url-source';
import { parseDirectoryListing } from '@core/fs/listing-parser';
import { fail, ok, type DirectoryEntryPayload } from '@core/messaging';
import { CONFORMANCE_TREE, runFileSourceConformance } from './fs-conformance';

const ROOT = '/tmp/tree';

/**
 * A transport backed by the conformance tree, exercising the real listing
 * parser: the HTML it hands back is generated in Chrome's actual addRow
 * format, so the source is tested through the same parsing path it uses in
 * production.
 */
function createTransport(): FileUrlTransport {
  const files = new Map<string, string>();
  for (const [relative, content] of Object.entries(CONFORMANCE_TREE)) {
    files.set(`${ROOT}/${relative}`, content);
  }

  const pathOf = (url: string) => decodeURIComponent(url.replace(/^file:\/\//, ''));

  const childrenOf = (dir: string) => {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    const seen = new Map<string, { isDir: boolean; size: number }>();
    for (const [path, content] of files) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) seen.set(rest, { isDir: false, size: content.length });
      else if (!seen.has(rest.slice(0, slash))) {
        seen.set(rest.slice(0, slash), { isDir: true, size: 0 });
      }
    }
    return seen;
  };

  const renderListing = (dir: string) => {
    const rows = [...childrenOf(dir)]
      .map(
        ([name, info]) =>
          `<script>addRow(${JSON.stringify(name)},${JSON.stringify(
            encodeURIComponent(name),
          )},${info.isDir ? 1 : 0},${info.size},"${info.size} B",1789495712,"x");</script>`,
      )
      .join('\n');
    return `<html><head><script>function addRow(name, url, isdir,
      size, size_string, date_modified, date_modified_string) {}</script></head>
      <body><table id="tbody"></table>${rows}</body></html>`;
  };

  return {
    async readFile(url, binary) {
      const path = pathOf(url);
      const content = files.get(path);
      if (content === undefined) return fail('not-found', `Not found: ${path}`);
      if (binary) {
        return ok({
          text: null,
          dataUrl: `data:application/octet-stream;base64,${btoa(content)}`,
          mimeType: 'application/octet-stream',
          size: content.length,
        });
      }
      return ok({
        text: content,
        dataUrl: null,
        mimeType: 'text/plain',
        size: content.length,
      });
    },

    async listDirectory(url) {
      const dir = pathOf(url).replace(/\/$/, '');
      if (childrenOf(dir).size === 0) return fail('not-found', `Not a directory: ${dir}`);
      const entries = parseDirectoryListing(renderListing(dir), dir);
      if (!entries)
        return fail<DirectoryEntryPayload[]>('unparseable-listing', 'bad listing');
      return ok(entries);
    },
  };
}

runFileSourceConformance('FileUrlSource', {
  create: () => new FileUrlSource(createTransport(), ROOT),
  root: ROOT,
  expected: { kind: 'file-url', canPersist: true, canRefresh: true },
});

describe('FileUrlSource — file:// specifics', () => {
  it('percent-encodes paths but keeps separators', () => {
    expect(pathToFileUrl('/a/b.md')).toBe('file:///a/b.md');
    expect(pathToFileUrl('/my notes/設定.md')).toBe(
      'file:///my%20notes/%E8%A8%AD%E5%AE%9A.md',
    );
    expect(pathToFileUrl('/a/b c/d#e.md')).toBe('file:///a/b%20c/d%23e.md');
  });

  it('asks for a directory with a trailing slash', async () => {
    const transport = createTransport();
    const spy = vi.spyOn(transport, 'listDirectory');
    const src = new FileUrlSource(transport, ROOT);

    await src.listDirectory(`${ROOT}/docs`);
    // Without the slash Chrome tries to read the directory as a file.
    expect(spy.mock.calls[0]![0]).toMatch(/\/docs\/$/);
  });

  it('caches a listing and re-reads after invalidate', async () => {
    const transport = createTransport();
    const spy = vi.spyOn(transport, 'listDirectory');
    const src = new FileUrlSource(transport, ROOT);

    await src.listDirectory(ROOT);
    await src.listDirectory(ROOT);
    expect(spy).toHaveBeenCalledTimes(1);

    src.invalidate(ROOT);
    await src.listDirectory(ROOT);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('surfaces file-access-denied distinctly from not-found', async () => {
    // The UI shows a completely different panel for each, so conflating them
    // would send users chasing a missing file that is really a permission.
    const denied: FileUrlTransport = {
      async readFile() {
        return fail('file-access-denied', 'blocked');
      },
      async listDirectory() {
        return fail('file-access-denied', 'blocked');
      },
    };
    const src = new FileUrlSource(denied, ROOT);
    await expect(src.readFile(`${ROOT}/readme.md`)).rejects.toMatchObject({
      code: 'file-access-denied',
    });
  });

  it('surfaces an unparseable listing rather than an empty folder', async () => {
    const broken: FileUrlTransport = {
      async readFile() {
        return fail('not-found', 'x');
      },
      async listDirectory() {
        return fail('unparseable-listing', 'bad');
      },
    };
    const src = new FileUrlSource(broken, ROOT);
    await expect(src.listDirectory(ROOT)).rejects.toMatchObject({
      code: 'unparseable-listing',
    });
  });

  it('derives a display name from the root', () => {
    expect(new FileUrlSource(createTransport(), '/home/me/docs').displayName).toBe(
      'docs',
    );
    expect(new FileUrlSource(createTransport(), '/home/me/docs/').displayName).toBe(
      'docs',
    );
  });
});
