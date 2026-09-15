import type {
  DiagramRenderer,
  EnrichmentLoaders,
  Highlighter,
  MathRenderer,
} from '@core/enrich';

/**
 * Loads the enrichment libraries by URL (open question Q11, verified in a
 * real content script before this was built).
 *
 * A Manifest V3 content script is a classic script, so a dynamic import()
 * written inside it is inlined by the bundler rather than split out. These
 * modules are therefore built separately into `public/lazy/` by
 * `scripts/build-lazy.mjs` and fetched here at runtime, which keeps roughly
 * 4 MB of Shiki, KaTeX and Mermaid out of every document load.
 *
 * The URLs are declared in `web_accessible_resources`; without that Chrome
 * blocks the import with no visible error.
 */

/** `@vite-ignore` keeps the bundler from trying to resolve these at build time. */
async function importLazy<T>(name: string): Promise<T> {
  // WXT types getURL against known entrypoints; these are generated assets it
  // cannot know about, so the path is asserted here rather than widened.
  const getUrl = browser.runtime.getURL as unknown as (path: string) => string;
  const url = getUrl(`/lazy/${name}.js`);
  return (await import(/* @vite-ignore */ url)) as T;
}

let highlighterPromise: Promise<Highlighter> | null = null;
let mathPromise: Promise<MathRenderer> | null = null;
let diagramPromise: Promise<DiagramRenderer> | null = null;

/**
 * Each module is loaded at most once per page.
 *
 * A failed load is *not* cached: a transient failure should not disable
 * highlighting for the life of the page.
 */
function once<T>(
  current: Promise<T> | null,
  set: (p: Promise<T> | null) => void,
  factory: () => Promise<T>,
): Promise<T> {
  if (current) return current;
  const promise = factory().catch((err) => {
    set(null);
    throw err;
  });
  set(promise);
  return promise;
}

export const enrichmentLoaders: EnrichmentLoaders = {
  highlight: () =>
    once(
      highlighterPromise,
      (p) => (highlighterPromise = p),
      async () => {
        const mod = await importLazy<{
          highlight: Highlighter['highlight'];
        }>('highlight');
        return { highlight: mod.highlight };
      },
    ),

  math: () =>
    once(
      mathPromise,
      (p) => (mathPromise = p),
      async () => {
        const mod = await importLazy<{
          renderMath: MathRenderer['render'];
          stylesheet(): Promise<string>;
        }>('math');
        await injectStylesheet('mw-katex-styles', mod.stylesheet);
        return { render: mod.renderMath };
      },
    ),

  diagram: () =>
    once(
      diagramPromise,
      (p) => (diagramPromise = p),
      async () => {
        const mod = await importLazy<{
          renderDiagram: DiagramRenderer['render'];
        }>('diagram');
        return { render: mod.renderDiagram };
      },
    ),
};

/** Injects a stylesheet once per document, for output that needs its own CSS. */
async function injectStylesheet(id: string, load: () => Promise<string>): Promise<void> {
  if (document.getElementById(id)) return;
  try {
    const css = await load();
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  } catch {
    // Math still renders as MathML without the stylesheet; it is just plainer.
  }
}
