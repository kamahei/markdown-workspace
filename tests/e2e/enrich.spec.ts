import { expect, test } from './fixtures';

/**
 * Phase two with the real libraries, loaded as web-accessible modules by URL.
 *
 * This is the test that matters for open question Q11: an MV3 content script
 * is a classic script the bundler cannot split, so these chunks are built
 * separately and imported at runtime. If that path breaks, the enrichment
 * silently never happens.
 */
test.describe('rich rendering', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('highlights code with real Shiki (FR-5)', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'doc.md': '# Doc\n\n```ts\nconst greeting: string = "hi";\n```\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));

    await expect(page.locator('.mw-doc pre.shiki')).toBeVisible({ timeout: 15_000 });
    // Shiki wraps tokens in spans with inline colours.
    await expect(page.locator('.mw-doc pre.shiki span').first()).toBeVisible();
    await expect(page.locator('.mw-doc')).toContainText('const greeting');
  });

  test('leaves an unknown language as plain text, with no error', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'doc.md': '# Doc\n\n```notalanguage\nsome content\n```\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));

    await expect(page.locator('.mw-doc')).toContainText('some content');
    await page.waitForTimeout(1000);
    await expect(page.locator('.mw-enrich-error')).toHaveCount(0);
    await expect(page.locator('pre.shiki')).toHaveCount(0);
  });

  test('renders math with real KaTeX (FR-6)', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree({
      'doc.md': '# Doc\n\nInline $E = mc^2$ and block:\n\n$$\n\frac{a}{b}\n$$\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));

    await expect(page.locator('.mw-doc .katex').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('.mw-doc .katex')).toHaveCount(2);
  });

  test('keeps invalid math as source rather than discarding it', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'doc.md': '# Doc\n\nBroken $\frac{1$ here and text after.\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));

    await expect(page.locator('.mw-doc')).toContainText('text after');
  });

  test('renders a diagram with real Mermaid (FR-7)', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'doc.md': '# Doc\n\n```mermaid\ngraph TD;\n  A-->B;\n  B-->C;\n```\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));

    await expect(page.locator('.mw-diagram svg')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.mw-diagram')).toHaveAttribute('data-mw-state', 'done');
  });

  test('falls back to the source when a diagram will not parse', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'doc.md':
        '# Doc\n\n```mermaid\nthis is definitely not a diagram ((( \n```\n\nText after.\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));

    await expect(page.locator('.mw-diagram')).toHaveAttribute('data-mw-state', 'error', {
      timeout: 25_000,
    });
    await expect(page.locator('.mw-diagram')).toContainText('not a diagram');
    // The rest of the document is untouched (NFR-6).
    await expect(page.locator('.mw-doc')).toContainText('Text after.');
  });

  test('diagram nodes keep their labels', async ({ context, makeTree, fileUrl }) => {
    // Regression: Mermaid puts labels in <foreignObject>, which the SVG
    // sanitizer strips. Diagrams drew perfectly with completely empty nodes.
    const root = await makeTree({
      'doc.md': '# Doc\n\n```mermaid\ngraph TD;\n  A[Start here] --> B[End here];\n```\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));

    await expect(page.locator('.mw-diagram svg')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.mw-diagram svg')).toContainText('Start here');
    await expect(page.locator('.mw-diagram svg')).toContainText('End here');
  });

  test('diagram keeps its embedded styling', async ({ context, makeTree, fileUrl }) => {
    // Regression: the sanitizer forbids <style>, and Mermaid ships the
    // diagram's styling inside the SVG. Stripping it left black rectangles.
    const root = await makeTree({
      'doc.md': '# Doc\n\n```mermaid\ngraph TD;\n  A[One] --> B[Two];\n```\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-diagram svg')).toBeVisible({ timeout: 25_000 });

    const hasStyle = await page.evaluate(
      () => document.querySelector('.mw-diagram svg style') !== null,
    );
    expect(hasStyle).toBe(true);

    const fill = await page.evaluate(() => {
      const node = document.querySelector(
        '.mw-diagram svg .node rect, .mw-diagram svg rect',
      );
      return node ? getComputedStyle(node).fill : null;
    });
    // Unstyled SVG shapes default to black; anything else means the embedded
    // stylesheet survived.
    expect(fill).not.toBe('rgb(0, 0, 0)');
  });

  test('math uses the KaTeX fonts, not a browser fallback', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // Regression: the stylesheet was inlined as a <style>, so its relative
    // @font-face URLs resolved against the file:// page and never loaded.
    const root = await makeTree({ 'doc.md': '# Doc\n\nMath: $E = mc^2$\n' });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));

    await expect(page.locator('.mw-doc .katex').first()).toBeVisible({ timeout: 15_000 });

    const font = await page.evaluate(() => {
      const el = document.querySelector('.katex .mord');
      return el ? getComputedStyle(el).fontFamily : null;
    });
    expect(font).toMatch(/KaTeX/);
  });

  test('loads no enrichment chunk for a plain document (NFR-2)', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'plain.md': '# Plain\n\nJust prose, no code, no math, no diagrams.\n',
    });
    const page = await context.newPage();

    const lazyRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/lazy/')) lazyRequests.push(req.url());
    });

    await page.goto(fileUrl(`${root}/plain.md`));
    await expect(page.locator('.mw-doc h1')).toHaveText('Plain');
    await page.waitForTimeout(1500);

    // The entire point of the two-phase contract.
    expect(lazyRequests).toEqual([]);
  });

  test('loads only the chunk a document actually needs', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'code.md': '# Code\n\n```js\nlet a = 1;\n```\n' });
    const page = await context.newPage();

    const lazyRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/lazy/')) lazyRequests.push(req.url());
    });

    await page.goto(fileUrl(`${root}/code.md`));
    await expect(page.locator('.mw-doc pre.shiki')).toBeVisible({ timeout: 15_000 });

    expect(lazyRequests.some((u) => u.includes('highlight.js'))).toBe(true);
    expect(lazyRequests.some((u) => u.includes('math.js'))).toBe(false);
    expect(lazyRequests.some((u) => u.includes('diagram.js'))).toBe(false);
  });

  test('document text is readable before enrichment finishes (NFR-1)', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'heavy.md':
        '# Heading\n\nProse first.\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n\n$x^2$\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/heavy.md`));

    // Phase one output must be present without waiting for any library.
    await expect(page.locator('.mw-doc h1')).toHaveText('Heading');
    await expect(page.locator('.mw-doc')).toContainText('Prose first.');
  });
});
