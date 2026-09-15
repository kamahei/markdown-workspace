import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';

/**
 * Tokenizes `$inline$` and `$$block$$` math without rendering it.
 *
 * Deliberately does not import KaTeX. Core stays free of the heavy renderer,
 * and the placeholders this emits are typeset in phase two — which is what
 * keeps a 270 KB dependency out of every document's initial payload.
 */

function isEscaped(state: StateInline, pos: number): boolean {
  let backslashes = 0;
  let i = pos - 1;
  while (i >= 0 && state.src.charCodeAt(i) === 0x5c /* \ */) {
    backslashes += 1;
    i -= 1;
  }
  return backslashes % 2 === 1;
}

function inlineMath(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false;
  if (isEscaped(state, start)) return false;

  // `$$` at an inline position is block math that leaked in; let it pass.
  if (state.src.charCodeAt(start + 1) === 0x24) return false;

  // `$ 5` is currency, not math. Opening delimiters must hug their content.
  const afterOpen = state.src.charCodeAt(start + 1);
  if (Number.isNaN(afterOpen)) return false;
  if (afterOpen === 0x20 || afterOpen === 0x0a) return false;

  let pos = start + 1;
  let found = -1;
  while (pos < state.posMax) {
    const code = state.src.charCodeAt(pos);
    if (code === 0x24 && state.src.charCodeAt(pos - 1) !== 0x5c) {
      // Closing delimiters must hug their content too.
      const beforeClose = state.src.charCodeAt(pos - 1);
      if (beforeClose !== 0x20 && beforeClose !== 0x0a) {
        found = pos;
        break;
      }
    }
    // Math never spans a blank line.
    if (code === 0x0a && state.src.charCodeAt(pos + 1) === 0x0a) break;
    pos += 1;
  }

  if (found === -1) return false;

  const content = state.src.slice(start + 1, found);
  if (content.trim() === '') return false;

  // A digit immediately after the closer means this was a price range.
  const afterClose = state.src.charCodeAt(found + 1);
  if (afterClose >= 0x30 && afterClose <= 0x39) return false;

  if (!silent) {
    const token = state.push('math_inline', 'span', 0);
    token.content = content;
    token.markup = '$';
  }

  state.pos = found + 1;
  return true;
}

function blockMath(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
) {
  const startPos = state.bMarks[startLine]! + state.tShift[startLine]!;
  const maxPos = state.eMarks[startLine]!;

  if (startPos + 2 > maxPos) return false;
  if (state.src.slice(startPos, startPos + 2) !== '$$') return false;

  const firstLineRest = state.src.slice(startPos + 2, maxPos);

  // Single-line form: $$ x = 1 $$
  const singleLineClose = firstLineRest.trimEnd().endsWith('$$');
  if (singleLineClose && firstLineRest.trimEnd().length > 2) {
    if (silent) return true;
    const token = state.push('math_block', 'div', 0);
    token.content = firstLineRest.trimEnd().slice(0, -2).trim();
    token.markup = '$$';
    token.map = [startLine, startLine + 1];
    state.line = startLine + 1;
    return true;
  }

  let nextLine = startLine;
  let closed = false;
  const lines: string[] = [];
  if (firstLineRest.trim() !== '') lines.push(firstLineRest);

  while (nextLine + 1 < endLine) {
    nextLine += 1;
    const from = state.bMarks[nextLine]! + state.tShift[nextLine]!;
    const to = state.eMarks[nextLine]!;
    const line = state.src.slice(from, to);

    if (line.trimEnd().endsWith('$$')) {
      const beforeClose = line.trimEnd().slice(0, -2);
      if (beforeClose.trim() !== '') lines.push(beforeClose);
      closed = true;
      break;
    }
    lines.push(line);
  }

  // An unterminated block is not math. Falling through leaves the `$$` as
  // literal text rather than swallowing the rest of the document.
  if (!closed) return false;
  if (silent) return true;

  const token = state.push('math_block', 'div', 0);
  token.content = lines.join('\n').trim();
  token.markup = '$$';
  token.map = [startLine, nextLine + 1];
  state.line = nextLine + 1;
  return true;
}

export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'math_inline', inlineMath);
  md.block.ruler.before('fence', 'math_block', blockMath, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
}
