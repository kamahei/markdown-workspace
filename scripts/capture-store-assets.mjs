#!/usr/bin/env node
/**
 * Captures the Chrome Web Store assets.
 *
 * Drives the real extension in a real Chrome against `samples/`, so the
 * screenshots show the product doing the thing rather than a mockup of it.
 * Promo tiles are laid out as HTML and screenshotted the same way, which
 * keeps them editable text rather than a binary nobody can change.
 *
 * Output: store-assets/ (gitignored; regenerate with pnpm build:store-assets)
 */
import { chromium } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXTENSION_PATH = resolve('.output/chrome-mv3');
const SAMPLES = resolve('samples');
const OUT = 'store-assets';

/** The store accepts 1280x800 or 640x400; the larger reads better. */
const SHOT = { width: 1280, height: 800 };

async function launch() {
  const profile = await mkdtemp(join(tmpdir(), 'mw-capture-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    viewport: SHOT,
    deviceScaleFactor: 2,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
    ],
  });
  return { context, profile };
}

async function extensionId(context) {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  return new URL(worker.url()).host;
}

const fileUrl = (relative) => pathToFileURL(join(SAMPLES, relative)).href;

async function shoot(page, name) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ${OUT}/${name}.png`);
}

// --- Promo tiles ----------------------------------------------------------

/**
 * Promo tiles as HTML.
 *
 * The store shows these small and next to competitors, so they carry one idea
 * and the product name, not a feature list nobody will read at 440px.
 */
function promoHtml({ width, height, headline, sub, scale }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
  body {
    display: flex; align-items: center; gap: ${40 * scale}px;
    padding: ${44 * scale}px;
    background: linear-gradient(135deg, #1f6feb 0%, #1a4fb8 100%);
    color: #fff;
    font-family: -apple-system, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
  }
  .mark {
    flex: 0 0 auto; width: ${132 * scale}px; height: ${132 * scale}px;
    background: rgba(255,255,255,.14); border-radius: ${30 * scale}px;
    display: flex; align-items: center; justify-content: center;
    border: ${2 * scale}px solid rgba(255,255,255,.28);
  }
  .copy { min-width: 0; }
  h1 {
    font-size: ${44 * scale}px; line-height: 1.12; font-weight: 650;
    letter-spacing: -.02em; margin-bottom: ${14 * scale}px;
  }
  p { font-size: ${21 * scale}px; line-height: 1.45; color: rgba(255,255,255,.88); }
  .name {
    margin-top: ${18 * scale}px; font-size: ${15 * scale}px;
    letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.7);
  }
</style></head><body>
  <div class="mark">
    <svg width="${76 * scale}" height="${76 * scale}" viewBox="0 0 24 24" fill="none"
         stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3v11"/><path d="M6.5 9.5 12 15l5.5-5.5"/><path d="M5 19.5h14"/>
    </svg>
  </div>
  <div class="copy">
    <h1>${headline}</h1>
    <p>${sub}</p>
    <div class="name">Markdown Workspace</div>
  </div>
</body></html>`;
}

async function capturePromo(context, name, spec) {
  const page = await context.newPage();
  await page.setViewportSize({ width: spec.width, height: spec.height });
  await page.setContent(promoHtml(spec));
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    clip: { x: 0, y: 0, width: spec.width, height: spec.height },
  });
  await page.close();
  console.log(`  ${OUT}/${name}.png  (${spec.width}x${spec.height})`);
}

// --- Main -----------------------------------------------------------------

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const { context, profile } = await launch();
  const id = await extensionId(context);
  const page = await context.newPage();

  console.log('Screenshots');

  // 1. A document with the sidebar: the core claim, in one image.
  await page.goto(fileUrl('README.md'));
  await page.waitForSelector('.mw-doc h1', { timeout: 15_000 }).catch(() => {});
  await shoot(page, '01-document-with-sidebar');

  // 2. Syntax highlighting, at the top of the document.
  await page.goto(fileUrl('docs/code-and-diagrams.md'));
  await page.waitForSelector('pre.shiki', { timeout: 25_000 }).catch(() => {});
  await shoot(page, '02-syntax-highlighting');

  // 3. Math and diagrams, which are further down the same document. Scrolled
  //    into view on purpose: a screenshot of the feature has to show it.
  await page.waitForSelector('.mw-diagram svg', { timeout: 25_000 }).catch(() => {});
  await page
    .locator('.mw-doc h2', { hasText: 'Math' })
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  await page.evaluate(() => {
    const main = document.querySelector('.mw-main');
    const heading = [...document.querySelectorAll('.mw-doc h2')].find((h) =>
      h.textContent?.includes('Math'),
    );
    if (main && heading) main.scrollTop = heading.offsetTop - 24;
  });
  await shoot(page, '03-math-and-diagrams');

  // 4. The folder view that replaces Chrome's own listing.
  await page.goto(`${pathToFileURL(SAMPLES).href}/docs/`);
  await page.waitForSelector('[role="tree"]', { timeout: 15_000 }).catch(() => {});
  await page
    .locator('[role="treeitem"]', { hasText: 'reference' })
    .first()
    .click()
    .catch(() => {});
  await shoot(page, '04-folder-browser');

  // 5. Dark theme, on a document with structure worth showing.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(fileUrl('docs/writing.md'));
  await page.waitForSelector('.mw-doc table', { timeout: 15_000 }).catch(() => {});
  await shoot(page, '05-dark-theme');
  await page.emulateMedia({ colorScheme: 'light' });

  // 6. Settings, which is where the privacy claim is visible.
  await page.goto(`chrome-extension://${id}/options.html`);
  await shoot(page, '06-settings');

  await page.close();

  console.log('Promo tiles');
  await capturePromo(context, 'promo-small-440x280', {
    width: 440,
    height: 280,
    scale: 0.72,
    headline: 'Read a whole folder of Markdown',
    sub: 'File tree, working links, nothing uploaded.',
  });
  await capturePromo(context, 'promo-marquee-1400x560', {
    width: 1400,
    height: 560,
    scale: 1.85,
    headline: 'Read a whole folder of Markdown',
    sub: 'Drop a directory onto Chrome and get a file tree, working links between documents, and code, math and diagrams — all of it local.',
  });

  await context.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});

  await writeFile(
    `${OUT}/README.txt`,
    [
      'Chrome Web Store assets for Markdown Workspace.',
      '',
      'Generated by: pnpm build:store-assets',
      'Source content: samples/  (real documentation, not placeholder text)',
      '',
      'Screenshots are 1280x800 at 2x device scale.',
      'Promo tiles are 440x280 and 1400x560.',
      '',
      'These are build output, not source. Edit the sample documents or the',
      'promo layout in scripts/capture-store-assets.mjs and regenerate.',
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`\nWrote assets to ${OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
