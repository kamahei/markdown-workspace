import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * The `src/core/` boundary (see .project/decision-log.md D8) is enforced here
 * rather than by convention. Core stays framework-free and browser-free so it
 * can be unit tested in plain Node, in milliseconds.
 *
 * Core may still *operate on* web platform objects — a Document, a
 * FileSystemDirectoryHandle — as long as they arrive as parameters. What is
 * banned is reaching for them as globals, which is what makes a module
 * untestable outside a browser.
 */
const CORE_BANNED_GLOBALS = [
  { name: 'document', message: 'src/core must receive a Document as a parameter.' },
  { name: 'window', message: 'src/core must receive a Window as a parameter.' },
  {
    name: 'chrome',
    message: 'src/core must not call extension APIs. Inject a transport.',
  },
  {
    name: 'browser',
    message: 'src/core must not call extension APIs. Inject a transport.',
  },
  { name: 'localStorage', message: 'src/core must not touch browser storage directly.' },
  {
    name: 'sessionStorage',
    message: 'src/core must not touch browser storage directly.',
  },
  { name: 'indexedDB', message: 'src/core must not touch browser storage directly.' },
  { name: 'navigator', message: 'src/core must receive platform data as a parameter.' },
];

const CORE_BANNED_IMPORTS = [
  { group: ['preact', 'preact/*'], message: 'src/core must stay framework-free.' },
  {
    group: ['@ui', '@ui/*'],
    message: 'Dependencies point entrypoints -> ui -> core, never back.',
  },
  {
    group: ['wxt', 'wxt/*'],
    message: 'src/core must not depend on the extension framework.',
  },
  { group: ['#imports'], message: 'src/core must not use WXT auto-imports.' },
];

export default tseslint.config(
  {
    ignores: [
      '.output/**',
      '.wxt/**',
      'node_modules/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      '.project/**',
      // Generated minified bundles; rebuilt by scripts/build-lazy.mjs.
      'public/lazy/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        chrome: 'readonly',
        browser: 'readonly',
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        indexedDB: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        structuredClone: 'readonly',
        crypto: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortController: 'readonly',
        performance: 'readonly',
        globalThis: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // The core boundary.
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...CORE_BANNED_GLOBALS],
      'no-restricted-imports': ['error', { patterns: CORE_BANNED_IMPORTS }],
      'no-console': 'error',
    },
  },

  /*
   * UI may use Preact and the DOM, but never extension APIs: components take
   * data and callbacks, which is what keeps them testable without a browser.
   * src/platform/ is the adapter layer where extension APIs are allowed, and
   * the mount-* composition roots wire the two together.
   */
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'chrome',
          message:
            'UI components take data as props. Extension APIs belong in entrypoints/.',
        },
        {
          name: 'browser',
          message:
            'UI components take data as props. Extension APIs belong in entrypoints/.',
        },
      ],
    },
  },

  // Tests and tooling are exempt.
  {
    files: ['tests/**/*.{ts,tsx}', 'scripts/**/*.{ts,mjs}', '*.config.{ts,js,mjs}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-imports': 'off',
      // Playwright fixtures declare their dependencies by destructuring, so a
      // fixture that needs none is written `async ({}, use) => {}`.
      'no-empty-pattern': 'off',
    },
  },
);
