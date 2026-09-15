import { ANCHOR_ATTR } from './types';

/**
 * Restores heading `id`s after sanitization (FR-3).
 *
 * The sanitizer's DOM-clobbering protection removes an `id` whose value
 * collides with a document property. `id="intro"` survives; `id="title"` does
 * not, because `document.title` exists. Silently losing the anchor on some
 * headings and not others is worse than either extreme, so the slug travels
 * through sanitization as a data attribute and the `id` is set here as a DOM
 * property write, which no sanitizer is involved in.
 *
 * The root arrives as a parameter, so this stays free of DOM globals.
 */
export function applyHeadingAnchors(root: ParentNode): void {
  const headings = root.querySelectorAll(`[${ANCHOR_ATTR}]`);
  for (const el of Array.from(headings)) {
    const slug = el.getAttribute(ANCHOR_ATTR);
    if (slug && !el.id) el.id = slug;
  }
}

/**
 * Scrolls to the element matching a URL fragment.
 *
 * Returns false when nothing matched, so the caller can decide whether that is
 * worth reporting. Handles percent-encoded fragments, which is the normal case
 * for non-ASCII headings.
 */
export function scrollToFragment(root: ParentNode, fragment: string): boolean {
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (!raw) return false;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // A malformed escape sequence just means the fragment is used verbatim.
  }

  const target =
    findById(root, decoded) ??
    findById(root, raw) ??
    root.querySelector(`[${ANCHOR_ATTR}="${cssEscape(decoded)}"]`);

  if (!target) return false;
  (target as unknown as { scrollIntoView?: (arg?: unknown) => void }).scrollIntoView?.({
    behavior: 'auto',
    block: 'start',
  });
  return true;
}

function findById(root: ParentNode, id: string): Element | null {
  if (!id) return null;
  try {
    return root.querySelector(`#${cssEscape(id)}`);
  } catch {
    return null;
  }
}

/** Minimal CSS.escape, since core cannot reach for the global. */
function cssEscape(value: string): string {
  return value.replace(/["\\\][:.#()>+~*^$|/?!,='`{}%@;&\s-]/g, (c) => `\\${c}`);
}
