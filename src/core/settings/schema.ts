/**
 * Settings schema, defaults and migrations (see .project/data-model.md).
 *
 * Migrations are pure functions of the stored object so they can be tested
 * against real historical shapes. An unmigratable record falls back to
 * defaults rather than throwing: a corrupted setting must never stop a
 * document from rendering.
 */

import { clampContentWidth, CONTENT_WIDTH_DEFAULT } from './layout';

export const SETTINGS_SCHEMA_VERSION = 2;

export type ThemeMode = 'light' | 'dark' | 'system';
/** Percentage of the reading pane a line of text uses. See layout.ts. */
export type ContentWidth = number;
export type MarkdownPreset = 'commonmark' | 'gfm';
export type SortBy = 'name' | 'modified';

export interface OriginRule {
  /** Match pattern, e.g. `https://docs.example.com/*`. */
  pattern: string;
  addedAt: number;
  /**
   * Whether the rule is active. This is the user's intent; Chrome's granted
   * permission set is the authority. A rule whose permission was revoked
   * outside the extension is disabled here rather than deleted, so the user
   * can see what happened instead of silently losing their configuration.
   */
  enabled: boolean;
}

export interface Settings {
  schemaVersion: number;
  theme: ThemeMode;
  contentWidth: ContentWidth;
  features: {
    highlight: boolean;
    math: boolean;
    diagrams: boolean;
    tableOfContents: boolean;
  };
  markdown: {
    preset: MarkdownPreset;
    linkify: boolean;
    typographer: boolean;
    breaks: boolean;
  };
  fileBrowser: {
    showHiddenFiles: boolean;
    excludedDirectories: string[];
    sortBy: SortBy;
  };
  allowedOrigins: OriginRule[];
}

export const DEFAULT_EXCLUDED_DIRECTORIES = [
  '.git',
  'node_modules',
  '.wxt',
  '.output',
  'dist',
];

export function defaultSettings(): Settings {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    theme: 'system',
    contentWidth: CONTENT_WIDTH_DEFAULT,
    features: {
      highlight: true,
      math: true,
      diagrams: true,
      tableOfContents: true,
    },
    markdown: {
      preset: 'gfm',
      linkify: true,
      typographer: false,
      breaks: false,
    },
    fileBrowser: {
      showHiddenFiles: false,
      // A repository's node_modules would otherwise dominate the tree.
      excludedDirectories: [...DEFAULT_EXCLUDED_DIRECTORIES],
      sortBy: 'name',
    },
    // Empty on install and it must stay that way (FR-22).
    allowedOrigins: [],
  };
}

// --- Validation -----------------------------------------------------------

const THEMES: ThemeMode[] = ['light', 'dark', 'system'];
const PRESETS: MarkdownPreset[] = ['commonmark', 'gfm'];
const SORTS: SortBy[] = ['name', 'modified'];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const pick = <T>(value: unknown, allowed: T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

function readOrigins(value: unknown): OriginRule[] {
  if (!Array.isArray(value)) return [];
  const out: OriginRule[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const pattern = item.pattern;
    if (typeof pattern !== 'string' || pattern === '') continue;
    out.push({
      pattern,
      addedAt: typeof item.addedAt === 'number' ? item.addedAt : 0,
      enabled: bool(item.enabled, true),
    });
  }
  return out;
}

/**
 * Coerces an arbitrary stored value into valid settings.
 *
 * Every field falls back independently, so one bad value costs only that
 * field rather than the whole record.
 */
export function normalizeSettings(value: unknown): Settings {
  const base = defaultSettings();
  if (!isRecord(value)) return base;

  const features = isRecord(value.features) ? value.features : {};
  const markdown = isRecord(value.markdown) ? value.markdown : {};
  const fileBrowser = isRecord(value.fileBrowser) ? value.fileBrowser : {};

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    theme: pick(value.theme, THEMES, base.theme),
    contentWidth: clampContentWidth(value.contentWidth),
    features: {
      highlight: bool(features.highlight, base.features.highlight),
      math: bool(features.math, base.features.math),
      diagrams: bool(features.diagrams, base.features.diagrams),
      tableOfContents: bool(features.tableOfContents, base.features.tableOfContents),
    },
    markdown: {
      preset: pick(markdown.preset, PRESETS, base.markdown.preset),
      linkify: bool(markdown.linkify, base.markdown.linkify),
      typographer: bool(markdown.typographer, base.markdown.typographer),
      breaks: bool(markdown.breaks, base.markdown.breaks),
    },
    fileBrowser: {
      showHiddenFiles: bool(
        fileBrowser.showHiddenFiles,
        base.fileBrowser.showHiddenFiles,
      ),
      excludedDirectories: Array.isArray(fileBrowser.excludedDirectories)
        ? fileBrowser.excludedDirectories.filter(
            (d): d is string => typeof d === 'string',
          )
        : base.fileBrowser.excludedDirectories,
      sortBy: pick(fileBrowser.sortBy, SORTS, base.fileBrowser.sortBy),
    },
    allowedOrigins: readOrigins(value.allowedOrigins),
  };
}

// --- Migrations -----------------------------------------------------------

type Migration = (value: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by the version being migrated *from*.
 *
 * Version 0 means a record predating versioning, or one whose version could
 * not be read.
 */
const MIGRATIONS: Record<number, Migration> = {
  0: (value) => ({ ...value, schemaVersion: 1 }),
  // contentWidth stopped being 'narrow' | 'normal' | 'wide' and became a
  // percentage. clampContentWidth understands the old names, so this only
  // has to carry the value across and move the version along -- written
  // out rather than skipped, because a migration that looks like a no-op
  // is the one nobody notices is missing.
  1: (value) => ({
    ...value,
    contentWidth: clampContentWidth(value.contentWidth),
    schemaVersion: 2,
  }),
};

/** Applies migrations in order, then normalizes. Never throws. */
export function migrateSettings(stored: unknown): Settings {
  if (!isRecord(stored)) return defaultSettings();

  try {
    let value = { ...stored };
    let version =
      typeof value.schemaVersion === 'number' && Number.isFinite(value.schemaVersion)
        ? value.schemaVersion
        : 0;

    while (version < SETTINGS_SCHEMA_VERSION) {
      const migrate = MIGRATIONS[version];
      // A gap in the chain means the record came from a newer build, or the
      // chain is broken. Either way, defaults beat a half-migrated record.
      if (!migrate) return defaultSettings();
      value = migrate(value);
      version += 1;
    }

    return normalizeSettings(value);
  } catch {
    return defaultSettings();
  }
}

/** Render options derived from settings, for the Markdown pipeline. */
export function renderOptionsFrom(settings: Settings) {
  return {
    preset: settings.markdown.preset,
    linkify: settings.markdown.linkify,
    typographer: settings.markdown.typographer,
    breaks: settings.markdown.breaks,
    math: settings.features.math,
    diagrams: settings.features.diagrams,
  };
}
