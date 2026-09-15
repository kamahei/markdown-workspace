/**
 * The two-phase render contract (.project/decision-log.md D4).
 *
 * Phase one produces readable, sanitized HTML synchronously. Phase two walks
 * the returned descriptors and enriches the live DOM in place — highlighting
 * code, typesetting math, drawing diagrams. If phase two never runs, or fails
 * partway, the document is still complete prose.
 */

/** Marks an element that phase two should enrich. */
export const ENRICH_ATTR = 'data-mw-enrich';

/** Correlates a descriptor with its placeholder element. */
export const ENRICH_ID_ATTR = 'data-mw-id';

/**
 * Carries a heading's anchor slug through sanitization.
 *
 * The sanitizer's DOM-clobbering protection drops an `id` whose value collides
 * with a document property, which would break heading anchors for any document
 * with a heading called "Title". The slug rides along as a data attribute and
 * the real `id` is reapplied afterwards by `applyHeadingAnchors`.
 */
export const ANCHOR_ATTR = 'data-mw-anchor';

export type EnrichmentKind = 'code' | 'math' | 'diagram';

export interface CodeEnrichment {
  kind: 'code';
  id: string;
  /** Raw source, unescaped. */
  source: string;
  /** Info string language, lowercased, or null when the fence had none. */
  language: string | null;
}

export interface MathEnrichment {
  kind: 'math';
  id: string;
  source: string;
  display: boolean;
}

export interface DiagramEnrichment {
  kind: 'diagram';
  id: string;
  source: string;
}

export type Enrichment = CodeEnrichment | MathEnrichment | DiagramEnrichment;

/** YAML front matter, parsed. Values are whatever the document declared. */
export interface FrontMatter {
  /** Parsed mapping, or null when the block was absent or not a mapping. */
  data: Record<string, unknown> | null;
  /** The raw block without its delimiters, for display when parsing failed. */
  raw: string | null;
  /** Set when a front matter block was present but could not be parsed. */
  error: string | null;
}

export interface Heading {
  /** Anchor id, matching the rendered element's `id`. */
  id: string;
  /** 1-6. */
  level: number;
  /** Plain text, with inline markup removed. */
  text: string;
}

export interface RenderOptions {
  /** CommonMark only, or CommonMark plus GFM extensions. */
  preset?: 'commonmark' | 'gfm';
  /** Auto-detect bare URLs and turn them into links. */
  linkify?: boolean;
  /** Smart quotes, dashes and ellipses. */
  typographer?: boolean;
  /** Treat a single newline as a line break. */
  breaks?: boolean;
  /** Emit math placeholders. Off means `$` is literal text. */
  math?: boolean;
  /** Emit diagram placeholders for ```mermaid fences. */
  diagrams?: boolean;
}

export interface RenderResult {
  /** Sanitized HTML, ready to insert. */
  html: string;
  /** Placeholders for phase two, in document order. */
  enrichments: Enrichment[];
  /** Heading tree source for the table of contents. */
  headings: Heading[];
  /** Front matter, always present; `data` is null when there was none. */
  frontMatter: FrontMatter;
}

export const DEFAULT_RENDER_OPTIONS: Required<RenderOptions> = {
  preset: 'gfm',
  linkify: true,
  typographer: false,
  breaks: false,
  math: true,
  diagrams: true,
};
