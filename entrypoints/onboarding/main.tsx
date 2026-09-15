import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { applyTheme, migrateSettings, type Settings } from '@core/settings';
import { send } from '../../src/platform/messaging';

import '@ui/styles/theme.css';
import '@ui/styles/app.css';
import '@ui/styles/onboarding.css';

/**
 * Post-install setup (FR-28).
 *
 * This page exists because of one platform fact: Chrome gates `file://`
 * reading behind a toggle the **user** must flip, and an extension cannot
 * request it, prompt for it, or navigate there. All it can do is explain
 * clearly and detect the result — which is what the live indicator below is
 * for. Without this page the extension appears broken on first use.
 */
function Onboarding() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  // Polls rather than waiting for a reload: the user flips the toggle in
  // another tab, and coming back to a stale "still blocked" message would
  // read as the instructions not having worked.
  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const result = await send({ type: 'checkFileAccess' });
        if (active) setGranted(result.granted);
      } catch {
        if (active) setGranted(false);
      }
    };

    void check();
    const timer = setInterval(() => void check(), 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const copy = () => {
    void navigator.clipboard
      ?.writeText('chrome://extensions')
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <main class="mw-onboarding">
      <h1>Markdown Workspace is installed</h1>
      <p class="mw-onboarding-lead">
        One step left. Chrome blocks extensions from reading local files until you allow
        it, and this is the only thing it will not let the extension do for you.
      </p>

      <ol class="mw-onboarding-steps">
        <li>
          <span class="mw-step-number">1</span>
          <div>
            Open <code>chrome://extensions</code>
            <button type="button" class="mw-btn mw-btn-secondary" onClick={copy}>
              {copied ? 'Copied' : 'Copy address'}
            </button>
            <p class="mw-step-note">
              Chrome does not allow an extension to open this page, so the address has to
              be pasted into the address bar.
            </p>
          </div>
        </li>
        <li>
          <span class="mw-step-number">2</span>
          <div>
            Find <strong>Markdown Workspace</strong> and click <strong>Details</strong>
          </div>
        </li>
        <li>
          <span class="mw-step-number">3</span>
          <div>
            Turn on <strong>Allow access to file URLs</strong>
          </div>
        </li>
      </ol>

      <div
        class={`mw-onboarding-status is-${granted === null ? 'checking' : granted ? 'granted' : 'blocked'}`}
        role="status"
        aria-live="polite"
      >
        {granted === null ? 'Checking…' : null}
        {granted === false ? (
          <>
            <strong>Not enabled yet.</strong> This updates on its own once you flip the
            toggle — no need to come back and reload.
          </>
        ) : null}
        {granted ? (
          <>
            <strong>Ready.</strong> Local Markdown files will now render.
          </>
        ) : null}
      </div>

      {granted ? (
        <div class="mw-state-actions">
          <button
            type="button"
            class="mw-btn mw-btn-primary"
            onClick={() => void send({ type: 'openWorkspace' })}
          >
            Open the workspace
          </button>
        </div>
      ) : null}

      <section class="mw-onboarding-next">
        <h2>How to use it</h2>
        <ul>
          <li>
            Drag a <code>.md</code> file onto Chrome to read it.
          </li>
          <li>
            Drag a <strong>folder</strong> onto Chrome to browse it, with a sidebar and
            working links between documents.
          </li>
          <li>Click the toolbar icon any time to open the workspace.</li>
        </ul>
        <p class="mw-step-note">
          Markdown on websites is ignored unless you add the site in Settings. Nothing is
          enabled by default and nothing you open leaves your device.
        </p>
      </section>
    </main>
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
  document.title = 'Set up Markdown Workspace';
  render(<Onboarding />, document.getElementById('app')!);
}

void main();
