import { parseDirectoryListing } from '@core/fs/listing-parser';
import {
  fail,
  ok,
  type DirectoryEntryPayload,
  type FileContentPayload,
  type Request,
  type Result,
} from '@core/messaging';
import { migrateSettings, type Settings } from '@core/settings';
import { pruneDocumentState } from '../src/platform/document-state';
import {
  activePatterns,
  addOrigin,
  buildHeaderRules,
  normalizePattern,
  reconcileOrigins,
  removeOrigin,
  RULE_ID_BASE,
} from '@core/origins';

/**
 * The service worker is stateless by necessity (architecture.md C7): Chrome
 * terminates it aggressively, so nothing may live in a module variable and be
 * expected to survive. Every handler reads what it needs and returns.
 *
 * It centralizes file:// reads because a content script running on a file://
 * page has an opaque origin and cannot fetch its siblings. The extension
 * origin can.
 */

const SETTINGS_KEY = 'settings';

async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  return migrateSettings(stored[SETTINGS_KEY]);
}

async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.sync.set({ [SETTINGS_KEY]: settings });
  broadcast({ type: 'settingsChanged', settings });
}

function broadcast(message: unknown): void {
  // No receiver is a normal state, not an error: there may simply be no open
  // surface. Swallow it rather than logging noise on every settings change.
  browser.runtime.sendMessage(message).catch(() => {});
  browser.tabs
    .query({})
    .then((tabs) => {
      for (const tab of tabs) {
        if (tab.id != null) browser.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    })
    .catch(() => {});
}

/** Whether Chrome currently allows this extension to read file:// URLs. */
async function hasFileAccess(): Promise<boolean> {
  try {
    return await browser.extension.isAllowedFileSchemeAccess();
  } catch {
    return false;
  }
}

function describeFetchFailure(url: string, granted: boolean) {
  if (url.startsWith('file:') && !granted) {
    return fail<never>(
      'file-access-denied',
      'Chrome is blocking access to local files. Enable "Allow access to file URLs" ' +
        "on the extension's details page.",
    );
  }
  return fail<never>(
    'not-found',
    'The file could not be read. It may have been moved or deleted.',
  );
}

async function readFile(
  url: string,
  binary: boolean,
): Promise<Result<FileContentPayload>> {
  const granted = await hasFileAccess();

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return describeFetchFailure(url, granted);
  }

  // file:// responses report status 0 on success, so `ok` is unreliable here.
  if (!response.ok && response.status !== 0) {
    return describeFetchFailure(url, granted);
  }

  const mimeType = response.headers.get('content-type');

  try {
    if (binary) {
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      return ok({ text: null, dataUrl, mimeType, size: blob.size });
    }
    const text = await response.text();
    return ok({ text, dataUrl: null, mimeType, size: text.length });
  } catch {
    return fail('not-readable', 'The file could not be decoded as text.');
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Chunked to stay clear of the argument limit on large images.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

async function listDirectory(url: string): Promise<Result<DirectoryEntryPayload[]>> {
  const granted = await hasFileAccess();

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return describeFetchFailure(url, granted);
  }

  if (!response.ok && response.status !== 0) {
    return describeFetchFailure(url, granted);
  }

  const html = await response.text();
  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    path = url;
  }

  const entries = parseDirectoryListing(html, path);
  if (entries === null) {
    return fail(
      'unparseable-listing',
      'This folder listing could not be read. Try opening the folder in the workspace instead.',
    );
  }
  return ok(entries);
}

async function openWorkspace(target?: string): Promise<{ opened: boolean }> {
  const base = browser.runtime.getURL('/workspace.html');
  const url = target ? `${base}?open=${encodeURIComponent(target)}` : base;

  // Focus an existing workspace rather than accumulating duplicates.
  const existing = await browser.tabs.query({ url: `${base}*` });
  const first = existing[0];
  if (first?.id != null) {
    await browser.tabs.update(first.id, { active: true, url });
    if (first.windowId != null)
      await browser.windows.update(first.windowId, { focused: true });
    return { opened: true };
  }

  await browser.tabs.create({ url });
  return { opened: true };
}

// --- Opt-in remote origins (FR-22..FR-25) ---------------------------------

const READER_SCRIPT_ID = 'mw-reader-remote';

/** Patterns Chrome currently grants, among those the user asked for. */
async function grantedPatterns(settings: Settings): Promise<string[]> {
  const wanted = settings.allowedOrigins.map((rule) => rule.pattern);
  const checks = await Promise.all(
    wanted.map(async (pattern) => {
      try {
        return (await browser.permissions.contains({ origins: [pattern] }))
          ? pattern
          : null;
      } catch {
        return null;
      }
    }),
  );
  return checks.filter((p): p is string => p !== null);
}

/**
 * Brings the network rules and content script registration in line with the
 * settings.
 *
 * Re-established from storage rather than remembered: the service worker is
 * ephemeral, so nothing registered in a previous life can be assumed to
 * still exist (architecture.md C7).
 */
async function applyOriginEffects(settings: Settings): Promise<void> {
  const patterns = activePatterns(settings);

  try {
    const existing = await browser.declarativeNetRequest.getDynamicRules();
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing
        .filter((rule) => rule.id >= RULE_ID_BASE)
        .map((rule) => rule.id),
      addRules: buildHeaderRules(patterns) as never,
    });
  } catch (err) {
    console.error('[Markdown Workspace] Could not update network rules', err);
  }

  try {
    const registered = await browser.scripting.getRegisteredContentScripts({
      ids: [READER_SCRIPT_ID],
    });
    if (registered.length > 0) {
      await browser.scripting.unregisterContentScripts({ ids: [READER_SCRIPT_ID] });
    }

    if (patterns.length > 0) {
      await browser.scripting.registerContentScripts([
        {
          id: READER_SCRIPT_ID,
          matches: patterns,
          js: ['content-scripts/reader.js'],
          css: ['content-scripts/reader.css'],
          runAt: 'document_end',
          persistAcrossSessions: true,
        },
      ]);
    }
  } catch (err) {
    console.error('[Markdown Workspace] Could not update content scripts', err);
  }
}

/** Reconciles stored intent with reality, then applies the effects. */
async function syncOrigins(): Promise<Settings> {
  const stored = await loadSettings();
  const reconciled = reconcileOrigins(stored, await grantedPatterns(stored));

  if (reconciled !== stored) {
    await browser.storage.sync.set({ [SETTINGS_KEY]: reconciled });
    broadcast({ type: 'settingsChanged', settings: reconciled });
  }

  await applyOriginEffects(reconciled);
  return reconciled;
}

async function handleAddOrigin(input: string) {
  const settings = await loadSettings();
  const { ok, pattern } = normalizePattern(input);
  if (!ok) return { granted: false, settings };

  let granted = false;
  try {
    granted = await browser.permissions.request({ origins: [pattern] });
  } catch {
    granted = false;
  }

  if (!granted) return { granted: false, settings };

  const updated = addOrigin(settings, pattern);
  await saveSettings(updated);
  await applyOriginEffects(updated);
  return { granted: true, settings: updated };
}

async function handleRemoveOrigin(pattern: string) {
  const settings = await loadSettings();
  const updated = removeOrigin(settings, pattern);
  await saveSettings(updated);

  // Revoking matters: leaving the permission behind would mean the extension
  // still holds access the user believes they removed.
  try {
    await browser.permissions.remove({ origins: [pattern] });
  } catch {
    // Chrome refuses to revoke a permission it never granted; harmless.
  }

  await applyOriginEffects(updated);
  return { removed: true, settings: updated };
}

async function handle(request: Request): Promise<unknown> {
  switch (request.type) {
    case 'readFile':
      return readFile(request.url, request.binary ?? false);
    case 'listDirectory':
      return listDirectory(request.url);
    case 'checkFileAccess':
      return { granted: await hasFileAccess() };
    case 'openWorkspace':
      return openWorkspace(request.target);
    case 'getSettings':
      return loadSettings();
    case 'saveSettings':
      await saveSettings(request.settings);
      return { saved: true };
    case 'addOrigin':
      return handleAddOrigin(request.pattern);
    case 'removeOrigin':
      return handleRemoveOrigin(request.pattern);
    default:
      return undefined;
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Request, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;

    handle(message)
      .then(sendResponse)
      .catch((err: unknown) => {
        sendResponse(
          fail('unknown', err instanceof Error ? err.message : 'Unexpected error'),
        );
      });

    // Keeps the message channel open for the async response.
    return true;
  });

  // No action.onClicked listener: the toolbar icon opens the popup, which
  // offers "Open Workspace" among the other quick actions. Chrome never fires
  // onClicked while a default_popup is declared, so a listener here would be
  // dead code that looks live.

  // Registrations do not survive the worker, so they are rebuilt from storage
  // on every startup as well as on install (architecture.md C7).
  browser.runtime.onStartup.addListener(() => {
    void syncOrigins();
    // Reading state is capped; pruning once per session is enough and
    // pointless on every scroll.
    void pruneDocumentState();
  });

  // A permission revoked from chrome://extensions arrives here, which is the
  // only chance to notice before the user does.
  browser.permissions.onRemoved.addListener(() => void syncOrigins());
  browser.permissions.onAdded.addListener(() => void syncOrigins());

  browser.runtime.onInstalled.addListener((details) => {
    void syncOrigins();

    if (details.reason === 'install') {
      void browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
    }

    browser.contextMenus.removeAll(() => {
      browser.contextMenus.create({
        id: 'open-in-workspace',
        title: 'Open in Markdown Workspace',
        contexts: ['link', 'page'],
        targetUrlPatterns: ['file:///*'],
        documentUrlPatterns: ['file:///*'],
      });
    });
  });

  browser.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== 'open-in-workspace') return;
    void openWorkspace(info.linkUrl ?? info.pageUrl);
  });
});
