import { expect, test } from './fixtures';

/**
 * Checks moved off the manual checklist.
 *
 * `manual-checklist.md` says that if something on it can be automated, it
 * should be automated and deleted from the list. These are the ones that
 * could: first run, the permission panel, theme following the OS, narrow
 * windows, print, and a keyboard-only session.
 *
 * What stays manual is written down in that file, and it is short: whether
 * the onboarding wording still matches what `chrome://extensions` shows, and
 * whether a screen reader makes a usable job of the result. Both need a
 * person looking, not a selector.
 */

const TREE = {
  'README.md': '# Tour\n\nSome prose to scroll.\n\n[Guide](docs/guide.md)\n',
  'docs/guide.md': [
    '# Guide',
    '',
    '| Column | Another | A third |',
    '| --- | --- | --- |',
    '| value | value | value |',
    '',
    '```js',
    'const wide = "a line long enough to need its own horizontal scroller";',
    '```',
    '',
  ].join('\n'),
};

test.describe('first run (checklist 3)', () => {
  test('opens the setup page by itself on install', async ({ context, extensionId }) => {
    // The fixture launches a fresh profile every time, so this *is* a first
    // install. Without this page the extension looks broken on first use,
    // because Chrome will not let it ask for file access.
    await expect
      .poll(() =>
        context
          .pages()
          .map((p) => p.url())
          .concat(context.backgroundPages().map((p) => p.url()))
          .some((url) => url.endsWith('/onboarding.html')),
      )
      .toBe(true);

    const page =
      context.pages().find((p) => p.url().endsWith('/onboarding.html')) ??
      (await context.newPage());
    await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/installed/i);
  });

  test('names the three steps Chrome actually requires', async ({
    context,
    extensionId,
  }) => {
    // Wording, not layout: this is the text a person compares against
    // chrome://extensions, and the comparison is worthless if the steps have
    // silently changed underneath it.
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/onboarding.html`);

    const steps = page.locator('.mw-onboarding-steps li');
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText('chrome://extensions');
    await expect(steps.nth(1)).toContainText('Details');
    await expect(steps.nth(2)).toContainText('Allow access to file URLs');
  });

  test('copies the address, since it cannot navigate there', async ({
    context,
    extensionId,
  }) => {
    // Playwright cannot grant clipboard permission to an extension origin --
    // Chrome treats it as opaque -- so the write is recorded rather than read
    // back. The argument is the part that matters: the button is worthless if
    // it copies the wrong address.
    const page = await context.newPage();
    await page.addInitScript(() => {
      (window as unknown as { __copied?: string[] }).__copied = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text: string) => {
            (window as unknown as { __copied: string[] }).__copied.push(text);
            return Promise.resolve();
          },
        },
      });
    });
    await page.goto(`chrome-extension://${extensionId}/onboarding.html`);

    await page.getByRole('button', { name: 'Copy address' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied),
    ).toEqual(['chrome://extensions']);
  });

  test('reports the live access status without a reload', async ({
    context,
    extensionId,
    hasFileAccess,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/onboarding.html`);

    const status = page.locator('.mw-onboarding-status');
    await expect(status).not.toHaveClass(/is-checking/);
    await expect(status).toHaveClass(hasFileAccess ? /is-granted/ : /is-blocked/);

    // The promise of this page is that it updates on its own, so it must be
    // polling rather than reading once at load.
    if (!hasFileAccess) {
      await expect(status).toContainText('updates on its own');
    }
  });

  test('shows the permission panel instead of a blank page', async ({
    context,
    fileUrl,
    makeTree,
    hasFileAccess,
  }) => {
    test.skip(hasFileAccess, 'this is the blocked path');

    // The failure this guards is the worst one available: a user opens a
    // Markdown file, sees nothing at all, and concludes the extension does
    // not work.
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/README.md`));

    const panel = page.locator('.mw-state-panel, .mw-permission-panel');
    await expect(panel.first()).toBeVisible();
    await expect(page.locator('body')).toContainText('chrome://extensions');
  });
});

test.describe('theme and layout (checklist 5)', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('follows the operating system in both directions', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(fileUrl(`${root}/README.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    // The surface colour is on .mw-root. `body` is transparent, so reading it
    // returns the same rgba(0, 0, 0, 0) under either scheme.
    const bg = () =>
      page.evaluate(
        () => getComputedStyle(document.querySelector('.mw-root')!).backgroundColor,
      );
    const dark = await bg();

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(bg).not.toBe(dark);
    const light = await bg();

    // Not merely different: a dark theme has to actually be darker, or the
    // tokens are wired to the wrong side.
    expect(luminance(dark)).toBeLessThan(luminance(light));
  });

  test('an explicit choice overrides the operating system', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(fileUrl(`${root}/README.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    // Cycle until the explicit light theme is reached, then confirm the OS
    // preference no longer wins.
    const theme = page.getByRole('button', { name: /^Theme:/ });
    await expect
      .poll(async () => {
        await theme.click();
        return page.evaluate(() => document.documentElement.dataset.theme);
      })
      .toBe('light');

    const bg = await page.evaluate(
      () => getComputedStyle(document.querySelector('.mw-root')!).backgroundColor,
    );
    expect(luminance(bg)).toBeGreaterThan(0.5);
  });

  test('a narrow window scrolls nothing sideways but its own containers', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.setViewportSize({ width: 400, height: 720 });
    await page.goto(fileUrl(`${root}/docs/guide.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - document.body.clientWidth,
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(overflow.body).toBeLessThanOrEqual(1);
    expect(overflow.doc).toBeLessThanOrEqual(1);

    // The table is allowed to be wider than the screen — inside its own
    // scroller, which is the point of wrapping it.
    const scroller = page.locator('.mw-table-scroll');
    await expect(scroller).toHaveCount(1);
    expect(await scroller.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
  });

  test('prints the document rather than the chrome around it', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/docs/guide.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await page.emulateMedia({ media: 'print' });
    // A toolbar and a file tree on every printed page is wasted paper and
    // makes the text column narrow for no reason.
    await expect(page.locator('.mw-toolbar')).toBeHidden();
    await expect(page.locator('.mw-sidebar')).toBeHidden();
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await expect(page.locator('.mw-doc table')).toBeVisible();
  });
});

test.describe('without a pointer (checklist 6)', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('a whole session runs on the keyboard alone', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // Open a folder, find a document, read it, come back. No click anywhere
    // in this test, which is the only way to know it is really possible.
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(`${fileUrl(root)}/`);
    await expect(page.locator('[role="tree"]')).toBeVisible();

    // Into the filter and back out to the list, which is the entry point the
    // options page advertises. The filter matches loaded entries, and docs/
    // is collapsed on arrival, so this filters on what is actually there.
    // Each step waits for the state it depends on. Typing into a field that
    // has not taken focus yet, or arrowing into a list still re-rendering
    // under the filter, made this fail about one run in ten.
    await page.keyboard.press('/');
    const filter = page.getByLabel('Filter files by name');
    await expect(filter).toBeFocused();

    await page.keyboard.type('doc');
    await expect(filter).toHaveValue('doc');
    await expect(page.locator('[role="treeitem"]', { hasText: 'docs' })).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('role')))
      .toBe('tree');

    // Escape from inside the tree clears the filter, which is what the
    // shortcut list promises and what leaves the whole folder reachable
    // again without touching the field.
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Filter files by name')).toHaveValue('');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // open docs/
    await expect(
      page.locator('[role="treeitem"]', { hasText: 'guide.md' }),
    ).toBeVisible();
    await page.keyboard.press('ArrowRight'); // step into it
    await page.keyboard.press('Enter');
    await expect(page.locator('.mw-doc h1')).toHaveText('Guide');

    await page.keyboard.press('Escape');
    await expect(page.locator('main.mw-main')).toBeFocused();
  });

  test('the tree is announced as a tree, with the cursor named', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // Not a screen reader, but it is what a screen reader is handed. A tree
    // whose rows arrive as anonymous groups reads as nothing at all.
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(`${fileUrl(root)}/`);
    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await tree.focus();
    await page.keyboard.press('Home');

    // Not a screen reader, but it is exactly what one is handed.
    const snapshot = await tree.ariaSnapshot();
    expect(snapshot).toContain('tree "Files"');

    const rows = snapshot
      .split(String.fromCharCode(10))
      .filter((line) => line.includes('treeitem'));
    expect(rows.length, 'rows reach assistive technology').toBeGreaterThan(0);
    for (const row of rows) {
      // A row with no accessible name reads as nothing at all.
      expect(row, 'every row carries a name').toMatch(/treeitem "[^"]+"/);
    }

    const current = await tree.getAttribute('aria-activedescendant');
    expect(current).toBeTruthy();
    await expect(page.locator(`#${current}`)).toHaveCount(1);
  });

  test('the document has landmarks and a way past the sidebar', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/README.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await expect(page.locator('nav[aria-label="Files"]')).toHaveCount(1);
    await expect(page.locator('main#mw-main')).toHaveCount(1);

    // The skip link has to move focus, not merely scroll: Tab from there
    // must continue inside the document.
    await page.keyboard.press('Tab');
    const skip = page.locator('.mw-skip-link');
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main.mw-main')).toBeFocused();
  });
});

/** Relative luminance of a `rgb(r, g, b)` string, good enough to compare two. */
function luminance(color: string): number {
  const [r = 0, g = 0, b = 0] = (color.match(/\d+/g) ?? []).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
