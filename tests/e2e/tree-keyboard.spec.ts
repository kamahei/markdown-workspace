import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Keyboard navigation of the file tree, driven through a real browser.
 *
 * Reported: the arrow keys work in the workspace but not after dropping a
 * folder onto the browser, and Right/Left misbehave — the cursor drifts up
 * and down, and expanding a folder throws it onto the open document.
 *
 * That was three separate defects, one per group below. The workspace was
 * the one surface where this worked because opening a document there never
 * reloads the page; in reader mode every open is a fresh `file://` load.
 */
const NESTED = {
  'README.md': '# Root readme\n',
  'docs/guide.md': '# Guide\n',
  'docs/api/rest.md': '# Rest\n',
  'docs/api/graph.md': '# Graph\n',
};

const focusedRow = (page: Page) => page.locator('.mw-tree-row.is-focused');
const activeRole = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('role') ?? null);

test.describe('the tree is reachable from the keyboard', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('a dropped folder starts with the tree focused', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // Dropping a folder lands on the directory listing. There is no document
    // to read there, so the arrow keys did nothing at all until the user
    // happened to find the tree with Tab.
    const root = await makeTree(NESTED);
    const page = await context.newPage();
    await page.goto(`${fileUrl(root)}/`);
    await expect(page.locator('[role="tree"]')).toBeVisible();

    await expect.poll(() => activeRole(page)).toBe('tree');

    await page.keyboard.press('ArrowDown');
    await expect(focusedRow(page)).toHaveText(/README\.md/);
  });

  test('the cursor survives opening a document from the tree', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // Every Enter used to drop focus back onto the body, so the next arrow
    // key did nothing and the reader had to reach for the mouse again.
    const root = await makeTree(NESTED);
    const page = await context.newPage();
    await page.goto(`${fileUrl(root)}/`);
    await expect(page.locator('[role="tree"]')).toBeVisible();

    const tree = page.locator('[role="tree"]');
    await tree.focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    await expect(page.locator('.mw-doc h1')).toHaveText('Root readme');
    await expect.poll(() => activeRole(page)).toBe('tree');

    // Still usable: no click, no Tab, just keep going.
    await page.keyboard.press('Home');
    await expect(focusedRow(page)).toHaveText(/docs/);
  });

  test('following a link in the document does not jump to the sidebar', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // The handoff is conditional for a reason: someone reading the document
    // should stay in the document.
    const root = await makeTree({
      'README.md': '# Root readme\n\n[Guide](docs/guide.md)\n',
      'docs/guide.md': '# Guide\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/README.md`));
    await page.locator('.mw-doc a', { hasText: 'Guide' }).click();

    await expect(page.locator('.mw-doc h1')).toHaveText('Guide');
    expect(await activeRole(page)).not.toBe('tree');
  });

  test('ArrowDown from the filter moves into the list', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(NESTED);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/README.md`));
    await expect(page.locator('[role="tree"]')).toBeVisible();

    await page.keyboard.press('/');
    await expect(page.getByLabel('Filter files by name')).toBeFocused();
    await page.keyboard.press('ArrowDown');

    await expect.poll(() => activeRole(page)).toBe('tree');
  });

  test('Escape hands focus back to the document', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(NESTED);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/README.md`));
    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await tree.focus();

    await page.keyboard.press('Escape');
    await expect(page.locator('main.mw-main')).toBeFocused();
  });
});

test.describe('Right and Left move through the hierarchy', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('expanding a folder leaves the cursor on that folder', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // Reported: opening a folder moved the cursor to the file that is open.
    // Following the active document was re-running on every change to the
    // row list, and expanding a folder changes the row list.
    const root = await makeTree(NESTED);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/README.md`));
    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await expect(focusedRow(page)).toHaveText(/README\.md/);

    await tree.focus();
    await page.keyboard.press('Home');
    await expect(focusedRow(page)).toHaveText(/docs/);

    await page.keyboard.press('ArrowRight');
    await expect(
      page.locator('[role="treeitem"]', { hasText: 'guide.md' }),
    ).toBeVisible();
    await expect(focusedRow(page)).toHaveText(/docs/);
  });

  test('Right on an open folder steps into it, and Left comes back out', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(NESTED);
    const page = await context.newPage();
    await page.goto(`${fileUrl(root)}/`);
    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await tree.focus();
    await page.keyboard.press('Home');

    await page.keyboard.press('ArrowRight'); // opens docs
    await expect(
      page.locator('[role="treeitem"]', { hasText: 'guide.md' }),
    ).toBeVisible();
    await expect(focusedRow(page)).toHaveText(/docs/);

    await page.keyboard.press('ArrowRight'); // steps into it
    await expect(focusedRow(page)).toHaveText(/api/);

    await page.keyboard.press('ArrowLeft'); // api is collapsed: go to parent
    await expect(focusedRow(page)).toHaveText(/docs/);

    await page.keyboard.press('ArrowLeft'); // docs is open: close it
    await expect(
      page.locator('[role="treeitem"]', { hasText: 'guide.md' }),
    ).toHaveCount(0);
    await expect(focusedRow(page)).toHaveText(/docs/);
  });

  test('Right does nothing on a file and Left goes to its folder', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // Reported verbatim: pressing Right or Left moves the cursor up and down.
    const root = await makeTree(NESTED);
    const page = await context.newPage();
    await page.goto(`${fileUrl(root)}/`);
    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await tree.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // opens docs
    await expect(
      page.locator('[role="treeitem"]', { hasText: 'guide.md' }),
    ).toBeVisible();
    await page.keyboard.press('ArrowDown'); // api
    await page.keyboard.press('ArrowDown'); // guide.md
    await expect(focusedRow(page)).toHaveText(/guide\.md/);

    await page.keyboard.press('ArrowRight');
    await expect(focusedRow(page)).toHaveText(/guide\.md/);

    await page.keyboard.press('ArrowLeft');
    await expect(focusedRow(page)).toHaveText(/docs/);
  });

  test('the cursor stays on the same file when rows shift above it', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // The cursor used to be an index into a list that reorders. Filtering
    // removes rows above it, so the same index came to mean a different
    // file -- or no file at all.
    const root = await makeTree(NESTED);
    const page = await context.newPage();
    await page.goto(`${fileUrl(root)}/`);
    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await tree.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // opens docs
    await expect(
      page.locator('[role="treeitem"]', { hasText: 'guide.md' }),
    ).toBeVisible();
    await page.keyboard.press('ArrowDown'); // api
    await page.keyboard.press('ArrowDown'); // guide.md
    await expect(focusedRow(page)).toHaveText(/guide\.md/);

    // Filtering drops the rows above it. The cursor is on a file, not on a
    // position, so it must still be on that file.
    await page.getByLabel('Filter files by name').fill('guide');
    await expect(page.locator('[role="treeitem"]')).toHaveCount(2);
    await expect(focusedRow(page)).toHaveText(/guide\.md/);

    // And Enter still opens what the cursor is pointing at.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('.mw-doc h1')).toHaveText('Guide');
  });
});
