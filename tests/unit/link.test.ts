import { describe, expect, it } from 'vitest';
import { classifyLink, pickDirectoryIndex, resolveImagePath } from '@core/link';

const from = { fromPath: '/docs/api/guide.md' };

describe('classifyLink — in-document fragments (FR-3)', () => {
  it('recognizes a bare fragment', () => {
    expect(classifyLink('#setup', from)).toEqual({ kind: 'fragment', fragment: 'setup' });
  });

  it('recognizes a non-ASCII fragment', () => {
    expect(classifyLink('#設定', from)).toEqual({ kind: 'fragment', fragment: '設定' });
  });

  it('ignores an empty href', () => {
    expect(classifyLink('', from).kind).toBe('ignore');
    expect(classifyLink('   ', from).kind).toBe('ignore');
  });
});

describe('classifyLink — sibling documents (FR-10)', () => {
  it('resolves a bare sibling', () => {
    expect(classifyLink('other.md', from)).toEqual({
      kind: 'document',
      path: '/docs/api/other.md',
      fragment: null,
    });
  });

  it('resolves an explicit ./ prefix', () => {
    expect(classifyLink('./other.md', from)).toMatchObject({
      path: '/docs/api/other.md',
    });
  });

  it('resolves a parent traversal', () => {
    expect(classifyLink('../overview.md', from)).toMatchObject({
      path: '/docs/overview.md',
    });
  });

  it('resolves repeated parent traversal', () => {
    expect(classifyLink('../../README.md', from)).toMatchObject({ path: '/README.md' });
  });

  it('resolves an absolute path', () => {
    expect(classifyLink('/top.md', from)).toMatchObject({ path: '/top.md' });
  });

  it('keeps a fragment alongside the document', () => {
    expect(classifyLink('../overview.md#goals', from)).toEqual({
      kind: 'document',
      path: '/docs/overview.md',
      fragment: 'goals',
    });
  });

  it('strips a query string from the path', () => {
    expect(classifyLink('other.md?v=2', from)).toMatchObject({
      path: '/docs/api/other.md',
    });
  });

  it('decodes percent-encoded paths', () => {
    expect(classifyLink('my%20notes/a.md', from)).toMatchObject({
      path: '/docs/api/my notes/a.md',
    });
    expect(classifyLink('%E8%A8%AD%E5%AE%9A.md', from)).toMatchObject({
      path: '/docs/api/設定.md',
    });
  });

  it('recognizes every Markdown extension', () => {
    for (const ext of ['.md', '.markdown', '.mdown', '.mkd', '.mkdn', '.mdx']) {
      expect(classifyLink(`sibling${ext}`, from).kind).toBe('document');
    }
  });

  it('clamps traversal above the root rather than escaping', () => {
    const intent = classifyLink('../../../../../../etc/passwd.md', from);
    expect(intent).toMatchObject({ kind: 'document', path: '/etc/passwd.md' });
  });
});

describe('classifyLink — directories (FR-14)', () => {
  it('treats a trailing slash as a directory', () => {
    expect(classifyLink('../guides/', from)).toEqual({
      kind: 'directory',
      path: '/docs/guides',
    });
  });

  it('treats an extensionless path as a directory', () => {
    expect(classifyLink('../guides', from)).toEqual({
      kind: 'directory',
      path: '/docs/guides',
    });
  });
});

describe('classifyLink — non-Markdown local files (FR-13)', () => {
  it.each(['diagram.png', 'data.json', 'archive.zip', 'script.js', 'sheet.csv'])(
    'hands %s to the browser rather than rendering it',
    (name) => {
      expect(classifyLink(name, from).kind).toBe('file');
    },
  );

  it('does not treat a .md.txt file as Markdown', () => {
    expect(classifyLink('notes.md.txt', from).kind).toBe('file');
  });
});

describe('classifyLink — external links (FR-12)', () => {
  it.each([
    'https://example.test/page',
    'http://example.test/page',
    'mailto:a@b.test',
    'tel:+123',
  ])('treats %s as external', (href) => {
    expect(classifyLink(href, from)).toEqual({ kind: 'external', href });
  });

  it('treats a protocol-relative URL as external', () => {
    expect(classifyLink('//cdn.test/x.md', from)).toMatchObject({ kind: 'external' });
  });

  it('keeps an absolute file: URL local', () => {
    expect(classifyLink('file:///other/doc.md', from)).toMatchObject({
      kind: 'document',
      path: '/other/doc.md',
    });
  });
});

describe('resolveImagePath (FR-11)', () => {
  it('resolves a sibling image', () => {
    expect(resolveImagePath('pic.png', from)).toBe('/docs/api/pic.png');
  });

  it('resolves an image in a sibling folder', () => {
    expect(resolveImagePath('../img/pic.png', from)).toBe('/docs/img/pic.png');
  });

  it('resolves an absolute path', () => {
    expect(resolveImagePath('/assets/pic.png', from)).toBe('/assets/pic.png');
  });

  it('decodes percent-encoded names', () => {
    expect(resolveImagePath('my%20pic.png', from)).toBe('/docs/api/my pic.png');
  });

  it('returns null for references the browser can already load', () => {
    expect(resolveImagePath('https://cdn.test/a.png', from)).toBeNull();
    expect(resolveImagePath('data:image/png;base64,AAAA', from)).toBeNull();
    expect(resolveImagePath('blob:abc', from)).toBeNull();
    expect(resolveImagePath('//cdn.test/a.png', from)).toBeNull();
    expect(resolveImagePath('', from)).toBeNull();
  });

  it('strips a query string', () => {
    expect(resolveImagePath('pic.png?v=2', from)).toBe('/docs/api/pic.png');
  });
});

describe('pickDirectoryIndex (FR-14)', () => {
  it('prefers README.md', () => {
    expect(pickDirectoryIndex(['index.md', 'README.md', 'other.md'])).toBe('README.md');
  });

  it('falls back to index.md', () => {
    expect(pickDirectoryIndex(['index.md', 'other.md'])).toBe('index.md');
  });

  it('matches case-insensitively as a last resort', () => {
    expect(pickDirectoryIndex(['Readme.MD'])).toBe('Readme.MD');
  });

  it('returns null when there is no index', () => {
    // The caller shows the tree rather than inventing a document.
    expect(pickDirectoryIndex(['a.md', 'b.md'])).toBeNull();
    expect(pickDirectoryIndex([])).toBeNull();
  });
});
