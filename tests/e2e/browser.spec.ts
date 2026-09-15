import { expect, test } from './fixtures';

/**
 * Phase 3 in a real browser: the sidebar, relative navigation, and taking over
 * Chrome's own directory listing.
 */
test.describe('file browser', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  const TREE = {
    'readme.md': '# Readme\n\nSee [the guide](docs/guide.md).\n',
    'docs/guide.md':
      '# Guide\n\nBack to [readme](../readme.md).\n\nAlso [api](api/ref.md).\n',
    'docs/api/ref.md': '# Reference\n\nUp to [guide](../guide.md).\n',
    'docs/index.md': '# Docs Index\n',
    'notes.txt': 'plain\n',
    'node_modules/junk/a.md': '# Junk\n',
    '.hidden/secret.md': '# Secret\n',
    '設定.md': '# 設定\n',
  };

  test('shows the containing folder beside a document (FR-15)', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/readme.md`));

    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await expect(tree.getByText('readme.md', { exact: true })).toBeVisible();
    await expect(tree.getByText('docs', { exact: true })).toBeVisible();
    await expect(tree.getByText('設定.md', { exact: true })).toBeVisible();
  });

  test('hides noise directories and dotfiles by default (FR-20)', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/readme.md`));

    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await expect(tree.getByText('node_modules', { exact: true })).toHaveCount(0);
    await expect(tree.getByText('.hidden', { exact: true })).toHaveCount(0);
  });

  test('opens a sibling document from the sidebar', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/readme.md`));

    await page.locator('[role="tree"]').getByText('設定.md', { exact: true }).click();
    await expect(page.locator('.mw-doc h1')).toHaveText('設定');
  });

  test('expands a directory on demand, not eagerly (FR-19)', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/readme.md`));

    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    // Collapsed: the child is not in the DOM at all.
    await expect(tree.getByText('guide.md', { exact: true })).toHaveCount(0);

    await tree.getByText('docs', { exact: true }).click();
    await expect(tree.getByText('guide.md', { exact: true })).toBeVisible();
  });

  test('filters the tree by name (FR-17)', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/readme.md`));

    const filter = page.getByLabel('Filter files by name');
    await filter.fill('readme');

    const tree = page.locator('[role="tree"]');
    await expect(tree.getByText('readme.md', { exact: true })).toBeVisible();
    await expect(tree.getByText('notes.txt', { exact: true })).toHaveCount(0);

    await filter.fill('');
    await expect(tree.getByText('notes.txt', { exact: true })).toBeVisible();
  });

  test('reveals a match inside a collapsed directory that was loaded', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/readme.md`));

    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();

    // Load docs/ and docs/api/, then collapse docs again.
    await tree.getByText('docs', { exact: true }).click();
    await tree.getByText('api', { exact: true }).click();
    await expect(tree.getByText('ref.md', { exact: true })).toBeVisible();
    await tree.getByText('docs', { exact: true }).click();
    await expect(tree.getByText('ref.md', { exact: true })).toHaveCount(0);

    // The filter reaches back into the collapsed subtree.
    await page.getByLabel('Filter files by name').fill('ref');
    await expect(tree.getByText('ref.md', { exact: true })).toBeVisible();
  });

  test('filter reaches only folders already loaded, by design (FR-19)', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree(TREE);
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/readme.md`));

    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();

    // docs/ has never been expanded, so its contents were never fetched.
    // Searching them would mean walking the tree, which is the thing that
    // makes a node_modules folder hang the sidebar. See open question Q12.
    await page.getByLabel('Filter files by name').fill('guide');
    await expect(tree.getByText('guide.md', { exact: true })).toHaveCount(0);
  });
});

test.describe('relative navigation (FR-10, FR-11)', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('follows a relative link into a subdirectory', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'readme.md': '# Readme\n\nSee [the guide](docs/guide.md).\n',
      'docs/guide.md': '# Guide\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/readme.md`));

    await page.locator('.mw-doc').getByRole('link', { name: 'the guide' }).click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Guide');
  });

  test('follows a parent-relative link back out', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'readme.md': '# Readme\n',
      'docs/guide.md': '# Guide\n\nBack to [readme](../readme.md).\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/docs/guide.md`));

    await page.locator('.mw-doc').getByRole('link', { name: 'readme' }).click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Readme');
  });

  test('follows a relative link carrying a fragment', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const filler = Array.from({ length: 60 }, (_, i) => `Para ${i}`).join('\n\n');
    const root = await makeTree({
      'a.md': '# A\n\nGo to [target](b.md#deep-section).\n',
      'b.md': `# B\n\n${filler}\n\n## Deep Section\n\nHere.\n`,
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a.md`));

    await page.locator('.mw-doc').getByRole('link', { name: 'target' }).click();
    await expect(page.locator('#deep-section')).toBeVisible();
  });

  test('resolves a relative image', async ({ context, makeTree, fileUrl }) => {
    // A 1x1 transparent GIF.
    const gif = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64',
    ).toString('binary');

    const root = await makeTree({
      'doc.md': '# Doc\n\n![a picture](img/pic.gif)\n',
      'img/pic.gif': gif,
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));

    const img = page.locator('.mw-doc img');
    await expect(img).toBeVisible();
    // Loaded through the source, so the src is rewritten to a data URL.
    await expect(img).not.toHaveClass(/mw-image-missing/);
  });

  test('marks a missing image without breaking the document', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'doc.md': '# Doc\n\n![gone](img/missing.png)\n\nText after the image.\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));

    await expect(page.locator('.mw-doc')).toContainText('Text after the image.');
    await expect(page.locator('.mw-doc img')).toHaveClass(/mw-image-missing/);
  });
});

test.describe('directory takeover (FR-16)', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('replaces Chrome listing with the file browser', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'readme.md': '# Readme\n',
      'docs/guide.md': '# Guide\n',
    });
    const page = await context.newPage();
    await page.goto(`${fileUrl(root)}/`);

    // Chrome's own listing must be gone, replaced by the tree.
    await expect(page.locator('.mw-root')).toBeVisible();
    await expect(page.locator('[role="tree"]')).toBeVisible();
    await expect(page.locator('[role="tree"]').getByText('readme.md')).toBeVisible();
  });

  test('opens a document from the taken-over listing', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'readme.md': '# Readme\n' });
    const page = await context.newPage();
    await page.goto(`${fileUrl(root)}/`);

    await page.locator('[role="tree"]').getByText('readme.md').click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Readme');
  });

  test('offers the folder index document when there is one (FR-14)', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'README.md': '# Index Doc\n',
      'other.md': '# Other\n',
    });
    const page = await context.newPage();
    await page.goto(`${fileUrl(root)}/`);

    await page.getByRole('button', { name: /Open README\.md/ }).click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Index Doc');
  });

  test('handles an empty folder without claiming an error', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'placeholder/keep.md': '# Keep\n' });
    const page = await context.newPage();
    await page.goto(`${fileUrl(root)}/placeholder/`);

    await expect(page.locator('.mw-root')).toBeVisible();
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });
});

test.describe('keyboard navigation (NFR-7)', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('moves through the tree and opens with Enter', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'a.md': '# Alpha\n',
      'b.md': '# Beta\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a.md`));

    const tree = page.locator('[role="tree"]');
    await expect(tree).toBeVisible();
    await tree.focus();

    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page.locator('.mw-doc h1')).toHaveText('Beta');
  });

  test('exposes the tree with correct ARIA roles', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'a.md': '# A\n', 'docs/b.md': '# B\n' });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a.md`));

    const tree = page.locator('[role="tree"]');
    await expect(tree).toHaveAttribute('aria-label', 'Files');

    const dirItem = page.locator('[role="treeitem"]', { hasText: 'docs' }).first();
    await expect(dirItem).toHaveAttribute('aria-expanded', 'false');
    await dirItem.click();
    await expect(dirItem).toHaveAttribute('aria-expanded', 'true');
  });
});
