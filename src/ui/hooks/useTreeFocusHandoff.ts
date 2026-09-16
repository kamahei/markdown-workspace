import { useCallback, useState } from 'preact/hooks';

const KEY = 'mw:focus-tree';

/**
 * Carries keyboard focus across a reader-mode navigation.
 *
 * Reader mode opens a document by loading a new `file://` page, so focus
 * returns to the body every single time. From the reader's point of view
 * nothing navigated — they picked a file in a sidebar — so arrowing to the
 * next document and pressing Enter dropped them out of the tree on every
 * open, which is what made keyboard navigation of a folder unusable in
 * reader mode while working fine in the workspace, where opening a document
 * never reloads the page.
 *
 * `sessionStorage` is the right scope and the right lifetime: it is per tab,
 * so two tabs reading different folders cannot interfere, and it is gone
 * with the session. That it works at all on `file://` pages was checked in a
 * real browser rather than assumed — `file://` shares one opaque origin, and
 * the flag does not leak between tabs.
 */
export function useTreeFocusHandoff(doc: Document): {
  /** The previous page handed focus over; the tree should take it back. */
  restoreTreeFocus: boolean;
  /** Call immediately before navigating away. */
  handOffTreeFocus: () => void;
} {
  // Read once, during the first render, and cleared in the same breath: the
  // flag must survive exactly one navigation.
  const [restoreTreeFocus] = useState(() => take(doc));

  const handOffTreeFocus = useCallback(() => {
    // Only when the tree actually holds focus. Someone who followed a link
    // inside the document should land in the document, not be dragged into
    // the sidebar by the act of following it.
    const active = doc.activeElement;
    if (!active?.closest('[role="tree"]')) return;
    try {
      doc.defaultView?.sessionStorage.setItem(KEY, '1');
    } catch {
      // Storage can be blocked. The cost is one lost cursor, not a failed
      // navigation, so this is deliberately silent.
    }
  }, [doc]);

  return { restoreTreeFocus, handOffTreeFocus };
}

function take(doc: Document): boolean {
  try {
    const storage = doc.defaultView?.sessionStorage;
    if (!storage) return false;
    const value = storage.getItem(KEY);
    storage.removeItem(KEY);
    return value === '1';
  } catch {
    return false;
  }
}
