import { render } from 'preact';
import type { PageInfo } from '@core/reader/classify';
import { applyContentWidth, applyTheme, migrateSettings } from '@core/settings';
import { ReaderApp } from './ReaderApp';
import { send } from '../platform/messaging';

import './styles/theme.css';
import './styles/app.css';
import './styles/document.css';

/**
 * Phase-two entry for reader mode. Everything heavy lives behind this module
 * so the content script's classification step stays cheap.
 */

async function loadSettings() {
  try {
    return await send({ type: 'getSettings' });
  } catch {
    // The service worker may be starting up. Defaults let the document render
    // now; the settingsChanged broadcast will correct the view shortly.
    return migrateSettings(undefined);
  }
}

function prepareHost(): HTMLElement {
  // The original body stays in the DOM (hidden) so a failed render can be
  // rolled back to Chrome's plain-text view.
  const host = document.createElement('div');
  host.id = 'mw-app';
  document.body.appendChild(host);
  return host;
}

export async function mountReader(options: {
  page: PageInfo;
  source: string;
}): Promise<void> {
  const settings = await loadSettings();

  // Before first paint: a flash of the wrong theme is a defect, not a detail.
  applyTheme(document.documentElement, settings.theme);
  applyContentWidth(document.documentElement, settings.contentWidth);

  const host = prepareHost();
  const title = options.page.path?.split('/').pop();
  if (title) document.title = title;

  render(
    <ReaderApp
      page={options.page}
      source={options.source}
      initialSettings={settings}
      doc={document}
      onSaveSettings={(next) => void send({ type: 'saveSettings', settings: next })}
      onOpenWorkspace={(target) => void send({ type: 'openWorkspace', target })}
    />,
    host,
  );
}
