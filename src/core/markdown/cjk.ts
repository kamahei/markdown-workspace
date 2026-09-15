import type { MarkdownIt } from 'markdown-it';

/**
 * Removes the space Markdown inserts when a CJK line is wrapped.
 *
 * A soft line break becomes whitespace in HTML, which is exactly right for
 * English — "the\nquick" must read as "the quick". Japanese, Chinese and
 * Korean do not separate words with spaces, so the same rule turns
 *
 *     このファイルが入っている
 *     フォルダが表示されています
 *
 * into "このファイルが入っている フォルダが表示されています", with a gap in
 * the middle of a sentence. Anyone who wraps their source at a comfortable
 * width — which is most people writing prose — gets this throughout.
 *
 * The space is dropped only when the characters on *both* sides of the break
 * are CJK. A break between a CJK character and a Latin word keeps its space,
 * because mixed text genuinely needs one: "Chrome が" should not become
 * "Chromeが".
 */

/**
 * Scripts written without inter-word spaces, plus the punctuation and
 * full-width forms that appear inside such text.
 */
const CJK =
  /[ᄀ-ᇿ⺀-⿿　-〿぀-ゟ゠-ヿ㄰-㆏㆐-㆟ㇰ-ㇿ㈀-㋿㐀-䶿一-鿿ꥠ-꥿가-힯豈-﫿︰-﹏＀-｠￠-￦]/;

export function isCjk(char: string | undefined): boolean {
  return char !== undefined && char !== '' && CJK.test(char);
}

/** The last character of an inline token's rendered text, if it has one. */
function trailingChar(token: { type: string; content: string } | undefined): string {
  if (!token) return '';
  return token.content.slice(-1);
}

/** The first character of an inline token's rendered text, if it has one. */
function leadingChar(token: { type: string; content: string } | undefined): string {
  if (!token) return '';
  return token.content.slice(0, 1);
}

export function cjkPlugin(md: MarkdownIt): void {
  const previous = md.renderer.rules.softbreak;

  md.renderer.rules.softbreak = (tokens, idx, options, env, self) => {
    // With `breaks` on, a soft break is an explicit <br> and the author asked
    // for it; nothing to collapse.
    if (!options.breaks && isCjk(trailingChar(tokens[idx - 1]))) {
      if (isCjk(leadingChar(tokens[idx + 1]))) return '';
    }

    return previous
      ? previous(tokens, idx, options, env, self)
      : options.breaks
        ? '<br>\n'
        : '\n';
  };
}
