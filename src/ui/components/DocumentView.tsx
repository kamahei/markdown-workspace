import { useEffect, useRef } from 'preact/hooks';
import { applyHeadingAnchors, scrollToFragment, type RenderResult } from '@core/markdown';
import { classifyLink, resolveImagePath } from '@core/link';
import {
  enrichDocument,
  markPending,
  type EnrichmentLoaders,
  type EnrichMessages,
  type Theme,
} from '@core/enrich';
import type { Sanitizer } from '@core/sanitize';
import type { FileSource } from '@core/fs/types';
import { t } from '../i18n';

interface FrontMatterProps {
  frontMatter: RenderResult['frontMatter'];
}

/**
 * Front matter as a metadata header, never as body text (FR-4).
 *
 * A block that failed to parse is shown verbatim: the author wrote something
 * and losing it silently is worse than showing it imperfectly.
 */
function FrontMatterHeader({ frontMatter }: FrontMatterProps) {
  if (frontMatter.error) {
    return (
      <div class="mw-frontmatter mw-frontmatter-error">
        <strong>{t('frontMatterUnparseable', [frontMatter.error ?? ''])}</strong>
        <pre class="mw-raw">{frontMatter.raw}</pre>
      </div>
    );
  }

  const data = frontMatter.data;
  if (!data || Object.keys(data).length === 0) return null;

  return (
    <div class="mw-frontmatter">
      <dl>
        {Object.entries(data).map(([key, value]) => (
          <>
            <dt>{key}</dt>
            <dd>{formatValue(value)}</dd>
          </>
        ))}
      </dl>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface DocumentViewProps {
  result: RenderResult;
  /** Raw source, shown by the raw/rendered toggle (FR-8). */
  source: string;
  raw: boolean;
  /** Fragment to scroll to once the document is in the DOM. */
  fragment?: string;
  /** Path of this document, used to resolve relative references. */
  documentPath: string;
  /** Used to load relative images. Null when the folder is unreadable. */
  fileSource: FileSource | null;
  /** Called for links that stay inside the workspace (FR-10, FR-14). */
  onNavigate: (path: string, fragment?: string | null) => void;
  /** Phase two: highlighting, math and diagrams. Omit to skip enrichment. */
  enrichment?: {
    loaders: EnrichmentLoaders;
    sanitizer: Sanitizer;
    theme: Theme;
    features: { highlight: boolean; math: boolean; diagrams: boolean };
    messages: EnrichMessages;
  };
}

export function DocumentView({
  result,
  source,
  raw,
  fragment,
  documentPath,
  fileSource,
  onNavigate,
  enrichment,
}: DocumentViewProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (raw) return;
    const root = ref.current;
    if (!root) return;

    // Anchors are reapplied here rather than trusted from the HTML: the
    // sanitizer drops an id that would clobber a document property.
    applyHeadingAnchors(root);
    wrapTables(root);
    trackCodeScrollability(root);

    const cancelled = { value: false };
    void loadRelativeImages(root, documentPath, fileSource, cancelled);

    // Phase two. The document is already readable; this only enhances it, so
    // nothing here is awaited before paint and every failure is contained.
    if (enrichment) {
      markPending(root, result.enrichments);
      void enrichDocument(root, result.enrichments, enrichment.loaders, {
        theme: enrichment.theme,
        sanitizer: enrichment.sanitizer,
        features: enrichment.features,
        messages: enrichment.messages,
        // Live view of the cleanup flag, so an in-flight enrichment stops
        // as soon as the document is replaced.
        signal: {
          get aborted() {
            return cancelled.value;
          },
        },
      });
    }

    if (fragment) {
      // After paint, so the target has its final position.
      requestAnimationFrame(() => scrollToFragment(root, fragment));
    }

    return () => {
      cancelled.value = true;
    };
  }, [
    result.html,
    result.enrichments,
    raw,
    fragment,
    documentPath,
    fileSource,
    enrichment,
  ]);

  /**
   * Link handling is delegated from the article rather than bound per anchor:
   * one listener survives re-renders and covers links added by enrichment.
   */
  const onClick = (event: MouseEvent) => {
    // Leave modified clicks to the browser so "open in new tab" keeps working.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = (event.target as Element | null)?.closest?.('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    const intent = classifyLink(href, { fromPath: documentPath });

    switch (intent.kind) {
      case 'fragment': {
        event.preventDefault();
        const root = ref.current;
        if (root) scrollToFragment(root, intent.fragment);
        break;
      }
      case 'document':
        event.preventDefault();
        onNavigate(intent.path, intent.fragment);
        break;
      case 'directory':
        event.preventDefault();
        onNavigate(intent.path);
        break;
      // A non-Markdown file and an external URL both go to the browser, which
      // is what the sanitizer already set target="_blank" for.
      case 'file':
      case 'external':
      case 'ignore':
      default:
        break;
    }
  };

  if (raw) {
    return (
      <div class="mw-pane">
        <pre class="mw-raw">{source}</pre>
      </div>
    );
  }

  return (
    <div class="mw-pane">
      <FrontMatterHeader frontMatter={result.frontMatter} />
      <article
        ref={ref}
        class="mw-doc"
        onClick={onClick}
        // Already sanitized in core; there is no path that reaches here
        // without passing through the sanitizer.
        dangerouslySetInnerHTML={{ __html: result.html }}
      />
    </div>
  );
}

/**
 * Rewrites relative image sources so they load (FR-11).
 *
 * On a `file://` page the browser resolves relative paths itself, but reading
 * through the source works on every surface and is what makes images appear in
 * the workspace, where the document lives on the extension origin.
 */
async function loadRelativeImages(
  root: HTMLElement,
  documentPath: string,
  fileSource: FileSource | null,
  cancelled: { value: boolean },
): Promise<void> {
  if (!fileSource || !documentPath) return;

  for (const img of Array.from(root.querySelectorAll('img'))) {
    if (cancelled.value) return;

    const src = img.getAttribute('src');
    if (!src) continue;

    const path = resolveImagePath(src, { fromPath: documentPath });
    if (!path) continue;

    try {
      const content = await fileSource.readFile(path, { binary: true });
      if (cancelled.value) return;
      if (content.url) img.setAttribute('src', content.url);
    } catch {
      // A missing image is a missing image, not a broken document.
      img.classList.add('mw-image-missing');
      if (!img.getAttribute('alt')) img.setAttribute('alt', `Missing image: ${src}`);
    }
  }
}

/**
 * Gives wide tables their own horizontal scroller.
 *
 * Without this a wide table forces the whole page to scroll sideways, which
 * makes the prose unreadable rather than just the table.
 */
function wrapTables(root: HTMLElement): void {
  for (const table of Array.from(root.querySelectorAll('table'))) {
    if (table.parentElement?.classList.contains('mw-table-scroll')) continue;
    const wrapper = root.ownerDocument.createElement('div');
    wrapper.className = 'mw-table-scroll';
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
    trackScrollability(wrapper);
  }
}

/**
 * The same for code blocks that nothing else has made reachable.
 *
 * Shiki puts `tabindex="0"` on the `<pre>` it emits, so a highlighted block
 * is already fine. A block in a language it does not know keeps the original
 * `<pre>`, and so does every block when highlighting is switched off in
 * settings -- and a long line in one of those was cut off with no way to
 * reach the rest.
 */
function trackCodeScrollability(root: HTMLElement): void {
  for (const pre of Array.from(root.querySelectorAll('pre'))) {
    if (pre.hasAttribute('tabindex')) continue;
    trackScrollability(pre);
  }
}

/**
 * Makes a scrolling region reachable by keyboard, but only while it scrolls.
 *
 * A region that scrolls and cannot be focused cannot be scrolled without a
 * pointer, which axe reports as a serious WCAG 2.1.1 violation and which is
 * exactly true: the rest of a wide table, or of a long line of code, was
 * simply unreachable for a keyboard user.
 *
 * Conditional on purpose. Making every table and every code block a tab stop
 * would add one apiece, most of which fit and have nothing to scroll.
 * Whether it overflows depends on the window, so it is re-measured when the
 * window changes rather than decided once.
 */
function trackScrollability(wrapper: HTMLElement): void {
  const view = wrapper.ownerDocument.defaultView;

  const update = () => {
    const scrolls = wrapper.scrollWidth > wrapper.clientWidth + 1;
    if (scrolls) wrapper.setAttribute('tabindex', '0');
    else wrapper.removeAttribute('tabindex');
  };

  update();
  if (!view?.ResizeObserver) return;
  const observer = new view.ResizeObserver(update);
  observer.observe(wrapper);
}
