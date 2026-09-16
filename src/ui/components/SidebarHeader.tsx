import { basename, dirname } from '@core/fs/types';
import { t } from '../i18n';

interface SidebarHeaderProps {
  /** Directory the tree is rooted at. */
  root: string;
  /** Opens the parent folder. Omitted when there is nowhere to go. */
  onNavigateUp?: (parent: string) => void;
  children?: preact.ComponentChildren;
}

/**
 * The sidebar's folder header, with a way out.
 *
 * A document opened directly -- rather than from a folder -- has no
 * remembered root to fall back on, so without this the tree is stuck at that
 * document's own directory and the parent folder is unreachable. Going up
 * opens the parent as a folder, which is the same path a drop takes.
 */
export function SidebarHeader({ root, onNavigateUp, children }: SidebarHeaderProps) {
  const trimmed = root.replace(/\/+$/, '');
  const parent = dirname(trimmed);
  const canGoUp = Boolean(onNavigateUp) && trimmed !== '' && parent !== trimmed;

  return (
    <div class="mw-sidebar-header">
      {canGoUp ? (
        <button
          type="button"
          class="mw-btn mw-sidebar-up"
          title={t('openParentFolder', [parent])}
          aria-label={`Open the parent folder: ${parent}`}
          onClick={() => onNavigateUp?.(parent.endsWith('/') ? parent : `${parent}/`)}
        >
          ↑
        </button>
      ) : null}
      <span class="mw-sidebar-title" title={root}>
        {basename(trimmed) || '/'}
      </span>
      {children}
    </div>
  );
}
