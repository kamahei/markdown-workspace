/**
 * Heading anchor slugs (FR-3).
 *
 * Slugs must be stable across renders so that a link copied today still works
 * tomorrow, and must stay usable for non-ASCII headings — stripping everything
 * outside ASCII would collapse a Japanese document's headings into a series of
 * empty strings.
 */

// Control characters are stripped on purpose: they are invisible in a heading
// but would survive into the anchor and break the URL.
// eslint-disable-next-line no-control-regex
const STRIP = /[\x00-\x1F!"#$%&'()*+,./:;<=>?@[\]\\^`{|}~]/g;

/**
 * Converts heading text to an anchor slug.
 *
 * Lowercases, drops punctuation, and collapses whitespace to hyphens. Letters
 * and digits in any script are preserved.
 */
export function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      // Combining marks would produce visually identical but distinct slugs.
      .normalize('NFKC')
      .replace(STRIP, '')
      .replace(/\s+/g, '-')
      // Collapse runs introduced by stripping punctuation between words.
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

/**
 * Tracks slugs within one document and disambiguates repeats.
 *
 * Two headings with the same text produce `intro` and `intro-1`, matching the
 * convention readers already expect from hosted Markdown.
 */
export class SlugRegistry {
  readonly #counts = new Map<string, number>();

  /** Returns a unique slug, falling back to `section-N` for empty input. */
  unique(text: string): string {
    const base = slugify(text) || 'section';
    const seen = this.#counts.get(base) ?? 0;
    this.#counts.set(base, seen + 1);

    if (seen === 0) return base;

    // The suffixed form could itself collide with a literal heading.
    let extra = seen;
    let candidate = `${base}-${extra}`;
    while (this.#counts.has(candidate)) {
      extra += 1;
      candidate = `${base}-${extra}`;
    }
    this.#counts.set(candidate, 1);
    return candidate;
  }

  reset(): void {
    this.#counts.clear();
  }
}
