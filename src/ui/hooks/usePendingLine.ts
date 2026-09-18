import { useCallback, useState } from 'preact/hooks';

const KEY = 'mw:goto-line';

/**
 * Carries "and scroll to this line" across a reader-mode navigation.
 *
 * A folder search finds a line in a document that is not open. Reader mode
 * opens a document by loading its page, so the line number has to survive a
 * full page load — the same problem as the tree cursor, and the same answer:
 * per-tab `sessionStorage`, taken once and cleared in the same breath.
 *
 * The path is stored alongside the line. Without it, opening some *other*
 * document before the handoff was consumed would scroll that one instead.
 */
export function usePendingLine(doc: Document): {
  /** Path and line handed over by the previous page, if any. */
  pending: { path: string; line: number } | null;
  /** Call immediately before navigating to a search result. */
  handOff: (path: string, line: number) => void;
} {
  const [pending] = useState(() => take(doc));

  const handOff = useCallback(
    (path: string, line: number) => {
      try {
        doc.defaultView?.sessionStorage.setItem(KEY, JSON.stringify({ path, line }));
      } catch {
        // Storage can be blocked. The document still opens; it just opens
        // at the top, which is a worse landing and not a failure.
      }
    },
    [doc],
  );

  return { pending, handOff };
}

function take(doc: Document): { path: string; line: number } | null {
  try {
    const storage = doc.defaultView?.sessionStorage;
    if (!storage) return null;
    const raw = storage.getItem(KEY);
    storage.removeItem(KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { path, line } = parsed as { path?: unknown; line?: unknown };
    if (typeof path !== 'string' || typeof line !== 'number') return null;
    return { path, line };
  } catch {
    return null;
  }
}
