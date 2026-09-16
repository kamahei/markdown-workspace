import {
  documentStateKey,
  normalizeDocumentState,
  selectExpiredKeys,
  DOC_STATE_PREFIX,
  type DocumentState,
} from '@core/settings';
import { guard, guardAsync } from './extension-context';

/**
 * Reading state, stored locally per document (FR-30).
 *
 * Never synced: a path or a scroll position reflects what the user is reading,
 * and the privacy claim in PRIVACY.md is that such things stay on the device.
 */

export async function loadScrollRatio(path: string): Promise<number> {
  const key = documentStateKey(path);
  const stored = await guardAsync(() => browser.storage.local.get(key), {});
  return normalizeDocumentState(stored[key]).scrollRatio;
}

export function saveScrollRatio(path: string, scrollRatio: number): void {
  const key = documentStateKey(path);
  const state: DocumentState = {
    scrollRatio,
    lastOpenedAt: Date.now(),
  };
  // Guarded rather than caught: after the extension reloads, `browser
  // .storage` is undefined, so reading `.local` throws before there is a
  // promise for `.catch` to attach to.
  guard(
    () => void browser.storage.local.set({ [key]: state }).catch(() => {}),
    undefined,
  );
}

/**
 * Drops the least recently opened records so the store stays bounded.
 *
 * Runs at startup rather than on every write: pruning is cheap once per
 * session and pointless on every scroll.
 */
export async function pruneDocumentState(): Promise<number> {
  try {
    const all = await browser.storage.local.get(null);
    const records = Object.entries(all)
      .filter(([key]) => key.startsWith(DOC_STATE_PREFIX))
      .map(([key, value]) => ({
        key,
        lastOpenedAt: normalizeDocumentState(value).lastOpenedAt,
      }));

    const expired = selectExpiredKeys(records);
    if (expired.length > 0) await browser.storage.local.remove(expired);
    return expired.length;
  } catch {
    return 0;
  }
}
