import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/**
 * Lazily loaded syntax highlighter (FR-5).
 *
 * Built as a standalone ES module in `public/lazy/` and imported by URL, so
 * none of Shiki reaches the reader's initial bundle (NFR-2, open question
 * Q11).
 *
 * Uses Shiki's **JavaScript** regex engine rather than the default Oniguruma
 * WASM one. Loading WebAssembly under Manifest V3 requires widening the
 * content security policy with `wasm-unsafe-eval`, which is exactly the kind
 * of permission this project avoids — and the JS engine needs none of it.
 *
 * The language set is curated rather than complete. Bundling every grammar
 * Shiki ships would cost several megabytes for languages almost no document
 * uses; an unlisted language degrades to plain monospace, which is the
 * documented behaviour anyway.
 */

const LANGS = {
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  shell: () => import('shiki/langs/shellscript.mjs'),
} as const;

/** Aliases people actually write in fences. */
const ALIASES: Record<string, keyof typeof LANGS> = {
  js: 'javascript',
  ts: 'typescript',
  mjs: 'javascript',
  cjs: 'javascript',
  sh: 'bash',
  zsh: 'bash',
  shellscript: 'shell',
  console: 'shell',
  py: 'python',
  rb: 'ruby',
  'c++': 'cpp',
  cs: 'csharp',
  yml: 'yaml',
  md: 'markdown',
  htm: 'html',
  patch: 'diff',
};

let highlighter: HighlighterCore | null = null;
const loaded = new Set<string>();

async function getHighlighter(): Promise<HighlighterCore> {
  if (highlighter) return highlighter;

  const [light, dark] = await Promise.all([
    import('shiki/themes/github-light.mjs'),
    import('shiki/themes/github-dark.mjs'),
  ]);

  highlighter = await createHighlighterCore({
    themes: [light.default, dark.default],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

function resolveLanguage(language: string | null): keyof typeof LANGS | null {
  if (!language) return null;
  const key = language.toLowerCase();
  if (key in LANGS) return key as keyof typeof LANGS;
  return ALIASES[key] ?? null;
}

export interface HighlightRequest {
  code: string;
  language: string | null;
  theme: 'light' | 'dark';
}

/**
 * Returns highlighted HTML, or null when the language is unknown.
 *
 * Null means "leave the plain monospace block alone" rather than an error: an
 * unrecognized language is not a failure (FR-5).
 */
export async function highlight(request: HighlightRequest): Promise<string | null> {
  const lang = resolveLanguage(request.language);
  if (!lang) return null;

  const shiki = await getHighlighter();

  if (!loaded.has(lang)) {
    const mod = await LANGS[lang]();
    await shiki.loadLanguage(mod.default);
    loaded.add(lang);
  }

  return shiki.codeToHtml(request.code, {
    lang,
    theme: request.theme === 'dark' ? 'github-dark' : 'github-light',
  });
}

/** Languages this build can highlight, for the options page. */
export function supportedLanguages(): string[] {
  return [...Object.keys(LANGS), ...Object.keys(ALIASES)].sort();
}
