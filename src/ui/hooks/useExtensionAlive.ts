import { useEffect, useState } from 'preact/hooks';

/** How often to look. A property read, so this is close to free. */
const INTERVAL_MS = 5000;

/**
 * Whether the extension behind this content script still exists.
 *
 * Reloading or updating the extension leaves the page rendered and readable
 * but disconnected: the sidebar, the settings and the reading position all
 * stop working, silently. Silence was the right first fix — an uncaught
 * "Extension context invalidated" in somebody's console helps nobody — but
 * silence alone leaves a reader clicking a sidebar that has quietly become
 * decoration.
 *
 * Polled rather than pushed, because there is no event for this: the
 * extension does not get to tell a page it has gone. The check is a
 * property read, and it stops as soon as the answer is no, so it costs one
 * lookup every five seconds for as long as things are working.
 *
 * `check` is injected so this file stays free of extension APIs, like
 * everything else under `src/ui/`.
 */
export function useExtensionAlive(check: () => boolean): boolean {
  const [alive, setAlive] = useState(true);

  useEffect(() => {
    if (!alive) return;
    const timer = setInterval(() => {
      if (!check()) setAlive(false);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [check, alive]);

  return alive;
}
