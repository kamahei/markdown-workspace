import { writeFile } from 'node:fs/promises';
import { expect, test } from './fixtures';

/**
 * Captures what Chrome actually returns for a file:// directory, so the
 * listing parser is written against reality rather than a guess
 * (architecture.md C3, open question Q1).
 */
test('capture a real Chrome directory listing', async ({
  serviceWorker,
  hasFileAccess,
  makeTree,
  fileUrl,
}) => {
  test.skip(!hasFileAccess, 'needs file:// access');

  const root = await makeTree({
    'readme.md': '# Readme\n',
    'notes.txt': 'text\n',
    'my notes/deep.md': '# Deep\n',
    'docs/guide.md': '# Guide\n',
    '設定.md': '# 設定\n',
  });

  const url = `${fileUrl(root)}/`;
  const html = await serviceWorker.evaluate(async (u: string) => {
    const res = await fetch(u);
    return res.text();
  }, url);

  await writeFile('tests/fixtures/chrome-directory-listing.html', html, 'utf8');
  console.log('--- CAPTURED LISTING (first 3000 chars) ---');
  console.log(html.slice(0, 3000));
  console.log('--- length:', html.length);

  expect(html.length).toBeGreaterThan(0);
});
