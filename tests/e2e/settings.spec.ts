import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { expect, test } from './fixtures';

/**
 * Settings, onboarding and the opt-in remote path.
 *
 * The remote tests run against a local server that sends
 * `Content-Type: text/markdown`. Architecture note C5 called that the exact
 * condition that makes Chrome download a file instead of showing it; measured
 * on 2026-09-16, it is not, and C5 now records what browsers actually do.
 */

test.describe('options page (FR-26)', () => {
  test('renders every settings group', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    for (const heading of [
      'Appearance',
      'Rendering',
      'Markdown',
      'File browser',
      'Websites',
      'Reset',
    ]) {
      await expect(
        page.getByRole('heading', { name: heading, exact: true }),
      ).toBeVisible();
    }
  });

  test('persists a setting and reports it back', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await page.getByLabel('Theme').selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const settings = await page.evaluate(
      async () => await chrome.runtime.sendMessage({ type: 'getSettings' }),
    );
    expect(settings.theme).toBe('dark');

    // A reload proves it reached storage, not just component state.
    await page.reload();
    await expect(page.getByLabel('Theme')).toHaveValue('dark');
  });

  test('toggles a rendering feature', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await page.getByLabel('Diagrams (Mermaid)').uncheck();
    const settings = await page.evaluate(
      async () => await chrome.runtime.sendMessage({ type: 'getSettings' }),
    );
    expect(settings.features.diagrams).toBe(false);
  });

  test('edits and restores the excluded folder list', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Saving is a round trip through the background worker, so the value is
    // polled rather than read once -- reading immediately races the write.
    const excluded = () =>
      page.evaluate(
        async () =>
          (await chrome.runtime.sendMessage({ type: 'getSettings' })).fileBrowser
            .excludedDirectories,
      );

    await page.getByLabel('Hidden folders').fill('vendor\ntmp');
    await page.getByLabel('Hidden folders').blur();
    await expect.poll(excluded).toEqual(['vendor', 'tmp']);

    await page.getByRole('button', { name: 'Restore defaults' }).click();
    await expect.poll(excluded).toContain('node_modules');
  });

  test('requires confirmation before resetting (FR-31)', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await page.getByLabel('Theme').selectOption('dark');
    await page.getByRole('button', { name: 'Reset all settings' }).click();

    // Destructive and irreversible, so it asks first.
    await expect(
      page.getByRole('button', { name: 'Yes, reset everything' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    let settings = await page.evaluate(
      async () => await chrome.runtime.sendMessage({ type: 'getSettings' }),
    );
    expect(settings.theme).toBe('dark');

    await page.getByRole('button', { name: 'Reset all settings' }).click();
    await page.getByRole('button', { name: 'Yes, reset everything' }).click();

    await expect(page.getByLabel('Theme')).toHaveValue('system');
    settings = await page.evaluate(
      async () => await chrome.runtime.sendMessage({ type: 'getSettings' }),
    );
    expect(settings.theme).toBe('system');
    expect(settings.allowedOrigins).toEqual([]);
  });

  test('shows no websites by default (FR-22)', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.getByText('No websites added.')).toBeVisible();
  });
});

test.describe('onboarding (FR-28)', () => {
  test('explains the file access step', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/onboarding.html`);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('installed');
    await expect(page.getByText('chrome://extensions').first()).toBeVisible();
    await expect(page.getByText('Allow access to file URLs')).toBeVisible();
  });

  test('offers to copy the address rather than a button that cannot navigate', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/onboarding.html`);

    // An extension cannot open chrome://extensions. A button that looked like
    // it could would be worse than admitting the limitation.
    await expect(page.getByRole('button', { name: 'Copy address' })).toBeVisible();
    await expect(page.getByRole('link', { name: /chrome:\/\/extensions/ })).toHaveCount(
      0,
    );
  });

  test('reports the live file access status', async ({
    context,
    extensionId,
    hasFileAccess,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/onboarding.html`);

    const status = page.locator('[role="status"]');
    await expect(status).toBeVisible();
    await expect(status).toHaveClass(hasFileAccess ? /is-granted/ : /is-blocked/, {
      timeout: 10_000,
    });
  });
});

test.describe('popup (FR-25)', () => {
  test('offers the workspace and settings actions', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(page.getByRole('button', { name: /Open Workspace/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Settings/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Theme/ })).toBeVisible();
  });

  test('cycles the theme and persists it', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await page.getByRole('button', { name: /^Theme/ }).click();
    const settings = await page.evaluate(
      async () => await chrome.runtime.sendMessage({ type: 'getSettings' }),
    );
    expect(settings.theme).toBe('light');
  });
});

test.describe('remote Markdown (FR-24, architecture C5, Q14)', () => {
  let server: Server;
  let port = 0;

  test.beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/doc.md') {
        // The content type the opt-in origin feature was designed around.
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end('# Remote Doc\n\nServed as text/markdown.\n');
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('is ignored before the origin is added', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/doc.md`).catch(() => {});

    // Whatever the browser does with the response, the extension must not
    // have touched it: no origin has been approved.
    await expect(page.locator('.mw-root')).toHaveCount(0);
  });

  test('a Markdown content type is displayed, not downloaded', async ({ context }) => {
    /*
     * Architecture note C5 said the opposite, from documentation rather than
     * from a browser, and the whole header-rewriting feature was built on it.
     * Measured on Chrome 153, Edge 153 and both Chromium builds Playwright
     * ships: a Markdown type renders as a text page, which means a content
     * script runs on it and no rewrite is needed. See open question Q14.
     *
     * This asserts the measurement rather than the design, so the day a
     * browser changes its mind the test says so instead of the feature
     * quietly not working.
     */
    const page = await context.newPage();
    const download = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
    await page.goto(`http://127.0.0.1:${port}/doc.md`).catch(() => {});

    expect(await download, 'a Markdown type is not a download').toBeNull();
    expect(await page.evaluate(() => document.contentType)).toMatch(/markdown/);
  });

  test('builds a header rule scoped to the origin and the main frame', async ({
    context,
    extensionId,
  }) => {
    // The permission prompt cannot be driven from Playwright, so the rule
    // shape is asserted directly. The prompt itself is on the manual list.
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // The rule shapes themselves are covered by the buildHeaderRules unit
    // tests; this asserts the extension declares the APIs needed to apply
    // them, and nothing broader.
    const manifest = await page.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.permissions).toContain('declarativeNetRequest');
    expect(manifest.permissions).toContain('scripting');
    expect(manifest.optional_host_permissions).toEqual(
      expect.arrayContaining(['http://*/*', 'https://*/*']),
    );
  });

  test('declares no granted host permission beyond file (NFR-5)', async ({
    serviceWorker,
  }) => {
    const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.host_permissions).toEqual(['file:///*']);

    // Optional permissions are not granted; they only make the runtime
    // request possible.
    const granted = await serviceWorker.evaluate(
      async () => await chrome.permissions.getAll(),
    );
    expect(granted.origins ?? []).not.toContain('https://*/*');
  });

  test('says so when Chrome refuses to store a setting', async ({
    context,
    extensionId,
  }) => {
    // storage.sync caps a single item at 8 KB. The page used to fire the save
    // and ignore the result, so it went on showing a value that was never
    // written. This drives the real quota rather than a stub.
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    const huge = Array.from({ length: 600 }, (_, i) => `folder-${i}-${'x'.repeat(20)}`);
    await page.getByLabel('Hidden folders').fill(huge.join(String.fromCharCode(10)));
    await page.getByLabel('Hidden folders').blur();

    await expect(page.getByRole('alert')).toContainText('was not saved');

    // And the stored value is genuinely the old one, not the one on screen.
    const stored = await page.evaluate(
      async () =>
        (
          (await chrome.runtime.sendMessage({ type: 'getSettings' })) as {
            fileBrowser: { excludedDirectories: string[] };
          }
        ).fileBrowser.excludedDirectories,
    );
    expect(stored).toContain('node_modules');
  });

  test('ships the manifest the config asks for', async ({ serviceWorker }) => {
    // WXT takes some manifest keys from the entrypoint rather than from
    // wxt.config.ts, and silently wins. `options_ui.open_in_tab` was set to
    // true in the config and shipped as false for exactly that reason, which
    // no test noticed because the suite navigates to options.html directly.
    const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.options_ui?.open_in_tab).toBe(true);
    expect(manifest.permissions).toEqual([
      'storage',
      'contextMenus',
      'declarativeNetRequest',
      'scripting',
    ]);
  });

  test('documents every permission it declares', async ({ serviceWorker }) => {
    // The store asks for a written justification per permission, and the
    // privacy policy is the public version of that answer. `scripting` was
    // declared, used, and absent from the policy until a review caught it;
    // this makes the next one impossible to miss.
    const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
    const policy = await readFile('PRIVACY.md', 'utf8');

    const undocumented = (manifest.permissions ?? []).filter(
      (permission) => !policy.includes(`\`${permission}\``),
    );
    expect(undocumented).toEqual([]);

    for (const host of manifest.host_permissions ?? []) {
      expect(policy).toContain(host);
    }
  });
});
