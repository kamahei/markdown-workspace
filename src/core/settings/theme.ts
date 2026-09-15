import type { ContentWidth, ThemeMode } from './schema';

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

export function applyContentWidth(root: HTMLElement, width: ContentWidth): void {
  if (width === 'normal') root.removeAttribute('data-content-width');
  else root.setAttribute('data-content-width', width);
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
