/**
 * Sidebar geometry (FR-30).
 *
 * The bounds live in core because they are a fact about the layout, not
 * about storage: the resizer, the CSS and the persistence layer all have to
 * agree on them, and only one of those three is allowed to touch
 * `chrome.storage`.
 */

/** Below this the tree is unreadable; above it, it stops being a sidebar. */
export const SIDEBAR_MIN = 150;
export const SIDEBAR_MAX = 600;
export const SIDEBAR_DEFAULT = 260;

export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT;
  return Math.min(Math.max(Math.round(value), SIDEBAR_MIN), SIDEBAR_MAX);
}
