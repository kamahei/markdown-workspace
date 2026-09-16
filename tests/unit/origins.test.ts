import { describe, expect, it } from 'vitest';
import {
  activePatterns,
  addOrigin,
  hasOrigin,
  normalizePattern,
  reconcileOrigins,
  removeOrigin,
} from '@core/origins';
import { defaultSettings, type Settings } from '@core/settings';

const withOrigins = (patterns: Array<[string, boolean]>): Settings => ({
  ...defaultSettings(),
  allowedOrigins: patterns.map(([pattern, enabled]) => ({
    pattern,
    addedAt: 1,
    enabled,
  })),
});

describe('normalizePattern', () => {
  it('normalizes a bare host to an https pattern', () => {
    expect(normalizePattern('docs.example.com')).toMatchObject({
      ok: true,
      pattern: 'https://docs.example.com/*',
    });
  });

  it('keeps an explicit scheme', () => {
    expect(normalizePattern('http://intranet.local').pattern).toBe(
      'http://intranet.local/*',
    );
  });

  it('strips a path and trailing wildcards', () => {
    expect(normalizePattern('https://example.test/docs/guide.md').pattern).toBe(
      'https://example.test/*',
    );
    expect(normalizePattern('https://example.test/*').pattern).toBe(
      'https://example.test/*',
    );
  });

  it('accepts a subdomain wildcard', () => {
    expect(normalizePattern('https://*.example.test').ok).toBe(true);
  });

  it('refuses an all-hosts pattern', () => {
    // This is the whole point of opt-in origins: one site at a time. An
    // all-hosts pattern would be a broad host permission by another name.
    for (const input of ['*', 'https://*', 'https://*/*', '*://*/*']) {
      expect(normalizePattern(input).ok).toBe(false);
    }
  });

  it('refuses a non-web scheme', () => {
    expect(normalizePattern('file:///home/me').ok).toBe(false);
    expect(normalizePattern('ftp://example.test').ok).toBe(false);
  });

  it('refuses empty input with a usable message', () => {
    const result = normalizePattern('   ');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('add and remove', () => {
  it('adds an origin as enabled', () => {
    const settings = addOrigin(defaultSettings(), 'https://a.test/*');
    expect(settings.allowedOrigins).toHaveLength(1);
    expect(settings.allowedOrigins[0]).toMatchObject({
      pattern: 'https://a.test/*',
      enabled: true,
    });
  });

  it('re-enables rather than duplicating an existing origin', () => {
    const settings = addOrigin(
      withOrigins([['https://a.test/*', false]]),
      'https://a.test/*',
    );
    expect(settings.allowedOrigins).toHaveLength(1);
    expect(settings.allowedOrigins[0]!.enabled).toBe(true);
  });

  it('removes an origin', () => {
    const settings = removeOrigin(
      withOrigins([
        ['https://a.test/*', true],
        ['https://b.test/*', true],
      ]),
      'https://a.test/*',
    );
    expect(settings.allowedOrigins.map((o) => o.pattern)).toEqual(['https://b.test/*']);
  });

  it('does not mutate the input', () => {
    const original = defaultSettings();
    addOrigin(original, 'https://a.test/*');
    expect(original.allowedOrigins).toEqual([]);
  });

  it('reports membership', () => {
    const settings = withOrigins([['https://a.test/*', true]]);
    expect(hasOrigin(settings, 'https://a.test/*')).toBe(true);
    expect(hasOrigin(settings, 'https://b.test/*')).toBe(false);
  });
});

describe('reconcileOrigins (FR-23)', () => {
  it('disables a rule whose permission was revoked, rather than deleting it', () => {
    // Deleting would lose the user's configuration silently. Disabling lets
    // the options page show what happened.
    const settings = reconcileOrigins(
      withOrigins([
        ['https://a.test/*', true],
        ['https://b.test/*', true],
      ]),
      ['https://a.test/*'],
    );
    expect(settings.allowedOrigins).toHaveLength(2);
    expect(settings.allowedOrigins[0]!.enabled).toBe(true);
    expect(settings.allowedOrigins[1]!.enabled).toBe(false);
  });

  it('re-enables a rule whose permission came back', () => {
    const settings = reconcileOrigins(withOrigins([['https://a.test/*', false]]), [
      'https://a.test/*',
    ]);
    expect(settings.allowedOrigins[0]!.enabled).toBe(true);
  });

  it('returns the same object when nothing changed', () => {
    // Identity is the signal the caller uses to skip a storage write and a
    // broadcast on every startup.
    const settings = withOrigins([['https://a.test/*', true]]);
    expect(reconcileOrigins(settings, ['https://a.test/*'])).toBe(settings);
  });

  it('disables everything when nothing is granted', () => {
    const settings = reconcileOrigins(
      withOrigins([
        ['https://a.test/*', true],
        ['https://b.test/*', true],
      ]),
      [],
    );
    expect(settings.allowedOrigins.every((o) => !o.enabled)).toBe(true);
  });
});

describe('activePatterns', () => {
  it('lists only rules that are both wanted and granted', () => {
    expect(
      activePatterns(
        withOrigins([
          ['https://a.test/*', true],
          ['https://b.test/*', false],
        ]),
      ),
    ).toEqual(['https://a.test/*']);
  });

  it('is empty by default (FR-22)', () => {
    expect(activePatterns(defaultSettings())).toEqual([]);
  });
});
