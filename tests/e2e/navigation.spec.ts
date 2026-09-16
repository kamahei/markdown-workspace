import { expect, test } from './fixtures';

/**
 * The sidebar root must stay where the user opened it.
 *
 * Reported: drop a folder, open a document two levels down, and the sidebar
 * re-roots at that document's own directory. The parent folder and every
 * sibling at the top level become unreachable.
 */
const TREE = {
  'README.md': '# Root Readme\n',
  'top-level.md': '# Top Level\n',
  'docs/guide.md': '# Guide\n',
  'docs/reference/shortcuts.md': '# Shortcuts\n',
  'docs/reference/glossary.md': '# Glossary\n',
};

test.describe('sidebar root stability', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('keeps the opened folder as the root when navigating into a subfolder', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();

    // 1. Open the folder, as dropping it on Chrome would.
    await page.goto(`${fileUrl(root)}/`);
    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await expect(tree.getByText('README.md', { exact: true })).toBeVisible();

    // 2. Walk down two levels and open a document.
    await tree.getByText('docs', { exact: true }).click();
    await tree.getByText('reference', { exact: true }).click();
    await tree.getByText('shortcuts.md', { exact: true }).click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Shortcuts');

    // 3. The root must not have moved with the document.
    await expect(tree).toBeVisible();
    await expect(tree.getByText('README.md', { exact: true })).toBeVisible();
    await expect(tree.getByText('top-level.md', { exact: true })).toBeVisible();
  });

  test('can open a top-level document after visiting a subfolder', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();

    await page.goto(`${fileUrl(root)}/`);
    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();

    await tree.getByText('docs', { exact: true }).click();
    await tree.getByText('reference', { exact: true }).click();
    await tree.getByText('shortcuts.md', { exact: true }).click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Shortcuts');

    // The reported symptom: getting back to the top level is impossible.
    await tree.getByText('top-level.md', { exact: true }).click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Top Level');
  });

  test('keeps the root across a sibling hop inside a subfolder', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();

    await page.goto(`${fileUrl(root)}/`);
    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();

    await tree.getByText('docs', { exact: true }).click();
    await tree.getByText('reference', { exact: true }).click();
    await tree.getByText('shortcuts.md', { exact: true }).click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Shortcuts');

    await tree.getByText('glossary.md', { exact: true }).click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Glossary');
    await expect(tree.getByText('README.md', { exact: true })).toBeVisible();
  });

  test('offers a way up when a document was opened directly', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();

    // Straight to a nested document, with no folder opened first, so there
    // is no remembered root to fall back on.
    await page.goto(fileUrl(`${root}/docs/reference/shortcuts.md`));
    await expect(page.locator('.mw-doc h1')).toHaveText('Shortcuts');

    const up = page.getByRole('button', { name: /parent folder/i });
    await expect(up).toBeVisible();

    await up.click();
    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await expect(tree.getByText('guide.md', { exact: true })).toBeVisible();

    // And again, back to the folder that holds the top-level documents.
    await page.getByRole('button', { name: /parent folder/i }).click();
    await expect(tree.getByText('README.md', { exact: true })).toBeVisible();
  });

  test('going up re-roots the tab for later documents', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();

    await page.goto(fileUrl(`${root}/docs/reference/shortcuts.md`));
    await expect(page.locator('.mw-doc h1')).toHaveText('Shortcuts');

    await page.getByRole('button', { name: /parent folder/i }).click();
    await page.getByRole('button', { name: /parent folder/i }).click();

    const tree = page.locator('[role="tree"]');
    await expect(tree.getByText('README.md', { exact: true })).toBeVisible();

    // The new root must stick when a document is opened from it.
    await tree.getByText('top-level.md', { exact: true }).click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Top Level');
    await expect(tree.getByText('README.md', { exact: true })).toBeVisible();
  });
});
