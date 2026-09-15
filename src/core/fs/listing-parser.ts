import type { DirectoryEntryPayload } from '../messaging';

/**
 * Parses Chrome's generated `file://` directory listing (architecture.md C3).
 *
 * This is generated markup, not a documented API, so it is isolated here: a
 * format change touches one module. Chrome builds the listing client-side by
 * calling `addRow(name, url, isDirectory, size, dateString, ...)` from a
 * script tag, and also renders a `<table>` once that script has run. Both
 * shapes are handled, because a content script may arrive before or after.
 *
 * A shape that cannot be parsed returns null so the caller can say so.
 * Silently reporting "this folder is empty" would be the worst outcome here:
 * the user sees a plausible answer that is simply false.
 */

const ADD_ROW =
  /addRow\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*,\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*,\s*([^,]+)\s*,\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,]+)\s*,\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,)]+)/g;

function unquote(raw: string): string {
  const trimmed = raw.trim();
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  if (!quoted) return trimmed;

  const inner = trimmed.slice(1, -1);
  return inner
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\(["'\\/])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseSize(raw: string): number | null {
  const text = unquote(raw).trim();
  if (!text) return null;
  // Chrome renders sizes like "1.2 kB"; an exact byte count is not available,
  // and guessing from the rounded label would be worse than reporting none.
  const bytes = Number(text.replace(/[^0-9]/g, ''));
  return Number.isFinite(bytes) && text.match(/^\d+$/) ? bytes : null;
}

function parseDate(raw: string): number | null {
  const text = unquote(raw).trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function joinPath(directory: string, name: string): string {
  const base = directory.endsWith('/') ? directory : `${directory}/`;
  return `${base}${name}`;
}

/** Entries Chrome includes that are navigation, not content. */
function isNavigationEntry(name: string): boolean {
  return name === '..' || name === '.' || name === 'Parent Directory';
}

export function parseDirectoryListing(
  html: string,
  directoryPath: string,
): DirectoryEntryPayload[] | null {
  const fromScript = parseFromAddRow(html, directoryPath);
  if (fromScript) return fromScript;

  const fromTable = parseFromTable(html, directoryPath);
  if (fromTable) return fromTable;

  // An empty listing is legitimate, but only if the page really is Chrome's
  // listing. Requiring a marker keeps an unrelated page from parsing as an
  // empty folder.
  if (/addRow|<script>start\(|id="tbody"|id="listingParsingErrorBox"/.test(html)) {
    return [];
  }

  return null;
}

function parseFromAddRow(
  html: string,
  directoryPath: string,
): DirectoryEntryPayload[] | null {
  const entries: DirectoryEntryPayload[] = [];
  let match: RegExpExecArray | null;
  ADD_ROW.lastIndex = 0;

  while ((match = ADD_ROW.exec(html)) !== null) {
    const name = unquote(match[1] ?? '');
    if (!name || isNavigationEntry(name)) continue;

    const isDirectory = /true|1/i.test((match[3] ?? '').trim());
    entries.push({
      name,
      kind: isDirectory ? 'directory' : 'file',
      path: joinPath(directoryPath, name),
      size: isDirectory ? null : parseSize(match[4] ?? ''),
      modifiedAt: parseDate(match[5] ?? ''),
    });
  }

  return entries.length > 0 ? entries : null;
}

/** The rendered form, once Chrome's own script has built the table. */
function parseFromTable(
  html: string,
  directoryPath: string,
): DirectoryEntryPayload[] | null {
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi);
  if (!rows) return null;

  const entries: DirectoryEntryPayload[] = [];
  for (const row of rows) {
    const link = row.match(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;

    const href = link[1] ?? '';
    const label = (link[2] ?? '').replace(/<[^>]*>/g, '').trim();
    const name = decodePath(label).replace(/\/$/, '');
    if (!name || isNavigationEntry(name)) continue;

    const cells = row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/gi) ?? [];
    const text = cells.map((c) => c.replace(/<[^>]*>/g, '').trim());

    entries.push({
      name,
      kind: href.endsWith('/') || label.endsWith('/') ? 'directory' : 'file',
      path: joinPath(directoryPath, name),
      size: null,
      modifiedAt: text.length >= 3 ? parseDate(text[2] ?? '') : null,
    });
  }

  return entries.length > 0 ? entries : null;
}
