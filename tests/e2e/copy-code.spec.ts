import { expect, test } from './fixtures';

/**
 * Copying a code block.
 *
 * The clipboard itself was checked before this was built: a `file://` page
 * is a secure context and `navigator.clipboard.writeText` resolves there.
 * What these drive is everything around it — that the button reaches both
 * highlighted and unhighlighted blocks, that it survives the highlighter
 * replacing the elements underneath it, and above all that what lands on
 * the clipboard is the code and nothing else.
 */

const SHELL = 'pnpm install\npnpm dev';
const DOC = [
  '# Commands',
  '```sh',
  SHELL,
  '```',
  'Some prose between them.',
  '```notalanguage',
  'plain block, nothing to highlight',
  '```',
].join('\n');

/**
 * What is actually on the clipboard, read back through the page.
 *
 * Line endings are normalised because the system clipboard is not ours to
 * choose. Windows hands back CRLF for text written as LF; CI runs on Linux,
 * which does not. Asserting either literal would pass on one machine and
 * fail on the other for a product that is behaving correctly.
 */
const clipboard = async (page: import('@playwright/test').Page) =>
  (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');

test.describe('copy code', () => {
  test.beforeEach(async ({ hasFileAccess, context }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('copies the code, and nothing but the code', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'doc.md': DOC });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await page.waitForSelector('pre.shiki', { timeout: 25_000 }).catch(() => {});

    await page.locator('.mw-code-block').first().hover();
    await page.locator('.mw-code-copy').first().click();

    /*
     * The trap this exists for: the button lives next to the <pre>, and
     * reading `pre.textContent` instead of the <code> inside it would put
     * the word "Copy code" on the clipboard along with the commands.
     */
    expect(await clipboard(page)).toBe(SHELL);
  });

  test('reaches a block the highlighter did not touch', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'doc.md': DOC });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await page.waitForSelector('pre.shiki', { timeout: 25_000 }).catch(() => {});

    // Both blocks have one: the highlighted one and the unknown language.
    await expect(page.locator('.mw-code-copy')).toHaveCount(2);

    await page.locator('.mw-code-block').nth(1).hover();
    await page.locator('.mw-code-copy').nth(1).click();
    expect(await clipboard(page)).toBe('plain block, nothing to highlight');
  });

  test('survives the highlighter replacing the block', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // The buttons are added before highlighting and again after, because
    // Shiki swaps the <pre> out and takes the first set with it.
    const root = await makeTree({ 'doc.md': DOC });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await page.waitForSelector('pre.shiki', { timeout: 25_000 }).catch(() => {});
    await page.waitForTimeout(500);

    // One per block, not two: the pass has to be idempotent.
    await expect(page.locator('.mw-code-copy')).toHaveCount(2);
    await expect(page.locator('.mw-code-block')).toHaveCount(2);
  });

  test('says it copied, then goes back', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree({ 'doc.md': DOC });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    const button = page.locator('.mw-code-copy').first();
    await page.locator('.mw-code-block').first().hover();
    await button.click();
    await expect(button).toHaveText('Copied');
    await expect(button).toHaveText('Copy code', { timeout: 5000 });
  });

  test('can be reached and used from the keyboard', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'doc.md': DOC });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    // A control only a mouse can find is not a control everyone has.
    const button = page.locator('.mw-code-copy').first();
    await button.focus();
    await expect(button).toBeFocused();
    await expect(button).toBeVisible();
    await page.keyboard.press('Enter');
    expect(await clipboard(page)).toBe(SHELL);
  });

  test('is not in the way on paper', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree({ 'doc.md': DOC });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.mw-code-copy').first()).toBeHidden();
  });
});
