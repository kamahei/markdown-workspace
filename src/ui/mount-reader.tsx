import { render } from 'preact';
import { resolveTreeRoot, type PageInfo } from '@core/reader/classify';
import { splitFrontMatter } from '@core/markdown';
import {
  applyContentWidth,
  applyTheme,
  migrateSettings,
  type Settings,
} from '@core/settings';
import { FileUrlSource } from '@core/fs/file-url-source';
import type { FileSource } from '@core/fs/types';
import { ReaderApp } from './ReaderApp';
import { DirectoryApp } from './DirectoryApp';
import { post, send } from '../platform/messaging';
import { fileUrlTransport } from '../platform/file-url-transport';
import { loadScrollRatio, saveScrollRatio } from '../platform/document-state';
import { loadSidebarWidth, saveSidebarWidth } from '../platform/layout-state';
import { isExtensionAlive } from '../platform/extension-context';

import './styles/theme.css';
import './styles/app.css';
import './styles/document.css';
import { useBrowserTranslations } from '../platform/i18n';

/**
 * Composition root for reader mode: wires the platform adapters to the pure
 * UI components. Everything heavy lives behind this module so the content
 * script's classification step stays cheap.
 */

async function loadSettings(): Promise<Settings> {
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

/**
 * Declares the document's language for assistive technology.
 *
 * Chrome's plain-text page carries no `lang`, and this replaces that page, so
 * the attribute has to come from somewhere. Front matter is authoritative
 * when the author declared it. Otherwise the browser's own language is a
 * better guess than a hardcoded "en": a reader on a Japanese profile is far
 * more likely to be reading Japanese, and mislabelling a document's language
 * makes a screen reader pronounce it wrongly.
 */
function applyLanguage(frontMatter?: Record<string, unknown> | null): void {
  const declared = frontMatter?.lang ?? frontMatter?.language;
  const lang =
    typeof declared === 'string' && declared.trim()
      ? declared.trim()
      : navigator.language || 'en';
  document.documentElement.setAttribute('lang', lang);
}

function applyChrome(settings: Settings): void {
  // Before first paint: a flash of the wrong theme is a defect, not a detail.
  applyTheme(document.documentElement, settings.theme);
  applyContentWidth(document.documentElement, settings.contentWidth);
}

const openWorkspace = (target: string) => post({ type: 'openWorkspace', target });
const persist = (settings: Settings) => post({ type: 'saveSettings', settings });

export async function mountReader(options: {
  page: PageInfo;
  source: string;
}): Promise<void> {
  // Before the first render: a label that paints in English and then
  // swaps is worse than one that waits a tick.
  useBrowserTranslations();

  const settings = await loadSettings();
  applyChrome(settings);

  const host = prepareHost();
  const title = options.page.path?.split('/').pop();
  if (title) document.title = title;
  applyLanguage(splitFrontMatter(options.source).frontMatter.data);

  // Root the tree at the folder the user opened, not at this document's own
  // directory. Each navigation is a fresh page load, so without the
  // remembered root the sidebar walks downwards as they read and the parent
  // folder becomes unreachable.
  const remembered = await send({ type: 'getWorkspaceRoot' })
    .then((r) => r.root)
    .catch(() => null);
  const treeRoot = resolveTreeRoot(options.page.directory, remembered);

  // Opening a document outside the remembered folder means they moved
  // somewhere else; that becomes the new root.
  if (treeRoot && treeRoot !== remembered) {
    post({ type: 'setWorkspaceRoot', root: treeRoot });
  }

  // The sidebar is best-effort: a document must still render when its folder
  // cannot be listed.
  const fileSource: FileSource | null = treeRoot
    ? new FileUrlSource(fileUrlTransport, treeRoot)
    : null;

  render(
    <ReaderApp
      page={options.page}
      source={options.source}
      initialSettings={settings}
      doc={document}
      fileSource={fileSource}
      treeRoot={treeRoot}
      onSaveSettings={persist}
      onOpenWorkspace={openWorkspace}
      loadScroll={loadScrollRatio}
      saveScroll={saveScrollRatio}
      loadSidebarWidth={loadSidebarWidth}
      saveSidebarWidth={saveSidebarWidth}
      isExtensionAlive={isExtensionAlive}
    />,
    host,
  );
}

export async function mountDirectory(options: { page: PageInfo }): Promise<void> {
  const settings = await loadSettings();
  applyChrome(settings);

  applyLanguage(null);

  const directory = options.page.directory ?? '/';

  // Opening a folder is what sets the root for this tab; every document
  // opened from here keeps it.
  post({ type: 'setWorkspaceRoot', root: directory });

  const source = new FileUrlSource(fileUrlTransport, directory);

  // Probe once up front so the page can show the permission panel rather than
  // an empty tree with no explanation.
  let accessError: 'file-access-denied' | 'unparseable-listing' | 'unknown' | null = null;
  try {
    await source.listDirectory(directory);
  } catch (err) {
    const code = (err as { code?: string }).code;
    accessError =
      code === 'file-access-denied' || code === 'unparseable-listing' ? code : 'unknown';
  }

  const host = prepareHost();

  render(
    <DirectoryApp
      page={options.page}
      initialSettings={settings}
      fileSource={accessError ? null : source}
      doc={document}
      accessError={accessError}
      onSaveSettings={persist}
      onOpenWorkspace={openWorkspace}
      onRecheckAccess={() => {
        void send({ type: 'checkFileAccess' })
          .then((result) => {
            if (result.granted) location.reload();
          })
          .catch(() => {
            // The extension went away; the button simply does nothing.
          });
      }}
    />,
    host,
  );
}
