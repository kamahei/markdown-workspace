import { t } from '../i18n';
export interface Tab {
  id: string;
  title: string;
  path: string;
}

interface TabsProps {
  tabs: Tab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

/**
 * Document tabs (FR-21).
 *
 * Overflow scrolls horizontally rather than shrinking tabs below a readable
 * width: a row of unreadable stubs is worse than a scrollbar.
 */
export function Tabs({ tabs, activeId, onSelect, onClose }: TabsProps) {
  if (tabs.length === 0) return null;

  return (
    <div class="mw-tabs" role="tablist" aria-label={t('openDocumentsTabs')}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          tabIndex={tab.id === activeId ? 0 : -1}
          aria-selected={tab.id === activeId}
          class={`mw-tab${tab.id === activeId ? ' is-active' : ''}`}
          title={tab.path}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(tab.id);
            }
          }}
          onAuxClick={(e) => {
            // Middle click closes, as in the browser's own tab strip.
            if (e.button === 1) {
              e.preventDefault();
              onClose(tab.id);
            }
          }}
        >
          <span class="mw-tab-title">{tab.title}</span>
          <button
            type="button"
            class="mw-tab-close"
            aria-label={t('closeTab', [tab.title])}
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
