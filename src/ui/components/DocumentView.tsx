import { useEffect, useRef } from 'preact/hooks';
import { applyHeadingAnchors, scrollToFragment, type RenderResult } from '@core/markdown';

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
        <strong>Front matter could not be parsed:</strong> {frontMatter.error}
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
  /** Called with the mounted article so phase two can enrich it. */
  onMounted?: (root: HTMLElement) => void;
}

export function DocumentView({
  result,
  source,
  raw,
  fragment,
  onMounted,
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

    if (fragment) {
      // After paint, so the target has its final position.
      requestAnimationFrame(() => scrollToFragment(root, fragment));
    }

    onMounted?.(root);
  }, [result.html, raw, fragment, onMounted]);

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
        // Already sanitized in core; there is no path that reaches here
        // without passing through the sanitizer.
        dangerouslySetInnerHTML={{ __html: result.html }}
      />
    </div>
  );
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
  }
}
