import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/** How long the width has to stop changing before it is written. */
const SAVE_DELAY_MS = 200;

/**
 * The sidebar's width, applied to the document and remembered.
 *
 * Two separate setters, for two genuinely different operations:
 *
 * - `setWidth` takes an absolute width, which is what a pointer produces.
 * - `nudgeWidth` takes a delta and applies it with the functional form of
 *   the state setter. Arrow keys arrive faster than Preact re-renders, and
 *   an absolute `width + step` computed from a prop drops every press that
 *   lands in the same frame as the one before it — pressing Left three
 *   times moved the sidebar twice.
 *
 * The write is debounced rather than tied to the end of a gesture. A drag
 * produces a width per pointer move, and storing each one would repeat the
 * mistake that `useScrollMemory` exists to avoid.
 */
export function useSidebarWidth(
  doc: Document,
  load: () => Promise<number>,
  save: (width: number) => void,
  clamp: (width: number) => number,
  fallback: number,
): { width: number; setWidth: (w: number) => void; nudgeWidth: (delta: number) => void } {
  const [width, setWidthState] = useState(fallback);

  // Nothing is written until the reader has actually moved the handle;
  // otherwise merely opening a document would store the default back.
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void load().then((stored) => {
      if (!cancelled) setWidthState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // A custom property rather than a style on the element: the sidebar and
  // the narrow-window rules read the same token, so the width has one
  // source.
  useEffect(() => {
    doc.documentElement.style.setProperty('--mw-sidebar-width', `${width}px`);
  }, [doc, width]);

  const latest = useRef(width);
  latest.current = width;

  useEffect(() => {
    if (!touched.current) return;
    const timer = setTimeout(() => save(width), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [width, save]);

  /*
   * Flush on the way out.
   *
   * Reader mode opens a document by loading a page, so resizing the sidebar
   * and immediately clicking a file would otherwise lose the new width in
   * the debounce window. Best effort — a storage write started during
   * pagehide is not guaranteed to land — which is why the debounce above is
   * short rather than relying on this.
   */
  useEffect(() => {
    const view = doc.defaultView;
    if (!view) return;
    const flush = () => {
      if (touched.current) save(latest.current);
    };
    view.addEventListener('pagehide', flush);
    return () => view.removeEventListener('pagehide', flush);
  }, [doc, save]);

  const setWidth = useCallback(
    (next: number) => {
      touched.current = true;
      setWidthState(clamp(next));
    },
    [clamp],
  );

  const nudgeWidth = useCallback(
    (delta: number) => {
      touched.current = true;
      setWidthState((current) => clamp(current + delta));
    },
    [clamp],
  );

  return { width, setWidth, nudgeWidth };
}
