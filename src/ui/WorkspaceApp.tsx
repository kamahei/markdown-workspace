import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  buildOutline,
  flattenOutline,
  headingForLine,
  renderMarkdown,
  scrollToFragment,
  type Heading,
  type RenderResult,
} from '@core/markdown';
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
import type { FileError, FileErrorCode } from '@core/messaging';
import { Toolbar, ToolbarButton } from './components/Toolbar';
import { DocumentView } from './components/DocumentView';
import { FileTree } from './components/FileTree';
import { SidebarPanels, type SidebarPanel } from './components/SidebarPanels';
import { Outline } from './components/Outline';
import { SearchPanel } from './components/SearchPanel';
import { DropZone } from './components/DropZone';
import { Tabs, type Tab } from './components/Tabs';
import { ErrorPanel, FileAccessPanel, LoadingPane } from './components/States';
import { useFileTree } from './hooks/useFileTree';
import { useSettingsSync } from './hooks/useSettingsSync';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useScrollMemory } from './hooks/useScrollMemory';
import { useSidebarPanel } from './hooks/useSidebarPanel';
import { useActiveHeading } from './hooks/useActiveHeading';
import { useFolderSearch } from './hooks/useFolderSearch';
import { useEnrichment } from './hooks/useEnrichment';
import { t, themeKey } from './i18n';

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
  /** Reading position, persisted per document (FR-30). */
  loadScroll: (path: string) => Promise<number>;
  saveScroll: (path: string, ratio: number) => void;
}

/**
 * Why a document would not open, in the reader's language.
 *
 * Worded for a file rather than for a folder; the sidebar has its own
 * mapping, because "no longer there" needs a different noun in each place.
 */
function describeOpenFailure(code: FileErrorCode): string {
  switch (code) {
    case 'file-access-denied':
      return t('localFilesBlocked');
    case 'not-found':
      return t('fileNoLongerThere');
    default:
      return t('documentCouldNotBeOpened');
  }
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
  loadScroll,
  saveScroll,
}: WorkspaceAppProps) {
  // Live: a change made in the options page reaches this surface
  // without a reload (FR-26).
  const [settings, setSettings] = useSettingsSync(initialSettings);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Map<string, OpenDocument>>(new Map());
  const [error, setError] = useState<FileError | null>(null);
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarPanel, setSidebarPanel] = useSidebarPanel(doc);

  const sanitizer = useMemo(() => createSanitizer(doc.defaultView!), [doc]);
  const enrichment = useEnrichment(sanitizer, settings, doc);
  const tree = useFileTree(fileSource, fileSource ? '/' : null);
  const { reveal, setFilter } = tree;
  const filterValue = tree.state.filter;

  const openedInitial = useRef(false);
  const scroller = useRef<HTMLElement>(null);
  /** The rendered article, so the outline can follow the scroll. */
  const docRoot = useRef<HTMLElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  /**
   * Scrolls to the heading a source line falls under.
   *
   * The rendered page has anchors only at headings, so a line in the middle
   * of a section lands at the section. After paint, because the document
   * has only just been handed to Preact.
   */
  const landOnLine = useCallback((headings: Heading[], line: number) => {
    const heading = headingForLine(headings, line);
    if (!heading) return;
    requestAnimationFrame(() => {
      const root = docRoot.current;
      if (root) scrollToFragment(root, heading.id);
    });
  }, []);

  /**
   * Opens a document, optionally landing near a line.
   *
   * The line comes from a folder search, and the scrolling happens here
   * rather than in the caller because this is where the rendered result
   * exists. A caller that awaited this and then read `documents` would be
   * reading state that has not been committed yet.
   */
  const openPath = useCallback(
    async (path: string, line?: number) => {
      if (!fileSource) return;

      const existing = tabs.find((tab) => tab.path === path);
      if (existing) {
        setActiveId(existing.id);
        reveal(path);
        const already = documents.get(path);
        if (line !== undefined && already) landOnLine(already.result.headings, line);
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
        if (line !== undefined) landOnLine(result.headings, line);
      } catch (err) {
        // Translated from the code, not from the error's own message: that
        // one is written in `src/core/`, which has no translator by design,
        // and it was reaching the alert panel as English prose.
        setError(
          err instanceof FileSourceError
            ? { code: err.code, message: describeOpenFailure(err.code) }
            : { code: 'unknown', message: t('documentCouldNotBeOpened') },
        );
      } finally {
        setLoading(false);
      }
    },
    [fileSource, tabs, documents, sanitizer, settings, reveal, landOnLine],
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

  useKeyboardShortcuts(
    doc,
    useMemo(
      () => ({
        toggleSidebar: () => setSidebarVisible((v) => !v),
        toggleRaw: () => setRaw((v) => !v),
        focusFilter: () => {
          setSidebarVisible(true);
          setSidebarPanel('files');
          requestAnimationFrame(() => filterRef.current?.focus());
        },
        focusSearch: () => {
          setSidebarVisible(true);
          setSidebarPanel('search');
          requestAnimationFrame(() => searchRef.current?.focus());
        },
        closeTab: () => {
          if (activeId) closeTab(activeId);
        },
        escape: () => {
          // The shortcut list says Escape clears the filter, so it clears the
          // filter -- from the tree as well as from the field. It used to do
          // so only when the field had focus, which meant arrowing into a
          // narrowed list left no way out of it.
          if (doc.activeElement === filterRef.current) {
            setFilter('');
            filterRef.current?.blur();
            return;
          }
          if (filterValue) {
            setFilter('');
            return;
          }
          // Nothing left to clear: out of the sidebar and back to the
          // document, so Space and PageDown scroll again.
          if (doc.activeElement?.closest('[role="tree"]')) scroller.current?.focus();
        },
      }),
      [doc, setFilter, filterValue, activeId, closeTab, setSidebarPanel],
    ),
  );

  const treeOptions = useMemo(
    () => ({
      showHidden: settings.fileBrowser.showHiddenFiles,
      excludedDirectories: settings.fileBrowser.excludedDirectories,
      sortBy: settings.fileBrowser.sortBy,
    }),
    [settings.fileBrowser],
  );

  // A handle-backed source is rooted at '/', the same root its tree gets.
  const search = useFolderSearch(fileSource, fileSource ? '/' : null, treeOptions);

  const panels: SidebarPanel[] = [
    {
      id: 'files',
      label: t('filesNav'),
      content: fileSource ? (
        <>
          {!fileSource.canPersist ? (
            <p class="mw-sidebar-note">{t('snapshotFolderNote')}</p>
          ) : null}
          <FileTree
            filterRef={filterRef}
            state={tree.state}
            options={treeOptions}
            onToggle={tree.toggle}
            onOpen={(path) => void openPath(path)}
            onFilterChange={tree.setFilter}
          />
        </>
      ) : (
        <p class="mw-empty">{t('dropAFolderHere')}</p>
      ),
    },
  ];

  const active = activeId ? documents.get(activeId) : null;

  // The renderer already emits the headings; this only gives them shape.
  const outline = useMemo(
    () => buildOutline(active?.result.headings ?? []),
    [active?.result.headings],
  );
  const outlineIds = useMemo(
    () => flattenOutline(outline).map((node) => node.id),
    [outline],
  );
  const activeHeading = useActiveHeading(docRoot, outlineIds, !raw);

  /** A heading is a scroll within the open tab, never a navigation. */
  const goToHeading = useCallback((id: string) => {
    const root = docRoot.current;
    if (root) scrollToFragment(root, id);
  }, []);

  /** Open a search hit; openPath does the landing. */
  const openMatch = useCallback(
    (path: string, line: number) => void openPath(path, line),
    [openPath],
  );

  if (settings.features.tableOfContents) {
    panels.push({
      id: 'outline',
      label: t('sidebarTabOutline'),
      content: (
        <Outline nodes={outline} activeId={activeHeading} onNavigate={goToHeading} />
      ),
    });
  }

  panels.push({
    id: 'search',
    label: t('sidebarTabSearch'),
    content: (
      <SearchPanel
        {...search}
        inputRef={searchRef}
        available={fileSource !== null}
        onOpen={openMatch}
      />
    ),
  });

  // Keyed on the active tab, so switching tabs restores each document's
  // own position rather than carrying one across.
  useScrollMemory(
    scroller,
    raw ? null : activeId,
    loadScroll,
    saveScroll,
    Boolean(active),
  );

  // Capability-dependent controls are hidden rather than shown as dead
  // buttons: a snapshot source genuinely cannot reload.
  const canRefresh = fileSource?.canRefresh ?? false;

  return (
    <DropZone onDrop={onDropFolder} accepts={dragAccepts}>
      <div class="mw-root">
        <a class="mw-skip-link" href="#mw-main">
          {t('skipToContent')}
        </a>

        <Toolbar
          actions={
            <>
              {active ? (
                <ToolbarButton
                  icon="raw"
                  label={raw ? t('showRenderedDocument') : t('showMarkdownSource')}
                  pressed={raw}
                  onClick={() => setRaw((v) => !v)}
                />
              ) : null}
              {canRefresh ? (
                <ToolbarButton
                  icon="reload"
                  label={t('reloadFromDisk')}
                  onClick={tree.refresh}
                />
              ) : null}
              <ToolbarButton
                icon="theme"
                label={t('themeIs', [t(themeKey(settings.theme))])}
                onClick={cycleTheme}
              />
            </>
          }
        >
          <ToolbarButton
            icon="sidebar"
            label={t('toggleSidebar')}
            pressed={sidebarVisible}
            onClick={() => setSidebarVisible((v) => !v)}
          />
          <span class="mw-breadcrumb-name">
            {fileSource?.displayName ?? 'Markdown Workspace'}
          </span>
        </Toolbar>

        <div class="mw-body">
          <nav class="mw-sidebar" hidden={!sidebarVisible} aria-label={t('filesNav')}>
            <div class="mw-sidebar-header">
              <span class="mw-sidebar-title">{t('workspaceFolders')}</span>
              <button
                type="button"
                class="mw-btn"
                aria-label={t('openAFolder')}
                title={t('openAFolder')}
                onClick={onPickFolder}
              >
                +
              </button>
            </div>

            <SidebarPanels
              label={t('sidebarSections')}
              panels={panels}
              selected={sidebarPanel}
              onSelect={setSidebarPanel}
            />

            {recent.length > 0 ? (
              <div class="mw-recent">
                <div class="mw-sidebar-header">
                  <span>{t('workspaceRecent')}</span>
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
                        aria-label={t('forgetFolder', [item.displayName])}
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

            {/* tabIndex so the skip link actually moves focus here; a
                plain <main> is not focusable. */}
            <main class="mw-main" id="mw-main" tabIndex={-1} ref={scroller}>
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
                  rootRef={docRoot}
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
      <h1 class="mw-folder-title">{t('extName')}</h1>
      <p class="mw-folder-hint">
        {hasFolder ? t('pickADocument') : t('dropAFolderAnywhere')}
      </p>
      {!hasFolder ? (
        <button type="button" class="mw-btn mw-btn-primary" onClick={onPickFolder}>
          {t('chooseAFolder')}
        </button>
      ) : null}
    </div>
  );
}
