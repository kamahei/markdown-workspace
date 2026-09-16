import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from '@ui/i18n/en';
import { ja } from '@ui/i18n/ja';
import { fromCatalogue, interpolate, setTranslator, t, themeKey } from '@ui/i18n';

/**
 * The catalogues, and the generated files Chrome actually reads.
 *
 * Two languages drift the moment one of them is edited alone, so this is
 * the cheapest place to notice. The generated `_locales` files are checked
 * too: they are what ships, and they are also what decides whether the
 * Chrome Web Store offers a Japanese tab to write a listing in at all.
 */

const KEYS = Object.keys(en) as Array<keyof typeof en>;

describe('the message catalogues agree', () => {
  it('carries the same keys in both languages', () => {
    expect(Object.keys(ja).sort()).toEqual(KEYS.slice().sort());
  });

  it('translates every message, rather than copying the English', () => {
    // A handful are deliberately identical: a product name, and strings that
    // are addresses or code rather than prose.
    const sameOnPurpose = new Set([
      'extName',
      'onboardingStep2Name',
      'optionsMarkdown',
      'optionsOriginPlaceholder',
      'flavourGfm',
    ]);

    const untranslated = KEYS.filter(
      (key) => !sameOnPurpose.has(key) && ja[key] === en[key],
    );
    expect(untranslated).toEqual([]);
  });

  it('keeps the same substitutions on both sides', () => {
    // A message whose translation drops its `$1` renders a sentence with a
    // hole in it, and one that gains a `$2` renders a literal "$2".
    // Both kinds: `$n` that Chrome fills, and `{n}` that interpolate() does.
    const placeholders = (message: string) =>
      [...message.matchAll(/\$(\d)|\{(\d)\}/g)].map((m) => m[0]).sort();

    for (const key of KEYS) {
      expect(placeholders(ja[key]), `${key} placeholders`).toEqual(placeholders(en[key]));
    }
  });

  it('uses only the characters Chrome accepts in a key', () => {
    expect(KEYS.filter((key) => !/^[A-Za-z0-9_]+$/.test(key))).toEqual([]);
  });
});

describe('the generated _locales files match the catalogues', () => {
  const read = (lang: string) =>
    JSON.parse(readFileSync(`public/_locales/${lang}/messages.json`, 'utf8')) as Record<
      string,
      { message: string }
    >;

  it('is current — run `pnpm build:locales` if this fails', () => {
    for (const [lang, catalogue] of [
      ['en', en],
      ['ja', ja],
    ] as const) {
      const generated = read(lang);
      expect(Object.keys(generated).sort(), `${lang} keys`).toEqual(KEYS.slice().sort());
      for (const key of KEYS) {
        expect(generated[key]?.message, `${lang}.${key}`).toBe(catalogue[key]);
      }
    }
  });
});

describe('lookup', () => {
  it('answers from the English catalogue when nothing is wired in', () => {
    setTranslator(null);
    expect(t('extName')).toBe(en.extName);
  });

  it('fills substitutions the way chrome.i18n does', () => {
    setTranslator(null);
    expect(t('themeIs', ['Dark'])).toBe('Theme: Dark');
    expect(t('closeTab', ['notes.md'])).toBe('Close notes.md');
  });

  it('leaves a placeholder alone when nothing was given for it', () => {
    setTranslator(null);
    expect(t('themeIs')).toBe('Theme: $1');
  });

  it('uses an injected translator, and goes back when it is cleared', () => {
    setTranslator(() => 'translated');
    expect(t('extName')).toBe('translated');
    setTranslator(null);
    expect(t('extName')).toBe(en.extName);
  });

  it('exposes the catalogue directly, for a caller that must not be overridden', () => {
    setTranslator(() => 'translated');
    expect(fromCatalogue('extName')).toBe(en.extName);
    setTranslator(null);
  });
});

describe('interpolate', () => {
  it('drops a node where the slot is', () => {
    expect(interpolate('Open {1} now', ['X'])).toEqual(['Open ', 'X', ' now']);
  });

  it('handles a slot at either end', () => {
    expect(interpolate('{1} first', ['X'])).toEqual(['X', ' first']);
    expect(interpolate('last {1}', ['X'])).toEqual(['last ', 'X']);
  });

  it('places two of them in the order the message asks for', () => {
    // Japanese puts the verb last, so a message may well want {2} before {1}.
    expect(interpolate('{2} then {1}', ['A', 'B'])).toEqual(['B', ' then ', 'A']);
  });

  it('leaves a $n alone, because Chrome owns that one', () => {
    // A markup slot written as $1 was gone before interpolate saw it: Chrome
    // replaces it with nothing when no substitution is passed. This is the
    // regression that cost two onboarding steps their code elements.
    expect(interpolate('Open $1 now', ['X'])).toEqual(['Open $1 now']);
  });

  it('leaves a message with no placeholder whole', () => {
    expect(interpolate('nothing here', ['X'])).toEqual(['nothing here']);
  });
});

describe('themeKey', () => {
  it.each([
    ['light', 'themeLight'],
    ['dark', 'themeDark'],
    ['system', 'themeSystem'],
  ] as const)('%s maps to %s', (theme, key) => {
    expect(themeKey(theme)).toBe(key);
  });
});

describe('nothing user-facing escapes the catalogue', () => {
  /**
   * `src/core/` has no translator by design, so the prose in a
   * `FileSourceError` is English whatever the interface language is. Rendering
   * one put an English sentence in the workspace's alert panel and in the
   * sidebar's tooltip on a Japanese interface -- both shipped that way, and
   * both were found by reading rather than by a failing test.
   *
   * The UI translates from the error's `code` instead. `ErrorPanel` is the one
   * place that renders a message, and its callers hand it a translated one.
   */
  const uiSources = () =>
    globSync('src/ui/**/*.{ts,tsx}').map(
      (file) => [file, readFileSync(file, 'utf8')] as const,
    );

  it('never renders an error’s own message outside the panel that takes one', () => {
    const offenders = uiSources()
      .filter(([file]) => !file.endsWith('States.tsx'))
      .filter(([, source]) => /\b(err|error)\.message\b/.test(source))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it('keeps that panel’s one message render, so the rule above means something', () => {
    // If this fails the exemption above is stale and should go, not be moved.
    const panel = readFileSync('src/ui/components/States.tsx', 'utf8');
    expect(panel).toContain('{error.message}');
  });
});
