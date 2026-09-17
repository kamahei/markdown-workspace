import { describe, expect, it } from 'vitest';
import {
  buildOutline,
  flattenOutline,
  headingForLine,
  type OutlineNode,
} from '@core/markdown/outline';
import type { Heading } from '@core/markdown';

/**
 * Heading list to table-of-contents tree.
 *
 * The interesting cases are all the ones real documents actually contain:
 * levels are skipped, a document starts at `h2` because its title came from
 * front matter, and occasionally a deeper heading appears before a shallower
 * one. None of those should produce an empty level or lose a heading.
 */

const h = (level: number, text: string, line = 1): Heading => ({
  id: text.toLowerCase().replace(/\s+/g, '-'),
  level,
  text,
  line,
});

/** Compact shape for comparing, so the assertions stay readable. */
const shape = (nodes: OutlineNode[]): unknown =>
  nodes.map((node) => ({ text: node.text, children: shape(node.children) }));

describe('buildOutline', () => {
  it('returns nothing for a document with no headings', () => {
    expect(buildOutline([])).toEqual([]);
  });

  it('keeps same-level headings as siblings', () => {
    expect(shape(buildOutline([h(1, 'One'), h(1, 'Two')]))).toEqual([
      { text: 'One', children: [] },
      { text: 'Two', children: [] },
    ]);
  });

  it('nests a deeper heading under the one above it', () => {
    expect(shape(buildOutline([h(1, 'Top'), h(2, 'Under'), h(1, 'Next')]))).toEqual([
      { text: 'Top', children: [{ text: 'Under', children: [] }] },
      { text: 'Next', children: [] },
    ]);
  });

  it('treats a skipped level as one step down, not as a hole', () => {
    // h1 -> h3 is ordinary in hand-written Markdown. Inserting an empty h2
    // would put a blank row in the table of contents.
    expect(shape(buildOutline([h(1, 'Top'), h(3, 'Deep')]))).toEqual([
      { text: 'Top', children: [{ text: 'Deep', children: [] }] },
    ]);
  });

  it('closes several levels at once on the way back up', () => {
    const outline = buildOutline([
      h(1, 'Top'),
      h(2, 'Middle'),
      h(4, 'Deepest'),
      h(2, 'Sibling'),
    ]);
    expect(shape(outline)).toEqual([
      {
        text: 'Top',
        children: [
          { text: 'Middle', children: [{ text: 'Deepest', children: [] }] },
          { text: 'Sibling', children: [] },
        ],
      },
    ]);
  });

  it('handles a document whose first heading is not the shallowest', () => {
    // Starting at h2 is normal when the title lives in front matter, and a
    // later h1 must not swallow what came before it.
    expect(
      shape(buildOutline([h(2, 'First'), h(1, 'Later'), h(2, 'Its child')])),
    ).toEqual([
      { text: 'First', children: [] },
      { text: 'Later', children: [{ text: 'Its child', children: [] }] },
    ]);
  });

  it('carries the id and level through untouched', () => {
    const [node] = buildOutline([h(3, 'Some Heading')]);
    expect(node).toMatchObject({ id: 'some-heading', level: 3, text: 'Some Heading' });
  });

  it('loses no heading, whatever the shape', () => {
    const headings = [h(2, 'a'), h(4, 'b'), h(1, 'c'), h(6, 'd'), h(3, 'e'), h(3, 'f')];
    expect(flattenOutline(buildOutline(headings)).map((n) => n.text)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
  });
});

describe('flattenOutline', () => {
  it('walks depth first, in document order', () => {
    const outline = buildOutline([h(1, 'A'), h(2, 'B'), h(3, 'C'), h(1, 'D')]);
    expect(flattenOutline(outline).map((n) => n.text)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('headingForLine', () => {
  const doc = [h(1, 'One'), h(2, 'Two'), h(2, 'Three')];
  doc[0]!.line = 1;
  doc[1]!.line = 10;
  doc[2]!.line = 20;

  it('finds the heading a line sits under', () => {
    expect(headingForLine(doc, 12)?.text).toBe('Two');
    expect(headingForLine(doc, 25)?.text).toBe('Three');
  });

  it('counts a line on the heading itself as under it', () => {
    expect(headingForLine(doc, 10)?.text).toBe('Two');
  });

  it('gives nothing for a line above the first heading', () => {
    // Front matter, or an intro paragraph. Staying at the top of the
    // document is right; inventing a target is not.
    const above = [{ ...doc[0]!, line: 5 }];
    expect(headingForLine(above, 2)).toBeNull();
  });

  it('gives nothing for a document with no headings', () => {
    expect(headingForLine([], 3)).toBeNull();
  });
});
