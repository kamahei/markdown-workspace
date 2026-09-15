import mermaid from 'mermaid';

/**
 * Lazily loaded diagram renderer (FR-7).
 *
 * Mermaid is the largest dependency in the project by a wide margin, which is
 * the whole reason for the lazy-chunk machinery: a document with no diagrams
 * must never pay for it.
 *
 * Mermaid needs a DOM, so unlike highlighting and math this cannot run in the
 * service worker. It runs in the page that asked for it.
 */

let initialized: 'light' | 'dark' | null = null;

function ensureInitialized(theme: 'light' | 'dark'): void {
  if (initialized === theme) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === 'dark' ? 'dark' : 'default',
    securityLevel: 'strict',
    fontFamily: 'inherit',
    // Deterministic ids keep re-renders from accumulating stray elements.
    deterministicIds: true,
  });
  initialized = theme;
}

export interface DiagramRequest {
  id: string;
  source: string;
  theme: 'light' | 'dark';
}

export interface DiagramResult {
  svg: string | null;
  error: string | null;
}

export async function renderDiagram(request: DiagramRequest): Promise<DiagramResult> {
  ensureInitialized(request.theme);

  try {
    // parse() reports a syntax error without leaving partial output behind.
    await mermaid.parse(request.source);
    const { svg } = await mermaid.render(`mw-diagram-${request.id}`, request.source);
    return { svg, error: null };
  } catch (err) {
    // The caller falls back to showing the source, so the content survives.
    return {
      svg: null,
      error: err instanceof Error ? err.message : 'Could not render this diagram',
    };
  }
}
