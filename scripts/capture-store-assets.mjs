#!/usr/bin/env node
/**
 * Captures the Chrome Web Store assets.
 *
 * Drives the real extension in a real Chrome against the sample folders, so
 * the screenshots show the product doing the thing rather than a mockup of
 * it. The promo tile is laid out as HTML and screenshotted the same way,
 * which keeps it editable text rather than a binary nobody can change.
 *
 * The store allows five screenshots per listing, and this listing is
 * published in English and Japanese, so each locale gets its own five against
 * documents in that language. The promo tile is shared.
 *
 * Output: store-assets/ (gitignored; regenerate with pnpm build:store-assets)
 */
import { chromium } from '@playwright/test';
import { mkdir, rm, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXTENSION_PATH = resolve('.output/chrome-mv3');
const OUT = 'store-assets';

/** The store accepts 1280x800 or 640x400; the larger reads better. */
const SHOT = { width: 1280, height: 800 };

/**
 * One entry per store locale.
 *
 * Paths differ per language because the sample trees are written in that
 * language -- a Japanese screenshot with English folder names would look
 * half-translated.
 */
const LOCALES = [
  {
    id: 'en',
    language: 'en-US',
    samples: resolve('samples'),
    tour: 'README.md',
    rich: 'docs/code-and-diagrams.md',
    folder: 'docs/',
    mathHeading: 'Math',
  },
  {
    id: 'ja',
    language: 'ja',
    samples: resolve('samples-ja'),
    tour: 'README.md',
    rich: 'docs/コードと図.md',
    folder: 'docs/',
    mathHeading: '数式',
  },
];

/**
 * A browser in one language.
 *
 * Launched per locale rather than once, because the interface follows the
 * browser and the browser follows the operating system. Taking the default
 * produced English screenshots with a Japanese sidebar on a Japanese
 * machine -- half-translated in exactly the way the sample trees exist to
 * avoid.
 */
async function launch(language) {
  const profile = await mkdtemp(join(tmpdir(), 'mw-capture-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    viewport: SHOT,
    deviceScaleFactor: 2,
    locale: language,
    args: [
      `--lang=${language}`,
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

async function shoot(page, dir, name) {
  await page.waitForTimeout(900);
  /*
   * `scale: 'css'` is load-bearing. The context runs at deviceScaleFactor 2
   * so text rasterizes crisply, but without this the file comes out at
   * 2560x1600 -- and the store takes 1280x800 or 640x400 and nothing else.
   *
   * It shipped that way for weeks because the log printed the size that was
   * asked for rather than the size that was written.
   */
  await page.screenshot({ path: `${dir}/${name}.png`, scale: 'css' });
  console.log(`  ${dir}/${name}.png  ${await describe(`${dir}/${name}.png`)}`);
}

/**
 * The five screenshots for one locale.
 *
 * Five is the store's limit, so each has to earn its place: what it is, what
 * it renders, how a folder looks, that there is a dark theme, and that the
 * privacy claim is visible in the product rather than only in the copy.
 */
async function captureLocale(context, id, locale) {
  const dir = `${OUT}/${locale.id}`;
  await mkdir(dir, { recursive: true });

  const fileUrl = (relative) => pathToFileURL(join(locale.samples, relative)).href;
  const page = await context.newPage();

  console.log(`Screenshots (${locale.id})`);

  // 1. A document with the sidebar: the core claim, in one image.
  await page.goto(fileUrl(locale.tour));
  await page.waitForSelector('.mw-doc h1', { timeout: 15_000 }).catch(() => {});
  await shoot(page, dir, '1-document-and-sidebar');

  // 2. Syntax highlighting.
  await page.goto(fileUrl(locale.rich));
  await page.waitForSelector('pre.shiki', { timeout: 25_000 }).catch(() => {});
  await shoot(page, dir, '2-syntax-highlighting');

  // 3. Math and diagrams, further down the same document. Scrolled into view
  //    on purpose: a screenshot of a feature has to show the feature.
  await page.waitForSelector('.mw-diagram svg', { timeout: 25_000 }).catch(() => {});
  await page.evaluate((heading) => {
    const main = document.querySelector('.mw-main');
    const target = [...document.querySelectorAll('.mw-doc h2')].find((h) =>
      h.textContent?.includes(heading),
    );
    if (main && target) main.scrollTop = target.offsetTop - 24;
  }, locale.mathHeading);
  await shoot(page, dir, '3-math-and-diagrams');

  // 4. The folder view that replaces Chrome's own directory listing, in dark
  //    theme. Two claims in one image, because there are only five.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${pathToFileURL(locale.samples).href}/${locale.folder}`);
  await page.waitForSelector('[role="tree"]', { timeout: 15_000 }).catch(() => {});
  await page
    .locator('[role="treeitem"]')
    .first()
    .click()
    .catch(() => {});
  await shoot(page, dir, '4-folder-browser-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // 5. Settings, where the privacy claim is visible rather than asserted.
  await page.goto(`chrome-extension://${id}/options.html`);
  await shoot(page, dir, '5-settings');

  await page.close();
}

// --- Promo tile -----------------------------------------------------------

/**
 * The promo tile, as HTML.
 *
 * The store shows it small and beside competitors, so it carries one idea and
 * the product name, not a feature list nobody reads at 440px.
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
    font-family: -apple-system, 'Segoe UI', 'Noto Sans', 'Hiragino Kaku Gothic ProN',
      'Yu Gothic', Meiryo, Helvetica, Arial, sans-serif;
  }
  .mark {
    flex: 0 0 auto; width: ${132 * scale}px; height: ${132 * scale}px;
    background: rgba(255,255,255,.14); border-radius: ${30 * scale}px;
    display: flex; align-items: center; justify-content: center;
    border: ${2 * scale}px solid rgba(255,255,255,.28);
  }
  .copy { min-width: 0; }
  h1 {
    /* Sized so the headline sets in two lines at 440px. Three lines pushed
       the supporting sentence to the bottom edge and left the tile looking
       like a wall of text at the size the store actually shows it. */
    font-size: ${38 * scale}px; line-height: 1.15; font-weight: 650;
    letter-spacing: -.02em; margin-bottom: ${13 * scale}px;
  }
  p { font-size: ${19 * scale}px; line-height: 1.45; color: rgba(255,255,255,.88); }
  .name {
    margin-top: ${18 * scale}px; font-size: ${15 * scale}px;
    letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.7);
  }
</style></head><body>
  <div class="mark">
    <!-- The same mark as the extension icon: a sidebar beside lines of text.
         Transcribed from the geometry in scripts/build-icons.mjs, mapped onto
         a 24-unit box, and has to be changed with it. It used to be a
         downward chevron over a bar, which read as a download arrow. -->
    <svg width="${68 * scale}" height="${68 * scale}" viewBox="0 0 24 24" fill="#fff">
      <rect x="4.3" y="5.3" width="3.9" height="13.4" rx="0.9"/>
      <rect x="10.6" y="6.2" width="9.1" height="3.8" rx="0.9"/>
      <rect x="10.6" y="13.9" width="5.8" height="3.8" rx="0.9"/>
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
    scale: 'css',
    clip: { x: 0, y: 0, width: spec.width, height: spec.height },
  });
  await page.close();
  console.log(`  ${OUT}/${name}.png  ${await describe(`${OUT}/${name}.png`)}`);
}

/**
 * What was actually written, read back from the file.
 *
 * Reporting the requested size instead is how 2560x1600 screenshots went
 * unnoticed: every line of output said 1280x800.
 */
async function describe(path) {
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile(path);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colourType = buffer[25];
  const kind = colourType === 2 ? '24-bit, no alpha' : `colour type ${colourType}`;
  return `${width}x${height}  ${kind}`;
}

// --- Main -----------------------------------------------------------------

async function main() {
  /*
   * Clears only what this script produces.
   *
   * It used to remove the whole directory, which took the store icon
   * `build-icons.mjs` writes there with it -- a script deleting a sibling's
   * output, and invisible until the icon went missing from an upload.
   */
  for (const locale of LOCALES) {
    await rm(`${OUT}/${locale.id}`, { recursive: true, force: true });
  }
  await rm(`${OUT}/promo-440x280.png`, { force: true });
  await mkdir(OUT, { recursive: true });

  for (const locale of LOCALES) {
    const { context, profile } = await launch(locale.language);
    const id = await extensionId(context);
    await captureLocale(context, id, locale);
    await context.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  console.log('Promo tile');
  const { context, profile } = await launch('en-US');
  await capturePromo(context, 'promo-440x280', {
    width: 440,
    height: 280,
    scale: 0.72,
    headline: 'Read a whole folder of Markdown',
    sub: 'File tree, working links, nothing uploaded.',
  });
  await context.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});

  await writeFile(
    `${OUT}/README.txt`,
    [
      'Chrome Web Store assets for Markdown Workspace.',
      '',
      'Generated by: pnpm build:store-assets',
      '',
      'en/                five screenshots for the default (English) listing',
      'ja/                five screenshots for the Japanese listing',
      'promo-440x280.png  small promo tile, shared by both listings',
      'store-icon-128.png the store icon, written by scripts/build-icons.mjs',
      '',
      'Screenshots are 1280x800 at 2x device scale. Five per locale is the',
      'store maximum. The content comes from samples/ and samples-ja/, which',
      'are real documentation rather than placeholder text.',
      '',
      'The store icon is the extension mark on a 128 canvas with the artwork',
      'inset by 16px, which is the padding the store image guidance',
      'describes. The extension icons stay full-bleed, because Chrome frames',
      'those itself. If the dashboard would rather have a full-bleed store',
      'icon, upload public/icon/128.png -- the same mark without the margin.',
      '',
      'These are build output, not source. Edit the sample documents, the',
      'mark in scripts/build-icons.mjs, or the promo layout in',
      'scripts/capture-store-assets.mjs, and regenerate.',
      '',
    ].join('\n'),
    'utf8',
  );

  await verify();

  console.log(`\nWrote assets to ${OUT}/`);
}

/**
 * The store's own limits, as a check rather than as a comment.
 *
 * Every one of these was violated at some point and none of it showed:
 * screenshots went out at 2560x1600 for weeks because the log printed the
 * size that was asked for. The store takes 1280x800 or 640x400 and nothing
 * else, and an upload is the wrong place to find that out.
 */
export async function verify() {
  const { readdir, readFile } = await import('node:fs/promises');
  const problems = [];

  const check = async (path, allowed, label) => {
    const buffer = await readFile(path);
    const size = `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
    const colourType = buffer[25];
    if (!allowed.includes(size)) {
      problems.push(`${path}: ${size}, but ${label} takes ${allowed.join(' or ')}`);
    }
    // 24-bit PNG without alpha. Playwright writes colour type 2 for an
    // opaque page; a transparent one would come out as 6.
    if (colourType !== 2) {
      problems.push(`${path}: colour type ${colourType}, but 24-bit RGB is required`);
    }
  };

  for (const locale of LOCALES) {
    const dir = `${OUT}/${locale.id}`;
    const files = (await readdir(dir)).filter((f) => f.endsWith('.png'));
    if (files.length > 5) {
      problems.push(`${dir}: ${files.length} screenshots, but the store takes five`);
    }
    for (const file of files) {
      await check(`${dir}/${file}`, ['1280x800', '640x400'], 'a screenshot');
    }
  }

  await check(`${OUT}/promo-440x280.png`, ['440x280'], 'the small promo tile');

  if (problems.length > 0) {
    console.error(`\nThese would be rejected at upload:\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  console.log(`\nChecked: every asset is a size and format the store accepts.`);
}

// `--verify-only` checks what is already on disk, without a browser. Also
// what makes the check itself testable.
if (process.argv.includes('--verify-only')) {
  await verify();
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
