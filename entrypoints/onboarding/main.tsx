import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { applyTheme, migrateSettings, type Settings } from '@core/settings';
import { send } from '../../src/platform/messaging';

import '@ui/styles/theme.css';
import '@ui/styles/app.css';
import '@ui/styles/onboarding.css';
import { interpolate, t } from '@ui/i18n';
import { useBrowserTranslations } from '../../src/platform/i18n';

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
      <h1>{t('onboardingHeading')}</h1>
      <p class="mw-onboarding-lead">{t('onboardingLead')}</p>

      <ol class="mw-onboarding-steps">
        <li>
          <span class="mw-step-number">1</span>
          <div>
            {interpolate(t('onboardingStep1'), [<code>chrome://extensions</code>])}
            <button type="button" class="mw-btn mw-btn-secondary" onClick={copy}>
              {copied ? t('copied') : t('copyAddress')}
            </button>
            <p class="mw-step-note">{t('onboardingStep1Note')}</p>
          </div>
        </li>
        <li>
          <span class="mw-step-number">2</span>
          <div>
            {interpolate(t('onboardingStep2'), [
              <strong>{t('onboardingStep2Name')}</strong>,
              <strong>{t('onboardingStep2Details')}</strong>,
            ])}
          </div>
        </li>
        <li>
          <span class="mw-step-number">3</span>
          <div>
            {interpolate(t('onboardingStep3'), [
              <strong>{t('onboardingStep3Toggle')}</strong>,
            ])}
          </div>
        </li>
      </ol>

      <div
        class={`mw-onboarding-status is-${granted === null ? 'checking' : granted ? 'granted' : 'blocked'}`}
        role="status"
        aria-live="polite"
      >
        {granted === null ? t('checking') : null}
        {granted === false ? (
          <>
            <strong>{t('onboardingNotEnabled')}</strong> {t('onboardingNotEnabledBody')}
          </>
        ) : null}
        {granted ? (
          <>
            <strong>{t('onboardingReady')}</strong> {t('onboardingReadyBody')}
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
            {t('onboardingOpenWorkspace')}
          </button>
        </div>
      ) : null}

      <section class="mw-onboarding-next">
        <h2>{t('onboardingHowToUse')}</h2>
        <ul>
          <li>{interpolate(t('onboardingUseFile'), [<code>.md</code>])}</li>
          <li>
            {interpolate(t('onboardingUseFolder'), [
              <strong>{t('onboardingUseFolderWord')}</strong>,
            ])}
          </li>
          <li>{t('onboardingUseToolbar')}</li>
        </ul>
        <p class="mw-step-note">{t('onboardingPrivacyNote')}</p>
      </section>
    </main>
  );
}

async function main() {
  // Before the first render: a label that paints in English and then
  // swaps is worse than one that waits a tick.
  useBrowserTranslations();

  let settings: Settings;
  try {
    settings = await send({ type: 'getSettings' });
  } catch {
    settings = migrateSettings(undefined);
  }

  applyTheme(document.documentElement, settings.theme);
  document.title = t('onboardingTitle');
  render(<Onboarding />, document.getElementById('app')!);
}

void main();
