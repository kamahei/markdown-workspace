import type { OutlineNode } from '@core/markdown';
import { t } from '../i18n';

/**
 * The document's headings, as a table of contents.
 *
 * A nested `<ul>` of links rather than an ARIA tree. There is nothing to
 * expand or collapse here, and a screen reader announces a nested list's
 * depth on its own — the tree pattern would add keyboard machinery that
 * bought the reader nothing and a second set of arrow-key rules to learn.
 *
 * Links rather than buttons, with a real `#id` href, so the browser's own
 * "open in new tab", "copy link address" and the status bar all work, and so
 * the fragment lands in the address bar and in the back history.
 */

interface OutlineProps {
  nodes: OutlineNode[];
  /** Anchor id the reader is currently under; marked with aria-current. */
  activeId: string | null;
  /**
   * Navigate to a heading. Takes the click so the component never touches
   * `location` itself and stays renderable in a test.
   */
  onNavigate: (id: string) => void;
}

export function Outline({ nodes, activeId, onNavigate }: OutlineProps) {
  if (nodes.length === 0) {
    return <p class="mw-empty">{t('outlineEmpty')}</p>;
  }

  return (
    <div class="mw-outline-scroll">
      <nav class="mw-outline" aria-label={t('sidebarTabOutline')}>
        <OutlineList nodes={nodes} activeId={activeId} onNavigate={onNavigate} />
      </nav>
    </div>
  );
}

function OutlineList({ nodes, activeId, onNavigate }: OutlineProps) {
  return (
    <ul class="mw-outline-list">
      {nodes.map((node) => (
        <li key={node.id}>
          <a
            class="mw-outline-link"
            href={`#${encodeURIComponent(node.id)}`}
            // "true", not "location": this marks a position within the page,
            // not the page itself.
            aria-current={node.id === activeId ? 'true' : undefined}
            onClick={(event) => {
              // Let a modified click do what the reader asked of the browser.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return;
              }
              event.preventDefault();
              onNavigate(node.id);
            }}
          >
            {node.text}
          </a>
          {node.children.length > 0 ? (
            <OutlineList
              nodes={node.children}
              activeId={activeId}
              onNavigate={onNavigate}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
