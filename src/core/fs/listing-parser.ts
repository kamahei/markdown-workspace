import type { DirectoryEntryPayload } from '../messaging';

/**
 * Parses Chrome's generated `file://` directory listing (architecture.md C3).
 *
 * This is generated markup, not a documented API, so it is isolated here: a
 * format change touches one module. The shape below was captured from a real
 * Chrome rather than assumed — see `tests/fixtures/chrome-directory-listing.html`
 * and the capture spec that regenerates it.
 *
 * Chrome emits one script call per entry:
 *
 *   addRow(name, url, isdir, size, size_string, date_modified, date_modified_string)
 *   addRow("readme.md","readme.md",0,9,"9 B",1789495712,"2026/09/16 3:08:32")
 *
 * `name` is the decoded display name, `url` is percent-encoded, `isdir` is 1
 * or 0, `size` is exact bytes, and `date_modified` is epoch **seconds**. The
 * numeric fields are used rather than the localized strings beside them, which
 * change with the browser's language.
 *
 * A shape that cannot be parsed returns null so the caller can say so.
 * Silently reporting "this folder is empty" would be the worst outcome here:
 * the user sees a plausible answer that is simply false.
 */

/** One quoted JS string argument. */
const STR = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'`;

const ADD_ROW = new RegExp(
  String.raw`addRow\(\s*(${STR})\s*,\s*(${STR})\s*,\s*(\d+)\s*,\s*(-?\d+)\s*,\s*(?:${STR})\s*,\s*(-?\d+)\s*,`,
  'g',
);

/** Markers that identify the page as Chrome's listing even when it has no rows. */
const LISTING_MARKERS = /function addRow\(|id="tbody"|id="listingParsingErrorBox"/;

function unquote(raw: string): string {
  const trimmed = raw.trim();
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  if (!quoted) return trimmed;

  return trimmed
    .slice(1, -1)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\(["'\\/])/g, '$1');
}

function joinPath(directory: string, name: string): string {
  const base = directory.endsWith('/') ? directory : `${directory}/`;
  return `${base}${name}`;
}

/** Chrome filters these itself, but a future build might not. */
function isNavigationEntry(name: string): boolean {
  return name === '.' || name === '..';
}

export function parseDirectoryListing(
  html: string,
  directoryPath: string,
): DirectoryEntryPayload[] | null {
  const entries: DirectoryEntryPayload[] = [];
  let match: RegExpExecArray | null;
  ADD_ROW.lastIndex = 0;

  while ((match = ADD_ROW.exec(html)) !== null) {
    const name = unquote(match[1] ?? '');
    if (!name || isNavigationEntry(name)) continue;

    const isDirectory = match[3] === '1';
    const size = Number(match[4]);
    const epochSeconds = Number(match[5]);

    entries.push({
      name,
      kind: isDirectory ? 'directory' : 'file',
      path: joinPath(directoryPath, name),
      // Chrome reports 0 for directories, which is a placeholder, not a fact.
      size: isDirectory || !Number.isFinite(size) ? null : size,
      modifiedAt:
        Number.isFinite(epochSeconds) && epochSeconds > 0 ? epochSeconds * 1000 : null,
    });
  }

  if (entries.length > 0) return entries;

  // An empty folder is legitimate, but only if this really is Chrome's
  // listing. Requiring a marker stops an unrelated page from parsing as one.
  return LISTING_MARKERS.test(html) ? [] : null;
}
