import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  buildOutline,
  flattenOutline,
  headingForLine,
  renderMarkdown,
  scrollToFragment,
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
import type { PageInfo } from '@core/reader/classify';
import type { FileSource } from '@core/fs/types';
import { basename } from '@core/fs/types';
import { pathToFileUrl } from '@core/fs/file-url-source';
import { Breadcrumb, Toolbar, ToolbarButton } from './components/Toolbar';
import { DocumentView } from './components/DocumentView';
import { FileTree } from './components/FileTree';
import { SidebarPanels, type SidebarPanel } from './components/SidebarPanels';
import { Outline } from './components/Outline';
import { SearchPanel } from './components/SearchPanel';
import { SidebarHeader } from './components/SidebarHeader';
import { useFileTree } from './hooks/useFileTree';
import { useEnrichment } from './hooks/useEnrichment';
import { useSettingsSync } from './hooks/useSettingsSync';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useScrollMemory } from './hooks/useScrollMemory';
import { useTreeFocusHandoff } from './hooks/useTreeFocusHandoff';
import { useSidebarPanel } from './hooks/useSidebarPanel';
import { useActiveHeading } from './hooks/useActiveHeading';
import { useFolderSearch } from './hooks/useFolderSearch';
import { usePendingLine } from './hooks/usePendingLine';
import { t, themeKey } from './i18n';

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
  const searchRef = useRef<HTMLInputElement>(null);
  /** The rendered article, so the outline can follow the scroll. */
  const docRoot = useRef<HTMLElement>(null);

  const documentPath = page.path ?? '';
  const sanitizer = useMemo(() => createSanitizer(doc.defaultView!), [doc]);

  const result: RenderResult = useMemo(
    () => renderMarkdown(source, sanitizer, renderOptionsFrom(settings)),
    [source, sanitizer, settings],
  );

  const enrichment = useEnrichment(sanitizer, settings, doc);

  // The renderer already emits the headings; this only gives them shape.
  const outline = useMemo(() => buildOutline(result.headings), [result.headings]);
  const outlineIds = useMemo(
    () => flattenOutline(outline).map((node) => node.id),
    [outline],
  );
  const activeHeading = useActiveHeading(docRoot, outlineIds, !raw);

  /**
   * Jump to a heading without reloading.
   *
   * Reader mode navigates between *documents* by changing the page, but a
   * fragment within the open one is a scroll: setting `location.hash` here
   * would be a same-page navigation that re-runs nothing, and pushing the
   * state keeps the back button meaningful.
   */
  const goToHeading = useCallback(
    (id: string) => {
      const root = docRoot.current;
      if (root) scrollToFragment(root, id);
      try {
        doc.defaultView?.history.pushState(null, '', `#${encodeURIComponent(id)}`);
      } catch {
        // A file:// page can refuse pushState in some configurations; the
        // scroll already happened, which is the part that matters.
      }
    },
    [doc],
  );

  const tree = useFileTree(fileSource, treeRoot);
  const { reveal, setFilter } = tree;
  const filterValue = tree.state.filter;

  // Opening a document reloads the page, so the tree cursor has to be
  // carried across by hand or it is lost on every Enter.
  const { restoreTreeFocus, handOffTreeFocus } = useTreeFocusHandoff(doc);

  // And for the same reason, so does the chosen sidebar tab.
  const [sidebarPanel, setSidebarPanel] = useSidebarPanel(doc);

  const treeOptions = useMemo(
    () => ({
      showHidden: settings.fileBrowser.showHiddenFiles,
      excludedDirectories: settings.fileBrowser.excludedDirectories,
      sortBy: settings.fileBrowser.sortBy,
    }),
    [settings.fileBrowser],
  );

  const search = useFolderSearch(fileSource, treeRoot, treeOptions);
  const { pending, handOff } = usePendingLine(doc);

  /** Open a search hit: a different document, landing near the line. */
  const openMatch = useCallback(
    (path: string, line: number) => {
      handOffTreeFocus();
      if (path === documentPath) {
        // Already here, so it is only a scroll.
        const heading = headingForLine(result.headings, line);
        const root = docRoot.current;
        if (heading && root) scrollToFragment(root, heading.id);
        return;
      }
      handOff(path, line);
      doc.location.href = pathToFileUrl(path);
    },
    [doc, documentPath, handOff, handOffTreeFocus, result.headings],
  );

  /**
   * Land near the line a search sent us to.
   *
   * The match is a line in the source; the rendered page has anchors only
   * at headings, so the nearest heading at or above the line is where this
   * arrives. Above the first heading it stays at the top rather than
   * guessing.
   */
  useEffect(() => {
    if (!pending || pending.path !== documentPath || raw) return;
    const heading = headingForLine(result.headings, pending.line);
    if (!heading) return;
    const root = docRoot.current;
    if (!root) return;
    // After paint, so the document has its real height.
    const frame = requestAnimationFrame(() => scrollToFragment(root, heading.id));
    return () => cancelAnimationFrame(frame);
  }, [pending, documentPath, raw, result.headings]);

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
          setSidebarPanel('files');
          requestAnimationFrame(() => filterRef.current?.focus());
        },
        focusSearch: () => {
          // The panel has to be showing before its field can take focus,
          // and Preact has not rendered the switch yet at this point.
          setSidebarVisible(true);
          setSidebarPanel('search');
          requestAnimationFrame(() => searchRef.current?.focus());
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
      [doc, setFilter, filterValue, setSidebarPanel],
    ),
  );

  const panels: SidebarPanel[] = [
    {
      id: 'files',
      label: t('filesNav'),
      content: fileSource ? (
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
        <p class="mw-empty">{t('folderCouldNotBeRead')}</p>
      ),
    },
  ];

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

  return (
    <div class="mw-root">
      <a class="mw-skip-link" href="#mw-main">
        {t('skipToContent')}
      </a>

      <Toolbar
        actions={
          <>
            <ToolbarButton
              icon="raw"
              label={raw ? t('showRenderedDocument') : t('showMarkdownSource')}
              pressed={raw}
              onClick={() => setRaw((v) => !v)}
            />
            <ToolbarButton
              icon="reload"
              label={t('reload')}
              onClick={() => doc.location.reload()}
            />
            <ToolbarButton
              icon="theme"
              label={t('themeIs', [t(themeKey(settings.theme))])}
              onClick={cycleTheme}
            />
            <ToolbarButton
              icon="workspace"
              label={t('openInWorkspace')}
              onClick={() => onOpenWorkspace(doc.location.href)}
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
        <Breadcrumb
          directory={page.directory ?? ''}
          name={basename(documentPath) || t('untitledDocument')}
        />
      </Toolbar>

      <div class="mw-body">
        <nav class="mw-sidebar" hidden={!sidebarVisible} aria-label={t('filesNav')}>
          <SidebarHeader root={treeRoot ?? ''} onNavigateUp={openFolder} />
          <SidebarPanels
            label={t('sidebarSections')}
            panels={panels}
            selected={sidebarPanel}
            onSelect={setSidebarPanel}
          />
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
            rootRef={docRoot}
          />
        </main>
      </div>
    </div>
  );
}
