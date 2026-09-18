import type { ContentWidth, ThemeMode } from './schema';
import { clampContentWidth } from './layout';

/**
 * Applies the theme to a document root (FR-27).
 *
 * Called before first paint. A flash of the wrong theme is a defect, not a
 * cosmetic detail, so this must run from the settings read that precedes the
 * first render rather than from an effect afterwards.
 *
 * 'system' deliberately stamps nothing, leaving `prefers-color-scheme` in
 * charge. An explicit choice stamps the attribute, which the stylesheet gives
 * precedence over the media query in both directions.
 */
export function applyTheme(root: HTMLElement, theme: ThemeMode): void {
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/**
 * Sets how much of the reading pane a line of text uses.
 *
 * A custom property rather than an attribute per named size, because the
 * setting is now a percentage: there is no fixed set of values to write
 * selectors for. The stylesheet floors it so a small window still gets a
 * line of text rather than a squeezed column.
 */
export function applyContentWidth(root: HTMLElement, width: ContentWidth): void {
  root.style.setProperty('--mw-content-share', `${clampContentWidth(width)}%`);
}

/** The theme actually in effect, for renderers that need a concrete value. */
export function resolveTheme(theme: ThemeMode, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme;
}

/** Cycles light -> dark -> system, for the toolbar toggle. */
export function nextTheme(theme: ThemeMode): ThemeMode {
  if (theme === 'light') return 'dark';
  if (theme === 'dark') return 'system';
  return 'light';
}
