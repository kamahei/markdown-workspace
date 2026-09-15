import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { applyTheme, migrateSettings, nextTheme, type Settings } from '@core/settings';
import { send } from '../../src/platform/messaging';

import '@ui/styles/theme.css';
import '@ui/styles/app.css';
import '@ui/styles/popup.css';

/** Toolbar popup (FR-25). Quick actions for the page in front of the user. */
function Popup({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [origin, setOrigin] = useState<string | null>(null);
  const [fileAccess, setFileAccess] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void send({ type: 'checkFileAccess' }).then((r) => setFileAccess(r.granted));

    void browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const url = tabs[0]?.url;
      if (!url) return;
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          setOrigin(`${parsed.origin}/*`);
        }
      } catch {
        // A tab with no parseable URL simply offers no origin action.
      }
    });
  }, []);

  const allowed = origin
    ? settings.allowedOrigins.some((rule) => rule.pattern === origin && rule.enabled)
    : false;

  const cycleTheme = useCallback(() => {
    const updated = { ...settings, theme: nextTheme(settings.theme) };
    setSettings(updated);
    applyTheme(document.documentElement, updated.theme);
    void send({ type: 'saveSettings', settings: updated });
  }, [settings]);

  const toggleOrigin = useCallback(async () => {
    if (!origin) return;
    setBusy(true);
    try {
      const result = allowed
        ? await send({ type: 'removeOrigin', pattern: origin })
        : await send({ type: 'addOrigin', pattern: origin });
      setSettings(result.settings);
    } finally {
      setBusy(false);
    }
  }, [origin, allowed]);

  return (
    <div class="mw-popup">
      <button
        type="button"
        class="mw-popup-item"
        onClick={() => {
          void send({ type: 'openWorkspace' });
          window.close();
        }}
      >
        <strong>Open Workspace</strong>
        <span>Browse a folder of Markdown</span>
      </button>

      {origin ? (
        <button
          type="button"
          class="mw-popup-item"
          disabled={busy}
          onClick={() => void toggleOrigin()}
        >
          <strong>
            {allowed ? 'Stop rendering this site' : 'Render Markdown on this site'}
          </strong>
          <span>{origin}</span>
        </button>
      ) : null}

      <button type="button" class="mw-popup-item" onClick={cycleTheme}>
        <strong>Theme</strong>
        <span>{settings.theme}</span>
      </button>

      <button
        type="button"
        class="mw-popup-item"
        onClick={() => {
          void browser.runtime.openOptionsPage();
          window.close();
        }}
      >
        <strong>Settings</strong>
        <span>Themes, rendering, websites</span>
      </button>

      {fileAccess === false ? (
        <div class="mw-popup-alert" role="alert">
          Local files are blocked. Enable &ldquo;Allow access to file URLs&rdquo; on this
          extension&rsquo;s details page.
        </div>
      ) : null}
    </div>
  );
}

async function main() {
  let settings: Settings;
  try {
    settings = await send({ type: 'getSettings' });
  } catch {
    settings = migrateSettings(undefined);
  }

  applyTheme(document.documentElement, settings.theme);
  render(<Popup initial={settings} />, document.getElementById('app')!);
}

void main();
