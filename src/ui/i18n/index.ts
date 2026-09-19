import type { AlertLabels } from '@core/markdown';
import { en } from './en';

/**
 * Translation for the UI layer.
 *
 * Chrome reads translations from `_locales/<lang>/messages.json`, which
 * `scripts/build-locales.mjs` generates from `en.ts` and `ja.ts`. Those stay
 * the source of truth because a catalogue of this size needs a compiler
 * watching it: `MessageKey` makes a typo a build error, and a test asserts
 * the two catalogues have the same keys, so a message cannot be added in one
 * language and forgotten in the other.
 *
 * The lookup arrives by injection rather than by calling `chrome.i18n` here.
 * `src/ui/` may not touch extension APIs — components take what they need —
 * and the composition roots wire in the real one. Without that the English
 * catalogue answers directly, which is what makes a component renderable in
 * a unit test with no browser at all.
 */

export type MessageKey = keyof typeof en;
export type Translate = (key: MessageKey, substitutions?: string[]) => string;

/** Fills `$1`, `$2` … the way `chrome.i18n.getMessage` does. */
function substitute(message: string, substitutions?: string[]): string {
  if (!substitutions || substitutions.length === 0) return message;
  return message.replace(/\$(\d)/g, (whole, digit: string) => {
    const value = substitutions[Number(digit) - 1];
    return value ?? whole;
  });
}

/** The bundled English catalogue, answering directly. */
export const fromCatalogue: Translate = (key, substitutions) =>
  substitute(en[key] ?? key, substitutions);

let translate: Translate = fromCatalogue;

/** Wires in the browser's own lookup. Called once, by an entrypoint. */
export function setTranslator(next: Translate | null): void {
  translate = next ?? fromCatalogue;
}

export function t(key: MessageKey, substitutions?: string[]): string {
  return translate(key, substitutions);
}

export { en };

/**
 * Splits a message around its `{1}`, `{2}` … and drops nodes into the gaps.
 *
 * For the handful of messages that wrap part of themselves in markup, such
 * as "Open `chrome://extensions`". Substituting a string cannot do it, and
 * splitting the sentence into "Open" plus a code element cannot either:
 * Japanese puts the verb last, so the pieces would assemble backwards. The
 * whole sentence stays one message and the markup goes where the slot is.
 *
 * **Braces, not `$1`.** Chrome consumes `$n` itself: `getMessage` with no
 * substitutions replaces it with nothing, so a slot written that way was
 * gone before this function ever saw the string. `$n` stays reserved for the
 * plain string substitutions Chrome does well; `{n}` is ours.
 */
export function interpolate<T>(message: string, nodes: T[]): Array<string | T> {
  const out: Array<string | T> = [];
  const pattern = /\{(\d)\}/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(message)) !== null) {
    if (match.index > last) out.push(message.slice(last, match.index));
    const node = nodes[Number(match[1]) - 1];
    if (node !== undefined) out.push(node);
    last = match.index + match[0].length;
  }
  if (last < message.length) out.push(message.slice(last));
  return out;
}

/**
 * The message key for a theme setting.
 *
 * Settings store `'system' | 'light' | 'dark'`; the toolbar shows the word
 * for it. Mapping here keeps the setting values as they are on disk while
 * letting the label be translated.
 */
export function themeKey(theme: 'system' | 'light' | 'dark'): MessageKey {
  if (theme === 'light') return 'themeLight';
  if (theme === 'dark') return 'themeDark';
  return 'themeSystem';
}

/**
 * Titles for GitHub's alert blocks, in the reader's language.
 *
 * The renderer needs these as data because `src/core/` has no translator,
 * so this is the seam between the catalogue and a pure module -- the same
 * arrangement enrichment uses for its failure messages.
 */
export function alertLabels(): AlertLabels {
  return {
    note: t('alertNote'),
    tip: t('alertTip'),
    important: t('alertImportant'),
    warning: t('alertWarning'),
    caution: t('alertCaution'),
  };
}
