import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  applyContentWidth,
  applyTheme,
  defaultSettings,
  DEFAULT_EXCLUDED_DIRECTORIES,
  migrateSettings,
  CONTENT_WIDTH_MAX,
  CONTENT_WIDTH_MIN,
  CONTENT_WIDTH_STEP,
  type MarkdownPreset,
  type Settings,
  type SortBy,
  type ThemeMode,
} from '@core/settings';
import { shortcutList } from '@core/keyboard';
import { normalizePattern } from '@core/origins';
import { send } from '../../src/platform/messaging';
import { clearAll } from '../../src/platform/recent-folders';

import '@ui/styles/theme.css';
import '@ui/styles/app.css';
import '@ui/styles/options.css';
import { interpolate, t, type MessageKey } from '@ui/i18n';
import { useBrowserTranslations } from '../../src/platform/i18n';

/** Settings page (FR-26, FR-27, FR-31). */
function Options({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [fileAccess, setFileAccess] = useState<boolean | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * Saves, and says so when it did not.
   *
   * `storage.sync` enforces an 8 KB item limit and a write rate ceiling, so a
   * save genuinely can fail. The page updates optimistically, which is right
   * for something this small -- but silently showing a value that was never
   * written is not.
   */
  const persist = useCallback((next: Settings) => {
    void send({ type: 'saveSettings', settings: next })
      .then((result) => {
        setSaveError(
          result.saved ? null : (result.reason ?? t('optionsSaveFailedUnknown')),
        );
      })
      .catch((err: unknown) => {
        setSaveError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  useEffect(() => {
    void send({ type: 'checkFileAccess' }).then((r) => setFileAccess(r.granted));
  }, []);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  useEffect(() => {
    applyTheme(document.documentElement, settings.theme);
    applyContentWidth(document.documentElement, settings.contentWidth);
  }, [settings.theme, settings.contentWidth]);

  const commitExcluded = useCallback(
    (el: HTMLTextAreaElement) => {
      const excludedDirectories = el.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      setSettings((prev) => {
        const current = prev.fileBrowser.excludedDirectories;
        const unchanged =
          current.length === excludedDirectories.length &&
          current.every((value, i) => value === excludedDirectories[i]);
        if (unchanged) return prev;

        const next = {
          ...prev,
          fileBrowser: { ...prev.fileBrowser, excludedDirectories },
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const reset = useCallback(async () => {
    setResetting(true);
    try {
      const fresh = defaultSettings();
      // Reset means reset: local state and stored handles go too, or the
      // extension would still hold access the user believes they cleared.
      await clearAll();
      await send({ type: 'saveSettings', settings: fresh });
      setSettings(fresh);
      setConfirmReset(false);
    } finally {
      setResetting(false);
    }
  }, []);

  return (
    <div class="mw-options">
      <header class="mw-options-header">
        <h1>{t('extName')}</h1>
        <p>{t('optionsStorageNote')}</p>
      </header>

      {saveError ? (
        <section class="mw-options-section mw-options-alert" role="alert">
          <h2>{t('optionsSaveFailedTitle')}</h2>
          <p>{t('optionsSaveFailedBody')}</p>
          <p class="mw-options-note">
            <code>{saveError}</code>
          </p>
        </section>
      ) : null}

      {fileAccess === false ? (
        <section class="mw-options-section mw-options-alert" role="alert">
          <h2>{t('optionsFileAccessTitle')}</h2>
          <p>
            {interpolate(t('optionsFileAccessBody'), [<code>chrome://extensions</code>])}
          </p>
          <button
            type="button"
            class="mw-btn mw-btn-secondary"
            onClick={() =>
              void send({ type: 'checkFileAccess' }).then((r) => setFileAccess(r.granted))
            }
          >
            {t('checkAgain')}
          </button>
        </section>
      ) : null}

      <section class="mw-options-section">
        <h2>{t('optionsAppearance')}</h2>

        <Field label={t('optionsTheme')} hint={t('optionsThemeHint')}>
          <Select
            value={settings.theme}
            options={[
              ['system', t('themeSystem')],
              ['light', t('themeLight')],
              ['dark', t('themeDark')],
            ]}
            onChange={(theme) => update({ theme: theme as ThemeMode })}
          />
        </Field>

        <Field
          label={t('optionsContentWidth', [String(settings.contentWidth)])}
          hint={t('optionsContentWidthHint')}
        >
          <input
            type="range"
            class="mw-range"
            min={CONTENT_WIDTH_MIN}
            max={CONTENT_WIDTH_MAX}
            step={CONTENT_WIDTH_STEP}
            value={settings.contentWidth}
            // The percentage is in the label rather than beside the slider:
            // a number that only appears next to the control is missed by
            // anyone reading the label to find out what the control does.
            onInput={(e) =>
              update({ contentWidth: Number((e.target as HTMLInputElement).value) })
            }
          />
        </Field>

        {/* Not under Rendering: that section's note promises the toggles
            there decide what gets downloaded, and this one downloads
            nothing. The headings are already produced with the document. */}
        <Toggle
          label={t('optionsTableOfContents')}
          checked={settings.features.tableOfContents}
          onChange={(tableOfContents) =>
            update({ features: { ...settings.features, tableOfContents } })
          }
        />
        <p class="mw-options-note">{t('optionsTableOfContentsHint')}</p>
      </section>

      <section class="mw-options-section">
        <h2>{t('optionsRendering')}</h2>
        <p class="mw-options-note">{t('optionsRenderingNote')}</p>

        <Toggle
          label={t('optionsHighlight')}
          checked={settings.features.highlight}
          onChange={(highlight) =>
            update({ features: { ...settings.features, highlight } })
          }
        />
        <Toggle
          label={t('optionsMath')}
          checked={settings.features.math}
          onChange={(math) => update({ features: { ...settings.features, math } })}
        />
        <Toggle
          label={t('optionsDiagrams')}
          checked={settings.features.diagrams}
          onChange={(diagrams) =>
            update({ features: { ...settings.features, diagrams } })
          }
        />
      </section>

      <section class="mw-options-section">
        <h2>{t('optionsMarkdown')}</h2>

        <Field label={t('optionsFlavour')} hint={t('optionsFlavourHint')}>
          <Select
            value={settings.markdown.preset}
            options={[
              ['gfm', t('flavourGfm')],
              ['commonmark', t('flavourCommonmark')],
            ]}
            onChange={(preset) =>
              update({
                markdown: { ...settings.markdown, preset: preset as MarkdownPreset },
              })
            }
          />
        </Field>

        <Toggle
          label={t('optionsLinkify')}
          checked={settings.markdown.linkify}
          onChange={(linkify) => update({ markdown: { ...settings.markdown, linkify } })}
        />
        <Toggle
          label={t('optionsTypographer')}
          checked={settings.markdown.typographer}
          onChange={(typographer) =>
            update({ markdown: { ...settings.markdown, typographer } })
          }
        />
        <Toggle
          label={t('optionsBreaks')}
          checked={settings.markdown.breaks}
          onChange={(breaks) => update({ markdown: { ...settings.markdown, breaks } })}
        />
      </section>

      <section class="mw-options-section">
        <h2>{t('optionsFileBrowser')}</h2>

        <Toggle
          label={t('optionsShowHidden')}
          checked={settings.fileBrowser.showHiddenFiles}
          onChange={(showHiddenFiles) =>
            update({ fileBrowser: { ...settings.fileBrowser, showHiddenFiles } })
          }
        />

        <Field label={t('optionsSortBy')}>
          <Select
            value={settings.fileBrowser.sortBy}
            options={[
              ['name', t('sortByName')],
              ['modified', t('sortByModified')],
            ]}
            onChange={(sortBy) =>
              update({
                fileBrowser: { ...settings.fileBrowser, sortBy: sortBy as SortBy },
              })
            }
          />
        </Field>

        <Field label={t('optionsHiddenFolders')} hint={t('optionsHiddenFoldersHint')}>
          <textarea
            class="mw-input mw-textarea"
            rows={5}
            value={settings.fileBrowser.excludedDirectories.join('\n')}
            // Committed on blur rather than on every keystroke: chrome.storage
            // .sync has a write-rate quota that typing would blow through.
            // Both events are bound because a change event is not guaranteed
            // when the value is set programmatically.
            onChange={(e) => commitExcluded(e.target as HTMLTextAreaElement)}
            onBlur={(e) => commitExcluded(e.target as HTMLTextAreaElement)}
          />
          <button
            type="button"
            class="mw-btn mw-btn-secondary"
            onClick={() =>
              update({
                fileBrowser: {
                  ...settings.fileBrowser,
                  excludedDirectories: [...DEFAULT_EXCLUDED_DIRECTORIES],
                },
              })
            }
          >
            {t('optionsRestoreDefaults')}
          </button>
        </Field>
      </section>

      <OriginSection settings={settings} onChanged={setSettings} />

      <ShortcutSection />

      <section class="mw-options-section mw-options-danger">
        <h2>{t('optionsReset')}</h2>
        <p>{t('optionsResetBody')}</p>
        {confirmReset ? (
          <div class="mw-state-actions">
            <button
              type="button"
              class="mw-btn mw-btn-primary"
              disabled={resetting}
              onClick={() => void reset()}
            >
              {resetting ? t('optionsResetting') : t('optionsResetConfirm')}
            </button>
            <button
              type="button"
              class="mw-btn mw-btn-secondary"
              onClick={() => setConfirmReset(false)}
            >
              {t('optionsCancel')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            class="mw-btn mw-btn-secondary"
            onClick={() => setConfirmReset(true)}
          >
            {t('optionsResetButton')}
          </button>
        )}
      </section>
    </div>
  );
}

/**
 * Detects macOS so the list says Cmd rather than Ctrl.
 *
 * `navigator.platform` is deprecated but is the only string every Chrome
 * version still fills in; `userAgentData` is preferred where it exists.
 */
function isMacPlatform(): boolean {
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData;
  const platform = data?.platform ?? navigator.platform ?? '';
  return /mac/i.test(platform);
}

/**
 * The shortcut reference (NFR-7).
 *
 * Rendered from `shortcutList()`, the same list `matchShortcut` is tested
 * against, so what this page shows cannot drift away from what the keys
 * actually do — which is the defect that made this section necessary.
 */
function ShortcutSection() {
  const mac = isMacPlatform();
  const shortcuts = shortcutList(mac ? 'mac' : 'other');

  return (
    <section class="mw-options-section">
      <h2>{t('optionsShortcuts')}</h2>
      <p class="mw-options-note">
        {interpolate(t('optionsShortcutsNote'), [
          <>
            <kbd>{mac ? 'Cmd' : 'Ctrl'}</kbd>
            <span class="mw-shortcut-sep">+</span>
            <kbd>W</kbd>
          </>,
        ])}
      </p>

      <dl class="mw-shortcut-list">
        {shortcuts.map(({ keys, descriptionKey }) => (
          <div key={keys} class="mw-shortcut-row">
            <dt>
              {splitKeys(keys).map((token, i) =>
                token.kind === 'key' ? (
                  <kbd key={i}>{token.text}</kbd>
                ) : (
                  <span key={i} class="mw-shortcut-sep">
                    {token.text}
                  </span>
                ),
              )}
            </dt>
            <dd>{t(descriptionKey as MessageKey)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type KeyToken = { kind: 'key' | 'sep'; text: string };

/**
 * Splits a displayed shortcut into keys and the separators between them, so
 * each key gets its own `<kbd>`. `Ctrl+\` splits on the plus; `↑ ↓` and
 * `Home / End` are alternatives rather than combinations and split on the
 * space or slash, which is why one separator is not enough.
 */
function splitKeys(keys: string): KeyToken[] {
  return keys
    .split(/(\s+\/\s+|\+|\s+)/)
    .filter((part) => part !== '')
    .map((part) => ({
      kind: /^(\s+\/\s+|\+|\s+)$/.test(part) ? 'sep' : 'key',
      text: part.trim() === '' ? ' ' : part.trim(),
    }));
}

/** Opt-in remote origins (FR-22, FR-23). Wired to real permissions in Phase 7. */
function OriginSection({
  settings,
  onChanged,
}: {
  settings: Settings;
  onChanged: (settings: Settings) => void;
}) {
  const [pattern, setPattern] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /**
   * Asks Chrome for the origin, then tells the worker to record it.
   *
   * The request has to happen **here**, in the click that caused it.
   * `chrome.permissions.request` is only allowed during a user gesture, and a
   * service worker has none: asking from the background failed every time
   * with "This function must be called during a user gesture", which the
   * page reported as Chrome having declined. Nobody had ever added an origin
   * successfully, because the prompt was never reached.
   */
  const add = async () => {
    const value = pattern.trim();
    if (!value) return;

    // Normalized here too, so an unusable address is named rather than
    // becoming a permission request Chrome would reject on its own terms.
    const normalized = normalizePattern(value);
    if (!normalized.ok) {
      setMessage(normalized.error);
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const granted = await chrome.permissions.request({
        origins: [normalized.pattern],
      });
      if (!granted) {
        setMessage(t('originNotGranted'));
        return;
      }

      const result = await send({ type: 'addOrigin', pattern: normalized.pattern });
      onChanged(result.settings);
      if (result.granted) setPattern('');
      else setMessage(t('originNotSaved'));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('originNotAdded'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (target: string) => {
    const result = await send({ type: 'removeOrigin', pattern: target });
    onChanged(result.settings);
  };

  return (
    <section class="mw-options-section">
      <h2>{t('optionsWebsites')}</h2>
      <p class="mw-options-note">{t('optionsWebsitesNote')}</p>

      <div class="mw-origin-add">
        <input
          type="text"
          class="mw-input"
          placeholder={t('optionsOriginPlaceholder')}
          aria-label={t('optionsOriginLabel')}
          value={pattern}
          disabled={busy}
          onInput={(e) => setPattern((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
        />
        <button
          type="button"
          class="mw-btn mw-btn-primary"
          disabled={busy || !pattern.trim()}
          onClick={() => void add()}
        >
          {t('optionsAdd')}
        </button>
      </div>

      {message ? <p class="mw-options-warning">{message}</p> : null}

      {settings.allowedOrigins.length === 0 ? (
        <p class="mw-empty">{t('optionsNoWebsites')}</p>
      ) : (
        <ul class="mw-origin-list">
          {settings.allowedOrigins.map((origin) => (
            <li key={origin.pattern}>
              <code>{origin.pattern}</code>
              {!origin.enabled ? (
                <span
                  class="mw-origin-disabled"
                  title={t('optionsPermissionRevokedHint')}
                >
                  {t('optionsPermissionRevoked')}
                </span>
              ) : null}
              <button
                type="button"
                class="mw-btn"
                aria-label={t('optionsRemoveOrigin', [origin.pattern])}
                onClick={() => void remove(origin.pattern)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- Small building blocks ------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: preact.ComponentChildren;
}) {
  return (
    <label class="mw-field">
      <span class="mw-field-label">{label}</span>
      {children}
      {hint ? <span class="mw-field-hint">{hint}</span> : null}
    </label>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <select
      class="mw-input mw-select"
      value={value}
      onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
    >
      {options.map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label class="mw-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
      />
      <span>{label}</span>
    </label>
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
  applyContentWidth(document.documentElement, settings.contentWidth);
  document.title = t('optionsTitle');

  render(<Options initial={settings} />, document.getElementById('app')!);
}

void main();
