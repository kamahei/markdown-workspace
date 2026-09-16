/**
 * Whether the extension this content script belongs to still exists.
 *
 * A content script outlives its extension. Reload it, update it, or let
 * Chrome update it from the store, and every page already open keeps running
 * the old script with a dead connection. The next call into any extension
 * API throws "Extension context invalidated."
 *
 * It throws **synchronously**, because the API object itself is gone rather
 * than the call failing: `browser.storage` is `undefined`, so reading
 * `.local` off it is a TypeError before any promise exists. That is why a
 * trailing `.catch()` did not help, and why saving a scroll position put an
 * uncaught error in the page — and in the extension's error list, which is
 * one of the first things a store reviewer looks at.
 *
 * What should happen instead is nothing. The document is already rendered
 * and still readable; what stops working is the sidebar, the settings sync
 * and the reading position, none of which are worth an exception in
 * somebody's console. A reload of the page restores all of it.
 */

/** True while the extension backing this script is still installed. */
export function isExtensionAlive(): boolean {
  try {
    // `runtime.id` is present exactly while the context is valid, and
    // reading it does not throw the way a real API call does.
    return typeof chrome !== 'undefined' && chrome.runtime?.id !== undefined;
  } catch {
    return false;
  }
}

/**
 * Runs an extension API call, or gives up quietly.
 *
 * Returns `fallback` both when the context has already gone and when the
 * call throws on the way — the check and the call are not atomic, and an
 * update can land between them.
 */
export function guard<T>(call: () => T, fallback: T): T {
  if (!isExtensionAlive()) return fallback;
  try {
    return call();
  } catch {
    return fallback;
  }
}

/**
 * The async form. A rejected promise is caught too, not only a synchronous
 * throw, since which one happens depends on how far the call got.
 */
export async function guardAsync<T>(call: () => Promise<T>, fallback: T): Promise<T> {
  if (!isExtensionAlive()) return fallback;
  try {
    return await call();
  } catch {
    return fallback;
  }
}
