import type { Sanitizer } from '../sanitize';
import { createRenderer } from './pipeline';
import { splitFrontMatter } from './frontmatter';
import type { RenderOptions, RenderResult } from './types';

export * from './types';
export { createRenderer } from './pipeline';
export { splitFrontMatter } from './frontmatter';
export { slugify, SlugRegistry } from './slug';
export {
  ALERT_KINDS,
  DEFAULT_ALERT_LABELS,
  type AlertKind,
  type AlertLabels,
} from './alert-plugin';
export { applyHeadingAnchors, scrollToFragment } from './anchors';
export {
  buildOutline,
  flattenOutline,
  headingForLine,
  type OutlineNode,
} from './outline';

/**
 * Phase one of the render contract: source in, sanitized HTML plus phase-two
 * descriptors out (.project/decision-log.md D4).
 *
 * Front matter is split before parsing so it never reaches markdown-it as body
 * text. Sanitization happens here rather than at the call site so there is no
 * path that produces HTML without passing through it.
 */
export function renderMarkdown(
  source: string,
  sanitizer: Sanitizer,
  options: RenderOptions = {},
): RenderResult {
  const { frontMatter, body } = splitFrontMatter(source);
  const renderer = createRenderer(options);
  const { html, enrichments, headings } = renderer.render(body);

  return {
    html: sanitizer.sanitize(html),
    enrichments,
    headings,
    frontMatter,
  };
}

/** Recognized Markdown file extensions (FR-9). */
export const MARKDOWN_EXTENSIONS = [
  '.md',
  '.markdown',
  '.mdown',
  '.mkd',
  '.mkdn',
  '.mdx',
] as const;

/** True when the path looks like a Markdown document. */
export function isMarkdownPath(path: string): boolean {
  const withoutQuery = path.split(/[?#]/)[0] ?? '';
  const lower = withoutQuery.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
