import type { FileError } from '@core/messaging';
import { interpolate, t } from '../i18n';

interface FileAccessPanelProps {
  onRecheck: () => void;
  checking?: boolean;
}

/**
 * The extension's most likely failure, and it must never look like a blank
 * page (FR-29).
 *
 * There is deliberately no button that navigates to chrome://extensions:
 * extensions cannot open that URL. Offering a control that appears to work and
 * then does nothing is worse than admitting the limitation, so the action
 * copies the address instead.
 */
export function FileAccessPanel({ onRecheck, checking }: FileAccessPanelProps) {
  const copy = () => {
    void navigator.clipboard?.writeText('chrome://extensions').catch(() => {});
  };

  return (
    <div class="mw-state mw-state-warning" role="alert">
      <h2>{t('fileAccessBlockedTitle')}</h2>
      <p>{t('fileAccessBlockedBody')}</p>
      <ol>
        <li>{interpolate(t('fileAccessStep1'), [<code>chrome://extensions</code>])}</li>
        <li>{t('fileAccessStep2')}</li>
        <li>{t('fileAccessStep3')}</li>
      </ol>
      <div class="mw-state-actions">
        <button type="button" class="mw-btn mw-btn-secondary" onClick={copy}>
          {t('copyExtensionsAddress')}
        </button>
        <button
          type="button"
          class="mw-btn mw-btn-primary"
          onClick={onRecheck}
          disabled={checking}
        >
          {checking ? t('checking') : t('checkAgain')}
        </button>
      </div>
    </div>
  );
}

interface ErrorPanelProps {
  error: FileError;
  onRetry?: () => void;
}

export function ErrorPanel({ error, onRetry }: ErrorPanelProps) {
  return (
    <div class="mw-state mw-state-error" role="alert">
      <h2>{t('fileCouldNotBeOpened')}</h2>
      <p>{error.message}</p>
      {onRetry ? (
        <div class="mw-state-actions">
          <button type="button" class="mw-btn mw-btn-primary" onClick={onRetry}>
            {t('tryAgain')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function LoadingPane() {
  return (
    <div class="mw-empty" role="status">
      {t('loading')}
    </div>
  );
}
