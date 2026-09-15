import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
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
import { useFileTree } from './hooks/useFileTree';
import { useEnrichment } from './hooks/useEnrichment';

interface ReaderAppProps {
  page: PageInfo;
  source: string;
  initialSettings: Settings;
  /** Document the app renders into; passed in so nothing reads a global. */
  doc: Document;
  /** Backs the sidebar. Null when the folder could not be read. */
  fileSource: FileSource | null;
  /**
   * Extension side effects arrive as callbacks so this component stays
   * testable without a browser. The composition root wires them to the
   * platform adapter.
   */
  onSaveSettings: (settings: Settings) => void;
  onOpenWorkspace: (target: string) => void;
}

export function ReaderApp({
  page,
  source,
  initialSettings,
  doc,
  fileSource,
  onSaveSettings,
  onOpenWorkspace,
}: ReaderAppProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [raw, setRaw] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const documentPath = page.path ?? '';
  const sanitizer = useMemo(() => createSanitizer(doc.defaultView!), [doc]);

  const result: RenderResult = useMemo(
    () => renderMarkdown(source, sanitizer, renderOptionsFrom(settings)),
    [source, sanitizer, settings],
  );

  const enrichment = useEnrichment(sanitizer, settings, doc);

  const tree = useFileTree(fileSource, page.directory);
  const { reveal } = tree;

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
      doc.location.href = pathToFileUrl(path) + (fragment ? `#${fragment}` : '');
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
          <div class="mw-sidebar-header">
            <span class="mw-sidebar-title" title={page.directory ?? ''}>
              {basename(page.directory ?? '') || '/'}
            </span>
          </div>
          {fileSource ? (
            <FileTree
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

        <main class="mw-main" id="mw-main">
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
