// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSanitizer } from '@core/sanitize';
import {
  applyHeadingAnchors,
  isMarkdownPath,
  MARKDOWN_EXTENSIONS,
  renderMarkdown,
  scrollToFragment,
} from '@core/markdown';

const sanitizer = createSanitizer(window);
const render = (src: string, opts = {}) => renderMarkdown(src, sanitizer, opts);

describe('markdown — CommonMark basics', () => {
  it('renders headings, emphasis and lists', () => {
    const { html } = render('# One\n\nSome **bold** and *italic*.\n\n- a\n- b\n');
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<li>a</li>');
  });

  it('renders blockquotes and thematic breaks', () => {
    const { html } = render('> quoted\n\n---\n');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<hr>');
  });

  it('renders inline code and links', () => {
    const { html } = render('Use `npm` and see [docs](https://ok.test/).');
    expect(html).toContain('<code>npm</code>');
    expect(html).toContain('href="https://ok.test/"');
  });

  it('escapes HTML entities in text', () => {
    const { html } = render('5 < 6 & 7 > 6');
    expect(html).toContain('&lt;');
    expect(html).toContain('&amp;');
  });
});

describe('markdown — GFM extensions (FR-1)', () => {
  it('renders tables', () => {
    const { html } = render('| A | B |\n| - | - |\n| 1 | 2 |\n');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>2</td>');
  });

  it('renders strikethrough', () => {
    expect(render('~~gone~~').html).toContain('<s>gone</s>');
  });

  it('renders task lists', () => {
    const { html } = render('- [ ] todo\n- [x] done\n');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
  });

  it('autolinks bare URLs when linkify is on', () => {
    expect(render('See https://ok.test/x', { linkify: true }).html).toContain(
      'href="https://ok.test/x"',
    );
  });

  it('leaves bare URLs alone when linkify is off', () => {
    expect(render('See https://ok.test/x', { linkify: false }).html).not.toContain('<a');
  });

  it('renders footnotes', () => {
    const { html } = render('Text[^1]\n\n[^1]: The note.\n');
    expect(html).toContain('footnote');
    expect(html).toContain('The note.');
  });

  it('renders definition lists', () => {
    const { html } = render('Term\n:   Definition\n');
    expect(html).toContain('<dl>');
    expect(html).toContain('<dt>Term</dt>');
  });

  it('honours the breaks option', () => {
    expect(render('a\nb', { breaks: true }).html).toContain('<br>');
    expect(render('a\nb', { breaks: false }).html).not.toContain('<br>');
  });
});

describe('markdown — headings and anchors (FR-3)', () => {
  it('collects headings with slugs', () => {
    const { headings } = render('# Getting Started\n\n## API Reference\n');
    expect(headings).toEqual([
      { id: 'getting-started', level: 1, text: 'Getting Started', line: 1 },
      { id: 'api-reference', level: 2, text: 'API Reference', line: 3 },
    ]);
  });

  it('records the body line each heading sits on', () => {
    // A folder search uses this to land near its hit: it knows the line of
    // a match in a document that is not open yet, and the nearest heading
    // at or above it is an anchor the rendered page already has.
    const { headings } = render('intro\n\n# One\n\ntext\n\ntext\n\n## Two\n');
    expect(headings.map((h) => [h.text, h.line])).toEqual([
      ['One', 3],
      ['Two', 9],
    ]);
  });

  it('counts lines in the body, so front matter does not shift them', () => {
    const { headings } = render('---\ntitle: T\nauthor: A\n---\n# One\n');
    expect(headings[0]?.line).toBe(1);
  });

  it('produces stable slugs across renders', () => {
    const src = '# Alpha\n\n## Beta\n';
    expect(render(src).headings).toEqual(render(src).headings);
  });

  it('disambiguates repeated headings', () => {
    const { headings } = render('# Intro\n\n# Intro\n\n# Intro\n');
    expect(headings.map((h) => h.id)).toEqual(['intro', 'intro-1', 'intro-2']);
  });

  it('produces usable slugs for non-ASCII headings', () => {
    const { headings } = render('# 日本語の見出し\n\n# Überschrift\n');
    expect(headings[0]!.id).toBe('日本語の見出し');
    expect(headings[1]!.id).toBe('überschrift');
  });

  it('falls back to section-N when a heading has no sluggable text', () => {
    const { headings } = render('# ***\n');
    expect(headings[0]!.id).toMatch(/^section/);
  });

  it('strips inline markup from heading text', () => {
    const { headings } = render('# A `code` and **bold** heading\n');
    expect(headings[0]!.text).toBe('A code and bold heading');
  });

  it('restores an id the sanitizer dropped for clobbering', () => {
    // "Title" slugs to `title`, which collides with document.title and is
    // therefore removed during sanitization. The anchor must survive anyway.
    const { html } = render('# Title\n');
    expect(html).not.toContain('id="title"');

    const host = document.createElement('div');
    host.innerHTML = html;
    applyHeadingAnchors(host);
    expect(host.querySelector('h1')!.id).toBe('title');
  });

  it('resolves a fragment to its heading, including non-ASCII', () => {
    const { html } = render('# Setup\n\n# 設定\n');
    const host = document.createElement('div');
    host.innerHTML = html;
    applyHeadingAnchors(host);

    expect(scrollToFragment(host, '#setup')).toBe(true);
    expect(scrollToFragment(host, `#${encodeURIComponent('設定')}`)).toBe(true);
    expect(scrollToFragment(host, '#nope')).toBe(false);
  });
});

describe('markdown — front matter (FR-4)', () => {
  it('extracts front matter and keeps it out of the body', () => {
    const { html, frontMatter } = render(
      '---\ntitle: Doc\ntags: [a, b]\n---\n\n# Body\n',
    );
    expect(frontMatter.data).toEqual({ title: 'Doc', tags: ['a', 'b'] });
    expect(frontMatter.error).toBeNull();
    expect(html).not.toContain('title: Doc');
    expect(html).toContain('<h1');
  });

  it('leaves a document without front matter untouched', () => {
    const { html, frontMatter } = render('# Body\n');
    expect(frontMatter.data).toBeNull();
    expect(html).toContain('<h1');
  });

  it('degrades malformed front matter to an error rather than throwing', () => {
    const { frontMatter, html } = render('---\n: : bad: [\n---\n\n# Body\n');
    expect(frontMatter.error).toBeTruthy();
    expect(frontMatter.raw).toContain('bad');
    expect(html).toContain('<h1');
  });

  it('rejects front matter that is not a mapping', () => {
    const { frontMatter } = render('---\n- just\n- a list\n---\n\n# Body\n');
    expect(frontMatter.data).toBeNull();
    expect(frontMatter.error).toMatch(/mapping/);
  });

  it('does not treat a leading horizontal rule as front matter', () => {
    const { html, frontMatter } = render('---\n\nJust a rule above.\n');
    expect(frontMatter.data).toBeNull();
    expect(html).toContain('<hr>');
  });

  it('handles a document that is only front matter', () => {
    const { frontMatter, html } = render('---\ntitle: Only\n---\n');
    expect(frontMatter.data).toEqual({ title: 'Only' });
    expect(html.trim()).toBe('');
  });

  it('sees front matter behind a BOM', () => {
    const { frontMatter } = render('﻿---\ntitle: Doc\n---\n\nBody\n');
    expect(frontMatter.data).toEqual({ title: 'Doc' });
  });
});

describe('markdown — two-phase contract (FR-5, FR-6, FR-7)', () => {
  it('emits code placeholders without highlighting', () => {
    const { html, enrichments } = render('```ts\nconst x: number = 1;\n```\n');
    expect(enrichments).toHaveLength(1);
    expect(enrichments[0]).toMatchObject({
      kind: 'code',
      language: 'ts',
      source: 'const x: number = 1;\n',
    });
    expect(html).toContain('data-mw-enrich="code"');
    // The source is readable prose even if phase two never runs.
    expect(html).toContain('const x: number = 1;');
  });

  it('records a null language for a bare fence', () => {
    const { enrichments } = render('```\nplain\n```\n');
    expect(enrichments[0]).toMatchObject({ kind: 'code', language: null });
  });

  it('emits diagram placeholders for mermaid fences', () => {
    const { html, enrichments } = render('```mermaid\ngraph TD;\nA-->B;\n```\n');
    expect(enrichments[0]).toMatchObject({ kind: 'diagram' });
    expect(html).toContain('data-mw-enrich="diagram"');
    // Falling back to the source is what makes a failed diagram survivable.
    expect(html).toContain('graph TD;');
  });

  it('treats mermaid as ordinary code when diagrams are off', () => {
    const { enrichments } = render('```mermaid\ngraph TD;\n```\n', { diagrams: false });
    expect(enrichments[0]).toMatchObject({ kind: 'code', language: 'mermaid' });
  });

  it('emits inline and block math placeholders', () => {
    const { enrichments } = render('Inline $a^2$ and block:\n\n$$\nE = mc^2\n$$\n');
    expect(enrichments).toHaveLength(2);
    expect(enrichments[0]).toMatchObject({ kind: 'math', source: 'a^2', display: false });
    expect(enrichments[1]).toMatchObject({
      kind: 'math',
      source: 'E = mc^2',
      display: true,
    });
  });

  it('gives every placeholder a unique id in document order', () => {
    const { enrichments } = render(
      '```js\na\n```\n\n$x$\n\n```mermaid\ngraph TD;\n```\n',
    );
    const ids = enrichments.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(enrichments.map((e) => e.kind)).toEqual(['code', 'math', 'diagram']);
  });

  it('imports no renderer libraries during phase one', () => {
    // Phase one must stay cheap. If KaTeX, Shiki or Mermaid were pulled in
    // here, every document would pay for them (NFR-2).
    const loaded = Object.keys(
      (globalThis as unknown as { __vite_ssr_modules__?: Record<string, unknown> })
        .__vite_ssr_modules__ ?? {},
    );
    render('$x$\n\n```mermaid\ngraph TD;\n```\n\n```ts\nlet a = 1;\n```\n');
    expect(loaded.filter((k) => /katex|shiki|mermaid/i.test(k))).toHaveLength(0);
  });
});

describe('markdown — math edge cases', () => {
  it('does not treat currency as math', () => {
    const { enrichments } = render('It costs $5 and $10 total.');
    expect(enrichments).toHaveLength(0);
  });

  it('ignores an escaped dollar sign', () => {
    const { enrichments } = render('Literal \\$x\\$ here.');
    expect(enrichments).toHaveLength(0);
  });

  it('leaves an unterminated block as literal text', () => {
    const { enrichments, html } = render('$$\nE = mc^2\n\nMore text.\n');
    expect(enrichments).toHaveLength(0);
    expect(html).toContain('More text.');
  });

  it('supports single-line block math', () => {
    const { enrichments } = render('$$ E = mc^2 $$\n');
    expect(enrichments[0]).toMatchObject({
      kind: 'math',
      display: true,
      source: 'E = mc^2',
    });
  });

  it('treats dollars as literal when math is disabled', () => {
    const { enrichments } = render('Inline $a^2$ here.', { math: false });
    expect(enrichments).toHaveLength(0);
  });
});

describe('markdown — sanitization is not bypassable', () => {
  it('strips script tags embedded in the source', () => {
    const { html } = render('# Doc\n\n<script>alert(1)</script>\n\nText\n');
    expect(html).not.toContain('<script');
    expect(html).toContain('Text');
  });

  it('strips event handlers from raw HTML', () => {
    const { html } = render('<div onclick="alert(1)">x</div>\n');
    expect(html).not.toMatch(/onclick/i);
  });

  it('never produces an anchor with a javascript: target', () => {
    // markdown-it refuses the target outright and leaves the literal text, so
    // the string survives as prose. What must not exist is a usable link.
    const host = document.createElement('div');
    for (const src of [
      '[click](javascript:alert(1))\n',
      '[click](JaVaScRiPt:alert(1))\n',
      '<a href="javascript:alert(1)">click</a>\n',
    ]) {
      host.innerHTML = render(src).html;
      for (const a of Array.from(host.querySelectorAll('a'))) {
        expect(a.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
      }
    }
  });
});

describe('markdown — path recognition (FR-9)', () => {
  it('recognizes every supported extension', () => {
    for (const ext of MARKDOWN_EXTENSIONS) {
      expect(isMarkdownPath(`/docs/readme${ext}`)).toBe(true);
      expect(isMarkdownPath(`/docs/readme${ext.toUpperCase()}`)).toBe(true);
    }
  });

  it('rejects other extensions', () => {
    for (const path of ['/a.txt', '/a.html', '/a.png', '/a', '/a.md.txt']) {
      expect(isMarkdownPath(path)).toBe(false);
    }
  });

  it('ignores query strings and fragments', () => {
    expect(isMarkdownPath('/a.md?v=1')).toBe(true);
    expect(isMarkdownPath('/a.md#section')).toBe(true);
  });
});

describe('markdown — document edge cases', () => {
  it('renders an empty document as empty, not an error', () => {
    const { html, enrichments, headings } = render('');
    expect(html.trim()).toBe('');
    expect(enrichments).toHaveLength(0);
    expect(headings).toHaveLength(0);
  });

  it('renders CRLF identically to LF', () => {
    expect(render('# A\r\n\r\nB\r\n').html).toBe(render('# A\n\nB\n').html);
  });

  it('survives deeply nested lists', () => {
    let src = '';
    for (let i = 0; i < 60; i += 1) src += `${'  '.repeat(i)}- level ${i}\n`;
    expect(() => render(src)).not.toThrow();
  });

  it('survives deeply nested blockquotes', () => {
    const src = `${'> '.repeat(150)}deep\n`;
    expect(() => render(src)).not.toThrow();
  });
});
