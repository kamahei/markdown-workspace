import { isMarkdownPath } from '../markdown';

/**
 * What the reader content script should do with a page (FR-9, FR-16).
 *
 * Classification runs before any heavy import. A page the extension does not
 * handle must cost essentially nothing, so this module stays free of the
 * renderer and everything it drags in.
 */
export type PageKind = 'markdown' | 'directory' | 'unhandled';

export interface PageInfo {
  kind: PageKind;
  /** Decoded path of the document or directory, when applicable. */
  path: string | null;
  /** Directory containing the document, used to root the sidebar. */
  directory: string | null;
  protocol: 'file:' | 'http:' | 'https:' | 'other';
}

const UNHANDLED: PageInfo = {
  kind: 'unhandled',
  path: null,
  directory: null,
  protocol: 'other',
};

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape sequence is not worth failing over; the raw form
    // still identifies the file.
    return value;
  }
}

/** The directory portion of a path, with its trailing slash. */
export function dirnameOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? '/' : path.slice(0, cut + 1);
}

export interface ClassifyOptions {
  /**
   * Response content type, when known. Only consulted for http(s), where a
   * URL may serve Markdown without a telling extension.
   */
  contentType?: string | null;
}

/**
 * Decides what a URL represents.
 *
 * Chrome renders a `file://` Markdown file as a plain-text page, which is what
 * makes takeover possible at all, and renders a `file://` directory as its own
 * generated listing — the page this replaces with the file browser.
 */
export function classifyUrl(rawUrl: string, options: ClassifyOptions = {}): PageInfo {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return UNHANDLED;
  }

  const protocol =
    url.protocol === 'file:' || url.protocol === 'http:' || url.protocol === 'https:'
      ? (url.protocol as PageInfo['protocol'])
      : 'other';

  if (protocol === 'other') return UNHANDLED;

  const path = decode(url.pathname);

  if (protocol === 'file:') {
    // A trailing slash on file:// is Chrome's directory listing.
    if (path.endsWith('/')) {
      return { kind: 'directory', path, directory: path, protocol };
    }
    if (isMarkdownPath(path)) {
      return { kind: 'markdown', path, directory: dirnameOf(path), protocol };
    }
    return { ...UNHANDLED, protocol };
  }

  // http(s): the extension only reaches here for an origin the user opted
  // into, so being generous about detection is safe.
  if (isMarkdownPath(path)) {
    return { kind: 'markdown', path, directory: dirnameOf(path), protocol };
  }

  const type = options.contentType?.split(';')[0]?.trim().toLowerCase();
  if (type === 'text/markdown' || type === 'text/x-markdown') {
    return { kind: 'markdown', path, directory: dirnameOf(path), protocol };
  }

  return { ...UNHANDLED, protocol };
}

/**
 * Extracts the Markdown source from a page Chrome rendered as plain text.
 *
 * Chrome wraps a plain-text response in a single `<pre>`. Reading
 * `body.textContent` instead would work for that case but would also happily
 * return the text of a real HTML page, so the `<pre>` is required and its
 * absence means this is not a plain-text page after all.
 */
export function extractPlainTextSource(doc: Document): string | null {
  const pre = doc.body?.querySelector('pre');
  if (pre) return pre.textContent ?? '';

  // Some responses arrive with no wrapper when the body is empty.
  const body = doc.body;
  if (body && body.children.length === 0) return body.textContent ?? '';

  return null;
}
