import { expect, test } from './fixtures';

/**
 * Reading state and live settings (FR-26, FR-30).
 *
 * These exist because both features were written and then never connected to
 * the surfaces that use them. Everything typechecked and every other test
 * passed; the features simply did nothing. A test that drives the real
 * behaviour is the only thing that catches that.
 */

const LONG = (title: string) =>
  `# ${title}\n\n${Array.from({ length: 200 }, (_, i) => `Paragraph number ${i}.`).join(
    '\n\n',
  )}\n\n## The End\n`;

test.describe('reading position (FR-30)', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('restores where you stopped reading', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree({ 'long.md': LONG('Long Document') });
    const page = await context.newPage();
    const url = fileUrl(`${root}/long.md`);

    await page.goto(url);
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await page.locator('.mw-main').evaluate((el) => {
      el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * 0.6);
    });
    const before = await page.locator('.mw-main').evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(200);

    // The write is debounced; give it time to land before navigating away.
    await page.waitForTimeout(900);

    await page.goto('about:blank');
    await page.goto(url);
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await expect
      .poll(async () => page.locator('.mw-main').evaluate((el) => el.scrollTop), {
        timeout: 8000,
      })
      .toBeGreaterThan(before * 0.7);
  });

  test('keeps each document at its own position', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'a.md': LONG('Alpha'), 'b.md': LONG('Beta') });
    const page = await context.newPage();

    await page.goto(fileUrl(`${root}/a.md`));
    await expect(page.locator('.mw-doc h1')).toHaveText('Alpha');
    await page.locator('.mw-main').evaluate((el) => {
      el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * 0.8);
    });
    await page.waitForTimeout(900);

    // b.md has never been scrolled, so it must open at the top rather than
    // inheriting a's position.
    await page.goto(fileUrl(`${root}/b.md`));
    await expect(page.locator('.mw-doc h1')).toHaveText('Beta');
    await page.waitForTimeout(700);
    expect(await page.locator('.mw-main').evaluate((el) => el.scrollTop)).toBe(0);
  });

  test('starts a never-opened document at the top', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'fresh.md': LONG('Fresh') });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/fresh.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await page.waitForTimeout(700);
    expect(await page.locator('.mw-main').evaluate((el) => el.scrollTop)).toBe(0);
  });
});

test.describe('live settings (FR-26)', () => {
  test('a change in options reaches an open document without a reload', async ({
    context,
    extensionId,
    makeTree,
    fileUrl,
    hasFileAccess,
  }) => {
    test.skip(!hasFileAccess, 'needs file:// access');

    const root = await makeTree({ 'doc.md': '# Doc\n\nSome text.\n' });

    const reader = await context.newPage();
    await reader.goto(fileUrl(`${root}/doc.md`));
    await expect(reader.locator('.mw-doc h1')).toBeVisible();
    await expect(reader.locator('html')).not.toHaveAttribute('data-theme', 'dark');

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByLabel('Theme').selectOption('dark');

    // The open document must follow, with no reload of any kind.
    await expect(reader.locator('html')).toHaveAttribute('data-theme', 'dark', {
      timeout: 8000,
    });
  });

  test('a rendering feature toggled off takes effect in an open document', async ({
    context,
    extensionId,
    makeTree,
    fileUrl,
    hasFileAccess,
  }) => {
    test.skip(!hasFileAccess, 'needs file:// access');

    const root = await makeTree({ 'doc.md': '# Doc\n\nMath: $E = mc^2$\n' });

    const reader = await context.newPage();
    await reader.goto(fileUrl(`${root}/doc.md`));
    await expect(reader.locator('.mw-doc .katex').first()).toBeVisible({
      timeout: 15_000,
    });

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByLabel('Math (KaTeX)').uncheck();

    // Re-rendered without math, so the source shows as written.
    await expect(reader.locator('.mw-doc .katex')).toHaveCount(0, { timeout: 8000 });
    await expect(reader.locator('.mw-doc')).toContainText('E = mc^2');
  });

  test('the workspace follows a settings change too', async ({
    context,
    extensionId,
  }) => {
    const workspace = await context.newPage();
    await workspace.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(workspace.locator('.mw-root')).toBeVisible();

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByLabel('Theme').selectOption('dark');

    await expect(workspace.locator('html')).toHaveAttribute('data-theme', 'dark', {
      timeout: 8000,
    });
  });
});
