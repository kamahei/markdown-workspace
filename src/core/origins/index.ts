import type { OriginRule, Settings } from '../settings';

/**
 * Opt-in remote origins (FR-22..FR-25, .project/decision-log.md D5).
 *
 * Pure policy: validating a pattern, reconciling stored intent against what
 * Chrome actually granted, and shaping the network rules. The calls to
 * `chrome.permissions`, `declarativeNetRequest` and `chrome.scripting` live in
 * the background entrypoint.
 */

/** Content types that make Chrome download Markdown instead of showing it. */
export const MARKDOWN_CONTENT_TYPES = ['text/markdown', 'text/x-markdown'];

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

export interface HeaderRule {
  id: number;
  priority: number;
  action: {
    type: 'modifyHeaders';
    responseHeaders: Array<{ header: string; operation: 'set'; value: string }>;
  };
  condition: {
    urlFilter: string;
    resourceTypes: ['main_frame'];
    responseHeaders?: Array<{ header: string; values: string[] }>;
  };
}

/** Rule ids are ours to own; keeping them in one range makes cleanup exact. */
export const RULE_ID_BASE = 1000;

/**
 * Builds the rules that stop Chrome downloading Markdown (FR-24).
 *
 * A server sending `Content-Type: text/markdown` makes Chrome download the
 * file, so no page exists and no content script runs. Rewriting the header to
 * `text/plain` restores the situation the reader already handles.
 *
 * **This rule currently does nothing.** It fires only when the response
 * already carries a Markdown content type, and browsers display those as text
 * pages rather than downloading them -- measured on Chrome 153, Edge 153 and
 * both Chromium builds Playwright ships. The responses that do download,
 * `application/octet-stream` and anything with `Content-Disposition:
 * attachment`, are excluded by this rule's own condition. Remote rendering
 * works because the content script is registered for the approved origin.
 * Open question Q14 holds the decision: drop the permission, widen the rule,
 * or keep it as insurance for older Chrome and stop claiming anything for it.
 *
 * Scoped to `main_frame` only: this must never touch a subresource a page
 * fetches for its own purposes.
 */
export function buildHeaderRules(patterns: string[]): HeaderRule[] {
  return patterns.map((pattern, index) => ({
    id: RULE_ID_BASE + index,
    priority: 1,
    action: {
      type: 'modifyHeaders' as const,
      responseHeaders: [
        {
          header: 'content-type',
          operation: 'set' as const,
          value: 'text/plain; charset=utf-8',
        },
      ],
    },
    condition: {
      urlFilter: pattern,
      resourceTypes: ['main_frame'] as ['main_frame'],
      // Only rewrite when the server really did send a Markdown type; an
      // unconditional rewrite would break every HTML page on the origin.
      responseHeaders: [{ header: 'content-type', values: MARKDOWN_CONTENT_TYPES }],
    },
  }));
}
