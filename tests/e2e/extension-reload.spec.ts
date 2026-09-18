import { expect, test } from './fixtures';

/**
 * What an already-open page does once its extension is gone.
 *
 * A content script outlives the extension that injected it. Reloading the
 * extension, updating it, or letting Chrome update it from the store leaves
 * every page that is already open running the old script against a dead
 * connection, and the next call into any extension API throws "Extension
 * context invalidated."
 *
 * A user reported exactly that from a rendered document, and it is also one
 * of the first things a store reviewer sees, because Chrome collects it on
 * the extension's own details page.
 *
 * The right behaviour is silence: the document is already rendered and still
 * readable, and what stops working -- the sidebar, settings, the reading
 * position -- comes back on a reload of the page.
 */

const LONG = `# Orphaned\n\n${Array.from(
  { length: 200 },
  (_, i) => `Paragraph number ${i}.`,
).join('\n\n')}\n`;

test.describe('after the extension is reloaded', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('a page left open raises nothing', async ({
    context,
    serviceWorker,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'long.md': LONG });
    const page = await context.newPage();

    // pageerror covers unhandled rejections too: Chrome reports those through
    // the same channel, and a `void send(...)` that nobody caught is exactly
    // the shape this is guarding against.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(fileUrl(`${root}/long.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    // Pull the extension out from under the page. The call never returns --
    // the worker it runs in is what is being torn down.
    void serviceWorker.evaluate(() => chrome.runtime.reload()).catch(() => {});

    // Wait for it to have actually happened rather than guessing at a delay:
    // the old worker stops answering once the reload lands.
    await expect
      .poll(
        async () => {
          try {
            await serviceWorker.evaluate(() => chrome.runtime.id);
            return 'alive';
          } catch {
            return 'gone';
          }
        },
        { timeout: 15_000 },
      )
      .toBe('gone');

    // Now use the page the way somebody who did not notice would.
    await page.locator('.mw-main').evaluate((el) => {
      el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * 0.5);
    });
    // Longer than the scroll-write debounce, which is what reported the bug.
    await page.waitForTimeout(900);

    await page.getByRole('button', { name: /^Theme:/ }).click();
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await page.waitForTimeout(300);

    expect(errors).toEqual([]);

    // And it is still a readable document, not a blank page.
    await expect(page.locator('.mw-doc h1')).toHaveText('Orphaned');
  });

  test('says so, rather than leaving a sidebar that silently does nothing', async ({
    context,
    serviceWorker,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'long.md': LONG });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/long.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    // Nothing to say while everything works.
    await expect(page.getByRole('status')).toHaveCount(0);

    void serviceWorker.evaluate(() => chrome.runtime.reload()).catch(() => {});
    await expect
      .poll(
        async () => {
          try {
            await serviceWorker.evaluate(() => chrome.runtime.id);
            return 'alive';
          } catch {
            return 'gone';
          }
        },
        { timeout: 15_000 },
      )
      .toBe('gone');

    // Polled every five seconds, so this has to be allowed to take one.
    await expect(page.getByText('Markdown Workspace was updated')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Reload this page' })).toBeVisible();

    // The document is not hidden behind the notice.
    await expect(page.locator('.mw-doc h1')).toHaveText('Orphaned');
  });
});
