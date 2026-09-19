import type { MarkdownIt, Token } from 'markdown-it';

/**
 * GitHub's alert syntax: a blockquote whose first line is `[!NOTE]`.
 *
 *     > [!WARNING]
 *     > This is the part people skip.
 *
 * GitHub renders five of these as coloured callouts, and repository
 * documentation uses them constantly. Without this they came out as an
 * ordinary blockquote containing the literal text `[!WARNING]` — so a
 * `docs/` folder written for GitHub rendered *worse* here than on the site
 * it was written for, which is the one thing this extension is for.
 *
 * Only the five GitHub defines are recognised. Anything else in the same
 * shape — `[!NOPE]`, or a line that merely starts with a bracket — stays a
 * blockquote. Inventing an interpretation for syntax nobody has defined
 * would turn somebody's prose into a callout they did not ask for.
 *
 * The title has to be translated and `src/core/` has no translator, so the
 * labels arrive as an option, the same way enrichment takes its messages.
 * Omitted, they fall back to English.
 */

export const ALERT_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const;

export type AlertKind = (typeof ALERT_KINDS)[number];

export type AlertLabels = Record<AlertKind, string>;

/** English, for a caller that passes nothing. */
export const DEFAULT_ALERT_LABELS: AlertLabels = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

/**
 * `[!NOTE]` alone on the blockquote's first line.
 *
 * Anchored and whole-line: `[!NOTE] and then some text` is not a marker,
 * because GitHub does not treat it as one either.
 */
const MARKER = /^\[!([A-Za-z]+)\][ \t]*$/;

const isKind = (value: string): value is AlertKind =>
  (ALERT_KINDS as readonly string[]).includes(value);

export function alertPlugin(md: MarkdownIt, labels: AlertLabels): void {
  md.core.ruler.after('block', 'mw_alert', (state) => {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i]!.type !== 'blockquote_open') continue;

      // The marker lives in the inline token of the first paragraph.
      const paragraphOpen = tokens[i + 1];
      const inline = tokens[i + 2];
      if (paragraphOpen?.type !== 'paragraph_open' || inline?.type !== 'inline') {
        continue;
      }

      const [first, ...rest] = inline.content.split('\n');
      const match = first === undefined ? null : MARKER.exec(first);
      const kind = match?.[1]?.toLowerCase();
      if (!kind || !isKind(kind)) continue;

      markAsAlert(state, tokens, i, kind, rest.join('\n'), labels);
    }

    return true;
  });
}

/**
 * Rewrites one blockquote in place.
 *
 * The tokens are edited rather than replaced wholesale so that everything
 * inside the quote -- links, code, nested lists, further blockquotes --
 * keeps being rendered by the rules that already handle it.
 *
 * Nothing here parses inline text. This rule runs after `block` and before
 * `inline`, so every `inline` token still holds raw `content` that the
 * standard inline rule is about to parse into `children`. Doing that work
 * here as well rendered every word twice -- titles, body text, all of it --
 * because the inline rule appends to whatever children it finds.
 */
function markAsAlert(
  state: { Token: typeof Token },
  tokens: Token[],
  index: number,
  kind: AlertKind,
  remainder: string,
  labels: AlertLabels,
): void {
  const open = tokens[index]!;
  open.tag = 'div';
  open.attrSet('class', 'mw-alert');
  open.attrSet('data-mw-alert', kind);

  // The matching close, so a nested blockquote does not steal it.
  const close = findClose(tokens, index);
  if (close) close.tag = 'div';

  // The title replaces the marker line. A real element with real text: a
  // CSS ::before would be invisible to a screen reader and untranslatable.
  const titleOpen = new state.Token('paragraph_open', 'p', 1);
  titleOpen.attrSet('class', 'mw-alert-title');
  const titleInline = new state.Token('inline', '', 0);
  titleInline.content = labels[kind];
  titleInline.children = [];
  const titleClose = new state.Token('paragraph_close', 'p', -1);

  const inline = tokens[index + 2]!;

  if (remainder.trim() === '') {
    // The marker was the whole first paragraph: drop it, keep the title.
    tokens.splice(index + 1, 3, titleOpen, titleInline, titleClose);
    return;
  }

  // Text followed the marker on later lines of the same paragraph. Keep it
  // as raw content and let the inline rule parse it, markup and all.
  inline.content = remainder;
  inline.children = [];
  tokens.splice(index + 1, 0, titleOpen, titleInline, titleClose);
}

/** The `blockquote_close` that matches the open at `index`. */
function findClose(tokens: Token[], index: number): Token | null {
  let depth = 0;
  for (let i = index; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.type === 'blockquote_open') depth += 1;
    else if (token.type === 'blockquote_close') {
      depth -= 1;
      if (depth === 0) return token;
    }
  }
  return null;
}
