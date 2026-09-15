import yaml from 'js-yaml';
import type { FrontMatter } from './types';

const DELIMITER = /^-{3,}\s*$/;

export interface SplitDocument {
  frontMatter: FrontMatter;
  /** The document body with the front matter block removed. */
  body: string;
}

const EMPTY: FrontMatter = { data: null, raw: null, error: null };

/**
 * Splits a leading YAML front matter block off the document (FR-4).
 *
 * Front matter is extracted before parsing so it never reaches markdown-it as
 * body text. A malformed block degrades to being treated as body content
 * rather than throwing — losing the document because its metadata is wrong
 * would be a much worse failure than showing the metadata as text.
 */
export function splitFrontMatter(source: string): SplitDocument {
  // A BOM before the delimiter would otherwise hide it.
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;

  const lines = text.split(/\r?\n/);
  const first = lines[0];

  if (first === undefined || !DELIMITER.test(first)) {
    return { frontMatter: EMPTY, body: text };
  }

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line !== undefined && DELIMITER.test(line)) {
      closingIndex = i;
      break;
    }
  }

  // An unterminated block is not front matter. A document that opens with a
  // horizontal rule is far more likely than one with a truncated header.
  if (closingIndex === -1) {
    return { frontMatter: EMPTY, body: text };
  }

  const raw = lines.slice(1, closingIndex).join('\n');
  const body = lines.slice(closingIndex + 1).join('\n');

  let parsed: unknown;
  try {
    parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    return {
      frontMatter: {
        data: null,
        raw,
        error: err instanceof Error ? err.message : 'Could not parse front matter',
      },
      body,
    };
  }

  // Scalars and sequences are valid YAML but are not document metadata. Treat
  // them as unusable rather than inventing a shape for them.
  if (parsed == null) {
    return { frontMatter: { data: {}, raw, error: null }, body };
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      frontMatter: {
        data: null,
        raw,
        error: 'Front matter must be a mapping of keys to values',
      },
      body,
    };
  }

  return {
    frontMatter: { data: parsed as Record<string, unknown>, raw, error: null },
    body,
  };
}
