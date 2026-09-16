import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * There is no official WXT module for Preact (only React, Vue, Svelte and
 * Solid), so Preact is wired in through its own Vite preset instead.
 */
export default defineConfig({
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  outDir: '.output',

  alias: {
    '@core': resolve('./src/core'),
    '@ui': resolve('./src/ui'),
  },

  manifest: {
    name: 'Markdown Workspace',
    short_name: 'Markdown Workspace',
    description:
      'Read Markdown files and whole folders in Chrome, with a built-in file browser. Everything stays on your device.',

    // Kept minimal on purpose. Remote origins are requested at runtime as
    // optional permissions; see .project/architecture.md "Permission Model".
    //
    // `declarativeNetRequest` was here to rewrite `Content-Type: text/markdown`
    // to `text/plain`, on the belief that browsers download a Markdown type
    // rather than displaying it. Measured on Chrome 153, Edge 153 and both
    // Chromium builds Playwright ships, they display it, so the rule never had
    // anything to do. Removed rather than kept as insurance: a permission
    // nobody can justify is one a reviewer has to take on trust (Q14).
    permissions: ['storage', 'contextMenus', 'scripting'],

    host_permissions: ['file:///*'],

    // Not granted at install. Requested per origin via chrome.permissions when
    // the user explicitly adds one in the options page.
    optional_host_permissions: ['http://*/*', 'https://*/*'],

    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },

    action: {
      default_title: 'Markdown Workspace',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
      default_popup: 'popup.html',
    },

    options_ui: {
      open_in_tab: true,
    },

    // Chunks a content script imports by URL must be declared here, or
    // Chrome blocks the request with no visible error.
    web_accessible_resources: [
      {
        resources: ['lazy/*'],
        matches: ['file:///*', 'http://*/*', 'https://*/*'],
        // use_dynamic_url would stop an arbitrary page probing for these
        // files to detect the extension, but it was tried and it breaks the
        // lazy imports: a content script's runtime.getURL() returns the
        // static URL, which the dynamic mapping then rejects. Rendering
        // silently loses highlighting, math and diagrams, which is a far
        // worse trade than the fingerprinting it prevents.
      },
    ],
  },

  /*
   * The sources archive WXT builds for Firefox review takes the working
   * directory, not `git ls-files` -- so it swept up `AGENTS.md`, which is
   * gitignored precisely so it never reaches GitHub, and attached it to a
   * release. Caught while the release was still a draft.
   *
   * `.project/` happened not to be included, but it is named here anyway: a
   * rule that holds by accident is not a rule.
   */
  zip: {
    excludeSources: [
      'AGENTS.md',
      '.project/**',
      // Generated store images. Not secret, just not source.
      'store-assets/**',
      'test-results/**',
      'playwright-report/**',
      'coverage/**',
    ],
  },

  vite: () => ({
    plugins: [preact()],
    build: {
      target: 'chrome120',
      // Readable stack traces in review builds without shipping sources.
      sourcemap: false,
    },
  }),
});
