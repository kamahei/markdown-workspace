import { classifyUrl, extractPlainTextSource } from '@core/reader/classify';

/**
 * Reader mode (FR-9, FR-16).
 *
 * Classification runs first and imports nothing heavy. A page the extension
 * does not handle must cost essentially nothing, so the renderer, Preact and
 * the stylesheets are all behind the dynamic import below.
 */
export default defineContentScript({
  matches: ['file:///*'],
  runAt: 'document_end',
  // The stylesheet ships with the takeover code, not with every page load.
  cssInjectionMode: 'manifest',

  async main() {
    const page = classifyUrl(location.href);
    if (page.kind === 'unhandled') return;

    if (page.kind === 'markdown') {
      const source = extractPlainTextSource(document);
      // A Markdown extension on something Chrome did not render as plain text
      // is not ours to touch.
      if (source === null) return;

      // Hide the original body before anything async, so the raw source never
      // flashes while the renderer loads.
      const hide = hideDocument();
      try {
        const { mountReader } = await import('../src/ui/mount-reader');
        await mountReader({ page, source });
      } catch (err) {
        // Restoring the plain-text view is a better failure than a blank page:
        // the user can still read the document.
        hide.restore();
        console.error('[Markdown Workspace] Failed to render document', err);
      }
      return;
    }

    if (page.kind === 'directory') {
      const hide = hideDocument();
      try {
        const { mountDirectory } = await import('../src/ui/mount-reader');
        await mountDirectory({ page });
      } catch (err) {
        // Chrome's own listing is a usable page; falling back to it beats a
        // blank one.
        hide.restore();
        console.error('[Markdown Workspace] Failed to render folder', err);
      }
    }
  },
});

/**
 * Hides the page immediately and returns a way back.
 *
 * A style element is used rather than clearing the body so the original
 * content is still there if the render fails.
 */
function hideDocument(): { restore: () => void } {
  // Tag the elements that exist *now* and hide only those.
  //
  // The obvious rule -- `body > *:not(#mw-app)` -- also hides anything added
  // later, and Mermaid measures text by appending a container to the body.
  // Hiding it gives the container no layout, and Mermaid fails with
  // "svg element not in render tree" or "could not find a suitable point for
  // the given distance". Every diagram in a taken-over page broke that way.
  const originals = Array.from(document.body?.children ?? []);
  for (const el of originals) el.setAttribute('data-mw-original', '');

  const style = document.createElement('style');
  style.id = 'mw-takeover-hide';
  style.textContent = 'body > [data-mw-original] { display: none !important; }';
  document.documentElement.appendChild(style);

  return {
    restore: () => {
      style.remove();
      for (const el of originals) el.removeAttribute('data-mw-original');
    },
  };
}
