// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { classifyUrl, dirnameOf, extractPlainTextSource } from '@core/reader/classify';

describe('classifyUrl — file:// Markdown (FR-9)', () => {
  it('recognizes every Markdown extension', () => {
    for (const ext of ['.md', '.markdown', '.mdown', '.mkd', '.mkdn', '.mdx']) {
      expect(classifyUrl(`file:///docs/readme${ext}`).kind).toBe('markdown');
    }
  });

  it('is case insensitive about the extension', () => {
    expect(classifyUrl('file:///docs/README.MD').kind).toBe('markdown');
  });

  it('reports the containing directory so the sidebar can root itself', () => {
    const info = classifyUrl('file:///home/me/docs/guide.md');
    expect(info.path).toBe('/home/me/docs/guide.md');
    expect(info.directory).toBe('/home/me/docs/');
  });

  it('decodes percent-encoded paths', () => {
    const info = classifyUrl('file:///docs/my%20notes/%E8%A8%AD%E5%AE%9A.md');
    expect(info.path).toBe('/docs/my notes/設定.md');
    expect(info.directory).toBe('/docs/my notes/');
  });

  it('survives a malformed escape sequence', () => {
    expect(() => classifyUrl('file:///docs/%E0%A4%A.md')).not.toThrow();
    expect(classifyUrl('file:///docs/%E0%A4%A.md').kind).toBe('markdown');
  });
});

describe('classifyUrl — file:// directories (FR-16)', () => {
  it('treats a trailing slash as a directory listing', () => {
    const info = classifyUrl('file:///home/me/docs/');
    expect(info.kind).toBe('directory');
    expect(info.directory).toBe('/home/me/docs/');
  });

  it('treats the filesystem root as a directory', () => {
    expect(classifyUrl('file:///').kind).toBe('directory');
  });

  it('handles a Windows drive listing', () => {
    const info = classifyUrl('file:///C:/Users/me/docs/');
    expect(info.kind).toBe('directory');
    expect(info.directory).toBe('/C:/Users/me/docs/');
  });
});

describe('classifyUrl — pages the extension must not touch', () => {
  it('ignores non-Markdown local files', () => {
    for (const path of ['/a.txt', '/a.html', '/a.png', '/a.pdf', '/a', '/a.md.txt']) {
      expect(classifyUrl(`file://${path}`).kind).toBe('unhandled');
    }
  });

  it('ignores unsupported protocols', () => {
    for (const url of [
      'chrome://extensions',
      'chrome-extension://abc/page.html',
      'data:text/plain,hi',
      'about:blank',
    ]) {
      expect(classifyUrl(url).kind).toBe('unhandled');
    }
  });

  it('ignores a URL it cannot parse', () => {
    expect(classifyUrl('not a url').kind).toBe('unhandled');
  });

  it('does not treat an http directory as a listing', () => {
    // Only file:// produces Chrome's own generated listing.
    expect(classifyUrl('https://example.test/docs/').kind).toBe('unhandled');
  });
});

describe('classifyUrl — http(s)', () => {
  it('recognizes a Markdown extension', () => {
    expect(classifyUrl('https://example.test/README.md').kind).toBe('markdown');
  });

  it('recognizes a Markdown content type without a telling extension', () => {
    expect(
      classifyUrl('https://example.test/raw/doc', { contentType: 'text/markdown' }).kind,
    ).toBe('markdown');
    expect(
      classifyUrl('https://example.test/raw/doc', {
        contentType: 'text/x-markdown; charset=utf-8',
      }).kind,
    ).toBe('markdown');
  });

  it('ignores an HTML content type', () => {
    expect(
      classifyUrl('https://example.test/page', { contentType: 'text/html' }).kind,
    ).toBe('unhandled');
  });

  it('ignores query strings and fragments when matching the extension', () => {
    expect(classifyUrl('https://example.test/a.md?raw=1#top').kind).toBe('markdown');
  });
});

describe('dirnameOf', () => {
  it.each([
    ['/a/b/c.md', '/a/b/'],
    ['/a.md', '/'],
    ['/a/b/', '/a/b/'],
    ['noslash', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(dirnameOf(input)).toBe(expected);
  });
});

describe('extractPlainTextSource', () => {
  it('reads the pre Chrome wraps plain text in', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><pre># Hello\n\nWorld</pre></body></html>',
      'text/html',
    );
    expect(extractPlainTextSource(doc)).toBe('# Hello\n\nWorld');
  });

  it('returns an empty string for an empty file rather than null', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><pre></pre></body></html>',
      'text/html',
    );
    expect(extractPlainTextSource(doc)).toBe('');
  });

  it('refuses a real HTML page', () => {
    // Falling back to body.textContent here would strip a site's markup and
    // re-render it as Markdown, which is far worse than doing nothing.
    const doc = new DOMParser().parseFromString(
      '<html><body><h1>Site</h1><p>Content</p></body></html>',
      'text/html',
    );
    expect(extractPlainTextSource(doc)).toBeNull();
  });

  it('preserves exact source including trailing whitespace', () => {
    const src = '# A\n\n  indented\n\n';
    const doc = new DOMParser().parseFromString(
      `<html><body><pre>${src}</pre></body></html>`,
      'text/html',
    );
    // Byte-exact round trip is what makes the raw toggle trustworthy (FR-8).
    expect(extractPlainTextSource(doc)).toBe(src);
  });
});
