import { useCallback, useRef } from 'preact/hooks';
import { t } from '../i18n';

/**
 * The handle that sets the sidebar's width.
 *
 * The CSS for this existed from the first release with no component behind
 * it, and FR-30 promised the width would be remembered, so a sidebar that
 * could not be resized at all was the state of things until now.
 *
 * `role="separator"` with `aria-valuenow` is the ARIA window-splitter
 * pattern: a separator that is focusable is understood as adjustable, and
 * the arrow keys move it. Dragging alone would have left the width
 * unreachable for anyone not using a pointer, which is the whole reason the
 * keyboard half is not optional.
 */

/** One arrow press. Large enough to be worth pressing, small enough to aim. */
const STEP = 16;
/** Shift makes it coarse, for crossing the range without holding a key down. */
const BIG_STEP = 64;

interface SidebarResizerProps {
  width: number;
  min: number;
  max: number;
  /** An absolute width, from the pointer. */
  onResize: (width: number) => void;
  /**
   * A delta, from the keyboard.
   *
   * Separate from `onResize` because arrow keys arrive faster than a
   * re-render: `width + step` read from the prop drops every press that
   * lands in the same frame as the one before it.
   */
  onNudge: (delta: number) => void;
}

export function SidebarResizer({
  width,
  min,
  max,
  onResize,
  onNudge,
}: SidebarResizerProps) {
  const dragging = useRef(false);

  const onPointerDown = useCallback((event: PointerEvent) => {
    const handle = event.currentTarget as HTMLElement;
    // Pointer capture, so a fast drag that leaves the 5px handle keeps
    // resizing instead of stopping wherever the cursor slipped off.
    handle.setPointerCapture(event.pointerId);
    dragging.current = true;
    event.preventDefault();
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragging.current) return;
      const handle = event.currentTarget as HTMLElement;
      const left = handle.ownerDocument.documentElement.getBoundingClientRect().left;
      onResize(event.clientX - left);
    },
    [onResize],
  );

  const stopDrag = useCallback((event: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const step = event.shiftKey ? BIG_STEP : STEP;

      if (event.key === 'ArrowLeft') onNudge(-step);
      else if (event.key === 'ArrowRight') onNudge(step);
      // Home and End are absolute by nature, and clamping makes the
      // out-of-range value land exactly on the bound.
      else if (event.key === 'Home') onResize(min);
      else if (event.key === 'End') onResize(max);
      else return;

      event.preventDefault();
    },
    [min, max, onResize, onNudge],
  );

  return (
    <div
      class="mw-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('resizeSidebar')}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onKeyDown={onKeyDown}
    />
  );
}
