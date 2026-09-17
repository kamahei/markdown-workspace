import { expect, test } from './fixtures';

/**
 * Resizing the sidebar (FR-30).
 *
 * The CSS for the handle shipped in the first release with no component
 * behind it, and FR-30 has always claimed the width is remembered, so until
 * now the sidebar could not be resized at all.
 *
 * Both halves are driven here. The keyboard half is not a nicety: a
 * separator that only responds to dragging leaves the width unreachable for
 * anyone not using a pointer.
 */

const TREE = { 'a.md': '# A\n', 'b.md': '# B\n' };

const widthOf = (page: import('@playwright/test').Page) =>
  page.locator('.mw-sidebar').evaluate((el) => el.getBoundingClientRect().width);

test.describe('sidebar width', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('drags wider and narrower', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a.md`));
    await expect(page.locator('.mw-tree')).toBeVisible();

    const before = await widthOf(page);
    const handle = page.locator('.mw-resizer');
    const box = (await handle.boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    const after = await widthOf(page);
    expect(after).toBeGreaterThan(before + 80);
  });

  test('moves with the arrow keys, which is the half a pointer hides', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a.md`));
    await expect(page.locator('.mw-tree')).toBeVisible();

    const handle = page.locator('.mw-resizer');
    await handle.focus();
    await expect(handle).toBeFocused();

    // Polled, not read once: a key press returns when the event is
    // dispatched, which is before Preact has rendered the new width.
    const before = await widthOf(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => widthOf(page)).toBeGreaterThan(before);

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    // Three steps back from two steps forward is one step narrower. This
    // fails if a press lands in the same frame as the one before it and is
    // computed from a stale width, which is how the first version behaved.
    await expect.poll(() => widthOf(page)).toBeLessThan(before);

    // Home and End reach the ends without holding a key down.
    await page.keyboard.press('End');
    await expect.poll(() => widthOf(page)).toBeGreaterThan(before);
    await page.keyboard.press('Home');
    await expect.poll(() => widthOf(page)).toBeLessThan(before);
  });

  test('refuses to go outside its bounds', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a.md`));
    await expect(page.locator('.mw-tree')).toBeVisible();

    const handle = page.locator('.mw-resizer');
    await handle.focus();

    // Far past either end, then check the separator reports a value inside
    // the range it advertises rather than a sidebar of nothing or of
    // everything.
    for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowLeft');
    expect(await widthOf(page)).toBeGreaterThanOrEqual(150);
    await expect(handle).toHaveAttribute('aria-valuenow', '150');

    for (let i = 0; i < 60; i += 1) await page.keyboard.press('ArrowRight');
    expect(await widthOf(page)).toBeLessThanOrEqual(600);
    await expect(handle).toHaveAttribute('aria-valuenow', '600');
  });

  test('is still that wide on the next document, and the next session', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a.md`));
    await expect(page.locator('.mw-tree')).toBeVisible();

    await page.locator('.mw-resizer').focus();
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
    await expect.poll(() => widthOf(page)).toBeGreaterThan(300);
    const chosen = await widthOf(page);
    // The write is debounced; give it time to land before navigating.
    await page.waitForTimeout(500);

    // Reader mode loads a new page for every document.
    await page.goto(fileUrl(`${root}/b.md`));
    await expect(page.locator('.mw-tree')).toBeVisible();
    await expect.poll(() => widthOf(page)).toBeCloseTo(chosen, 0);

    // And in a tab that never saw the drag: this is storage, not session
    // state, which is what FR-30 asks for.
    const fresh = await context.newPage();
    await fresh.goto(fileUrl(`${root}/a.md`));
    await expect(fresh.locator('.mw-tree')).toBeVisible();
    await expect.poll(() => widthOf(fresh)).toBeCloseTo(chosen, 0);
  });

  test('announces itself as an adjustable separator', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a.md`));
    await expect(page.locator('.mw-tree')).toBeVisible();

    const handle = page.getByRole('separator', { name: 'Resize the sidebar' });
    await expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    await expect(handle).toHaveAttribute('aria-valuemin', '150');
    await expect(handle).toHaveAttribute('aria-valuemax', '600');
  });

  test('goes away with the sidebar', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a.md`));
    await expect(page.locator('.mw-tree')).toBeVisible();

    // A handle for a hidden sidebar is a tab stop that does nothing.
    await page.keyboard.press('Control+b');
    await expect(page.locator('.mw-sidebar')).toBeHidden();
    await expect(page.locator('.mw-resizer')).toHaveCount(0);
  });
});
