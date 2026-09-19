// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSanitizer } from '@core/sanitize';
import { ALERT_KINDS, renderMarkdown, type AlertKind } from '@core/markdown';

/**
 * GitHub's alert syntax.
 *
 * Every assertion here reads the **sanitized** HTML, not the renderer's raw
 * output. A plugin that emits something the sanitizer then strips is a
 * plugin that does nothing, and testing the wrong side of that boundary is
 * how you ship one.
 */

const sanitizer = createSanitizer(window);
const render = (src: string, opts = {}) => renderMarkdown(src, sanitizer, opts).html;

const parse = (html: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};

const alert = (src: string) => parse(render(src)).querySelector('.mw-alert');

describe('alert syntax', () => {
  it.each(ALERT_KINDS)('renders [!%s] as a callout of that kind', (kind) => {
    const el = alert(`> [!${kind.toUpperCase()}]\n> Body text.\n`);
    expect(el).not.toBeNull();
    expect(el!.getAttribute('data-mw-alert')).toBe(kind);
    expect(el!.tagName).toBe('DIV');
    // The marker itself must be gone; it is the title now.
    expect(el!.textContent).not.toContain('[!');
    expect(el!.textContent).toContain('Body text.');
  });

  it('gives the callout a title made of real text', () => {
    // Not a CSS ::before: a screen reader cannot read generated content,
    // and it could not be translated.
    const el = alert('> [!WARNING]\n> Careful.\n')!;
    const title = el.querySelector('.mw-alert-title');
    expect(title?.textContent).toBe('Warning');
  });

  it('takes the titles it is given, because core cannot translate', () => {
    const labels: Record<AlertKind, string> = {
      note: 'メモ',
      tip: 'ヒント',
      important: '重要',
      warning: '警告',
      caution: '注意',
    };
    const html = render('> [!TIP]\n> Body.\n', { alertLabels: labels });
    expect(parse(html).querySelector('.mw-alert-title')?.textContent).toBe('ヒント');
  });

  it('is case-insensitive about the marker, as GitHub is', () => {
    expect(alert('> [!note]\n> Body.\n')?.getAttribute('data-mw-alert')).toBe('note');
    expect(alert('> [!Note]\n> Body.\n')?.getAttribute('data-mw-alert')).toBe('note');
  });

  it('leaves a kind nobody defined as an ordinary quote', () => {
    // Inventing a meaning for undefined syntax turns prose into a callout
    // the author never asked for.
    const host = parse(render('> [!NOPE]\n> Body.\n'));
    expect(host.querySelector('.mw-alert')).toBeNull();
    expect(host.querySelector('blockquote')).not.toBeNull();
    expect(host.textContent).toContain('[!NOPE]');
  });

  it('leaves a marker with text after it alone', () => {
    // GitHub requires the marker to be the whole line.
    const host = parse(render('> [!NOTE] and more\n> Body.\n'));
    expect(host.querySelector('.mw-alert')).toBeNull();
  });

  it('leaves an ordinary blockquote alone', () => {
    const host = parse(render('> Just a quote.\n'));
    expect(host.querySelector('.mw-alert')).toBeNull();
    expect(host.querySelector('blockquote')).not.toBeNull();
  });

  it('keeps the markup inside the callout working', () => {
    const el = alert(
      '> [!IMPORTANT]\n> Run `pnpm build` and see [the docs](https://ok.test/).\n',
    )!;
    expect(el.querySelector('code')?.textContent).toBe('pnpm build');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('https://ok.test/');
  });

  it('keeps a list inside the callout', () => {
    const el = alert('> [!TIP]\n> - one\n> - two\n')!;
    expect(el.querySelectorAll('li')).toHaveLength(2);
  });

  it('handles text on the line after the marker in the same paragraph', () => {
    const el = alert('> [!NOTE]\n> First line\n> second line\n')!;
    expect(el.textContent).toContain('First line');
    expect(el.textContent).toContain('second line');
    expect(el.querySelector('.mw-alert-title')?.textContent).toBe('Note');
  });

  it('survives a callout with nothing in it', () => {
    const el = alert('> [!NOTE]\n')!;
    expect(el.querySelector('.mw-alert-title')?.textContent).toBe('Note');
  });

  it('does not let a nested quote steal the closing tag', () => {
    const host = parse(render('> [!NOTE]\n> outer\n>\n> > inner quote\n'));
    const el = host.querySelector('.mw-alert')!;
    // The callout closes as a div, and the quote inside it stays a quote.
    expect(el.tagName).toBe('DIV');
    expect(el.querySelector('blockquote')?.textContent).toContain('inner quote');
  });

  it('renders two callouts in one document independently', () => {
    const host = parse(render('> [!NOTE]\n> first\n\n> [!CAUTION]\n> second\n'));
    const kinds = [...host.querySelectorAll('.mw-alert')].map((el) =>
      el.getAttribute('data-mw-alert'),
    );
    expect(kinds).toEqual(['note', 'caution']);
  });
});
