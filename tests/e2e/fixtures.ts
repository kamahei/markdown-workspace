import {
  chromium,
  test as base,
  type Browser,
  type BrowserContext,
  type Worker,
} from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
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
 * `=chrome` needs a different route entirely, which `launchForChannel`
 * below implements. Google Chrome stable no longer honours
 * `--load-extension` — it launches and the extension simply is not there,
 * and no flag brings it back (`--enable-unsafe-extension-debugging`,
 * `--disable-features=DisableLoadExtensionCommandLineSwitch`, `--test-type`
 * and `--allowlisted-extension-id` were all tried on 153). The supported
 * replacement is the CDP `Extensions.loadUnpacked` command, and Playwright's
 * own launcher cannot reach it: it refuses `--remote-debugging-pipe`
 * ("Playwright manages remote debugging connection") and the browser session
 * it hands out answers `No associated browser context`. Starting Chrome
 * directly and attaching with `connectOverCDP` does work, which is what the
 * chrome branch does.
 */
const CHANNEL = process.env.MW_BROWSER_CHANNEL ?? 'chromium';

/**
 * The language the extension renders in.
 *
 * Pinned, because `chrome.i18n` follows the browser, the browser follows the
 * operating system, and the suite asserts English strings. Left unpinned it
 * passed on an English machine and failed on a Japanese one -- forty tests
 * at once, for a product that was working correctly.
 *
 * `MW_UI_LANGUAGE=ja` runs the same suite in Japanese; only the tests that
 * assert the translation should care.
 */
export const UI_LANGUAGE = process.env.MW_UI_LANGUAGE ?? 'en-US';

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

/** Where Chrome lives, per platform. `MW_CHROME_PATH` overrides it. */
function chromeExecutable(): string {
  if (process.env.MW_CHROME_PATH) return process.env.MW_CHROME_PATH;
  if (process.platform === 'win32') {
    return 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  }
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return '/usr/bin/google-chrome';
}

/** Waits for the debugging endpoint rather than sleeping a guessed amount. */
async function waitForDebugger(port: number): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Chrome never opened a debugging port on ${port}.`);
}

interface Launched {
  context: BrowserContext;
  close: () => Promise<void>;
}

/**
 * Starts Chrome itself and installs the extension over CDP.
 *
 * The only route that works on Chrome stable. Playwright's launcher cannot
 * be used here, so the process is spawned directly and attached to; the
 * port is chosen high and random because two suites must not collide.
 */
async function launchChromeOverCdp(userDataDir: string): Promise<Launched> {
  const port = 9400 + Math.floor(Math.random() * 500);
  const child: ChildProcess = spawn(
    chromeExecutable(),
    [
      `--lang=${UI_LANGUAGE}`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--enable-unsafe-extension-debugging',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let browser: Browser | undefined;
  try {
    await waitForDebugger(port);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const cdp = await browser.newBrowserCDPSession();
    await cdp.send('Extensions.loadUnpacked', { path: EXTENSION_PATH });
    const context = browser.contexts()[0]!;
    return {
      context,
      close: async () => {
        await browser?.close().catch(() => {});
        child.kill();
      },
    };
  } catch (err) {
    await browser?.close().catch(() => {});
    child.kill();
    throw err;
  }
}

async function launchForChannel(userDataDir: string): Promise<Launched> {
  if (CHANNEL === 'chrome') return launchChromeOverCdp(userDataDir);

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: CHANNEL,
    locale: UI_LANGUAGE,
    args: [
      `--lang=${UI_LANGUAGE}`,
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
    ],
  });
  return { context, close: () => context.close() };
}

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), 'mw-e2e-'));
    await seedFileAccess(userDataDir);

    const launched = await launchForChannel(userDataDir);

    await use(launched.context);
    await launched.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  },

  serviceWorker: async ({ context }, use) => {
    await use(await waitForExtension(context));
  },

  extensionId: async ({ serviceWorker }, use) => {
    const id = new URL(serviceWorker.url()).host;
    await use(id);
  },

  hasFileAccess: async ({ context, serviceWorker }, use) => {
    const claimed = await serviceWorker.evaluate(async () => {
      try {
        return await chrome.extension.isAllowedFileSchemeAccess();
      } catch {
        return false;
      }
    });

    // Chrome does not always tell the truth here. Loaded over CDP it reports
    // false while the content script demonstrably runs on file:// and
    // renders the document. Believing it skipped every file:// test in the
    // suite, which reads as a pass and is the worst kind of green -- so when
    // the answer is no, go and find out.
    const granted = claimed || (await probeFileAccess(context));
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

let probedFileAccess: boolean | null = null;

/**
 * Opens a real Markdown file and reports whether the reader took it over.
 *
 * The only question the file:// tests actually care about. Cached: it is a
 * property of how the browser was started, not of one context.
 */
async function probeFileAccess(context: BrowserContext): Promise<boolean> {
  if (probedFileAccess !== null) return probedFileAccess;

  const root = await mkdtemp(join(tmpdir(), 'mw-probe-'));
  const file = join(root, 'probe.md');
  await writeFile(file, '# Probe\n', 'utf8');

  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(file).href, { timeout: 10_000 });
    await page.waitForSelector('.mw-root', { timeout: 10_000 });
    probedFileAccess = true;
  } catch {
    probedFileAccess = false;
  } finally {
    await page.close().catch(() => {});
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }

  return probedFileAccess;
}

const EXTENSION_NAME = 'Markdown Workspace';

/** Ours, not whatever else the browser happens to be running. */
async function findOurWorker(context: BrowserContext): Promise<Worker | null> {
  for (const worker of context.serviceWorkers()) {
    try {
      const name = await worker.evaluate(() => chrome.runtime.getManifest().name);
      if (name === EXTENSION_NAME) return worker;
    } catch {
      // A worker that went away between listing and asking.
    }
  }
  return null;
}

/**
 * Waits for the extension's service worker, and says why when it never comes.
 *
 * Identified by name rather than by being first: a real Chrome profile runs
 * service workers of its own, and taking `serviceWorkers()[0]` picked one of
 * those, so every extension URL then 404ed under an id that was not ours.
 *
 * The bare `waitForEvent` version failed with "Target page, context or
 * browser has been closed" once per test, which describes the symptom and
 * not the cause.
 */
async function waitForExtension(context: BrowserContext): Promise<Worker> {
  const deadline = Date.now() + 15_000;
  let worker = await findOurWorker(context);

  while (!worker && Date.now() < deadline) {
    const appeared = await Promise.race([
      context.waitForEvent('serviceworker'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
    ]).catch(() => null);
    if (appeared) {
      const name = await appeared
        .evaluate(() => chrome.runtime.getManifest().name)
        .catch(() => null);
      if (name === EXTENSION_NAME) worker = appeared;
    }
    worker ??= await findOurWorker(context);
  }

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
