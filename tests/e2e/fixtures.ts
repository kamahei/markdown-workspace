import {
  chromium,
  test as base,
  type BrowserContext,
  type Worker,
} from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXTENSION_PATH = resolve('.output/chrome-mv3');

/**
 * Which browser to drive.
 *
 * Defaults to the Chromium that Playwright installs, which is what CI has.
 * `MW_BROWSER_CHANNEL=msedge` runs the same suite against installed Edge,
 * which is how the "other Chromium browsers" line in the release checklist
 * gets answered by running it rather than by assuming a shared engine means
 * shared behaviour.
 *
 * **Not `chrome`.** Google Chrome stable no longer honours
 * `--load-extension`: it launches, the extension never loads, and every test
 * then waits for a service worker that will never arrive. Measured on Chrome
 * 153, where neither `--enable-unsafe-extension-debugging` nor
 * `--disable-features=DisableLoadExtensionCommandLineSwitch` brings it back.
 * Edge 153 still honours it. `assertExtensionLoaded` below turns that into
 * one clear failure rather than a suite-long timeout — it cost an hour the
 * first time.
 */
const CHANNEL = process.env.MW_BROWSER_CHANNEL ?? 'chromium';

/**
 * Extensions only load in a persistent context, so these tests launch their own
 * browser rather than using Playwright's default fixtures.
 *
 * File access is the awkward part. Chrome gates file:// reading behind a
 * per-extension "Allow access to file URLs" toggle that no command-line flag
 * sets, so the profile's Preferences file is seeded before launch. That is
 * unofficial, and `hasFileAccess` reports whether it actually took effect so a
 * test can skip rather than fail misleadingly.
 */

export interface Fixtures {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
  /** Whether Chrome granted this extension file:// access. */
  hasFileAccess: boolean;
  /** Writes a temporary tree and returns its root path. */
  makeTree: (files: Record<string, string>) => Promise<string>;
  fileUrl: (path: string) => string;
}

async function seedFileAccess(userDataDir: string): Promise<void> {
  const defaultDir = join(userDataDir, 'Default');
  await mkdir(defaultDir, { recursive: true });

  // Chrome merges this on first run. Extension ids are not known yet, so the
  // wildcard-ish approach is to set the policy-free default and rely on the
  // post-launch check to tell us whether it worked.
  const prefs = {
    extensions: {
      ui: { developer_mode: true },
    },
  };
  await writeFile(join(defaultDir, 'Preferences'), JSON.stringify(prefs), 'utf8');
}

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), 'mw-e2e-'));
    await seedFileAccess(userDataDir);

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: CHANNEL,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--allow-file-access-from-files',
      ],
    });

    await use(context);
    await context.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  },

  serviceWorker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await waitForExtension(context);
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    const id = new URL(serviceWorker.url()).host;
    await use(id);
  },

  hasFileAccess: async ({ serviceWorker }, use) => {
    const granted = await serviceWorker.evaluate(async () => {
      try {
        return await chrome.extension.isAllowedFileSchemeAccess();
      } catch {
        return false;
      }
    });
    await use(granted);
  },

  makeTree: async ({}, use) => {
    const roots: string[] = [];

    const make = async (files: Record<string, string>) => {
      const root = await mkdtemp(join(tmpdir(), 'mw-tree-'));
      roots.push(root);
      for (const [relative, content] of Object.entries(files)) {
        const full = join(root, relative);
        await mkdir(join(full, '..'), { recursive: true });
        await writeFile(full, content, 'utf8');
      }
      return root;
    };

    await use(make);
    for (const root of roots) {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  },

  fileUrl: async ({}, use) => {
    await use((path: string) => pathToFileURL(path).href);
  },
});

export const expect = test.expect;

/**
 * Waits for the extension's service worker, and says why when it never comes.
 *
 * The bare `waitForEvent` version failed with "Target page, context or
 * browser has been closed" once per test, which describes the symptom and
 * not the cause.
 */
async function waitForExtension(context: BrowserContext): Promise<Worker> {
  const worker = await Promise.race([
    context.waitForEvent('serviceworker'),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
  ]);

  if (worker) return worker;

  throw new Error(
    `The extension did not load in "${CHANNEL}".

` +
      (CHANNEL === 'chrome'
        ? 'Google Chrome stable no longer honours --load-extension, so it ' +
          'launches without the extension and every test then waits for a ' +
          'service worker that never arrives. Use the default channel, or ' +
          'MW_BROWSER_CHANNEL=msedge.'
        : `Check that ${EXTENSION_PATH} exists and is current: run "pnpm build".`),
  );
}
