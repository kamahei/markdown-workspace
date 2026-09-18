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

/**
 * How much of the reading pane a line of body text uses, as a percentage.
 *
 * A number rather than three named sizes, because there is no correct
 * answer: how much of a window text should fill depends on the monitor, the
 * script being read, and taste. Three buckets meant every reader was handed
 * somebody else's compromise, and the one that shipped first was a fixed
 * width that ignored the window entirely.
 *
 * No upper bound beyond 100: the percentage *is* the control, and a hidden
 * cap that quietly stopped the slider from doing anything is the behaviour
 * this replaced.
 */
export const CONTENT_WIDTH_MIN = 40;
export const CONTENT_WIDTH_MAX = 100;
export const CONTENT_WIDTH_DEFAULT = 82;
/** Slider granularity. Finer than this is a distinction nobody can see. */
export const CONTENT_WIDTH_STEP = 2;

/** What the three old named sizes measured, for migrating stored settings. */
export const LEGACY_CONTENT_WIDTHS: Record<string, number> = {
  narrow: 56,
  normal: 82,
  wide: 92,
};

export function clampContentWidth(value: unknown): number {
  if (typeof value === 'string' && value in LEGACY_CONTENT_WIDTHS) {
    return LEGACY_CONTENT_WIDTHS[value]!;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return CONTENT_WIDTH_DEFAULT;
  }
  return Math.min(Math.max(Math.round(value), CONTENT_WIDTH_MIN), CONTENT_WIDTH_MAX);
}
