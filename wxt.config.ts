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
    permissions: ['storage', 'contextMenus', 'declarativeNetRequest', 'scripting'],

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
      },
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
