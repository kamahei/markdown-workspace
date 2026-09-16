// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { enrichDocument, markPending, type EnrichmentLoaders } from '@core/enrich';
import { renderMarkdown } from '@core/markdown';
import { createSanitizer } from '@core/sanitize';

const sanitizer = createSanitizer(window);

const ALL_FEATURES = { highlight: true, math: true, diagrams: true };

function mount(markdown: string) {
  const result = renderMarkdown(markdown, sanitizer);
  const root = document.createElement('div');
  root.innerHTML = result.html;
  return { root, result };
}

const fakeLoaders = (overrides: Partial<EnrichmentLoaders> = {}): EnrichmentLoaders => ({
  highlight: async () => ({
    async highlight({ language, code }) {
      if (!language) return null;
      return `<pre class="shiki"><code>HL:${code.trim()}</code></pre>`;
    },
  }),
  math: async () => ({
    render({ source }) {
      return { html: `<span class="katex">MATH:${source}</span>`, error: null };
    },
  }),
  diagram: async () => ({
    async render({ source }) {
      return {
        svg: `<svg viewBox="0 0 10 10"><title>${source.trim()}</title></svg>`,
        error: null,
      };
    },
  }),
  ...overrides,
});

describe('enrichDocument — highlighting (FR-5)', () => {
  it('replaces a code placeholder with highlighted output', async () => {
    const { root, result } = mount('```ts\nconst x = 1;\n```\n');
    const report = await enrichDocument(root, result.enrichments, fakeLoaders(), {
      theme: 'light',
      sanitizer,
      features: ALL_FEATURES,
    });

    expect(report.highlighted).toBe(1);
    expect(root.querySelector('pre.shiki')?.textContent).toContain('HL:const x = 1;');
  });

  it('leaves an unknown language as plain monospace with no error', async () => {
    const { root, result } = mount('```\nplain text\n```\n');
    const report = await enrichDocument(root, result.enrichments, fakeLoaders(), {
      theme: 'light',
      sanitizer,
      features: ALL_FEATURES,
    });

    expect(report.highlighted).toBe(0);
    expect(report.failures).toBe(0);
    expect(root.textContent).toContain('plain text');
    expect(root.querySelector('.mw-enrich-error')).toBeNull();
  });

  it('keeps the code readable when the highlighter fails to load', async () => {
    const { root, result } = mount('```ts\nconst x = 1;\n```\n');
    const report = await enrichDocument(
      root,
      result.enrichments,
      fakeLoaders({ highlight: async () => Promise.reject(new Error('network')) }),
      { theme: 'light', sanitizer, features: ALL_FEATURES },
    );

    expect(report.failures).toBe(1);
    // NFR-6: the enhancement failed, the document did not.
    expect(root.textContent).toContain('const x = 1;');
  });

  it('passes the active theme through', async () => {
    const highlight = vi
      .fn()
      .mockResolvedValue('<pre class="shiki"><code>x</code></pre>');
    const { root, result } = mount('```ts\nx\n```\n');
    await enrichDocument(
      root,
      result.enrichments,
      fakeLoaders({ highlight: async () => ({ highlight }) }),
      { theme: 'dark', sanitizer, features: ALL_FEATURES },
    );
    expect(highlight).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
  });
});

describe('enrichDocument — math (FR-6)', () => {
  it('renders inline and block math', async () => {
    const { root, result } = mount('Inline $a^2$ and\n\n$$\nE = mc^2\n$$\n');
    const report = await enrichDocument(root, result.enrichments, fakeLoaders(), {
      theme: 'light',
      sanitizer,
      features: ALL_FEATURES,
    });

    expect(report.math).toBe(2);
    expect(root.querySelectorAll('.katex')).toHaveLength(2);
  });

  it('keeps the original source when an expression is invalid', async () => {
    const { root, result } = mount('Broken $\\frac{1}{$ here.\n');
    const report = await enrichDocument(
      root,
      result.enrichments,
      fakeLoaders({
        math: async () => ({
          render: () => ({ html: '', error: 'Expected group after \\frac' }),
        }),
      }),
      { theme: 'light', sanitizer, features: ALL_FEATURES },
    );

    expect(report.failures).toBe(1);
    const el = root.querySelector('.mw-math')!;
    expect(el.getAttribute('data-mw-state')).toBe('error');
    // Discarding the author's content because it has a typo would be worse.
    expect(el.textContent).toContain('frac');
  });
});

describe('enrichDocument — diagrams (FR-7)', () => {
  it('renders a diagram and hides the source', async () => {
    const { root, result } = mount('```mermaid\ngraph TD;\nA-->B;\n```\n');
    const report = await enrichDocument(root, result.enrichments, fakeLoaders(), {
      theme: 'light',
      sanitizer,
      features: ALL_FEATURES,
    });

    expect(report.diagrams).toBe(1);
    const el = root.querySelector('.mw-diagram')!;
    expect(el.getAttribute('data-mw-state')).toBe('done');
    expect(el.querySelector('svg')).not.toBeNull();
    // The source stays in the DOM; CSS hides it once the diagram is drawn.
    expect(el.querySelector('.mw-diagram-source')).not.toBeNull();
  });

  it('falls back to the source with the error when parsing fails', async () => {
    const { root, result } = mount('```mermaid\nnot a diagram\n```\n');
    const report = await enrichDocument(
      root,
      result.enrichments,
      fakeLoaders({
        diagram: async () => ({
          render: async () => ({ svg: null, error: 'Parse error on line 1' }),
        }),
      }),
      { theme: 'light', sanitizer, features: ALL_FEATURES },
    );

    expect(report.failures).toBe(1);
    const el = root.querySelector('.mw-diagram')!;
    expect(el.getAttribute('data-mw-state')).toBe('error');
    expect(el.textContent).toContain('Parse error on line 1');
    expect(el.textContent).toContain('not a diagram');
  });

  it('does not let one broken diagram affect another', async () => {
    const { root, result } = mount('```mermaid\nbad\n```\n\n```mermaid\ngood\n```\n');
    let call = 0;
    await enrichDocument(
      root,
      result.enrichments,
      fakeLoaders({
        diagram: async () => ({
          render: async () => {
            call += 1;
            return call === 1
              ? { svg: null, error: 'boom' }
              : { svg: '<svg viewBox="0 0 1 1"></svg>', error: null };
          },
        }),
      }),
      { theme: 'light', sanitizer, features: ALL_FEATURES },
    );

    const states = Array.from(root.querySelectorAll('.mw-diagram')).map((el) =>
      el.getAttribute('data-mw-state'),
    );
    expect(states).toEqual(['error', 'done']);
  });
});

describe('enrichDocument — cost control (NFR-2)', () => {
  it('loads no library for a document with none of its construct', async () => {
    const highlight = vi.fn();
    const math = vi.fn();
    const diagram = vi.fn();

    const { root, result } = mount('# Just prose\n\nNothing special here.\n');
    await enrichDocument(
      root,
      result.enrichments,
      { highlight, math, diagram },
      { theme: 'light', sanitizer, features: ALL_FEATURES },
    );

    // This is the whole point of the two-phase contract: a plain document
    // must not pay for Shiki, KaTeX or Mermaid.
    expect(highlight).not.toHaveBeenCalled();
    expect(math).not.toHaveBeenCalled();
    expect(diagram).not.toHaveBeenCalled();
  });

  it('loads only the libraries the document needs', async () => {
    const math = vi.fn();
    const diagram = vi.fn();

    const { root, result } = mount('```ts\nconst a = 1;\n```\n');
    await enrichDocument(
      root,
      result.enrichments,
      { ...fakeLoaders(), math, diagram },
      { theme: 'light', sanitizer, features: ALL_FEATURES },
    );

    expect(math).not.toHaveBeenCalled();
    expect(diagram).not.toHaveBeenCalled();
  });

  it('skips a disabled feature entirely', async () => {
    const highlight = vi.fn();
    const { root, result } = mount('```ts\nconst a = 1;\n```\n');
    await enrichDocument(
      root,
      result.enrichments,
      { ...fakeLoaders(), highlight },
      {
        theme: 'light',
        sanitizer,
        features: { highlight: false, math: true, diagrams: true },
      },
    );
    expect(highlight).not.toHaveBeenCalled();
  });

  it('stops when the signal aborts mid-flight', async () => {
    const signal = { aborted: false };
    const render = vi.fn().mockImplementation(() => {
      signal.aborted = true;
      return { html: '<span>x</span>', error: null };
    });

    const { root, result } = mount('$a$ and $b$ and $c$\n');
    await enrichDocument(
      root,
      result.enrichments,
      { ...fakeLoaders(), math: async () => ({ render }) },
      { theme: 'light', sanitizer, features: ALL_FEATURES, signal },
    );

    // Abandoning work for a document that was replaced beats finishing it.
    expect(render).toHaveBeenCalledTimes(1);
  });
});

describe('enrichDocument — security', () => {
  it('sanitizes highlighter output', async () => {
    const { root, result } = mount('```ts\nx\n```\n');
    await enrichDocument(
      root,
      result.enrichments,
      fakeLoaders({
        highlight: async () => ({
          async highlight() {
            return '<pre onclick="alert(1)"><code><script>alert(1)</script></code></pre>';
          },
        }),
      }),
      { theme: 'light', sanitizer, features: ALL_FEATURES },
    );

    // Enrichment output is not trusted either; it passes through the same
    // boundary as everything else.
    expect(root.innerHTML).not.toMatch(/onclick/i);
    expect(root.querySelector('script')).toBeNull();
  });

  it('sanitizes diagram SVG', async () => {
    const { root, result } = mount('```mermaid\ngraph TD;\n```\n');
    await enrichDocument(
      root,
      result.enrichments,
      fakeLoaders({
        diagram: async () => ({
          render: async () => ({
            svg: '<svg onload="alert(1)"><script>alert(1)</script></svg>',
            error: null,
          }),
        }),
      }),
      { theme: 'light', sanitizer, features: ALL_FEATURES },
    );

    expect(root.innerHTML).not.toMatch(/onload/i);
    expect(root.querySelector('script')).toBeNull();
  });
});

describe('markPending', () => {
  it('marks every placeholder before phase two runs', () => {
    const { root, result } = mount('```ts\nx\n```\n\n$a$\n\n```mermaid\ng\n```\n');
    markPending(root, result.enrichments);

    const states = Array.from(root.querySelectorAll('[data-mw-state]')).map((el) =>
      el.getAttribute('data-mw-state'),
    );
    expect(states).toEqual(['pending', 'pending', 'pending']);
  });
});

/**
 * A diagram is one object, not a pile of labels.
 *
 * Mermaid ships its SVG with `role="graphics-document document"`, which
 * invites a screen reader to walk inside, and every node and edge label is a
 * `<text>`. The sample flowchart came out as "A .md file, A folder, Drop a
 * folder on Chrome, What is it?" -- the edge labels first, then the nodes.
 * Not merely noisy: the order is not the order of the flow.
 */
describe('enrichDocument — diagrams reach assistive technology (NFR-7)', () => {
  const mermaidShaped = (svg: string): EnrichmentLoaders =>
    fakeLoaders({
      diagram: async () => ({
        async render() {
          return { svg, error: null };
        },
      }),
    });

  const plainSvg =
    '<svg viewBox="0 0 10 10" role="graphics-document document" ' +
    'aria-roledescription="flowchart-v2"><text>B</text><text>A</text></svg>';

  it('presents the diagram as a single image', async () => {
    const { root, result } = mount('```mermaid\ngraph TD\n  A-->B\n```\n');
    await enrichDocument(root, result.enrichments, mermaidShaped(plainSvg), {
      theme: 'light',
      sanitizer,
      features: ALL_FEATURES,
    });

    const svg = root.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    // Mermaid's own value here is its internal renderer name.
    expect(svg.getAttribute('aria-roledescription')).toBeNull();
    expect(svg.getAttribute('aria-label')).toBe('flowchart diagram');
  });

  it('offers the source as the alternative, since that is the structure', async () => {
    const { root, result } = mount('```mermaid\ngraph TD\n  A-->B\n```\n');
    await enrichDocument(root, result.enrichments, mermaidShaped(plainSvg), {
      theme: 'light',
      sanitizer,
      features: ALL_FEATURES,
    });

    const svg = root.querySelector('svg')!;
    const described = root.querySelector(`#${svg.getAttribute('aria-describedby')}`);
    expect(described).not.toBeNull();
    // The labels alone lose which node leads to which. The source does not.
    expect(described!.textContent).toContain('A-->B');
  });

  it('prefers a description the author wrote', async () => {
    // Mermaid turns accTitle and accDescr into <title> and <desc>. A real
    // description beats a generated one, so it is used as-is.
    const authored =
      '<svg viewBox="0 0 10 10" role="graphics-document document">' +
      '<title>How a drop is handled</title>' +
      '<desc>A folder opens the tree; a file renders.</desc><text>A</text></svg>';
    const { root, result } = mount('```mermaid\ngraph TD\n  A-->B\n```\n');
    await enrichDocument(root, result.enrichments, mermaidShaped(authored), {
      theme: 'light',
      sanitizer,
      features: ALL_FEATURES,
    });

    const svg = root.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBeNull();
    const title = root.querySelector(`#${svg.getAttribute('aria-labelledby')}`);
    expect(title?.textContent).toBe('How a drop is handled');
    const desc = root.querySelector(`#${svg.getAttribute('aria-describedby')}`);
    expect(desc?.textContent).toContain('A folder opens the tree');
  });
});
