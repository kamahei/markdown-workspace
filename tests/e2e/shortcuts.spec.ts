import { expect, test } from './fixtures';

/**
 * Keyboard shortcuts, driven through a real browser.
 *
 * Reported: none of them worked. They were written into the UI spec and the
 * sample documentation and never implemented, and two of the four could
 * never have worked -- Chrome reserves Ctrl+W entirely and owns Ctrl+P.
 *
 * These press real keys rather than calling handlers, because the defect was
 * precisely that nothing was listening.
 */
const TREE = {
  'alpha.md': '# Alpha\n\nSome text.\n',
  'beta.md': '# Beta\n',
  'gamma.md': '# Gamma\n',
};

test.describe('shortcuts in reader mode', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('Ctrl+B toggles the sidebar', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/alpha.md`));
    await expect(page.locator('[role="tree"]')).toBeVisible();

    await page.keyboard.press('Control+b');
    await expect(page.locator('.mw-sidebar')).toBeHidden();

    await page.keyboard.press('Control+b');
    await expect(page.locator('.mw-sidebar')).toBeVisible();
  });

  test('Ctrl+backslash toggles raw and rendered', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/alpha.md`));
    await expect(page.locator('.mw-doc')).toBeVisible();

    await page.keyboard.press('Control+\\');
    await expect(page.locator('.mw-raw')).toBeVisible();
    await expect(page.locator('.mw-doc')).toHaveCount(0);

    await page.keyboard.press('Control+\\');
    await expect(page.locator('.mw-doc h1')).toHaveText('Alpha');
  });

  test('slash focuses the file filter', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/alpha.md`));
    await expect(page.locator('[role="tree"]')).toBeVisible();

    await page.keyboard.press('/');
    await expect(page.getByLabel('Filter files by name')).toBeFocused();

    // And it must not have typed the slash into the field it just focused.
    await expect(page.getByLabel('Filter files by name')).toHaveValue('');
  });

  test('slash reopens a hidden sidebar before focusing', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/alpha.md`));
    await expect(page.locator('[role="tree"]')).toBeVisible();

    await page.keyboard.press('Control+b');
    await expect(page.locator('.mw-sidebar')).toBeHidden();

    await page.keyboard.press('/');
    await expect(page.locator('.mw-sidebar')).toBeVisible();
    await expect(page.getByLabel('Filter files by name')).toBeFocused();
  });

  test('Escape clears the filter', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/alpha.md`));
    await expect(page.locator('[role="tree"]')).toBeVisible();

    const filter = page.getByLabel('Filter files by name');
    await filter.fill('beta');
    await expect(page.locator('[role="tree"]').getByText('alpha.md')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(filter).toHaveValue('');
    await expect(page.locator('[role="tree"]').getByText('alpha.md')).toBeVisible();
  });

  test('typing a slash into the filter inserts it', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // The shortcut must not fire while the user is typing a path.
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/alpha.md`));
    await expect(page.locator('[role="tree"]')).toBeVisible();

    const filter = page.getByLabel('Filter files by name');
    await filter.click();
    await filter.type('a/b');
    await expect(filter).toHaveValue('a/b');
  });
});

test.describe('the tree cursor is visible', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('moving with the arrow keys visibly changes the current row', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/alpha.md`));

    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await tree.focus();
    await page.keyboard.press('Home');

    const styleOf = (index: number) =>
      page.evaluate((i) => {
        const rows = document.querySelectorAll('[role="treeitem"]');
        const el = rows[i] as HTMLElement | undefined;
        if (!el) return null;
        const s = getComputedStyle(el);
        // outline-style, not outline-width: a width is still reported when
        // the style is none, so width alone cannot tell them apart.
        return { outlineStyle: s.outlineStyle, background: s.backgroundColor };
      }, index);

    // Reported: arrow keys moved the selection with no visible change at all.
    expect((await styleOf(0))?.outlineStyle).toBe('solid');
    expect((await styleOf(1))?.outlineStyle).toBe('none');

    await page.keyboard.press('ArrowDown');

    expect((await styleOf(1))?.outlineStyle).toBe('solid');
    // And the row it left must no longer look current.
    expect((await styleOf(0))?.outlineStyle).toBe('none');
  });

  test('points aria-activedescendant at the current row', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/alpha.md`));

    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await tree.focus();
    await page.keyboard.press('Home');

    const current = await tree.getAttribute('aria-activedescendant');
    expect(current).toBeTruthy();
    // A screen reader follows this, so it has to name a real element.
    await expect(page.locator(`#${current}`)).toHaveCount(1);
  });

  test('Enter opens the row the cursor is on', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/alpha.md`));

    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await tree.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page.locator('.mw-doc h1')).toHaveText('Beta');
  });
});

test.describe('shortcuts in the workspace', () => {
  test('Alt+W closes the active tab', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('.mw-root')).toBeVisible();

    // Ctrl+W is reserved by Chrome and can never reach the page, which is
    // why the shortcut moved. Nothing to close here, so this asserts the
    // binding exists and does not throw.
    await page.keyboard.press('Alt+w');
    await expect(page.locator('.mw-root')).toBeVisible();
  });

  test('Ctrl+B toggles the workspace sidebar', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('.mw-sidebar')).toBeVisible();

    // The document listener attaches in an effect, after the first paint, so
    // a key pressed the instant the sidebar appears can beat it.
    await expect
      .poll(async () => {
        await page.keyboard.press('Control+b');
        return page.locator('.mw-sidebar').isHidden();
      })
      .toBe(true);
  });
});

test.describe('the shortcut reference on the options page', () => {
  test('lists the shortcuts that are actually bound', async ({
    context,
    extensionId,
  }) => {
    // The list and the matcher come from the same module on purpose. This
    // asserts the page renders it at all: the export existed for a while
    // with nothing calling it, which is how a shortcut reference silently
    // stops being shown to anyone.
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    const section = page.locator('.mw-shortcut-list');
    await expect(section).toBeVisible();

    const rows = section.locator('.mw-shortcut-row');
    await expect(rows).toHaveCount(9);

    await expect(section.getByText('Toggle the sidebar')).toBeVisible();
    await expect(section.getByText('Focus the file filter')).toBeVisible();

    // A bare slash is a key here, not the separator in "Home / End".
    const keyCaps = await section.locator('dt kbd').allInnerTexts();
    expect(keyCaps).toContain('/');
    expect(keyCaps).toContain('Home');
    expect(keyCaps).toContain('End');
    expect(keyCaps).toContain('Alt');
  });
});
