import { writeFile } from 'node:fs/promises';
import { expect, test } from './fixtures';

/**
 * Captures what Chrome actually returns for a file:// directory, so the
 * listing parser is written against reality rather than a guess
 * (architecture.md C3, open question Q1).
 */
// Regenerate with: CAPTURE_FIXTURES=1 pnpm test:e2e -g "capture a real"
// Skipped by default so an ordinary run does not rewrite a committed
// fixture out from under the unit tests.
test('capture a real Chrome directory listing', async ({
  serviceWorker,
  hasFileAccess,
  makeTree,
  fileUrl,
}) => {
  test.skip(!process.env.CAPTURE_FIXTURES, 'fixture capture is opt-in');
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

  // The capture embeds the temporary directory it was taken from, which on
  // a developer machine contains their username. This fixture is committed
  // to a public repository, so the path is replaced with a neutral one. Only
  // the page header shows it; the parser is told the root separately.
  const sanitized = html.replace(
    /start\("[^"]*"\)/,
    'start("/tmp/markdown-workspace-fixture/")',
  );
  expect(sanitized).not.toContain(root);

  await writeFile('tests/fixtures/chrome-directory-listing.html', sanitized, 'utf8');
  console.log('--- CAPTURED LISTING (first 3000 chars) ---');
  console.log(sanitized.slice(0, 3000));
  console.log('--- length:', sanitized.length);

  expect(sanitized.length).toBeGreaterThan(0);
});
