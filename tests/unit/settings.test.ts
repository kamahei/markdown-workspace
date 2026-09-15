import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  migrateSettings,
  nextTheme,
  normalizeSettings,
  renderOptionsFrom,
  resolveTheme,
  SETTINGS_SCHEMA_VERSION,
} from '@core/settings';
import {
  documentStateKey,
  fromScrollRatio,
  hashPath,
  normalizeDocumentState,
  selectExpiredKeys,
  toScrollRatio,
} from '@core/settings/document-state';

describe('defaults', () => {
  it('starts with no allowed origins (FR-22)', () => {
    // The single most important default: nothing is enabled at install.
    expect(defaultSettings().allowedOrigins).toEqual([]);
  });

  it('follows the system theme by default', () => {
    expect(defaultSettings().theme).toBe('system');
  });

  it('excludes the usual noise directories (FR-20)', () => {
    expect(defaultSettings().fileBrowser.excludedDirectories).toContain('node_modules');
    expect(defaultSettings().fileBrowser.excludedDirectories).toContain('.git');
  });

  it('does not share mutable state between calls', () => {
    const a = defaultSettings();
    a.fileBrowser.excludedDirectories.push('mutated');
    expect(defaultSettings().fileBrowser.excludedDirectories).not.toContain('mutated');
  });
});

describe('normalizeSettings', () => {
  it('falls back for a non-object', () => {
    for (const value of [null, undefined, 42, 'text', []]) {
      expect(normalizeSettings(value)).toEqual(defaultSettings());
    }
  });

  it('falls back field by field, so one bad value costs only that field', () => {
    const result = normalizeSettings({
      theme: 'chartreuse',
      contentWidth: 'wide',
      markdown: { preset: 'gfm', linkify: 'yes' },
    });
    expect(result.theme).toBe('system');
    // The valid neighbours survive.
    expect(result.contentWidth).toBe('wide');
    expect(result.markdown.preset).toBe('gfm');
    expect(result.markdown.linkify).toBe(true);
  });

  it('keeps valid values', () => {
    const result = normalizeSettings({
      theme: 'dark',
      features: { highlight: false, math: false, diagrams: true, tableOfContents: true },
      fileBrowser: {
        showHiddenFiles: true,
        sortBy: 'modified',
        excludedDirectories: ['x'],
      },
    });
    expect(result.theme).toBe('dark');
    expect(result.features.highlight).toBe(false);
    expect(result.fileBrowser.sortBy).toBe('modified');
    expect(result.fileBrowser.excludedDirectories).toEqual(['x']);
  });

  it('drops malformed origin rules but keeps the good ones', () => {
    const result = normalizeSettings({
      allowedOrigins: [
        { pattern: 'https://ok.test/*', addedAt: 1, enabled: true },
        { pattern: '' },
        { nope: true },
        'not an object',
      ],
    });
    expect(result.allowedOrigins).toHaveLength(1);
    expect(result.allowedOrigins[0]!.pattern).toBe('https://ok.test/*');
  });

  it('defaults an origin rule to enabled when the flag is missing', () => {
    const result = normalizeSettings({
      allowedOrigins: [{ pattern: 'https://ok.test/*' }],
    });
    expect(result.allowedOrigins[0]).toEqual({
      pattern: 'https://ok.test/*',
      addedAt: 0,
      enabled: true,
    });
  });
});

describe('migrateSettings', () => {
  it('treats a record with no version as version 0 and migrates it', () => {
    const migrated = migrateSettings({ theme: 'dark', contentWidth: 'narrow' });
    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    // A migration must not lose settings the user already chose.
    expect(migrated.theme).toBe('dark');
    expect(migrated.contentWidth).toBe('narrow');
  });

  it('passes a current-version record through', () => {
    const current = { ...defaultSettings(), theme: 'light' as const };
    expect(migrateSettings(current).theme).toBe('light');
  });

  it('keeps what it understands from a newer build rather than resetting', () => {
    // A record from a future version is not unmigratable: every field is
    // validated independently, so anything unrecognized falls back on its own.
    // Wiping the user's theme because they once ran a newer build would be a
    // worse outcome than forward-compatibility.
    const future = { ...defaultSettings(), schemaVersion: 999, theme: 'dark' as const };
    const migrated = migrateSettings(future);
    expect(migrated.theme).toBe('dark');
    expect(migrated.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
  });

  it('falls back to defaults when the migration chain has a gap', () => {
    // Version 0.5 has no migration registered, so there is no safe path
    // forward and a half-migrated record is worse than a fresh one.
    expect(migrateSettings({ schemaVersion: 0.5, theme: 'dark' })).toEqual(
      defaultSettings(),
    );
  });

  it('never throws, whatever it is given', () => {
    for (const value of [
      null,
      undefined,
      0,
      '',
      [],
      { schemaVersion: 'x' },
      { schemaVersion: NaN },
    ]) {
      expect(() => migrateSettings(value)).not.toThrow();
      expect(migrateSettings(value).schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    }
  });

  it('survives a deeply malformed record', () => {
    const migrated = migrateSettings({
      schemaVersion: 1,
      features: 'not an object',
      markdown: null,
      fileBrowser: [],
      allowedOrigins: 'nope',
    });
    // A corrupted setting must never stop a document from rendering.
    expect(migrated).toEqual(defaultSettings());
  });
});

describe('theme resolution (FR-27)', () => {
  it('resolves system to the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('lets an explicit choice win over the OS', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('cycles light -> dark -> system', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
    expect(nextTheme('system')).toBe('light');
  });
});

describe('renderOptionsFrom', () => {
  it('maps feature toggles onto the pipeline', () => {
    const settings = defaultSettings();
    settings.features.math = false;
    settings.features.diagrams = false;
    settings.markdown.breaks = true;

    const options = renderOptionsFrom(settings);
    expect(options.math).toBe(false);
    expect(options.diagrams).toBe(false);
    expect(options.breaks).toBe(true);
  });
});

describe('document state (FR-30)', () => {
  it('hashes a path rather than storing it', () => {
    const key = documentStateKey('/home/me/secret-project/plans.md');
    // Directory structure must not leak into a storage key name.
    expect(key).not.toContain('secret-project');
    expect(key).not.toContain('/');
    expect(key.startsWith('docState:')).toBe(true);
  });

  it('produces stable keys across calls', () => {
    expect(hashPath('/a/b.md')).toBe(hashPath('/a/b.md'));
  });

  it('separates paths that differ only by order', () => {
    // A single-pass FNV would collide on some transpositions.
    expect(hashPath('/ab/cd.md')).not.toBe(hashPath('/cd/ab.md'));
    expect(hashPath('/a.md')).not.toBe(hashPath('/b.md'));
  });

  it('normalizes a stored record, clamping the ratio', () => {
    expect(normalizeDocumentState({ scrollRatio: 5 }).scrollRatio).toBe(1);
    expect(normalizeDocumentState({ scrollRatio: -2 }).scrollRatio).toBe(0);
    expect(normalizeDocumentState({ scrollRatio: 'x' }).scrollRatio).toBe(0);
    expect(normalizeDocumentState(null).scrollRatio).toBe(0);
  });

  it('round-trips a scroll position as a ratio', () => {
    // A ratio survives a resize; a pixel offset would not.
    const ratio = toScrollRatio(500, 2000, 1000);
    expect(ratio).toBeCloseTo(0.5);
    expect(fromScrollRatio(ratio, 2000, 1000)).toBe(500);
    // Same ratio, taller window: still half way through.
    expect(fromScrollRatio(ratio, 4000, 1000)).toBe(1500);
  });

  it('reports zero for a document shorter than the viewport', () => {
    expect(toScrollRatio(0, 500, 1000)).toBe(0);
    expect(fromScrollRatio(0.5, 500, 1000)).toBe(0);
  });

  it('prunes the least recently opened records first', () => {
    const records = Array.from({ length: 12 }, (_, i) => ({
      key: `k${i}`,
      lastOpenedAt: i,
    }));
    expect(selectExpiredKeys(records, 10)).toEqual(['k0', 'k1']);
  });

  it('prunes nothing when under the limit', () => {
    expect(selectExpiredKeys([{ key: 'a', lastOpenedAt: 1 }], 10)).toEqual([]);
  });
});
