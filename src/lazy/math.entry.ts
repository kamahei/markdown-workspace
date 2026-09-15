import katex from 'katex';

/**
 * Lazily loaded math renderer (FR-6).
 *
 * KaTeX's `renderToString` is pure, so no DOM is needed here. Bundled as a
 * standalone ES module so none of it reaches the reader's initial payload.
 *
 * `throwOnError: false` is deliberate: invalid math renders as the original
 * source with an error marker rather than taking the document down. Losing a
 * paragraph because one expression has a typo would be a much worse failure.
 */

export interface MathRequest {
  source: string;
  display: boolean;
}

export interface MathResult {
  html: string;
  error: string | null;
}

export function renderMath(request: MathRequest): MathResult {
  try {
    const html = katex.renderToString(request.source, {
      displayMode: request.display,
      throwOnError: false,
      errorColor: 'currentColor',
      strict: false,
      trust: false,
      output: 'htmlAndMathml',
    });
    return { html, error: null };
  } catch (err) {
    return {
      html: '',
      error: err instanceof Error ? err.message : 'Could not render this expression',
    };
  }
}

/** The stylesheet KaTeX output needs, as text, for the caller to inject once. */
export async function stylesheet(): Promise<string> {
  const css = await import('katex/dist/katex.min.css?inline');
  return (css as { default: string }).default;
}
