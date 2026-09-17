import { useCallback, useState } from 'preact/hooks';
import type { SidebarPanelId } from '../components/SidebarPanels';

const KEY = 'mw:sidebar-panel';
const VALID: SidebarPanelId[] = ['files', 'outline', 'search'];

/**
 * Which sidebar tab is showing, remembered for the tab's session.
 *
 * Reader mode loads a new page for every document, so without this the
 * sidebar snaps back to the file tree on each open — the same problem
 * `useTreeFocusHandoff` solves for the keyboard cursor, and the same answer:
 * per-tab `sessionStorage`, which two windows reading different folders
 * cannot share and which is gone when the tab is.
 *
 * Unlike the focus handoff this is not one-shot. It survives every
 * navigation in the tab until the reader picks a different tab.
 */
export function useSidebarPanel(
  doc: Document,
): [SidebarPanelId, (id: SidebarPanelId) => void] {
  const [panel, setPanelState] = useState<SidebarPanelId>(() => read(doc));

  const setPanel = useCallback(
    (id: SidebarPanelId) => {
      setPanelState(id);
      try {
        doc.defaultView?.sessionStorage.setItem(KEY, id);
      } catch {
        // Storage can be blocked. The tab still switches; it just will not
        // be remembered, which is not worth failing the interaction over.
      }
    },
    [doc],
  );

  return [panel, setPanel];
}

function read(doc: Document): SidebarPanelId {
  try {
    const value = doc.defaultView?.sessionStorage.getItem(KEY);
    return VALID.find((id) => id === value) ?? 'files';
  } catch {
    return 'files';
  }
}
