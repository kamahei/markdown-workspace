import {
  ENRICH_ID_ATTR,
  type Enrichment,
  type CodeEnrichment,
  type MathEnrichment,
  type DiagramEnrichment,
} from '../markdown/types';
import type { Sanitizer } from '../sanitize';

/**
 * Phase two of the render contract (.project/decision-log.md D4).
 *
 * Walks the placeholders phase one left behind and enhances them in place.
 * Every subsystem is independent: a broken diagram engine costs one diagram,
 * not the document (NFR-6).
 *
 * The heavy libraries arrive as injected loaders rather than imports, so core
 * stays free of them and this is testable in Node with fakes.
 */

export type Theme = 'light' | 'dark';

export interface Highlighter {
  /** Null means the language is unknown; the plain block is left alone. */
  highlight(request: {
    code: string;
    language: string | null;
    theme: Theme;
  }): Promise<string | null>;
}

export interface MathRenderer {
  render(request: { source: string; display: boolean }): {
    html: string;
    error: string | null;
  };
}

export interface DiagramRenderer {
  render(request: { id: string; source: string; theme: Theme }): Promise<{
    svg: string | null;
    error: string | null;
  }>;
}

export interface EnrichmentLoaders {
  highlight?: () => Promise<Highlighter>;
  math?: () => Promise<MathRenderer>;
  diagram?: () => Promise<DiagramRenderer>;
}

export interface EnrichOptions {
  theme: Theme;
  sanitizer: Sanitizer;
  features: { highlight: boolean; math: boolean; diagrams: boolean };
  /** Aborts work when the document is replaced mid-flight. */
  signal?: { aborted: boolean };
}

export interface EnrichReport {
  highlighted: number;
  math: number;
  diagrams: number;
  failures: number;
}

function find(root: ParentNode, id: string): Element | null {
  return root.querySelector(`[${ENRICH_ID_ATTR}="${id}"]`);
}

function setState(el: Element, state: 'pending' | 'done' | 'error'): void {
  el.setAttribute('data-mw-state', state);
}

function showError(el: Element, message: string): void {
  const doc = el.ownerDocument;
  const note = doc.createElement('div');
  note.className = 'mw-enrich-error';
  note.textContent = message;
  el.insertBefore(note, el.firstChild);
}

/**
 * Enhances a rendered document in place.
 *
 * Never throws: every failure is contained to the element that caused it, and
 * reported in the return value instead.
 */
export async function enrichDocument(
  root: ParentNode,
  enrichments: Enrichment[],
  loaders: EnrichmentLoaders,
  options: EnrichOptions,
): Promise<EnrichReport> {
  const report: EnrichReport = { highlighted: 0, math: 0, diagrams: 0, failures: 0 };
  const aborted = () => options.signal?.aborted === true;

  const code = options.features.highlight
    ? enrichments.filter((e): e is CodeEnrichment => e.kind === 'code')
    : [];
  const math = options.features.math
    ? enrichments.filter((e): e is MathEnrichment => e.kind === 'math')
    : [];
  const diagrams = options.features.diagrams
    ? enrichments.filter((e): e is DiagramEnrichment => e.kind === 'diagram')
    : [];

  // A document with none of a given construct must load none of its library.
  await Promise.all([
    code.length > 0 && loaders.highlight
      ? runHighlighting(root, code, loaders.highlight, options, report, aborted)
      : Promise.resolve(),
    math.length > 0 && loaders.math
      ? runMath(root, math, loaders.math, options, report, aborted)
      : Promise.resolve(),
    diagrams.length > 0 && loaders.diagram
      ? runDiagrams(root, diagrams, loaders.diagram, options, report, aborted)
      : Promise.resolve(),
  ]);

  return report;
}

async function runHighlighting(
  root: ParentNode,
  items: CodeEnrichment[],
  load: () => Promise<Highlighter>,
  options: EnrichOptions,
  report: EnrichReport,
  aborted: () => boolean,
): Promise<void> {
  let highlighter: Highlighter;
  try {
    highlighter = await load();
  } catch {
    // Highlighting is an enhancement; the code is already readable.
    report.failures += 1;
    return;
  }

  for (const item of items) {
    if (aborted()) return;
    const el = find(root, item.id);
    if (!el) continue;

    try {
      const html = await highlighter.highlight({
        code: item.source,
        language: item.language,
        theme: options.theme,
      });
      // Null means an unknown language: leave the plain block, show no error.
      if (!html) continue;

      const clean = options.sanitizer.sanitize(html);
      const holder = el.ownerDocument.createElement('div');
      holder.innerHTML = clean;
      const replacement = holder.firstElementChild;
      if (!replacement) continue;

      for (const attr of ['data-mw-enrich', ENRICH_ID_ATTR, 'data-mw-lang']) {
        const value = el.getAttribute(attr);
        if (value) replacement.setAttribute(attr, value);
      }
      replacement.classList.add('mw-code');
      el.replaceWith(replacement);
      setState(replacement, 'done');
      report.highlighted += 1;
    } catch {
      report.failures += 1;
      setState(el, 'error');
    }
  }
}

async function runMath(
  root: ParentNode,
  items: MathEnrichment[],
  load: () => Promise<MathRenderer>,
  options: EnrichOptions,
  report: EnrichReport,
  aborted: () => boolean,
): Promise<void> {
  let renderer: MathRenderer;
  try {
    renderer = await load();
  } catch {
    report.failures += 1;
    return;
  }

  for (const item of items) {
    if (aborted()) return;
    const el = find(root, item.id);
    if (!el) continue;

    try {
      const { html, error } = renderer.render({
        source: item.source,
        display: item.display,
      });

      if (error || !html) {
        // The original source stays put; discarding the author's content
        // because it has a typo would be the worse failure (FR-6).
        setState(el, 'error');
        el.setAttribute('title', error ?? 'Could not render this expression');
        report.failures += 1;
        continue;
      }

      el.innerHTML = options.sanitizer.sanitize(html);
      setState(el, 'done');
      report.math += 1;
    } catch {
      setState(el, 'error');
      report.failures += 1;
    }
  }
}

async function runDiagrams(
  root: ParentNode,
  items: DiagramEnrichment[],
  load: () => Promise<DiagramRenderer>,
  options: EnrichOptions,
  report: EnrichReport,
  aborted: () => boolean,
): Promise<void> {
  let renderer: DiagramRenderer;
  try {
    renderer = await load();
  } catch {
    report.failures += 1;
    return;
  }

  for (const item of items) {
    if (aborted()) return;
    const el = find(root, item.id);
    if (!el) continue;

    try {
      const { svg, error } = await renderer.render({
        id: item.id,
        source: item.source,
        theme: options.theme,
      });

      if (!svg) {
        // Falls back to the source block already in the DOM, with the reason
        // attached (FR-7).
        setState(el, 'error');
        showError(el, error ?? 'Could not render this diagram');
        report.failures += 1;
        continue;
      }

      const holder = el.ownerDocument.createElement('div');
      // Diagram SVG keeps its embedded <style>; see Sanitizer.sanitizeDiagram.
      holder.innerHTML = options.sanitizer.sanitizeDiagram(svg);
      describeDiagram(holder, item.id, item.source);
      el.insertBefore(holder, el.firstChild);
      setState(el, 'done');
      report.diagrams += 1;
    } catch {
      setState(el, 'error');
      showError(el, 'Could not render this diagram');
      report.failures += 1;
    }
  }
}

/**
 * Gives a diagram one identity instead of a pile of loose labels.
 *
 * Mermaid ships its SVG with `role="graphics-document document"`, which
 * invites a screen reader to walk inside, and every node and edge label is a
 * `<text>` element. A reader then reads all of them in document order --
 * which for a flowchart is not the order of the flow. The sample diagram
 * came out as "A .md file, A folder, Drop a folder on Chrome, What is it?"
 * : the edge labels first, then the nodes. Not merely noisy, actively
 * misleading.
 *
 * So the SVG becomes a single `img`, and the alternative offered is the
 * diagram's own source. That is the honest substitute: for Mermaid the
 * source *is* a description of the graph, and it says which node leads to
 * which, which is exactly what the picture conveys and the labels alone
 * destroy.
 *
 * An author who writes `accTitle:` and `accDescr:` gets what they wrote
 * instead -- Mermaid turns those into `<title>` and `<desc>`, and a real
 * description beats a generated one every time.
 */
function describeDiagram(holder: Element, id: string, source: string): void {
  const svg = holder.querySelector('svg');
  if (!svg) return;

  const authored = svg.querySelector('title, desc');

  // One object, not a document to explore. `aria-roledescription` otherwise
  // announces Mermaid's internal name for the renderer, e.g. "flowchart-v2".
  svg.setAttribute('role', 'img');
  const kind = (svg.getAttribute('aria-roledescription') ?? '').replace(/-v\d+$/, '');
  svg.removeAttribute('aria-roledescription');

  if (authored) {
    // Point at it explicitly: a <title> deep in the SVG is not reliably
    // taken as the accessible name once the role changes.
    const titleEl = svg.querySelector('title');
    if (titleEl) {
      if (!titleEl.id) titleEl.id = `${id}-title`;
      svg.setAttribute('aria-labelledby', titleEl.id);
    }
    const descEl = svg.querySelector('desc');
    if (descEl) {
      if (!descEl.id) descEl.id = `${id}-desc`;
      svg.setAttribute('aria-describedby', descEl.id);
    }
    return;
  }

  svg.setAttribute('aria-label', kind ? `${kind} diagram` : 'Diagram');

  // The source, for a reader to fall back on. Off-screen rather than
  // `hidden`: hidden content is not announced at all, and the point is that
  // it should be available to ask for.
  const description = holder.ownerDocument.createElement('div');
  description.id = `${id}-source`;
  description.className = 'mw-visually-hidden';
  description.textContent = `Diagram source. ${source}`;
  holder.appendChild(description);
  svg.setAttribute('aria-describedby', description.id);
}

/** Marks every placeholder as awaiting enrichment, before phase two starts. */
export function markPending(root: ParentNode, enrichments: Enrichment[]): void {
  for (const item of enrichments) {
    const el = find(root, item.id);
    if (el) setState(el, 'pending');
  }
}
