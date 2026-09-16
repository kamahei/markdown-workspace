/**
 * Keyboard shortcuts (NFR-7).
 *
 * Pure: an event-shaped object in, an action out. The binding to a real
 * document lives in `src/ui/hooks/useKeyboardShortcuts.ts`, which keeps the
 * conflict rules and the typing guard testable without a browser.
 *
 * **What Chrome owns, and what that cost us.** The first set of shortcuts
 * was chosen from the spec without checking against Chrome's own bindings:
 *
 * - `Ctrl+P` opens the print dialog. A page can technically cancel it, but
 *   stealing print from a document a user is reading is hostile.
 * - `Ctrl+W` closes the tab and is **reserved** — Chrome does not deliver it
 *   to the page at all, so no amount of code could have made it work.
 * - `Ctrl+1`..`9` switch tabs and are likewise reserved.
 *
 * `Ctrl+B` and `Ctrl+\` are genuinely free in Chrome and are kept. The rest
 * moved to keys Chrome does not claim: a bare `/` to search, which is the
 * convention readers already know, and `Alt+W` to close a document tab.
 */

export type ShortcutAction =
  'toggleSidebar' | 'toggleRaw' | 'focusFilter' | 'closeTab' | 'escape';

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** Tag name of the event target, uppercased, when there is one. */
  targetTagName?: string;
  /** Whether the event target is editable, e.g. a contenteditable region. */
  targetIsEditable?: boolean;
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Whether the user is typing into something.
 *
 * A bare `/` must reach the filter from the document, and must insert a
 * slash when they are already typing in the filter.
 */
export function isTypingTarget(event: KeyEventLike): boolean {
  if (event.targetIsEditable) return true;
  return event.targetTagName !== undefined && TYPING_TAGS.has(event.targetTagName);
}

/** The primary modifier: Ctrl on Windows and Linux, Command on macOS. */
function hasPrimaryModifier(event: KeyEventLike): boolean {
  return event.ctrlKey || event.metaKey;
}

/**
 * Maps a key event to an action, or null when it is not ours.
 *
 * Returning null means "leave it to the browser", which is the default for
 * everything not listed.
 */
export function matchShortcut(event: KeyEventLike): ShortcutAction | null {
  const typing = isTypingTarget(event);

  // Escape works while typing: it is how the filter is cleared.
  if (event.key === 'Escape' && !hasPrimaryModifier(event) && !event.altKey) {
    return 'escape';
  }

  if (typing) return null;

  if (hasPrimaryModifier(event) && !event.altKey && !event.shiftKey) {
    // Chrome leaves both of these alone.
    if (event.key === 'b' || event.key === 'B') return 'toggleSidebar';
    if (event.key === '\\') return 'toggleRaw';
    return null;
  }

  // Alt+W rather than Ctrl+W: Chrome reserves Ctrl+W for closing the tab and
  // never delivers it to the page.
  if (
    event.altKey &&
    !hasPrimaryModifier(event) &&
    (event.key === 'w' || event.key === 'W')
  ) {
    return 'closeTab';
  }

  // A bare slash focuses the filter, the convention readers already know.
  // Never with a modifier, so Ctrl+/ and the like stay with the browser.
  if (event.key === '/' && !hasPrimaryModifier(event) && !event.altKey) {
    return 'focusFilter';
  }

  return null;
}

export interface ShortcutDescription {
  /** Display form, already platform-appropriate. */
  keys: string;
  description: string;
}

/**
 * The shortcuts, for the options page and the documentation.
 *
 * Kept beside `matchShortcut` on purpose: a documented shortcut that is not
 * implemented is worse than none, and this project shipped exactly that once
 * already.
 */
export function shortcutList(platform: 'mac' | 'other' = 'other'): ShortcutDescription[] {
  const mod = platform === 'mac' ? 'Cmd' : 'Ctrl';
  return [
    { keys: `${mod}+B`, description: 'Toggle the sidebar' },
    { keys: `${mod}+\\`, description: 'Toggle raw / rendered' },
    { keys: '/', description: 'Focus the file filter' },
    { keys: 'Alt+W', description: 'Close the active tab (workspace)' },
    { keys: 'Esc', description: 'Clear the filter' },
    { keys: '↑ ↓', description: 'Move through the file tree' },
    { keys: '→', description: 'Open a folder, or step into it' },
    { keys: '←', description: 'Close a folder, or go to the one above' },
    { keys: 'Enter', description: 'Open the selected file' },
    { keys: 'Home / End', description: 'Jump to the first or last file' },
  ];
}
