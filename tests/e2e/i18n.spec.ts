import { expect, test } from './fixtures';

/**
 * The interface in Japanese, driven through a real browser.
 *
 * The rest of the suite pins the browser to English and asserts English
 * strings. That pinning exists because of this feature: unpinned, the suite
 * followed the machine's operating system and forty tests failed at once on
 * a Japanese one, for a product that was working correctly.
 *
 * So this file is the other half. Run the whole suite in Japanese with
 * `MW_UI_LANGUAGE=ja pnpm test:e2e`; these tests assert it directly by
 * reading what Chrome resolves, so they are meaningful either way.
 */

test.describe('translation', () => {
  test('the catalogue Chrome reads carries both languages', async ({ serviceWorker }) => {
    // The Chrome Web Store derives the languages a listing may be written in
    // from the _locales folders in the package. An extension missing ja gets
    // one language tab in the dashboard and no way to add another, whatever
    // copy has been prepared.
    const locales = await serviceWorker.evaluate(async () => {
      // Root-relative, not chrome.runtime.getURL: the worker already runs
      // on the extension origin, and WXT types getURL against the files in
      // public/, which _locales is generated into rather than committed.
      const read = async (lang: string) => {
        const res = await fetch(`/_locales/${lang}/messages.json`);
        return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
      };
      return {
        en: Object.keys((await read('en')) ?? {}).length,
        ja: Object.keys((await read('ja')) ?? {}).length,
        defaultLocale: chrome.runtime.getManifest().default_locale,
      };
    });

    expect(locales.defaultLocale).toBe('en');
    expect(locales.en).toBeGreaterThan(100);
    expect(locales.ja).toBe(locales.en);
  });

  test('the manifest name and description come from the catalogue', async ({
    serviceWorker,
  }) => {
    // Not literals: Chrome substitutes them per the browser's language, and
    // the store listing takes its name and summary from what it resolves.
    const manifest = await serviceWorker.evaluate(() => {
      const resolved = chrome.runtime.getManifest();
      return {
        name: resolved.name,
        description: resolved.description,
        language: chrome.i18n.getUILanguage(),
      };
    });

    expect(manifest.name).not.toContain('__MSG_');
    expect(manifest.description).not.toContain('__MSG_');
    expect(manifest.description?.length ?? 0).toBeGreaterThan(20);
  });

  test('resolves a message in Japanese even when the browser is not', async ({
    serviceWorker,
  }) => {
    /*
     * Reading the ja catalogue directly rather than relaunching the browser:
     * this asserts the translation exists and is wired to the same keys,
     * which is the part that rots. Whether Chrome picks it is Chrome's job
     * and is covered by running the suite with MW_UI_LANGUAGE=ja.
     */
    const japanese = await serviceWorker.evaluate(async () => {
      const catalogue = (await (
        await fetch('/_locales/ja/messages.json')
      ).json()) as Record<string, { message: string }>;
      return {
        appearance: catalogue.optionsAppearance?.message,
        skip: catalogue.skipToContent?.message,
        theme: catalogue.themeIs?.message,
      };
    });

    expect(japanese.appearance).toBe('外観');
    expect(japanese.skip).toBe('本文へスキップ');
    // The substitution has to survive translation, or the label renders with
    // a hole in it.
    expect(japanese.theme).toContain('$1');
  });

  test('the options page renders in the language the browser is in', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    const language = await page.evaluate(() => chrome.i18n.getUILanguage());
    const heading = page.getByRole('heading', { level: 2 }).first();

    // Whichever language the suite is pinned to, the page must be in it --
    // and must not be showing a raw message key.
    await expect(heading).toBeVisible();
    const text = (await heading.textContent()) ?? '';
    expect(text).not.toMatch(/^options[A-Z]/);
    expect(text.length).toBeGreaterThan(0);

    if (language.startsWith('ja')) expect(text).toBe('外観');
    else expect(text).toBe('Appearance');
  });
});
