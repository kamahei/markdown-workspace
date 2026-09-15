import createDOMPurify from 'dompurify';

/**
 * The single sanitization boundary (FR-2, NFR-3).
 *
 * Everything rendered passes through here. There is no trusted path: a local
 * file the user opened is not evidence of safety, because they may have
 * downloaded it five minutes ago.
 *
 * The window arrives as a parameter rather than being read from a global, so
 * this module stays testable under jsdom and inside any extension surface.
 */

/** Attributes the renderer uses to correlate placeholders with descriptors. */
const ENRICHMENT_ATTRS = [
  'data-mw-enrich',
  'data-mw-id',
  'data-mw-lang',
  'data-mw-state',
  'data-mw-anchor',
];

/** Attributes KaTeX, Mermaid and task lists emit that must survive. */
const RENDERER_ATTRS = [
  'aria-hidden',
  'aria-label',
  'role',
  'style',
  'class',
  'id',
  'checked',
  'disabled',
  'type',
  'colspan',
  'rowspan',
  'align',
  'start',
  'reversed',
  'datetime',
  'title',
  'lang',
  'dir',
];

const SVG_ATTRS = [
  'viewBox',
  'preserveAspectRatio',
  'xmlns',
  'width',
  'height',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'points',
  'transform',
  'text-anchor',
  'dominant-baseline',
  'font-family',
  'font-size',
  'font-weight',
  'marker-end',
  'marker-start',
  'offset',
  'stop-color',
  'stop-opacity',
  'opacity',
  'fill-opacity',
];

export interface Sanitizer {
  /** Returns HTML safe to insert. */
  sanitize(html: string): string;

  /**
   * Sanitizes diagram SVG, which needs its own `<style>` element.
   *
   * Mermaid ships the diagram's styling inside the SVG rather than as
   * classes, so stripping `<style>` leaves correctly shaped but entirely
   * black diagrams. This is a *scoped* relaxation: the document sanitizer
   * still forbids `<style>` outright.
   *
   * What makes it acceptable here: DOMPurify filters the CSS itself,
   * removing `@import`, `expression()` and script URLs; the extension's
   * Manifest V3 policy blocks remote loads, so CSS cannot reach the network;
   * and the input is output from a bundled renderer rather than from the
   * document.
   */
  sanitizeDiagram(svg: string): string;
}

export interface SanitizerOptions {
  /** Permit SVG and MathML. Needed once diagrams and math render. */
  allowGraphics?: boolean;
}

type PurifyWindow = Parameters<typeof createDOMPurify>[0];

export function createSanitizer(
  win: PurifyWindow,
  options: SanitizerOptions = {},
): Sanitizer {
  const purify = createDOMPurify(win);
  const allowGraphics = options.allowGraphics ?? true;

  /**
   * Force every external link to open safely.
   *
   * `noopener` matters beyond tidiness: without it a link target can reach
   * back through `window.opener` and navigate the page it came from.
   */
  purify.addHook('afterSanitizeAttributes', (node) => {
    // `instanceof` is unreliable here: DOMPurify builds nodes in its own
    // document, which may not share a realm with this module.
    const el = node as unknown as Element;
    if (typeof el?.tagName !== 'string' || typeof el.getAttribute !== 'function') return;

    if (el.tagName === 'A' && el.hasAttribute('href')) {
      const href = el.getAttribute('href') ?? '';
      // In-document fragments and workspace-relative links stay in place.
      if (!href.startsWith('#')) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }
  });

  const config = {
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|file|blob|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    ADD_ATTR: [
      ...ENRICHMENT_ATTRS,
      ...RENDERER_ATTRS,
      ...(allowGraphics ? SVG_ATTRS : []),
    ],
    USE_PROFILES: allowGraphics
      ? { html: true, svg: true, svgFilters: true, mathMl: true }
      : { html: true },
    // Keep the document's own content; drop only what can execute.
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'base',
      'form',
    ] as string[],
    FORBID_ATTR: ['srcdoc', 'formaction', 'ping'],
  };

  const diagramConfig = {
    ...config,
    ADD_TAGS: ['style'],
    FORBID_TAGS: config.FORBID_TAGS.filter((tag) => tag !== 'style'),
  };

  return {
    sanitize(html: string): string {
      return purify.sanitize(html, config) as unknown as string;
    },

    sanitizeDiagram(svg: string): string {
      return purify.sanitize(svg, diagramConfig) as unknown as string;
    },
  };
}
