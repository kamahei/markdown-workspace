// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSanitizer } from '@core/sanitize';
import { renderMarkdown } from '@core/markdown';
import { isCjk } from '@core/markdown/cjk';

const sanitizer = createSanitizer(window);
/**
 * Asserted on the HTML, not on textContent.
 *
 * markdown-it emits a literal newline for a soft break; the browser collapses
 * it to a space when rendering. textContent would report the newline either
 * way, so it cannot tell "space" from "no space" -- which is the whole
 * question here.
 */
const html = (src: string, opts = {}) => renderMarkdown(src, sanitizer, opts).html;

describe('isCjk', () => {
  it.each(['あ', 'ア', '漢', '。', '、', '「', '１', 'ㄱ', '한'])('%s is CJK', (c) => {
    expect(isCjk(c)).toBe(true);
  });

  it.each(['a', 'Z', '0', '.', ' ', '-', 'é'])('%s is not CJK', (c) => {
    expect(isCjk(c)).toBe(false);
  });

  it('handles empty input', () => {
    expect(isCjk('')).toBe(false);
    expect(isCjk(undefined)).toBe(false);
  });
});

describe('wrapped CJK prose', () => {
  it('does not insert a space mid-sentence', () => {
    // The defect this exists for: a source wrapped at a comfortable width
    // rendered as "入っている フォルダが", with a gap inside the sentence.
    expect(html('このファイルが入っている\nフォルダが表示されています')).toContain(
      '<p>このファイルが入っているフォルダが表示されています</p>',
    );
  });

  it('joins across punctuation too', () => {
    expect(html('これは文です。\n次の文です。')).toContain(
      '<p>これは文です。次の文です。</p>',
    );
  });

  it('handles Chinese and Korean the same way', () => {
    expect(html('这是一个句子\n继续下去')).toContain('<p>这是一个句子继续下去</p>');
    expect(html('한국어입니다\n계속됩니다')).toContain('<p>한국어입니다계속됩니다</p>');
  });
});

describe('everything else keeps its separator', () => {
  it('keeps the break between English words', () => {
    // The newline survives, and the browser renders it as a space.
    expect(html('the quick\nbrown fox')).toContain('the quick' + '\n' + 'brown fox');
  });

  it('keeps the break where CJK meets Latin', () => {
    // Mixed text genuinely needs the separator: "Chrome が", not "Chromeが".
    expect(html('設定は Chrome\nが要求します')).toContain(
      'Chrome' + '\n' + 'が要求します',
    );
    expect(html('use the\nAPI です')).toContain('the' + '\n' + 'API');
  });

  it('keeps an explicit hard break', () => {
    expect(html('日本語\n中国語', { breaks: true })).toContain('<br>');
  });

  it('leaves a paragraph break alone', () => {
    expect(html('第一段落\n\n第二段落').match(/<p>/g)).toHaveLength(2);
  });
});
