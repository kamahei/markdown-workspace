import type { Heading } from './types';

/**
 * Turns the flat heading list into the tree a table of contents draws.
 *
 * The renderer already emits `headings` in document order with a level and a
 * stable anchor id (FR-3), so this adds no parsing — only shape.
 *
 * Real documents skip levels: an `h1` followed by an `h3` is common, and a
 * document whose first heading is an `h2` is the norm rather than the
 * exception once a title comes from front matter. So nesting is decided by
 * *relative* depth against the open ancestors, never by the absolute number:
 * a heading goes under the nearest preceding one that is shallower than it,
 * and becomes a root when there is none. That keeps `h1 → h3` a
 * parent-and-child rather than a hole with an empty level in it, and lets a
 * document that starts at `h3` and later has an `h1` put both at the top
 * level in the order they appear.
 */

export interface OutlineNode {
  id: string;
  level: number;
  text: string;
  children: OutlineNode[];
}

export function buildOutline(headings: Heading[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  /** The chain of headings still open above the one being placed. */
  const open: OutlineNode[] = [];

  for (const heading of headings) {
    const node: OutlineNode = {
      id: heading.id,
      level: heading.level,
      text: heading.text,
      children: [],
    };

    // Close everything at or below this heading's level; what remains is its
    // ancestry.
    while (open.length > 0 && open[open.length - 1]!.level >= node.level) {
      open.pop();
    }

    const parent = open[open.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);

    open.push(node);
  }

  return roots;
}

/** Every node, depth first, in document order. */
export function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  const out: OutlineNode[] = [];
  const visit = (list: OutlineNode[]) => {
    for (const node of list) {
      out.push(node);
      visit(node.children);
    }
  };
  visit(nodes);
  return out;
}

/**
 * The heading a given body line falls under.
 *
 * What a folder search needs to land somewhere useful: it knows the line,
 * the document knows its headings, and the nearest heading at or above that
 * line is an anchor that already exists in the rendered page.
 *
 * Null when the line is above the first heading, or there are none — the
 * caller should stay at the top rather than invent a target.
 */
export function headingForLine(headings: Heading[], line: number): Heading | null {
  let best: Heading | null = null;
  for (const heading of headings) {
    if (heading.line > line) break;
    best = heading;
  }
  return best;
}
