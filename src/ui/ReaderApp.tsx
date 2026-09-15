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
import { Breadcrumb, Toolbar, ToolbarButton } from './components/Toolbar';
import { DocumentView } from './components/DocumentView';

interface ReaderAppProps {
  page: PageInfo;
  source: string;
  initialSettings: Settings;
  /** Document the app renders into; passed in so nothing reads a global. */
  doc: Document;
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
  onSaveSettings,
  onOpenWorkspace,
}: ReaderAppProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [raw, setRaw] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const sanitizer = useMemo(() => createSanitizer(doc.defaultView!), [doc]);

  const result: RenderResult = useMemo(
    () => renderMarkdown(source, sanitizer, renderOptionsFrom(settings)),
    [source, sanitizer, settings],
  );

  useEffect(() => {
    applyTheme(doc.documentElement, settings.theme);
    applyContentWidth(doc.documentElement, settings.contentWidth);
  }, [doc, settings.theme, settings.contentWidth]);

  const cycleTheme = useCallback(() => {
    const updated = { ...settings, theme: nextTheme(settings.theme) };
    setSettings(updated);
    onSaveSettings(updated);
  }, [settings, onSaveSettings]);

  const openWorkspace = useCallback(() => {
    onOpenWorkspace(doc.location.href);
  }, [doc, onOpenWorkspace]);

  const reload = useCallback(() => {
    doc.location.reload();
  }, [doc]);

  const fileName = page.path?.split('/').pop() ?? 'Document';
  const directory = page.directory ?? '';

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
            <ToolbarButton icon="reload" label="Reload" onClick={reload} />
            <ToolbarButton
              icon="theme"
              label={`Theme: ${settings.theme}`}
              onClick={cycleTheme}
            />
            <ToolbarButton
              icon="workspace"
              label="Open in Workspace"
              onClick={openWorkspace}
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
        <Breadcrumb directory={directory} name={fileName} />
      </Toolbar>

      <div class="mw-body">
        <main class="mw-main" id="mw-main">
          <DocumentView
            result={result}
            source={source}
            raw={raw}
            fragment={doc.location.hash}
          />
        </main>
      </div>
    </div>
  );
}
