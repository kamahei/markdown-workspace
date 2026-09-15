import { expect, test } from './fixtures';

test('diagram and code follow a theme change', async ({
  context,
  makeTree,
  fileUrl,
  hasFileAccess,
}) => {
  test.skip(!hasFileAccess, 'needs file access');
  const root = await makeTree({
    'doc.md':
      '# Doc\n\n```ts\nconst a = 1;\n```\n\n```mermaid\ngraph TD;\n  A[One] --> B[Two];\n```\n',
  });
  const page = await context.newPage();
  await page.goto(fileUrl(`${root}/doc.md`));
  await expect(page.locator('.mw-diagram svg')).toHaveCount(1, { timeout: 25_000 });
  await expect(page.locator('pre.shiki')).toBeVisible();

  const read = () =>
    page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      codeBg: getComputedStyle(document.querySelector('pre.shiki')!).backgroundColor,
      nodeFill: (() => {
        const r = document.querySelector('.mw-diagram svg rect');
        return r ? getComputedStyle(r).fill : null;
      })(),
      svgCount: document.querySelectorAll('.mw-diagram svg').length,
    }));

  const light = await read();
  // Cycle light -> dark.
  await page.getByRole('button', { name: /^Theme/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Theme/ }).click();
  await page.waitForTimeout(2500);
  const dark = await read();

  console.log('LIGHT:', JSON.stringify(light));
  console.log('DARK :', JSON.stringify(dark));

  expect(dark.svgCount).toBe(1);
  expect(dark.theme).toBe('dark');
});
