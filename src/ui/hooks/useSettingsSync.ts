import { useEffect, useState } from 'preact/hooks';
import type { Settings } from '@core/settings';
import { onBroadcast } from '../../platform/messaging';

/**
 * Keeps a surface's settings current without a reload (FR-26).
 *
 * Settings are read once at startup and held in memory; the background
 * broadcasts changes. Re-reading storage on every render would be both slower
 * and still wrong, because another surface could have changed it.
 */
export function useSettingsSync(initial: Settings): [Settings, (next: Settings) => void] {
  const [settings, setSettings] = useState(initial);

  useEffect(
    () =>
      onBroadcast((message) => {
        if (
          typeof message === 'object' &&
          message !== null &&
          (message as { type?: string }).type === 'settingsChanged'
        ) {
          setSettings((message as { settings: Settings }).settings);
        }
      }),
    [],
  );

  return [settings, setSettings];
}
