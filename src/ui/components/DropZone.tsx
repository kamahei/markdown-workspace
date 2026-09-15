import { useCallback, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export type DropState = 'idle' | 'valid' | 'invalid' | 'loading';

interface DropZoneProps {
  children: ComponentChildren;
  /** Returns true when the drop produced a folder. */
  onDrop: (dataTransfer: DataTransfer) => Promise<boolean>;
  /** Whether the drag carries something acceptable. */
  accepts: (dataTransfer: DataTransfer | null) => boolean;
}

/**
 * Whole-surface drop target for folders (FR-16, ui-spec.md).
 *
 * Drag events fire for every child element, so a naive enter/leave pair
 * flickers constantly. A depth counter is what keeps the overlay steady.
 */
export function DropZone({ children, onDrop, accepts }: DropZoneProps) {
  const [state, setState] = useState<DropState>('idle');
  const [label, setLabel] = useState('');
  const depth = useRef(0);

  const onDragEnter = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      depth.current += 1;
      if (state === 'loading') return;
      setState(accepts(event.dataTransfer) ? 'valid' : 'invalid');
    },
    [accepts, state],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    // Without this the browser navigates to the dropped file instead.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setState((s) => (s === 'loading' ? s : 'idle'));
  }, []);

  const handleDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      depth.current = 0;

      const dataTransfer = event.dataTransfer;
      if (!dataTransfer) return setState('idle');

      if (!accepts(dataTransfer)) {
        setState('invalid');
        setTimeout(() => setState('idle'), 1500);
        return;
      }

      setState('loading');
      setLabel('Reading folder…');
      try {
        const ok = await onDrop(dataTransfer);
        setState(ok ? 'idle' : 'invalid');
        if (!ok) setTimeout(() => setState('idle'), 2000);
      } catch {
        setState('invalid');
        setTimeout(() => setState('idle'), 2000);
      }
    },
    [accepts, onDrop],
  );

  return (
    <div
      class="mw-dropzone"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {state !== 'idle' ? (
        <div class={`mw-drop-overlay is-${state}`} role="status" aria-live="polite">
          <div class="mw-drop-message">
            {state === 'valid' ? 'Drop to open this folder' : null}
            {state === 'invalid' ? 'Only folders and Markdown files can be opened' : null}
            {state === 'loading' ? label : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
