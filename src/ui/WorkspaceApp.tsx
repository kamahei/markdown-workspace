import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { renderMarkdown, type RenderResult } from '@core/markdown';
import { createSanitizer } from '@core/sanitize';
import {
  applyContentWidth,
  applyTheme,
  nextTheme,
  renderOptionsFrom,
  type Settings,
} from '@core/settings';
import { basename, FileSourceError, type FileSource } from '@core/fs/types';
import { pickDirectoryIndex } from '@core/link';
import type { FileError } from '@core/messaging';
import { Toolbar, ToolbarButton } from './components/Toolbar';
import { DocumentView } from './components/DocumentView';
import { FileTree } from './components/FileTree';
import { DropZone } from './components/DropZone';
import { Tabs, type Tab } from './components/Tabs';
import { ErrorPanel, FileAccessPanel, LoadingPane } from './components/States';
import { useFileTree } from './hooks/useFileTree';
import { useEnrichment } from './hooks/useEnrichment';

export interface RecentEntry {
  id: string;
  displayName: string;
}

interface OpenDocument {
  source: string;
  result: RenderResult;
}

export interface WorkspaceAppProps {
  initialSettings: Settings;
  doc: Document;
  /** Currently open folder, or null before anything is dropped. */
  fileSource: FileSource | null;
  /** Reopenable folders. Snapshot-backed folders never appear here. */
  recent: RecentEntry[];
  /** Path to open once the folder is ready, from an "open in workspace" link. */
  initialPath?: string | null;
  onSaveSettings: (settings: Settings) => void;
  onDropFolder: (dataTransfer: DataTransfer) => Promise<boolean>;
  onPickFolder: () => void;
  onOpenRecent: (id: string) => void;
  onForgetRecent: (id: string) => void;
  dragAccepts: (dataTransfer: DataTransfer | null) => boolean;
}

export function WorkspaceApp({
  initialSettings,
  doc,
  fileSource,
  recent,
  initialPath,
  onSaveSettings,
  onDropFolder,
  onPickFolder,
  onOpenRecent,
  onForgetRecent,
  dragAccepts,
}: WorkspaceAppProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Map<string, OpenDocument>>(new Map());
  const [error, setError] = useState<FileError | null>(null);
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const sanitizer = useMemo(() => createSanitizer(doc.defaultView!), [doc]);
  const enrichment = useEnrichment(sanitizer, settings, doc);
  const tree = useFileTree(fileSource, fileSource ? '/' : null);
  const { reveal } = tree;

  const openedInitial = useRef(false);

  useEffect(() => {
    applyTheme(doc.documentElement, settings.theme);
    applyContentWidth(doc.documentElement, settings.contentWidth);
  }, [doc, settings.theme, settings.contentWidth]);

  // A new folder replaces the session: the old tabs point at paths that no
  // longer resolve.
  useEffect(() => {
    setTabs([]);
    setActiveId(null);
    setDocuments(new Map());
    setError(null);
    openedInitial.current = false;
  }, [fileSource]);

  const openPath = useCallback(
    async (path: string) => {
      if (!fileSource) return;

      const existing = tabs.find((tab) => tab.path === path);
      if (existing) {
        setActiveId(existing.id);
        reveal(path);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const content = await fileSource.readFile(path);
        const result = renderMarkdown(
          content.text ?? '',
          sanitizer,
          renderOptionsFrom(settings),
        );

        const tab: Tab = { id: path, title: basename(path), path };
        setDocuments((prev) =>
          new Map(prev).set(path, { source: content.text ?? '', result }),
        );
        setTabs((prev) => (prev.some((t) => t.id === path) ? prev : [...prev, tab]));
        setActiveId(path);
        reveal(path);
      } catch (err) {
        setError(
          err instanceof FileSourceError
            ? { code: err.code, message: err.message }
            : { code: 'unknown', message: 'This document could not be opened.' },
        );
      } finally {
        setLoading(false);
      }
    },
    [fileSource, tabs, sanitizer, settings, reveal],
  );

  // Open the folder's index document so the workspace does not start empty.
  const rootEntries = tree.state.children.get('/');
  useEffect(() => {
    if (!fileSource || openedInitial.current || !rootEntries) return;
    openedInitial.current = true;

    if (initialPath) {
      void openPath(initialPath);
      return;
    }
    const index = pickDirectoryIndex(
      rootEntries.filter((e) => e.kind === 'file').map((e) => e.name),
    );
    if (index) void openPath(`/${index}`);
  }, [fileSource, rootEntries, initialPath, openPath]);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((tab) => tab.id !== id);
      setActiveId((current) => {
        if (current !== id) return current;
        const index = prev.findIndex((tab) => tab.id === id);
        return next[index]?.id ?? next[index - 1]?.id ?? null;
      });
      return next;
    });
    setDocuments((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const cycleTheme = useCallback(() => {
    const updated = { ...settings, theme: nextTheme(settings.theme) };
    setSettings(updated);
    onSaveSettings(updated);
  }, [settings, onSaveSettings]);

  const treeOptions = useMemo(
    () => ({
      showHidden: settings.fileBrowser.showHiddenFiles,
      excludedDirectories: settings.fileBrowser.excludedDirectories,
      sortBy: settings.fileBrowser.sortBy,
    }),
    [settings.fileBrowser],
  );

  const active = activeId ? documents.get(activeId) : null;

  // Capability-dependent controls are hidden rather than shown as dead
  // buttons: a snapshot source genuinely cannot reload.
  const canRefresh = fileSource?.canRefresh ?? false;

  return (
    <DropZone onDrop={onDropFolder} accepts={dragAccepts}>
      <div class="mw-root">
        <a class="mw-skip-link" href="#mw-main">
          Skip to content
        </a>

        <Toolbar
          actions={
            <>
              {active ? (
                <ToolbarButton
                  icon="raw"
                  label={raw ? 'Show rendered document' : 'Show Markdown source'}
                  pressed={raw}
                  onClick={() => setRaw((v) => !v)}
                />
              ) : null}
              {canRefresh ? (
                <ToolbarButton
                  icon="reload"
                  label="Reload from disk"
                  onClick={tree.refresh}
                />
              ) : null}
              <ToolbarButton
                icon="theme"
                label={`Theme: ${settings.theme}`}
                onClick={cycleTheme}
              />
            </>
          }
        >
          <ToolbarButton
            icon="sidebar"
            label="Toggle sidebar"
            pressed={sidebarVisible}
            onClick={() => setSidebarVisible((v) => !v)}
          />
          <span class="mw-breadcrumb-name">
            {fileSource?.displayName ?? 'Markdown Workspace'}
          </span>
        </Toolbar>

        <div class="mw-body">
          <nav class="mw-sidebar" hidden={!sidebarVisible} aria-label="Files">
            <div class="mw-sidebar-header">
              <span class="mw-sidebar-title">Folders</span>
              <button
                type="button"
                class="mw-btn"
                aria-label="Open a folder"
                title="Open a folder"
                onClick={onPickFolder}
              >
                +
              </button>
            </div>

            {fileSource ? (
              <>
                {!fileSource.canPersist ? (
                  <p class="mw-sidebar-note">
                    This folder is a one-time snapshot. It cannot be reloaded or reopened
                    later.
                  </p>
                ) : null}
                <FileTree
                  state={tree.state}
                  options={treeOptions}
                  onToggle={tree.toggle}
                  onOpen={(path) => void openPath(path)}
                  onFilterChange={tree.setFilter}
                />
              </>
            ) : (
              <p class="mw-empty">Drop a folder here to start.</p>
            )}

            {recent.length > 0 ? (
              <div class="mw-recent">
                <div class="mw-sidebar-header">
                  <span>Recent</span>
                </div>
                <ul class="mw-recent-list">
                  {recent.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        class="mw-recent-item"
                        onClick={() => onOpenRecent(item.id)}
                      >
                        {item.displayName}
                      </button>
                      <button
                        type="button"
                        class="mw-recent-forget"
                        aria-label={`Forget ${item.displayName}`}
                        onClick={() => onForgetRecent(item.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </nav>

          <div class="mw-content">
            <Tabs
              tabs={tabs}
              activeId={activeId}
              onSelect={setActiveId}
              onClose={closeTab}
            />

            <main class="mw-main" id="mw-main">
              {error?.code === 'file-access-denied' ? (
                <FileAccessPanel onRecheck={() => doc.location.reload()} />
              ) : error ? (
                <ErrorPanel error={error} />
              ) : loading && !active ? (
                <LoadingPane />
              ) : active && activeId ? (
                <DocumentView
                  result={active.result}
                  source={active.source}
                  raw={raw}
                  documentPath={activeId}
                  fileSource={fileSource}
                  onNavigate={(path) => void openPath(path)}
                  enrichment={enrichment}
                />
              ) : (
                <WelcomePane
                  hasFolder={Boolean(fileSource)}
                  onPickFolder={onPickFolder}
                />
              )}
            </main>
          </div>
        </div>
      </div>
    </DropZone>
  );
}

function WelcomePane({
  hasFolder,
  onPickFolder,
}: {
  hasFolder: boolean;
  onPickFolder: () => void;
}) {
  return (
    <div class="mw-pane">
      <h1 class="mw-folder-title">Markdown Workspace</h1>
      <p class="mw-folder-hint">
        {hasFolder
          ? 'Pick a document from the sidebar to start reading.'
          : 'Drop a folder anywhere on this page to open it, or choose one below.'}
      </p>
      {!hasFolder ? (
        <button type="button" class="mw-btn mw-btn-primary" onClick={onPickFolder}>
          Choose a folder
        </button>
      ) : null}
    </div>
  );
}
