import { expect, test } from './fixtures';

/**
 * Searching every document in the open folder.
 *
 * The walker is unit tested against an in-memory tree. What only a real
 * browser answers is whether the sidebar stays usable while a large folder
 * is being read — in reader mode every file is a round trip to the service
 * worker, which no unit test exercises.
 */

const TREE = {
  'intro.md': '# Intro\n\nThe quick brown fox.\n',
  'guide/setup.md':
    '# Setup\n\nInstall it first.\n\n## Details\n\nThe quick brown dog.\n',
  'guide/deep/notes.md': '# Notes\n\nNothing interesting.\n',
  'node_modules/pkg/readme.md': '# Package\n\nThe quick brown fox.\n',
};

test.describe('folder search', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('finds text across documents, and skips the noise folders', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/intro.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await page.getByRole('tab', { name: 'Search' }).click();
    await page.getByRole('searchbox', { name: /Search the text/ }).fill('quick brown');

    await expect(page.locator('.mw-search-group')).toHaveCount(2);
    await expect(page.locator('.mw-search-file')).toHaveText(['intro.md', 'setup.md']);
    // node_modules is excluded for search exactly as it is for the tree.
    await expect(page.getByText('readme.md')).toHaveCount(0);
  });

  test('marks the matching text inside the line', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/intro.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await page.getByRole('tab', { name: 'Search' }).click();
    await page.getByRole('searchbox', { name: /Search the text/ }).fill('brown');
    await expect(page.locator('.mw-search-text mark').first()).toHaveText('brown');
  });

  test('says how much it found', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/intro.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await page.getByRole('tab', { name: 'Search' }).click();
    const box = page.getByRole('searchbox', { name: /Search the text/ });

    await box.fill('quick brown');
    await expect(page.locator('.mw-search-status')).toHaveText(
      '2 matches in 2 documents.',
    );

    await box.fill('definitely-not-present');
    await expect(page.locator('.mw-search-status')).toHaveText('Nothing matched.');

    await box.fill('q');
    await expect(page.locator('.mw-search-status')).toHaveText(
      'Type at least 2 characters.',
    );
  });

  test('opens the document a hit is in, landing at its section', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/intro.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await page.getByRole('tab', { name: 'Search' }).click();
    await page
      .getByRole('searchbox', { name: /Search the text/ })
      .fill('quick brown dog');
    await page.locator('.mw-search-hit').first().click();

    // Reader mode opens a document by loading its page.
    await expect(page.locator('.mw-doc h1')).toHaveText('Setup');
    // The hit is under "Details", which is where this should have landed.
    await expect(page.locator('#details')).toBeInViewport();
  });

  test('wins over the position the document was last left at', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    /*
     * Two things want the scroll when a document opens: the remembered
     * reading position, and the line a search asked for. The remembered
     * one used to win, because it waits on a storage read and therefore
     * lands second -- so clicking a search result dropped the reader
     * wherever they last stopped instead of on the match.
     */
    const filler = (n: number) =>
      Array.from({ length: n }, (_, i) => `Paragraph ${i}.`).join('\n\n');
    const root = await makeTree({
      'start.md': '# Start\n\nnothing here\n',
      'target.md': [
        '# Target',
        filler(40),
        '## Deep Section',
        'the needle is here',
        filler(40),
      ].join('\n\n'),
    });
    const page = await context.newPage();

    // Leave target.md remembered near its end.
    await page.goto(fileUrl(`${root}/target.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await page.locator('.mw-main').evaluate((el) => {
      el.scrollTop = el.scrollHeight - el.clientHeight;
    });
    await page.waitForTimeout(900);

    // Then arrive at it from a search hit near the middle.
    await page.goto(fileUrl(`${root}/start.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await page.getByRole('tab', { name: 'Search' }).click();
    await page.getByRole('searchbox', { name: /Search the text/ }).fill('needle is here');
    await page.locator('.mw-search-hit').first().click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Target');

    // Given time for a late restore to arrive and steal it back.
    await page.waitForTimeout(1200);
    await expect(page.locator('#deep-section')).toBeInViewport();
  });

  test('does not leave the results of an abandoned query on screen', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/intro.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await page.getByRole('tab', { name: 'Search' }).click();
    const box = page.getByRole('searchbox', { name: /Search the text/ });

    // Type a broad query and immediately narrow it. The broad walk is still
    // running when the narrow one starts; if its results were allowed to
    // land they would overwrite the newer ones, which looks precisely like
    // a broken matcher.
    await box.fill('the');
    await box.fill('quick brown dog');

    await expect(page.locator('.mw-search-file')).toHaveText(['setup.md']);
    // And it stays that way: nothing arrives late and replaces it.
    await page.waitForTimeout(600);
    await expect(page.locator('.mw-search-file')).toHaveText(['setup.md']);
  });

  test('stays responsive on a folder of thousands of documents', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const files: Record<string, string> = { 'a-start.md': '# Start\n\nneedle\n' };
    for (let i = 0; i < 1200; i += 1) {
      files[`bulk/f${i}.md`] = `# File ${i}\n\nfiller text needle here\n`;
    }
    const root = await makeTree(files);

    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a-start.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await page.getByRole('tab', { name: 'Search' }).click();
    await page.getByRole('searchbox', { name: /Search the text/ }).fill('needle');

    // The match cap stops it well before 1200 files, so results arrive
    // rather than the sidebar hanging until every file has been read.
    await expect(page.locator('.mw-search-hit').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Stopped early/)).toBeVisible();

    // Still interactive: the tabs respond while all that was going on.
    await page.getByRole('tab', { name: 'Files' }).click();
    await expect(page.locator('.mw-tree')).toBeVisible();
  });

  test('Ctrl+Shift+F opens the search panel and focuses its field', async ({
    context,
    makeTree,
    fileUrl,
    hasFileAccess,
  }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
    const root = await makeTree({ 'a.md': '# A\n\nsome words here\n' });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await page.locator('.mw-main').click();
    await page.keyboard.press('Control+Shift+F');

    const box = page.getByRole('searchbox', { name: /Search the text/ });
    await expect(page.getByRole('tab', { name: 'Search' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(box).toBeFocused();

    // And it works from a hidden sidebar. Out of the field first: a
    // shortcut must not fire while the reader is typing, which is why
    // Ctrl+B does nothing from inside the search box.
    await page.locator('.mw-main').click();
    await page.keyboard.press('Control+b');
    await expect(page.locator('.mw-sidebar')).toBeHidden();
    await page.keyboard.press('Control+Shift+F');
    await expect(page.locator('.mw-sidebar')).toBeVisible();
    await expect(box).toBeFocused();
  });

  test('tells the reader when there is no folder to search', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('.mw-root')).toBeVisible();

    await page.getByRole('tab', { name: 'Search' }).click();
    await expect(page.locator('.mw-search-status')).toHaveText(
      'No folder is open to search.',
    );
    await expect(page.getByRole('searchbox', { name: /Search the text/ })).toBeDisabled();
  });
});
