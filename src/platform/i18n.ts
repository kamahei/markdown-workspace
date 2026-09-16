import { fromCatalogue, setTranslator, type Translate } from '@ui/i18n';

/**
 * Hands the UI Chrome's own message lookup.
 *
 * `src/platform/` is the adapter layer: the only place outside entrypoints
 * that may touch extension APIs. The UI takes a function, which is what lets
 * a component render in a unit test with no browser at all.
 *
 * Call once, before the first render. A key Chrome cannot find comes back as
 * an empty string rather than as an error, so that falls through to the
 * bundled English catalogue instead of painting a blank label.
 */
export function useBrowserTranslations(): void {
  const translate: Translate = (key, substitutions) => {
    try {
      // The overloads take a string or an array, never undefined, so the
      // no-substitution case has to be a separate call.
      const message = substitutions
        ? browser.i18n.getMessage(key, substitutions)
        : browser.i18n.getMessage(key);
      return message === '' ? fromCatalogue(key, substitutions) : message;
    } catch {
      return fromCatalogue(key, substitutions);
    }
  };

  setTranslator(translate);
}
