import { expect, test } from './fixtures';

/**
 * The document outline (sidebar "Outline" tab).
 *
 * The headings were already produced by the renderer and thrown away; this
 * is what finally reads them. What is worth driving in a real browser is the
 * part that cannot be unit tested: that clicking a heading moves the page,
 * and that the mark follows the reader down the document.
 */

/** A document with real structure and enough height to scroll through. */
const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `Paragraph number ${i}.`).join('\n\n');

const DOC = `# Title

${filler(30)}

## Installing

${filler(30)}

### From source

${filler(30)}

## Configuring

${filler(30)}
`;

test.describe('outline', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('lists the headings, nested by depth', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree({ 'doc.md': DOC });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await page.getByRole('tab', { name: 'Outline' }).click();
    const outline = page.getByRole('navigation', { name: 'Outline' });

    await expect(outline.getByRole('link')).toHaveText([
      'Title',
      'Installing',
      'From source',
      'Configuring',
    ]);

    // "From source" is an h3 under an h2, so it sits one list deeper than
    // "Installing" does. Depth is the whole point of a nested outline.
    const deeper = outline.locator('ul ul ul >> text=From source');
    await expect(deeper).toHaveCount(1);
  });

  test('jumps to the heading, and says so in the address bar', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'doc.md': DOC });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await page.getByRole('tab', { name: 'Outline' }).click();
    await page.getByRole('link', { name: 'Configuring', exact: true }).click();

    // The heading is on screen...
    await expect(page.locator('#configuring')).toBeInViewport();
    // ...the page scrolled rather than reloaded...
    const scrolled = await page.locator('.mw-main').evaluate((el) => el.scrollTop);
    expect(scrolled).toBeGreaterThan(0);
    // ...and the fragment is in the URL, so the link can be shared and Back
    // returns to where the reader was.
    expect(page.url()).toContain('#configuring');
  });

  test('marks where the reader is, and updates on scroll', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'doc.md': DOC });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await page.getByRole('tab', { name: 'Outline' }).click();

    const current = page.locator('.mw-outline-link[aria-current="true"]');
    // At the top of the document, the first heading owns the position.
    await expect(current).toHaveText('Title');

    // Through each section in turn, including the middle ones: a mark that
    // only ever moved to the last heading, or that stuck on the first,
    // would pass a single check at one end of the document.
    for (const [id, text] of [
      ['installing', 'Installing'],
      ['from-source', 'From source'],
      ['configuring', 'Configuring'],
    ] as const) {
      await page.locator(`#${id}`).evaluate((el) => el.scrollIntoView());
      await expect(current).toHaveText(text);
    }

    // And deep inside a section, where no heading is on screen at all, the
    // mark stays on the section rather than clearing.
    await page.locator('.mw-main').evaluate((el) => {
      el.scrollTop += 400;
    });
    await expect(current).toHaveText('Configuring');

    // Back to the top, so the mark is shown to move in both directions.
    await page.locator('.mw-main').evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(current).toHaveText('Title');
  });

  test('is absent when the setting is off', async ({
    context,
    extensionId,
    makeTree,
    fileUrl,
  }) => {
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByLabel('Document outline').uncheck();
    await options.close();

    const root = await makeTree({ 'doc.md': DOC });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    // One panel left, so there is no tablist at all — the sidebar looks
    // exactly as it did before the outline existed.
    await expect(page.getByRole('tab', { name: 'Outline' })).toHaveCount(0);
    await expect(page.locator('.mw-sidebar-tablist')).toHaveCount(0);
    await expect(page.locator('.mw-tree')).toBeVisible();
  });

  test('survives the raw/rendered toggle', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree({ 'doc.md': DOC });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await page.getByRole('tab', { name: 'Outline' }).click();

    // Raw mode has no headings to follow; the outline must not throw or
    // point at elements that are no longer there.
    await page.getByRole('button', { name: 'Show Markdown source' }).click();
    await expect(page.locator('.mw-raw')).toBeVisible();
    await expect(page.locator('.mw-outline-link[aria-current="true"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Show rendered document' }).click();
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await expect(page.locator('.mw-outline-link[aria-current="true"]')).toHaveText(
      'Title',
    );
  });

  test('tells the reader when there is nothing to list', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'flat.md': 'Just a paragraph, no headings.\n' });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/flat.md`));
    await expect(page.locator('.mw-doc')).toBeVisible();

    await page.getByRole('tab', { name: 'Outline' }).click();
    await expect(page.getByText('This document has no headings.')).toBeVisible();
  });

  test('remembers the chosen tab across opening another document', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'a.md': DOC, 'b.md': '# Bee\n\nText.\n' });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await page.getByRole('tab', { name: 'Outline' }).click();
    await expect(page.getByRole('tab', { name: 'Outline' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Reader mode loads a new page per document. Without the session
    // handoff the sidebar would snap back to the file tree here.
    await page.goto(fileUrl(`${root}/b.md`));
    await expect(page.locator('.mw-doc h1')).toHaveText('Bee');
    await expect(page.getByRole('tab', { name: 'Outline' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('moves between tabs with the arrow keys', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'doc.md': DOC });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    const files = page.getByRole('tab', { name: 'Files' });
    await files.focus();
    await page.keyboard.press('ArrowRight');

    const outline = page.getByRole('tab', { name: 'Outline' });
    await expect(outline).toHaveAttribute('aria-selected', 'true');
    await expect(outline).toBeFocused();
  });
});
