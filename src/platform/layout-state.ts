import { clampSidebarWidth, SIDEBAR_DEFAULT } from '@core/settings';
import { guard, guardAsync } from './extension-context';

/**
 * Sidebar width, remembered per device (FR-30).
 *
 * `storage.local` rather than `storage.sync`: a width chosen on a 27-inch
 * monitor is the wrong width on a laptop, and this is the one preference
 * where following the device beats following the person.
 *
 * Guarded like every other extension call a content script can make after
 * its extension has gone — see extension-context.ts.
 */

const KEY = 'layout:sidebarWidth';

export async function loadSidebarWidth(): Promise<number> {
  const stored = await guardAsync(() => browser.storage.local.get(KEY), {});
  const value = (stored as Record<string, unknown>)[KEY];
  return typeof value === 'number' ? clampSidebarWidth(value) : SIDEBAR_DEFAULT;
}

export function saveSidebarWidth(width: number): void {
  const value = clampSidebarWidth(width);
  guard(
    () => void browser.storage.local.set({ [KEY]: value }).catch(() => {}),
    undefined,
  );
}
