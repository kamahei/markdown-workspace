import { useEffect } from 'preact/hooks';
import { matchShortcut, type ShortcutAction } from '@core/keyboard';

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

/**
 * Binds the shortcuts to a document.
 *
 * Listens in the capture phase so a shortcut still works when focus is
 * inside the file tree, which handles its own arrow keys. The matching
 * itself is a pure function in core; this only wires it up and prevents the
 * default for the keys we actually claim.
 */
export function useKeyboardShortcuts(doc: Document, handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      const action = matchShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        targetTagName: target?.tagName,
        targetIsEditable: target?.isContentEditable ?? false,
      });

      if (!action) return;

      const handler = handlers[action];
      if (!handler) return;

      // Only claimed once there is something to do with it, so an unhandled
      // key still reaches the browser.
      event.preventDefault();
      event.stopPropagation();
      handler();
    };

    doc.addEventListener('keydown', onKeyDown, true);
    return () => doc.removeEventListener('keydown', onKeyDown, true);
  }, [doc, handlers]);
}
