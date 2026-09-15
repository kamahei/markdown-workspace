import type { Request, ResponseFor } from '@core/messaging';

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
  return (await browser.runtime.sendMessage(request)) as ResponseFor<T['type']>;
}

/** Subscribes to background broadcasts. Returns an unsubscribe function. */
export function onBroadcast(handler: (message: unknown) => void): () => void {
  const listener = (message: unknown) => {
    handler(message);
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
