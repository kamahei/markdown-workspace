import { useEffect, useState } from 'preact/hooks';

/**
 * Which heading the reader is currently under.
 *
 * Drives `aria-current` in the outline, so the table of contents says where
 * you are rather than only where you could go.
 *
 * `IntersectionObserver` answers "what is on screen", which is not the
 * question — deep inside a long section no heading is visible at all. So the
 * observer is used only as a *change signal*, and the answer comes from
 * measuring: the last heading whose top is at or above the activation line,
 * which is the one whose text you are reading.
 *
 * That signal is sufficient on its own, which is worth stating because it
 * looks like it should not be. The active heading changes exactly when some
 * heading crosses the activation line, and a crossing is exactly what the
 * observer reports; between crossings the correct answer cannot have
 * changed. A scroll listener was added here first and then removed once a
 * test proved it made no difference — layout shifts (an image loading, a
 * diagram rendering) move headings across the line too, and the observer
 * reports those as well.
 *
 * `rootMargin` pulls the line down from the very top so a heading scrolled
 * flush to the edge counts as entered rather than as still ahead.
 */

/** How far below the top of the scroller the "you are here" line sits. */
const ACTIVATION_OFFSET = 96;

export function useActiveHeading(
  /** The element the document is rendered into. */
  root: { current: HTMLElement | null },
  /** Anchor ids, in document order. Re-runs when the document changes. */
  ids: string[],
  /** False while the raw source is showing: there are no headings then. */
  enabled: boolean,
): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!enabled || !el || ids.length === 0) {
      setActive(null);
      return;
    }

    const view = el.ownerDocument.defaultView;
    if (!view?.IntersectionObserver) {
      // No observer: the outline still navigates, it just does not follow.
      return;
    }

    const headings = ids
      .map((id) => el.querySelector<HTMLElement>(`[id="${cssQuote(id)}"]`))
      .filter((node): node is HTMLElement => node !== null);
    if (headings.length === 0) {
      setActive(null);
      return;
    }

    const update = () => {
      let current: string | null = null;
      for (const heading of headings) {
        // Relative to the viewport, which is what getBoundingClientRect
        // gives, so this works whether the scroller is the window or a
        // pane inside it.
        if (heading.getBoundingClientRect().top <= ACTIVATION_OFFSET) {
          current = heading.id;
        } else {
          break;
        }
      }
      // Above the first heading — front matter, or a title block — belongs
      // to the first section rather than to none.
      setActive(current ?? headings[0]!.id);
    };

    const observer = new view.IntersectionObserver(update, {
      rootMargin: `-${ACTIVATION_OFFSET}px 0px 0px 0px`,
      threshold: 0,
    });
    for (const heading of headings) observer.observe(heading);
    update();

    return () => observer.disconnect();
  }, [root, ids, enabled]);

  return active;
}

/** Escapes a quote so an id containing one cannot break out of the selector. */
function cssQuote(id: string): string {
  return id.replace(/["\\]/g, '\\$&');
}
