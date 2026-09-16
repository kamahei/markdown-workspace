import type { OriginRule, Settings } from '../settings';

/**
 * Opt-in remote origins (FR-22..FR-25, .project/decision-log.md D5).
 *
 * Pure policy: validating a pattern, and reconciling stored intent against
 * what Chrome actually granted. The calls to `chrome.permissions` and
 * `chrome.scripting` live in the background entrypoint.
 *
 * There was a `declarativeNetRequest` rule builder here too, rewriting
 * `Content-Type: text/markdown` to `text/plain` so Chrome would display the
 * response instead of downloading it. Measured on Chrome 153, Edge 153 and
 * both Chromium builds Playwright ships, browsers display a Markdown content
 * type already -- so the rule fired only where nothing was wrong, and its own
 * condition excluded the cases that do download. It was removed along with
 * the permission it needed (Q14).
 */

export interface PatternResult {
  ok: boolean;
  /** Normalized `scheme://host/*` form. */
  pattern: string;
  error: string | null;
}

/**
 * Normalizes user input into a match pattern.
 *
 * Deliberately refuses anything wider than one host. An all-hosts pattern
 * would be a broad host permission by another name, and the whole point of
 * opt-in origins is that the user grants one site at a time.
 */
export function normalizePattern(input: string): PatternResult {
  const raw = input.trim();
  if (!raw) return { ok: false, pattern: '', error: 'Enter a website address.' };

  // A scheme has to be recognized before anything is prefixed. Blindly
  // prepending https:// to "ftp://example.test" produces
  // "https://ftp://example.test", which parses as the host "ftp" and would be
  // accepted as a perfectly valid-looking pattern for the wrong site.
  const declaredScheme = raw.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (declaredScheme && declaredScheme !== 'http' && declaredScheme !== 'https') {
    return {
      ok: false,
      pattern: '',
      error: 'Only http and https addresses can be added.',
    };
  }

  const withScheme = declaredScheme ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme.replace(/\*+$/, ''));
  } catch {
    return { ok: false, pattern: '', error: 'That does not look like a web address.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      pattern: '',
      error: 'Only http and https addresses can be added.',
    };
  }

  if (!url.hostname || url.hostname === '*') {
    return {
      ok: false,
      pattern: '',
      error: 'Add one site at a time; a wildcard host is not allowed.',
    };
  }

  // A leading *. subdomain wildcard is fine; a bare * host is not.
  if (url.hostname.startsWith('*.') && url.hostname.length <= 2) {
    return { ok: false, pattern: '', error: 'That host pattern is too broad.' };
  }

  return { ok: true, pattern: `${url.protocol}//${url.hostname}/*`, error: null };
}

export function hasOrigin(settings: Settings, pattern: string): boolean {
  return settings.allowedOrigins.some((rule) => rule.pattern === pattern);
}

export function addOrigin(settings: Settings, pattern: string): Settings {
  if (hasOrigin(settings, pattern)) {
    return {
      ...settings,
      allowedOrigins: settings.allowedOrigins.map((rule) =>
        rule.pattern === pattern ? { ...rule, enabled: true } : rule,
      ),
    };
  }
  const rule: OriginRule = { pattern, addedAt: Date.now(), enabled: true };
  return { ...settings, allowedOrigins: [...settings.allowedOrigins, rule] };
}

export function removeOrigin(settings: Settings, pattern: string): Settings {
  return {
    ...settings,
    allowedOrigins: settings.allowedOrigins.filter((rule) => rule.pattern !== pattern),
  };
}

/**
 * Reconciles stored intent with the permissions Chrome actually grants.
 *
 * The two can diverge: a user can revoke a permission from
 * `chrome://extensions` without the extension hearing about it. A rule whose
 * permission is gone is marked disabled rather than deleted, so the user can
 * see what happened instead of silently losing their configuration.
 */
export function reconcileOrigins(settings: Settings, granted: string[]): Settings {
  const grantedSet = new Set(granted);
  let changed = false;

  const allowedOrigins = settings.allowedOrigins.map((rule) => {
    const isGranted = grantedSet.has(rule.pattern);
    if (rule.enabled === isGranted) return rule;
    changed = true;
    return { ...rule, enabled: isGranted };
  });

  return changed ? { ...settings, allowedOrigins } : settings;
}

/** Patterns currently active, i.e. both wanted and granted. */
export function activePatterns(settings: Settings): string[] {
  return settings.allowedOrigins
    .filter((rule) => rule.enabled)
    .map((rule) => rule.pattern);
}
