import { isMarkdownPath } from '../markdown';
import { dirname, joinPath, normalizePath } from '../fs/types';

/**
 * Relative link and image resolution (FR-10..FR-14).
 *
 * Classifies a link and returns an *intent* rather than performing navigation.
 * The UI decides what to do with it, which keeps this testable and keeps
 * navigation policy in one place.
 */

export type LinkIntent =
  /** Scroll within the current document. */
  | { kind: 'fragment'; fragment: string }
  /** Open another Markdown document in the workspace. */
  | { kind: 'document'; path: string; fragment: string | null }
  /** A directory: open its index document, or its tree. */
  | { kind: 'directory'; path: string }
  /** A local file the extension does not render; hand it to the browser. */
  | { kind: 'file'; path: string }
  /** Leaves the workspace; opens in a new tab. */
  | { kind: 'external'; href: string }
  /** Nothing sensible to do, e.g. an empty href. */
  | { kind: 'ignore' };

const EXTERNAL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const LOCAL_SCHEMES = new Set(['file:']);

/** Index documents tried when a link points at a directory (FR-14). */
export const DIRECTORY_INDEX_FILES = ['README.md', 'index.md', 'readme.md'];

export interface ResolveOptions {
  /** Path of the document containing the link. */
  fromPath: string;
}

export function classifyLink(href: string, options: ResolveOptions): LinkIntent {
  const raw = href.trim();
  if (!raw) return { kind: 'ignore' };

  if (raw.startsWith('#')) {
    return { kind: 'fragment', fragment: raw.slice(1) };
  }

  // A scheme means the link is absolute. file: is still ours; everything else
  // leaves the workspace.
  const schemeMatch = raw.match(EXTERNAL_SCHEME);
  if (schemeMatch) {
    const scheme = schemeMatch[0].toLowerCase();
    if (!LOCAL_SCHEMES.has(scheme)) return { kind: 'external', href: raw };

    // file:///x has an empty authority between the slashes; dropping only
    // the leading "//" would leave a doubled slash in the path.
    const withoutScheme = raw.slice(scheme.length).replace(/^\/\/[^/]*/, '');
    return classifyPath(normalizePath(decodeSafely(withoutScheme)));
  }

  // Protocol-relative URLs are external.
  if (raw.startsWith('//')) return { kind: 'external', href: `https:${raw}` };

  const [pathPart = '', fragmentPart] = splitFragment(raw);

  // A bare fragment was handled above; an empty path with a fragment here
  // means something like `?x=1#y`, which stays in the document.
  if (pathPart === '') {
    return fragmentPart
      ? { kind: 'fragment', fragment: fragmentPart }
      : { kind: 'ignore' };
  }

  const resolved = joinPath(
    dirname(options.fromPath),
    decodeSafely(stripQuery(pathPart)),
  );
  const intent = classifyPath(resolved);

  if (intent.kind === 'document') {
    return { ...intent, fragment: fragmentPart ?? null };
  }
  return intent;
}

function classifyPath(path: string): LinkIntent {
  if (path.endsWith('/')) {
    return { kind: 'directory', path: path.replace(/\/+$/, '') || '/' };
  }
  if (isMarkdownPath(path)) {
    return { kind: 'document', path, fragment: null };
  }
  // No extension is far more likely to be a directory than an extensionless
  // file, and the caller falls back to `file` when the directory is missing.
  if (!/\.[^/]+$/.test(path)) {
    return { kind: 'directory', path };
  }
  return { kind: 'file', path };
}

function splitFragment(value: string): [string, string | undefined] {
  const hash = value.indexOf('#');
  if (hash === -1) return [value, undefined];
  return [value.slice(0, hash), value.slice(hash + 1)];
}

function stripQuery(value: string): string {
  const q = value.indexOf('?');
  return q === -1 ? value : value.slice(0, q);
}

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Resolves a relative image reference to a path (FR-11).
 *
 * Returns null when the reference is already absolute or external, meaning the
 * browser can load it unaided.
 */
export function resolveImagePath(src: string, options: ResolveOptions): string | null {
  const raw = src.trim();
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return null;

  const schemeMatch = raw.match(EXTERNAL_SCHEME);
  if (schemeMatch) {
    const scheme = schemeMatch[0].toLowerCase();
    if (!LOCAL_SCHEMES.has(scheme)) return null;
    return normalizePath(
      decodeSafely(raw.slice(scheme.length).replace(/^\/\/[^/]*/, '')),
    );
  }

  if (raw.startsWith('//')) return null;

  return joinPath(dirname(options.fromPath), decodeSafely(stripQuery(raw)));
}

/**
 * Picks a directory's index document (FR-14).
 *
 * Returns null when the directory has none, so the caller can show the tree
 * rather than inventing a document.
 */
export function pickDirectoryIndex(entryNames: string[]): string | null {
  for (const candidate of DIRECTORY_INDEX_FILES) {
    const found = entryNames.find((name) => name === candidate);
    if (found) return found;
  }
  // Fall back to a case-insensitive match before giving up.
  for (const candidate of DIRECTORY_INDEX_FILES) {
    const found = entryNames.find(
      (name) => name.toLowerCase() === candidate.toLowerCase(),
    );
    if (found) return found;
  }
  return null;
}
