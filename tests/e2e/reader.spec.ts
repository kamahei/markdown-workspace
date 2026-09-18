import { SETTINGS_SCHEMA_VERSION } from '../../src/core/settings';
import { expect, test } from './fixtures';

/**
 * Validates architecture.md C1 with a real browser: Chrome renders a file://
 * Markdown file as plain text, and a content script can take that page over.
 *
 * Every test here needs file:// access, which Chrome only grants through a
 * manual toggle. When the harness cannot arrange it the tests skip with a
 * clear reason rather than failing as if the feature were broken.
 */
test.describe('reader mode on file://', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(
      !hasFileAccess,
      'Chrome has not granted this extension file:// access; enable "Allow access to file URLs".',
    );
  });

  test('renders a Markdown file in place', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree({
      'readme.md': '# Hello World\n\nSome **bold** text.\n\n- one\n- two\n',
    });

    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/readme.md`));

    await expect(page.locator('.mw-doc h1')).toHaveText('Hello World');
    await expect(page.locator('.mw-doc strong')).toHaveText('bold');
    await expect(page.locator('.mw-doc li')).toHaveCount(2);
    // The original plain-text view must be gone, not merely covered.
    await expect(page.locator('.mw-root')).toBeVisible();
  });

  test('never shows the raw source before rendering', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'doc.md': '# Heading\n\nBody text.\n' });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));

    await expect(page.locator('.mw-doc')).toBeVisible();
    // Chrome's own <pre> stays in the DOM as a rollback path, but must not be
    // visible: a flash of raw Markdown is the defect this guards.
    const pre = page.locator('body > pre');
    if ((await pre.count()) > 0) {
      await expect(pre.first()).toBeHidden();
    }
  });

  test('toggles between rendered and raw source', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const source = '# Title\n\nParagraph with `code`.\n';
    const root = await makeTree({ 'doc.md': source });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));

    await expect(page.locator('.mw-doc')).toBeVisible();

    await page.getByRole('button', { name: /Markdown source/i }).click();
    await expect(page.locator('.mw-raw')).toHaveText(source);
    await expect(page.locator('.mw-doc')).toHaveCount(0);

    await page.getByRole('button', { name: /rendered document/i }).click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Title');
  });

  test('recognizes every Markdown extension', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree({
      'a.md': '# md\n',
      'b.markdown': '# markdown\n',
      'c.mdown': '# mdown\n',
      'd.mkd': '# mkd\n',
      'e.mkdn': '# mkdn\n',
    });

    const page = await context.newPage();
    for (const [file, heading] of [
      ['a.md', 'md'],
      ['b.markdown', 'markdown'],
      ['c.mdown', 'mdown'],
      ['d.mkd', 'mkd'],
      ['e.mkdn', 'mkdn'],
    ]) {
      await page.goto(fileUrl(`${root}/${file}`));
      await expect(page.locator('.mw-doc h1')).toHaveText(heading!);
    }
  });

  test('renders .mdx where the browser displays it rather than downloading', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // Whether a local file is displayed or downloaded is the operating
    // system's call, not the extension's: Chrome asks the OS for the type.
    // `.mdx` is unknown to the shared mime database on a bare Linux runner, so
    // Chrome downloads it and no page ever exists for a content script to act
    // on. It renders normally on a desktop that knows the type.
    //
    // There is no fix available. declarativeNetRequest cannot touch file://
    // responses, so the extension cannot correct the type the way it does for
    // an opted-in web origin. This asserts the half that is ours: when the
    // browser does produce a page, the extension renders it.
    const root = await makeTree({ 'f.mdx': '# mdx\n' });
    const page = await context.newPage();

    const downloaded = await page
      .goto(fileUrl(`${root}/f.mdx`))
      .then(() => false)
      .catch((err: Error) => /download/i.test(err.message));

    test.skip(downloaded, 'this system downloads .mdx rather than displaying it');
    await expect(page.locator('.mw-doc h1')).toHaveText('mdx');
  });

  test('leaves non-Markdown files alone', async ({ context, makeTree, fileUrl }) => {
    const root = await makeTree({
      'notes.txt': '# Not markdown\n\nJust text.\n',
      'page.html': '<html><body><h1>A real page</h1></body></html>',
    });

    const page = await context.newPage();

    await page.goto(fileUrl(`${root}/notes.txt`));
    await expect(page.locator('.mw-root')).toHaveCount(0);
    await expect(page.locator('body > pre')).toContainText('Not markdown');

    await page.goto(fileUrl(`${root}/page.html`));
    await expect(page.locator('.mw-root')).toHaveCount(0);
    await expect(page.locator('h1')).toHaveText('A real page');
  });

  test('renders an empty file as an empty document, not an error', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({ 'empty.md': '' });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/empty.md`));

    await expect(page.locator('.mw-root')).toBeVisible();
    // An empty document really is empty, so the article has zero height and
    // counts as hidden. What matters is that it exists and nothing failed.
    await expect(page.locator('.mw-doc')).toBeAttached();
    await expect(page.locator('.mw-doc')).toBeEmpty();
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });

  test('scrolls to a heading fragment on initial load', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const filler = Array.from({ length: 80 }, (_, i) => `Line ${i}`).join('\n\n');
    const root = await makeTree({
      'long.md': `# Top\n\n${filler}\n\n## Target Section\n\nHere.\n`,
    });

    const page = await context.newPage();
    await page.goto(`${fileUrl(`${root}/long.md`)}#target-section`);

    await expect(page.locator('#target-section')).toBeVisible();
    const scrolled = await page.locator('.mw-main').evaluate((el) => el.scrollTop);
    expect(scrolled).toBeGreaterThan(0);
  });

  test('shows front matter as metadata rather than body text', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const root = await makeTree({
      'fm.md': '---\ntitle: My Doc\nauthor: Someone\n---\n\n# Body\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/fm.md`));

    await expect(page.locator('.mw-frontmatter')).toContainText('title');
    await expect(page.locator('.mw-frontmatter')).toContainText('My Doc');
    await expect(page.locator('.mw-doc')).not.toContainText('title: My Doc');
  });
});

test.describe('extension surfaces', () => {
  test('loads with a service worker and the expected permissions', async ({
    serviceWorker,
    extensionId,
  }) => {
    expect(extensionId).toMatch(/^[a-z]{32}$/);

    const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toContain('storage');
    expect(manifest.host_permissions).toContain('file:///*');

    // NFR-5: no broad host pattern may be granted at install.
    expect(manifest.host_permissions ?? []).not.toContain('<all_urls>');
    expect(manifest.host_permissions ?? []).not.toContain('*://*/*');
  });

  test('opens the workspace page', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('body')).toBeVisible();
  });

  test('starts with no allowed origins (FR-22)', async ({ context, extensionId }) => {
    // Asked from a page, not the service worker: a worker's sendMessage does
    // not reach its own onMessage listener.
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);

    const settings = await page.evaluate(
      async () => await chrome.runtime.sendMessage({ type: 'getSettings' }),
    );
    expect(settings.allowedOrigins).toEqual([]);
    // Against the constant, not a literal: a schema bump is a routine
    // event and should not fail a test about allowed origins.
    expect(settings.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
  });
});
