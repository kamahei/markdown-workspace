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
import type { PageInfo } from '@core/reader/classify';
import type { FileSource } from '@core/fs/types';
import { basename } from '@core/fs/types';
import { pathToFileUrl } from '@core/fs/file-url-source';
import { Breadcrumb, Toolbar, ToolbarButton } from './components/Toolbar';
import { DocumentView } from './components/DocumentView';
import { FileTree } from './components/FileTree';
import { SidebarHeader } from './components/SidebarHeader';
import { useFileTree } from './hooks/useFileTree';
import { useEnrichment } from './hooks/useEnrichment';
import { useSettingsSync } from './hooks/useSettingsSync';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useScrollMemory } from './hooks/useScrollMemory';
import { useTreeFocusHandoff } from './hooks/useTreeFocusHandoff';

interface ReaderAppProps {
  page: PageInfo;
  source: string;
  initialSettings: Settings;
  /** Document the app renders into; passed in so nothing reads a global. */
  doc: Document;
  /** Backs the sidebar. Null when the folder could not be read. */
  fileSource: FileSource | null;
  /** Folder the sidebar is rooted at, which is not always this document's. */
  treeRoot: string | null;
  /**
   * Extension side effects arrive as callbacks so this component stays
   * testable without a browser. The composition root wires them to the
   * platform adapter.
   */
  onSaveSettings: (settings: Settings) => void;
  onOpenWorkspace: (target: string) => void;
  /** Reading position, persisted per document (FR-30). */
  loadScroll: (path: string) => Promise<number>;
  saveScroll: (path: string, ratio: number) => void;
}

export function ReaderApp({
  page,
  source,
  initialSettings,
  doc,
  fileSource,
  treeRoot,
  onSaveSettings,
  onOpenWorkspace,
  loadScroll,
  saveScroll,
}: ReaderAppProps) {
  // Settings come from the broadcast as well as from local edits, so a
  // change made in the options page reaches an open document without a
  // reload (FR-26).
  const [settings, setSettings] = useSettingsSync(initialSettings);
  const [raw, setRaw] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const scroller = useRef<HTMLElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const documentPath = page.path ?? '';
  const sanitizer = useMemo(() => createSanitizer(doc.defaultView!), [doc]);

  const result: RenderResult = useMemo(
    () => renderMarkdown(source, sanitizer, renderOptionsFrom(settings)),
    [source, sanitizer, settings],
  );

  const enrichment = useEnrichment(sanitizer, settings, doc);

  const tree = useFileTree(fileSource, treeRoot);
  const { reveal, setFilter } = tree;
  const filterValue = tree.state.filter;

  // Opening a document reloads the page, so the tree cursor has to be
  // carried across by hand or it is lost on every Enter.
  const { restoreTreeFocus, handOffTreeFocus } = useTreeFocusHandoff(doc);

  // Restored only once the document is rendered, so scrollHeight is real.
  useScrollMemory(scroller, raw ? null : documentPath, loadScroll, saveScroll, true);

  useEffect(() => {
    applyTheme(doc.documentElement, settings.theme);
    applyContentWidth(doc.documentElement, settings.contentWidth);
  }, [doc, settings.theme, settings.contentWidth]);

  // Highlight the open document in the sidebar.
  useEffect(() => {
    if (documentPath) reveal(documentPath);
  }, [documentPath, reveal]);

  const cycleTheme = useCallback(() => {
    const updated = { ...settings, theme: nextTheme(settings.theme) };
    setSettings(updated);
    onSaveSettings(updated);
  }, [settings, onSaveSettings]);

  /**
   * Reader mode navigates by changing the page rather than swapping the
   * document in place: each file:// URL is a real page the content script
   * takes over, so back and forward keep working.
   */
  const openPath = useCallback(
    (path: string, fragment?: string | null) => {
      handOffTreeFocus();
      doc.location.href = pathToFileUrl(path) + (fragment ? `#${fragment}` : '');
    },
    [doc, handOffTreeFocus],
  );

  /** Opening a folder navigates to its listing, which re-roots this tab. */
  const openFolder = useCallback(
    (directory: string) => {
      handOffTreeFocus();
      doc.location.href = `${pathToFileUrl(directory.replace(/\/+$/, ''))}/`;
    },
    [doc, handOffTreeFocus],
  );

  useKeyboardShortcuts(
    doc,
    useMemo(
      () => ({
        toggleSidebar: () => setSidebarVisible((v) => !v),
        toggleRaw: () => setRaw((v) => !v),
        focusFilter: () => {
          // Revealing the sidebar first, or the filter cannot take focus.
          setSidebarVisible(true);
          requestAnimationFrame(() => filterRef.current?.focus());
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
      [doc, setFilter, filterValue],
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

  return (
    <div class="mw-root">
      <a class="mw-skip-link" href="#mw-main">
        Skip to content
      </a>

      <Toolbar
        actions={
          <>
            <ToolbarButton
              icon="raw"
              label={raw ? 'Show rendered document' : 'Show Markdown source'}
              pressed={raw}
              onClick={() => setRaw((v) => !v)}
            />
            <ToolbarButton
              icon="reload"
              label="Reload"
              onClick={() => doc.location.reload()}
            />
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
        <ToolbarButton
          icon="sidebar"
          label="Toggle sidebar"
          pressed={sidebarVisible}
          onClick={() => setSidebarVisible((v) => !v)}
        />
        <Breadcrumb
          directory={page.directory ?? ''}
          name={basename(documentPath) || 'Document'}
        />
      </Toolbar>

      <div class="mw-body">
        <nav class="mw-sidebar" hidden={!sidebarVisible} aria-label="Files">
          <SidebarHeader root={treeRoot ?? ''} onNavigateUp={openFolder} />
          {fileSource ? (
            <FileTree
              filterRef={filterRef}
              autoFocus={restoreTreeFocus}
              state={tree.state}
              options={treeOptions}
              onToggle={tree.toggle}
              onOpen={openPath}
              onFilterChange={tree.setFilter}
            />
          ) : (
            <p class="mw-empty">This folder could not be read.</p>
          )}
        </nav>

        {/* tabIndex so the skip link and Escape can both land here: a
            plain <main> is not focusable and focus would stay behind. */}
        <main class="mw-main" id="mw-main" tabIndex={-1} ref={scroller}>
          <DocumentView
            result={result}
            source={source}
            raw={raw}
            fragment={doc.location.hash}
            documentPath={documentPath}
            fileSource={fileSource}
            onNavigate={openPath}
            enrichment={enrichment}
          />
        </main>
      </div>
    </div>
  );
}
