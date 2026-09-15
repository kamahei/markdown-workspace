import { useEffect, useRef } from 'preact/hooks';
import { fromScrollRatio, toScrollRatio } from '@core/settings';

/**
 * Restores and remembers reading position (FR-30).
 *
 * Stored as a ratio rather than a pixel offset, because a pixel offset is
 * wrong the moment the window width, theme or font changes.
 *
 * Writes are debounced: a scroll produces an event per frame, and persisting
 * each one would mean thousands of storage writes for one page of reading.
 */
export function useScrollMemory(
  scroller: { current: HTMLElement | null },
  key: string | null,
  load: (key: string) => Promise<number>,
  save: (key: string, ratio: number) => void,
  /** Restore only once the document is actually laid out. */
  ready: boolean,
) {
  const restored = useRef<string | null>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !key || !ready || restored.current === key) return;

    restored.current = key;
    void load(key).then((ratio) => {
      if (ratio <= 0) return;
      // After paint, so scrollHeight reflects the rendered document.
      requestAnimationFrame(() => {
        const target = scroller.current;
        if (!target) return;
        target.scrollTop = fromScrollRatio(
          ratio,
          target.scrollHeight,
          target.clientHeight,
        );
      });
    });
  }, [scroller, key, ready, load]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !key) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        save(key, toScrollRatio(el.scrollTop, el.scrollHeight, el.clientHeight));
      }, 400);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
    };
  }, [scroller, key, save]);
}
