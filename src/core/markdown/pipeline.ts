import MarkdownIt from 'markdown-it';
import anchorPlugin from 'markdown-it-anchor';
import footnotePlugin from 'markdown-it-footnote';
import deflistPlugin from 'markdown-it-deflist';
import taskListsPlugin from 'markdown-it-task-lists';
import type { Token } from 'markdown-it';

import { mathPlugin } from './math-plugin';
import { cjkPlugin } from './cjk';
import { SlugRegistry } from './slug';
import { splitFrontMatter } from './frontmatter';
import {
  ANCHOR_ATTR,
  DEFAULT_RENDER_OPTIONS,
  ENRICH_ATTR,
  ENRICH_ID_ATTR,
  type Enrichment,
  type Heading,
  type RenderOptions,
} from './types';

/** Language fences routed to the diagram renderer rather than the highlighter. */
const DIAGRAM_LANGUAGES = new Set(['mermaid']);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Collects the plain text of an inline token tree, dropping markup. */
function inlineText(token: Token | undefined): string {
  if (!token?.children) return token?.content ?? '';
  let out = '';
  for (const child of token.children) {
    if (child.type === 'text' || child.type === 'code_inline') out += child.content;
    else if (child.type === 'math_inline') out += child.content;
    else if (child.children) out += inlineText(child);
  }
  return out.trim();
}

/**
 * Per-render mutable state.
 *
 * markdown-it renderer rules are registered once but must write into the
 * current render's collections, so the instance holds a pointer that
 * `render` swaps before each run.
 */
interface RenderContext {
  enrichments: Enrichment[];
  headings: Heading[];
  counter: number;
}

export interface MarkdownRenderer {
  /** Phase one: HTML plus the descriptors phase two needs. Not yet sanitized. */
  render(source: string): {
    html: string;
    enrichments: Enrichment[];
    headings: Heading[];
  };
}

export function createRenderer(options: RenderOptions = {}): MarkdownRenderer {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };

  let ctx: RenderContext = { enrichments: [], headings: [], counter: 0 };
  const nextId = (prefix: string) => `${prefix}${ctx.counter++}`;

  const md = new MarkdownIt(opts.preset === 'commonmark' ? 'commonmark' : 'default', {
    html: true, // Raw HTML is allowed through here and removed by the sanitizer.
    linkify: opts.linkify,
    typographer: opts.typographer,
    breaks: opts.breaks,
    // Highlighting happens in phase two, so no highlight function here.
  });

  if (opts.preset === 'commonmark') {
    // The commonmark preset disables these; the GFM set is opt-in above.
    md.enable(['table', 'strikethrough']);
    md.disable(['table', 'strikethrough']);
  }

  const slugs = new SlugRegistry();

  md.use(anchorPlugin, {
    level: [1, 2, 3, 4, 5, 6],
    slugify: (text: string) => slugs.unique(text),
  });
  md.use(footnotePlugin);
  md.use(deflistPlugin);
  md.use(taskListsPlugin, { label: true, labelAfter: true });

  if (opts.math) md.use(mathPlugin);

  // Always on: a wrapped Japanese sentence must not gain a space in the
  // middle of it. Latin text is unaffected.
  md.use(cjkPlugin);

  // --- Fences become code or diagram placeholders -------------------------

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]!;
    const info = token.info.trim();
    const language = info.split(/\s+/)[0]?.toLowerCase() || null;
    const source = token.content;

    if (opts.diagrams && language && DIAGRAM_LANGUAGES.has(language)) {
      const id = nextId('d');
      ctx.enrichments.push({ kind: 'diagram', id, source });
      // The source stays in the DOM so a failed render can fall back to it,
      // and so the document still means something without phase two.
      return (
        `<div class="mw-diagram" ${ENRICH_ATTR}="diagram" ${ENRICH_ID_ATTR}="${id}">` +
        `<pre class="mw-diagram-source"><code>${escapeHtml(source)}</code></pre>` +
        `</div>\n`
      );
    }

    const id = nextId('c');
    ctx.enrichments.push({ kind: 'code', id, source, language });
    const langAttr = language ? ` data-mw-lang="${escapeHtml(language)}"` : '';
    const langClass = language ? ` language-${escapeHtml(language)}` : '';
    return (
      `<pre class="mw-code${langClass}" ${ENRICH_ATTR}="code" ${ENRICH_ID_ATTR}="${id}"${langAttr}>` +
      `<code>${escapeHtml(source)}</code></pre>\n`
    );
  };

  // --- Math placeholders --------------------------------------------------

  md.renderer.rules.math_inline = (tokens, idx) => {
    const source = tokens[idx]!.content;
    const id = nextId('m');
    ctx.enrichments.push({ kind: 'math', id, source, display: false });
    return (
      `<span class="mw-math mw-math-inline" ${ENRICH_ATTR}="math" ${ENRICH_ID_ATTR}="${id}">` +
      `${escapeHtml(source)}</span>`
    );
  };

  md.renderer.rules.math_block = (tokens, idx) => {
    const source = tokens[idx]!.content;
    const id = nextId('m');
    ctx.enrichments.push({ kind: 'math', id, source, display: true });
    return (
      `<div class="mw-math mw-math-block" ${ENRICH_ATTR}="math" ${ENRICH_ID_ATTR}="${id}">` +
      `${escapeHtml(source)}</div>\n`
    );
  };

  // --- Headings feed the table of contents --------------------------------

  const defaultHeadingOpen =
    md.renderer.rules.heading_open ??
    ((tokens, idx, o, _env, self) => self.renderToken(tokens, idx, o));

  md.renderer.rules.heading_open = (tokens, idx, o, env, self) => {
    const token = tokens[idx]!;
    const idAttr = token.attrGet('id');
    const id = idAttr == null ? null : String(idAttr);
    if (id) {
      ctx.headings.push({
        id,
        level: Number(token.tag.slice(1)),
        text: inlineText(tokens[idx + 1]),
        // markdown-it maps a block token to [startLine, endLine), 0-based
        // and relative to what it was given -- which is the body, because
        // front matter is split off before parsing. Search counts the body
        // the same way, so the two line up.
        line: (token.map?.[0] ?? 0) + 1,
      });
      // The sanitizer's DOM-clobbering protection silently drops an `id` whose
      // value collides with a document property -- `id="title"` is removed,
      // `id="intro"` is not. That would break heading anchors unpredictably,
      // so the slug also travels as a data attribute and the real `id` is
      // reapplied after sanitization by applyHeadingAnchors().
      token.attrSet(ANCHOR_ATTR, id);
    }
    return defaultHeadingOpen(tokens, idx, o, env, self);
  };

  return {
    render(source: string) {
      ctx = { enrichments: [], headings: [], counter: 0 };
      slugs.reset();
      const html = md.render(source);
      return { html, enrichments: ctx.enrichments, headings: ctx.headings };
    },
  };
}

export { splitFrontMatter };
