import { useCallback, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

/**
 * The sidebar's tabs: files, outline, search.
 *
 * Implements the ARIA `tablist` pattern with roving tabindex and automatic
 * activation — arrowing to a tab selects it, which the APG recommends when
 * showing a panel is cheap, and all three of these are already in the DOM.
 *
 * **Every panel stays mounted**, with the inactive ones hidden. Unmounting
 * would be tidier and is wrong here: the file tree carries a keyboard cursor
 * and a scroll position that reader mode already goes to some trouble to
 * preserve across navigations (`useTreeFocusHandoff`). Throwing those away
 * because somebody glanced at the outline would undo that work.
 */

export type SidebarPanelId = 'files' | 'outline' | 'search';

export interface SidebarPanel {
  id: SidebarPanelId;
  /** Already translated by the caller; this component has no opinion. */
  label: string;
  content: ComponentChildren;
}

interface SidebarPanelsProps {
  panels: SidebarPanel[];
  selected: SidebarPanelId;
  onSelect: (id: SidebarPanelId) => void;
  /** Names the tablist for assistive technology. */
  label: string;
}

const tabId = (id: SidebarPanelId) => `mw-sidebar-tab-${id}`;
const panelId = (id: SidebarPanelId) => `mw-sidebar-panel-${id}`;

export function SidebarPanels({ panels, selected, onSelect, label }: SidebarPanelsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // A panel can disappear — the outline goes away when its setting is off —
  // so never trust the selection to still name one that exists.
  const active = panels.some((panel) => panel.id === selected)
    ? selected
    : (panels[0]?.id ?? 'files');

  /** Selects a tab and puts focus on it, which the pattern requires. */
  const go = useCallback(
    (next: SidebarPanel | undefined) => {
      if (!next) return;
      onSelect(next.id);
      // Found by data attribute rather than by id: no escaping, and it
      // cannot reach a tab belonging to some other tablist on the page.
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-panel="${next.id}"]`)
        ?.focus();
    },
    [onSelect],
  );

  const move = useCallback(
    (delta: number) => {
      const index = panels.findIndex((panel) => panel.id === active);
      if (index < 0) return;
      // Wraps, per the tablist pattern.
      go(panels[(index + delta + panels.length) % panels.length]);
    },
    [panels, active, go],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          move(1);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          move(-1);
          break;
        // Home and End move focus too. Selecting a tab the focus is no
        // longer on leaves the roving tabindex pointing somewhere the
        // reader is not, and the next Tab press jumps somewhere unexpected.
        case 'Home':
          event.preventDefault();
          go(panels[0]);
          break;
        case 'End':
          event.preventDefault();
          go(panels[panels.length - 1]);
          break;
        default:
          break;
      }
    },
    [move, go, panels],
  );

  // One panel is not a choice, so it gets no tabs — reader mode with the
  // outline turned off and no folder open should look like it always did.
  const showTabs = panels.length > 1;

  return (
    <div class="mw-sidebar-panels">
      {showTabs ? (
        <div
          ref={listRef}
          role="tablist"
          aria-label={label}
          class="mw-sidebar-tablist"
          onKeyDown={onKeyDown}
        >
          {panels.map((panel) => (
            <button
              key={panel.id}
              id={tabId(panel.id)}
              type="button"
              role="tab"
              class="mw-sidebar-tab"
              data-panel={panel.id}
              aria-selected={panel.id === active}
              aria-controls={panelId(panel.id)}
              tabIndex={panel.id === active ? 0 : -1}
              onClick={() => onSelect(panel.id)}
            >
              {panel.label}
            </button>
          ))}
        </div>
      ) : null}

      {panels.map((panel) => (
        <div
          key={panel.id}
          id={panelId(panel.id)}
          role="tabpanel"
          aria-labelledby={showTabs ? tabId(panel.id) : undefined}
          class="mw-sidebar-panel"
          hidden={panel.id !== active}
        >
          {panel.content}
        </div>
      ))}
    </div>
  );
}
