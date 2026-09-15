import type { FileError } from '@core/messaging';

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
      <h2>Chrome is blocking access to this file</h2>
      <p>
        Markdown Workspace needs permission to read local files. Chrome requires you to
        enable this yourself — an extension cannot do it for you.
      </p>
      <ol>
        <li>
          Open <code>chrome://extensions</code>
        </li>
        <li>Find Markdown Workspace and click Details</li>
        <li>Enable &ldquo;Allow access to file URLs&rdquo;</li>
      </ol>
      <div class="mw-state-actions">
        <button type="button" class="mw-btn mw-btn-secondary" onClick={copy}>
          Copy chrome://extensions
        </button>
        <button
          type="button"
          class="mw-btn mw-btn-primary"
          onClick={onRecheck}
          disabled={checking}
        >
          {checking ? 'Checking…' : 'Check again'}
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
      <h2>This file could not be opened</h2>
      <p>{error.message}</p>
      {onRetry ? (
        <div class="mw-state-actions">
          <button type="button" class="mw-btn mw-btn-primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function LoadingPane() {
  return (
    <div class="mw-empty" role="status">
      Loading…
    </div>
  );
}
