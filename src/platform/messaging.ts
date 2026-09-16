import type { Request, ResponseFor } from '@core/messaging';
import { guard, isExtensionAlive } from './extension-context';

/**
 * Typed wrapper over browser.runtime messaging.
 *
 * `src/platform/` is the adapter layer: the only place outside entrypoints
 * that may touch extension APIs. Core receives a transport and never reaches
 * for one; UI components receive callbacks and never reach for one either.
 * Composition roots (the mount-* modules) wire the two together.
 */
export async function send<T extends Request>(
  request: T,
): Promise<ResponseFor<T['type']>> {
  // A content script outlives its extension. Rejecting rather than throwing
  // synchronously keeps every caller's existing `catch` in charge of what to
  // do about it -- see extension-context.ts.
  if (!isExtensionAlive()) {
    throw new Error('The extension was reloaded. Reload this page to use it again.');
  }
  return (await browser.runtime.sendMessage(request)) as ResponseFor<T['type']>;
}

/**
 * Sends without waiting for the answer.
 *
 * `void send(...)` reads as "ignore the result", but an ignored promise that
 * rejects still reaches the page as an uncaught rejection in the console.
 * Every one of these rejects once the extension has reloaded, so the
 * fire-and-forget case has to say out loud what it drops -- and keep
 * reporting the failures that are not that.
 */
export function post<T extends Request>(request: T): void {
  void send(request).catch((err: unknown) => {
    if (isExtensionAlive()) {
      console.warn('[Markdown Workspace] Could not deliver a message', err);
    }
  });
}

/** Subscribes to background broadcasts. Returns an unsubscribe function. */
export function onBroadcast(handler: (message: unknown) => void): () => void {
  const listener = (message: unknown) => {
    handler(message);
  };
  guard(() => browser.runtime.onMessage.addListener(listener), undefined);
  return () => guard(() => browser.runtime.onMessage.removeListener(listener), undefined);
}
