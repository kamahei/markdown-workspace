import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { PageInfo } from '@core/reader/classify';
import { basename, type FileSource } from '@core/fs/types';
import { pathToFileUrl } from '@core/fs/file-url-source';
import { pickDirectoryIndex } from '@core/link';
import { applyContentWidth, applyTheme, nextTheme, type Settings } from '@core/settings';
import { Breadcrumb, Toolbar, ToolbarButton } from './components/Toolbar';
import { FileTree } from './components/FileTree';
import { SidebarHeader } from './components/SidebarHeader';
import { FileAccessPanel, ErrorPanel } from './components/States';
import { useFileTree } from './hooks/useFileTree';
import { useSettingsSync } from './hooks/useSettingsSync';

interface DirectoryAppProps {
  page: PageInfo;
  initialSettings: Settings;
  fileSource: FileSource | null;
  doc: Document;
  /** Set when the folder could not be read at all. */
  accessError: 'file-access-denied' | 'unparseable-listing' | 'unknown' | null;
  onSaveSettings: (settings: Settings) => void;
  onOpenWorkspace: (target: string) => void;
  onRecheckAccess: () => void;
}

/**
 * Replaces Chrome's own `file://` directory listing with the file browser
 * (FR-16, and .project/decision-log.md D2).
 *
 * Dropping a folder onto Chrome navigates to the listing page, which an
 * extension cannot intercept — but it is an ordinary page, so it can be taken
 * over the same way a Markdown file is. That is what makes "drag a folder onto
 * the browser" work at all.
 */
export function DirectoryApp({
  page,
  initialSettings,
  fileSource,
  doc,
  accessError,
  onSaveSettings,
  onOpenWorkspace,
  onRecheckAccess,
}: DirectoryAppProps) {
  // Live: a change made in the options page reaches this surface
  // without a reload (FR-26).
  const [settings, setSettings] = useSettingsSync(initialSettings);
  const [checking, setChecking] = useState(false);

  const directory = page.directory ?? '/';
  const tree = useFileTree(fileSource, directory);

  useEffect(() => {
    applyTheme(doc.documentElement, settings.theme);
    applyContentWidth(doc.documentElement, settings.contentWidth);
  }, [doc, settings.theme, settings.contentWidth]);

  useEffect(() => {
    doc.title = `${basename(directory) || '/'} — Markdown Workspace`;
  }, [doc, directory]);

  const cycleTheme = useCallback(() => {
    const updated = { ...settings, theme: nextTheme(settings.theme) };
    setSettings(updated);
    onSaveSettings(updated);
  }, [settings, onSaveSettings]);

  const openPath = useCallback(
    (path: string) => {
      doc.location.href = pathToFileUrl(path);
    },
    [doc],
  );

  const treeOptions = useMemo(
    () => ({
      showHidden: settings.fileBrowser.showHiddenFiles,
      excludedDirectories: settings.fileBrowser.excludedDirectories,
      sortBy: settings.fileBrowser.sortBy,
    }),
    [settings.fileBrowser],
  );

  // Offer the folder's index document rather than an empty reading pane.
  const rootEntries = tree.state.children.get(directory);
  const indexName = rootEntries
    ? pickDirectoryIndex(rootEntries.filter((e) => e.kind === 'file').map((e) => e.name))
    : null;

  const recheck = () => {
    setChecking(true);
    onRecheckAccess();
    // The button is a signal that something happened; the page reloads on
    // success, so this only needs to outlast a fast negative answer.
    setTimeout(() => setChecking(false), 1200);
  };

  return (
    <div class="mw-root">
      <a class="mw-skip-link" href="#mw-main">
        Skip to content
      </a>

      <Toolbar
        actions={
          <>
            <ToolbarButton icon="reload" label="Reload" onClick={tree.refresh} />
            <ToolbarButton
              icon="theme"
              label={`Theme: ${settings.theme}`}
              onClick={cycleTheme}
            />
            <ToolbarButton
              icon="workspace"
              label="Open in Workspace"
              onClick={() => onOpenWorkspace(doc.location.href)}
            />
          </>
        }
      >
        <Breadcrumb directory={directory} name="" />
      </Toolbar>

      <div class="mw-body">
        <nav class="mw-sidebar" aria-label="Files">
          <SidebarHeader
            root={directory}
            onNavigateUp={(parent) => {
              doc.location.href = `${pathToFileUrl(parent.replace(/\/+$/, ''))}/`;
            }}
          />
          {fileSource ? (
            <FileTree
              state={tree.state}
              options={treeOptions}
              onToggle={tree.toggle}
              onOpen={openPath}
              onFilterChange={tree.setFilter}
            />
          ) : null}
        </nav>

        <main class="mw-main" id="mw-main">
          {accessError === 'file-access-denied' ? (
            <FileAccessPanel onRecheck={recheck} checking={checking} />
          ) : accessError ? (
            <ErrorPanel
              error={{
                code: accessError,
                message:
                  accessError === 'unparseable-listing'
                    ? 'This folder listing could not be read. Try opening the folder in the workspace instead.'
                    : 'This folder could not be opened.',
              }}
              onRetry={tree.refresh}
            />
          ) : (
            <div class="mw-pane">
              <h1 class="mw-folder-title">{basename(directory) || '/'}</h1>
              <p class="mw-folder-hint">
                {indexName
                  ? 'This folder has an index document.'
                  : 'Pick a document from the sidebar to start reading.'}
              </p>
              {indexName ? (
                <button
                  type="button"
                  class="mw-btn mw-btn-primary"
                  onClick={() => openPath(`${directory.replace(/\/$/, '')}/${indexName}`)}
                >
                  Open {indexName}
                </button>
              ) : null}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
