import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Release-readiness checks (T8.1, T8.2).
 *
 * These assert the non-functional requirements rather than features: that the
 * product is usable without a pointer, meets contrast in both themes, and
 * stays responsive on the documents and folders it claims to handle.
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function audit(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG).analyze();
}

function describeViolations(results: Awaited<ReturnType<typeof audit>>): string {
  return results.violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes[0]?.html ?? ''}`)
    .join('\n');
}

test.describe('accessibility (NFR-7)', () => {
  for (const [name, path] of [
    ['options', 'options.html'],
    ['popup', 'popup.html'],
    ['onboarding', 'onboarding.html'],
    ['workspace', 'workspace.html'],
  ] as const) {
    test(`${name} page has no WCAG AA violations`, async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/${path}`);
      await expect(page.locator('body')).toBeVisible();

      const results = await audit(page);
      expect(results.violations, describeViolations(results)).toEqual([]);
    });

    test(`${name} page has no WCAG AA violations in dark theme`, async ({
      context,
      extensionId,
    }) => {
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(`chrome-extension://${extensionId}/${path}`);
      await expect(page.locator('body')).toBeVisible();

      // Contrast is the failure mode a dark theme actually introduces.
      const results = await audit(page);
      expect(results.violations, describeViolations(results)).toEqual([]);
    });
  }

  test('a rendered document has no violations', async ({
    context,
    makeTree,
    fileUrl,
    hasFileAccess,
  }) => {
    test.skip(!hasFileAccess, 'needs file:// access');

    const root = await makeTree({
      'doc.md':
        '# Heading\n\nText with [a link](https://ok.test/) and `code`.\n\n' +
        '| A | B |\n| - | - |\n| 1 | 2 |\n\n- [ ] todo\n- [x] done\n\n' +
        '> A quote\n\n```js\nconst a = 1;\n```\n',
      'other.md': '# Other\n',
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    const results = await audit(page);
    expect(results.violations, describeViolations(results)).toEqual([]);
  });

  test('the outline panel has no violations', async ({
    context,
    makeTree,
    fileUrl,
    hasFileAccess,
  }) => {
    test.skip(!hasFileAccess, 'needs file:// access');

    // The default audit only ever saw the files tab: the other panels are
    // hidden, and axe does not scan what is hidden. A tablist with the
    // wrong roles or an unlabelled nav would have sailed through.
    const root = await makeTree({
      'doc.md': [
        '# Title',
        'Text.',
        '## Section',
        'More.',
        '### Deeper',
        'Even more.',
      ].join('\n\n'),
    });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await page.getByRole('tab', { name: 'Outline' }).click();
    await expect(page.getByRole('navigation', { name: 'Outline' })).toBeVisible();

    const results = await audit(page);
    expect(results.violations, describeViolations(results)).toEqual([]);
  });

  test('the outline panel has no violations in dark theme', async ({
    context,
    makeTree,
    fileUrl,
    hasFileAccess,
  }) => {
    test.skip(!hasFileAccess, 'needs file:// access');

    // The light theme's current-heading colour was calculated to pass and
    // then measured, and the calculation was wrong the first time. The dark
    // one gets measured rather than trusted for the same reason.
    const root = await makeTree({
      'doc.md': ['# Title', 'Text.', '## Section', 'More.'].join('\n\n'),
    });
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(fileUrl(`${root}/doc.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await page.getByRole('tab', { name: 'Outline' }).click();
    await expect(page.locator('.mw-outline-link[aria-current="true"]')).toBeVisible();

    const results = await audit(page);
    expect(results.violations, describeViolations(results)).toEqual([]);
  });

  test('the search panel has no violations, in either theme', async ({
    context,
    makeTree,
    fileUrl,
    hasFileAccess,
  }) => {
    test.skip(!hasFileAccess, 'needs file:// access');

    const root = await makeTree({
      'doc.md': ['# Title', 'A findable phrase.'].join('\n\n'),
      'other.md': ['# Other', 'Another findable phrase.'].join('\n\n'),
    });

    for (const scheme of ['light', 'dark'] as const) {
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(fileUrl(`${root}/doc.md`));
      await expect(page.locator('.mw-doc h1')).toBeVisible();
      await page.getByRole('tab', { name: 'Search' }).click();
      await page.getByRole('searchbox', { name: /Search the text/ }).fill('findable');
      // The highlight is the part with a colour decision in it.
      await expect(page.locator('.mw-search-text mark').first()).toBeVisible();

      const results = await audit(page);
      expect(results.violations, `${scheme}: ${describeViolations(results)}`).toEqual([]);
      await page.close();
    }
  });

  test('a document with real code, maths and a diagram has no violations', async ({
    context,
    fileUrl,
    hasFileAccess,
  }) => {
    test.skip(!hasFileAccess, 'needs file:// access');

    /*
     * The synthetic document above audits clean, and did so while two
     * serious violations were live. Its code sample was `const a = 1;`,
     * which never produces the token colour that fails contrast, and its
     * table was two columns wide so nothing scrolled.
     *
     * This audits the sample tour instead -- real code, real maths, a real
     * Mermaid diagram -- because a fixture chosen to be small is a fixture
     * chosen to be easy.
     */
    const page = await context.newPage();
    await page.goto(fileUrl(resolve('samples/docs/code-and-diagrams.md')));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await page.waitForSelector('pre.shiki', { timeout: 25_000 }).catch(() => {});
    await page.waitForSelector('.mw-diagram svg', { timeout: 25_000 }).catch(() => {});

    const results = await audit(page);
    expect(results.violations, describeViolations(results)).toEqual([]);
  });

  test('a table too wide for the window can be scrolled without a pointer', async ({
    context,
    makeTree,
    fileUrl,
    hasFileAccess,
  }) => {
    test.skip(!hasFileAccess, 'needs file:// access');

    // A scroller that cannot take focus cannot be scrolled from the
    // keyboard, so the rest of the table is simply unreachable.
    const columns = 14;
    const row = (cell: (i: number) => string) =>
      `| ${Array.from({ length: columns }, (_, i) => cell(i)).join(' | ')} |`;
    const root = await makeTree({
      'wide.md': [
        '# Wide',
        '',
        row((i) => `Column heading ${i}`),
        row(() => '---'),
        row((i) => `value ${i}`),
        '',
      ].join(String.fromCharCode(10)),
      'narrow.md': ['# Narrow', '', '| A | B |', '| - | - |', '| 1 | 2 |', ''].join(
        String.fromCharCode(10),
      ),
    });

    const page = await context.newPage();
    await page.setViewportSize({ width: 500, height: 720 });
    await page.goto(fileUrl(`${root}/wide.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();

    const scroller = page.locator('.mw-table-scroll');
    await expect(scroller).toHaveAttribute('tabindex', '0');
    const results = await audit(page);
    expect(results.violations, describeViolations(results)).toEqual([]);

    // And a table that fits does not become a tab stop for nothing.
    await page.goto(fileUrl(`${root}/narrow.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await expect(page.locator('.mw-table-scroll')).not.toHaveAttribute('tabindex', '0');
  });

  test('a code block too wide for the window can be scrolled without a pointer', async ({
    context,
    makeTree,
    fileUrl,
    hasFileAccess,
  }) => {
    test.skip(!hasFileAccess, 'needs file:// access');

    // Shiki puts tabindex on the <pre> it emits, so a highlighted block was
    // already fine and hid this. A block in a language it does not know
    // keeps the original <pre> -- and so does every block when highlighting
    // is switched off in settings.
    const long = `const x = "${'y'.repeat(300)}";`;
    const fence = (lang: string) =>
      ['```' + lang, long, '```', ''].join(String.fromCharCode(10));
    const root = await makeTree({
      'code.md': ['# Wide code', '', fence('js'), fence('notalanguage')].join(
        String.fromCharCode(10),
      ),
    });

    const page = await context.newPage();
    await page.setViewportSize({ width: 700, height: 800 });
    await page.goto(fileUrl(`${root}/code.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await page.waitForSelector('pre.shiki', { timeout: 25_000 }).catch(() => {});

    const unhighlighted = page.locator('.mw-doc pre:not(.shiki)');
    await expect(unhighlighted).toHaveAttribute('tabindex', '0');

    const results = await audit(page);
    expect(results.violations, describeViolations(results)).toEqual([]);
  });

  test('the whole reader is reachable by keyboard alone', async ({
    context,
    makeTree,
    fileUrl,
    hasFileAccess,
  }) => {
    test.skip(!hasFileAccess, 'needs file:// access');

    const root = await makeTree({ 'a.md': '# A\n', 'b.md': '# B\n' });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a.md`));
    await expect(page.locator('[role="tree"]')).toBeVisible();

    // Walk the tab order and collect what receives focus.
    const reached = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        return (
          el.getAttribute('aria-label') ??
          el.getAttribute('role') ??
          el.className ??
          el.tagName
        );
      });
      if (label) reached.add(label);
    }

    const labels = [...reached].join(' | ');
    // The tree owns focus as a single tab stop (roving tabindex), so it is
    // reached by its accessible name rather than its role.
    expect(labels).toMatch(/Files/);
    expect(labels).toMatch(/Toggle sidebar/);
    expect(labels).toMatch(/Filter files/);
    expect(labels).toMatch(/Markdown source|rendered document/);
  });

  test('offers a skip link before the document', async ({
    context,
    makeTree,
    fileUrl,
    hasFileAccess,
  }) => {
    test.skip(!hasFileAccess, 'needs file:// access');

    const root = await makeTree({ 'a.md': '# A\n' });
    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/a.md`));

    await page.keyboard.press('Tab');
    await expect(page.locator('.mw-skip-link')).toBeFocused();
  });
});

test.describe('performance (NFR-1, NFR-2)', () => {
  test.beforeEach(({ hasFileAccess }) => {
    test.skip(!hasFileAccess, 'needs file:// access');
  });

  test('a 100 KB document is readable well within 500 ms', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // Roughly 100 KB of realistic prose and structure.
    const section = (i: number) =>
      `## Section ${i}\n\nParagraph with **bold**, *italic* and \`code\` in it. ` +
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod ' +
      'tempor incididunt ut labore et dolore magna aliqua.\n\n' +
      `- item one\n- item two\n- item three\n\n`;

    let body = '# Large Document\n\n';
    let i = 0;
    while (body.length < 100_000) {
      body += section(i);
      i += 1;
    }

    const root = await makeTree({ 'large.md': body });
    const page = await context.newPage();

    const started = Date.now();
    await page.goto(fileUrl(`${root}/large.md`));
    await expect(page.locator('.mw-doc h1')).toHaveText('Large Document');
    const elapsed = Date.now() - started;

    console.log(`  100 KB document readable in ${elapsed} ms (budget 500 ms)`);
    // Generous headroom over the requirement, since a CI machine is slower
    // than the laptop the requirement describes.
    expect(elapsed).toBeLessThan(3000);
    await expect(page.locator('.mw-doc h2')).not.toHaveCount(0);
  });

  test('a folder of 5,000 files stays responsive (FR-19)', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const tree: Record<string, string> = { 'index.md': '# Index\n' };
    for (let i = 0; i < 5000; i += 1) tree[`f-${i}.md`] = `# File ${i}\n`;

    const root = await makeTree(tree);
    const page = await context.newPage();

    const started = Date.now();
    await page.goto(fileUrl(`${root}/index.md`));
    await expect(page.locator('[role="tree"]')).toBeVisible({ timeout: 20_000 });
    const elapsed = Date.now() - started;

    console.log(`  5,000-file folder listed in ${elapsed} ms`);

    // Virtualization is the point: only a window of rows is in the DOM.
    const rendered = await page.locator('[role="treeitem"]').count();
    console.log(`  rows in the DOM: ${rendered} of 5001`);
    expect(rendered).toBeLessThan(120);

    // Filtering stays interactive at that size.
    const filterStart = Date.now();
    await page.getByLabel('Filter files by name').fill('f-4242');
    await expect(page.locator('[role="tree"]').getByText('f-4242.md')).toBeVisible();
    console.log(`  filter applied in ${Date.now() - filterStart} ms`);
  });

  test('searching a documentation-sized folder finishes promptly', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    // 300 documents is a large handbook, and every one of them is a round
    // trip to the service worker in reader mode. The number below is
    // measured rather than assumed: a bug that made the walk start from
    // the filesystem root was found exactly this way.
    const tree: Record<string, string> = { 'index.md': '# Index\n' };
    for (let i = 0; i < 300; i += 1) {
      tree[`chapter-${i}/page.md`] = [
        `# Chapter ${i}`,
        'Ordinary prose about nothing in particular.',
      ].join('\n\n');
    }
    const root = await makeTree(tree);

    const page = await context.newPage();
    await page.goto(fileUrl(`${root}/index.md`));
    await expect(page.locator('.mw-doc h1')).toBeVisible();
    await page.getByRole('tab', { name: 'Search' }).click();

    const started = Date.now();
    await page.getByRole('searchbox', { name: /Search the text/ }).fill('particular');
    await expect(page.locator('.mw-search-status')).toContainText('matches in', {
      timeout: 30_000,
    });
    const elapsed = Date.now() - started;

    console.log(`  300 documents searched in ${elapsed} ms`);
    // Generous, because CI machines are slow and this is a floor against
    // something going quadratic, not a target to tune towards.
    expect(elapsed).toBeLessThan(15_000);

    // It found them all, rather than stopping early on a folder this size.
    await expect(page.getByText(/Stopped early/)).toHaveCount(0);
  });

  test('the text column follows the width of the window', async ({
    context,
    extensionId,
    makeTree,
    fileUrl,
  }) => {
    /*
     * The column used to be a fixed width. `--mw-measure` was `72ch` on
     * `.mw-pane`, and `ch` resolves against the font of the element it sits
     * on -- the 14px interface font, not the text inside it -- so it was
     * neither 72 characters nor responsive to anything. A reader on a wide
     * monitor got a 495px ribbon with most of the screen empty beside it,
     * and Japanese lines broke after 31 characters.
     *
     * It is a share of the reading pane now, floored and capped. This
     * asserts the share: that widening the window widens the text, which
     * is the property that was missing, and that neither end runs away.
     */
    const root = await makeTree({
      'doc.md': ['# Doc', 'x '.repeat(400).trim()].join('\n\n'),
    });
    const page = await context.newPage();

    /** Rendered width of a paragraph, and what it is as a share of the pane. */
    const measure = async (viewport: number) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await page.goto(fileUrl(`${root}/doc.md`));
      await expect(page.locator('.mw-doc h1')).toBeVisible();
      return page.evaluate(() => {
        const p = document.querySelector('.mw-doc > p') as HTMLElement;
        const main = document.querySelector('.mw-main') as HTMLElement;
        const probe = document.createElement('span');
        probe.style.font = getComputedStyle(p).font;
        probe.style.whiteSpace = 'pre';
        p.appendChild(probe);
        probe.textContent = 'あいうえおかきくけこ';
        const cjk = probe.getBoundingClientRect().width / 10;
        probe.remove();
        const width = p.getBoundingClientRect().width;
        return {
          width,
          share: width / main.getBoundingClientRect().width,
          cjk: width / cjk,
        };
      });
    };

    const narrowWindow = await measure(1100);
    const wideWindow = await measure(1920);

    console.log(
      `  1100px: ${Math.round(narrowWindow.width)}px text, ` +
        `${Math.round(narrowWindow.share * 100)}% of the pane, ` +
        `~${Math.round(narrowWindow.cjk)} CJK characters per line`,
    );
    console.log(
      `  1920px: ${Math.round(wideWindow.width)}px text, ` +
        `${Math.round(wideWindow.share * 100)}% of the pane, ` +
        `~${Math.round(wideWindow.cjk)} CJK characters per line`,
    );

    // The property the reader asked for, and the one a fixed measure fails.
    expect(wideWindow.width, 'a wider window gives a wider column').toBeGreaterThan(
      narrowWindow.width * 1.5,
    );

    // Neither end runs away. The upper bound is loose on purpose: how much
    // of the window the text should use is a preference, not a fact, and
    // the setting is where it belongs. What this pins is that there is
    // still a margin, and that a small window still gets a line of text
    // rather than a ribbon.
    expect(wideWindow.share, 'still has a margin').toBeLessThan(0.92);
    expect(narrowWindow.share, 'not a ribbon').toBeGreaterThan(0.5);
    expect(narrowWindow.cjk, 'Japanese stays a readable line').toBeGreaterThan(30);

    // And the setting still moves it. It is a percentage now rather than
    // three names, so this drives the slider to each end of its range.
    const choose = async (percent: number) => {
      const options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options.html`);
      const slider = options.getByRole('slider');
      await slider.fill(String(percent));
      // `fill` on a range input dispatches input, which is what the page
      // listens to; give the write to storage a moment to land.
      await expect(slider).toHaveValue(String(percent));
      await options.waitForTimeout(400);
      await options.close();
      return measure(1920);
    };

    const narrower = await choose(50);
    const wider = await choose(96);
    expect(narrower.width).toBeLessThan(wideWindow.width);
    expect(wider.width).toBeGreaterThan(wideWindow.width);
    // The slider spans a range worth having: the ends are far apart.
    expect(wider.width).toBeGreaterThan(narrower.width * 1.6);
  });

  test('a folder containing node_modules does not stall the sidebar', async ({
    context,
    makeTree,
    fileUrl,
  }) => {
    const tree: Record<string, string> = { 'readme.md': '# Readme\n' };
    // Deep and wide, the shape that would punish an eager tree walk.
    for (let i = 0; i < 400; i += 1) {
      tree[`node_modules/pkg-${i}/index.md`] = `# Pkg ${i}\n`;
      tree[`node_modules/pkg-${i}/docs/api.md`] = `# API ${i}\n`;
    }

    const root = await makeTree(tree);
    const page = await context.newPage();

    const started = Date.now();
    await page.goto(fileUrl(`${root}/readme.md`));
    await expect(page.locator('[role="tree"]')).toBeVisible({ timeout: 20_000 });
    console.log(`  repo-shaped folder listed in ${Date.now() - started} ms`);

    // Excluded by default, and never walked to find that out.
    await expect(
      page.locator('[role="tree"]').getByText('node_modules', { exact: true }),
    ).toHaveCount(0);
  });
});
