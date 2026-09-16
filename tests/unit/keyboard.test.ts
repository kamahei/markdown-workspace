import { describe, expect, it } from 'vitest';
import {
  isTypingTarget,
  matchShortcut,
  shortcutList,
  type KeyEventLike,
} from '@core/keyboard';

const ev = (partial: Partial<KeyEventLike> & { key: string }): KeyEventLike => ({
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...partial,
});

describe('shortcuts that are ours', () => {
  it('Ctrl+B toggles the sidebar', () => {
    expect(matchShortcut(ev({ key: 'b', ctrlKey: true }))).toBe('toggleSidebar');
    expect(matchShortcut(ev({ key: 'B', ctrlKey: true }))).toBe('toggleSidebar');
  });

  it('Ctrl+backslash toggles raw', () => {
    expect(matchShortcut(ev({ key: '\\', ctrlKey: true }))).toBe('toggleRaw');
  });

  it('a bare slash focuses the filter', () => {
    expect(matchShortcut(ev({ key: '/' }))).toBe('focusFilter');
  });

  it('Alt+W closes the tab', () => {
    expect(matchShortcut(ev({ key: 'w', altKey: true }))).toBe('closeTab');
  });

  it('Escape is recognized', () => {
    expect(matchShortcut(ev({ key: 'Escape' }))).toBe('escape');
  });

  it('accepts Command on macOS', () => {
    expect(matchShortcut(ev({ key: 'b', metaKey: true }))).toBe('toggleSidebar');
  });
});

describe('shortcuts Chrome owns are left alone', () => {
  it('does not take Ctrl+W', () => {
    // Reserved: Chrome never delivers it to the page, so claiming it would
    // be a documented shortcut that cannot work.
    expect(matchShortcut(ev({ key: 'w', ctrlKey: true }))).toBeNull();
  });

  it('does not take Ctrl+P', () => {
    // Printing is Chrome's, and stealing it from a document someone is
    // reading would be hostile even though it is technically possible.
    expect(matchShortcut(ev({ key: 'p', ctrlKey: true }))).toBeNull();
  });

  it.each(['1', '2', '9', 't', 'n', 'j', 'f', 'l', 'r'])(
    'does not take Ctrl+%s',
    (key) => {
      expect(matchShortcut(ev({ key, ctrlKey: true }))).toBeNull();
    },
  );

  it('does not take a modified slash', () => {
    expect(matchShortcut(ev({ key: '/', ctrlKey: true }))).toBeNull();
    expect(matchShortcut(ev({ key: '/', altKey: true }))).toBeNull();
  });

  it('does not take Ctrl+Shift combinations', () => {
    expect(matchShortcut(ev({ key: 'b', ctrlKey: true, shiftKey: true }))).toBeNull();
  });
});

describe('typing must not trigger shortcuts', () => {
  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('ignores a bare slash in %s', (tag) => {
    // Otherwise typing a path into the filter would re-focus the filter on
    // every slash.
    expect(matchShortcut(ev({ key: '/', targetTagName: tag }))).toBeNull();
  });

  it('ignores a contenteditable region', () => {
    expect(matchShortcut(ev({ key: '/', targetIsEditable: true }))).toBeNull();
  });

  it('still honours Escape while typing', () => {
    // Escape is how the filter gets cleared, so it has to work from inside it.
    expect(matchShortcut(ev({ key: 'Escape', targetTagName: 'INPUT' }))).toBe('escape');
  });

  it('ignores Ctrl+B while typing', () => {
    expect(
      matchShortcut(ev({ key: 'b', ctrlKey: true, targetTagName: 'INPUT' })),
    ).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('%s is a typing target', (tag) => {
    expect(isTypingTarget(ev({ key: 'a', targetTagName: tag }))).toBe(true);
  });

  it.each(['DIV', 'ARTICLE', 'BODY', undefined])('%s is not', (tag) => {
    expect(isTypingTarget(ev({ key: 'a', targetTagName: tag }))).toBe(false);
  });
});

describe('the documented list matches what is implemented', () => {
  it('lists no shortcut Chrome reserves', () => {
    const keys = shortcutList().map((s) => s.keys);
    expect(keys).not.toContain('Ctrl+W');
    expect(keys).not.toContain('Ctrl+P');
  });

  it('every modifier shortcut it lists actually resolves', () => {
    // The defect this guards: shortcuts documented in the UI and in the
    // sample docs that were never implemented at all.
    const resolvable: Record<string, ShortcutKey> = {
      'Ctrl+B': { key: 'b', ctrlKey: true },
      'Ctrl+\\': { key: '\\', ctrlKey: true },
      '/': { key: '/' },
      'Alt+W': { key: 'w', altKey: true },
      Esc: { key: 'Escape' },
    };

    for (const { keys } of shortcutList()) {
      const probe = resolvable[keys];
      if (!probe) continue; // Tree navigation is handled by the tree itself.
      expect(matchShortcut(ev(probe)), `${keys} should resolve`).not.toBeNull();
    }
  });

  it('uses Cmd on macOS', () => {
    expect(shortcutList('mac').map((s) => s.keys)).toContain('Cmd+B');
  });
});

type ShortcutKey = Partial<KeyEventLike> & { key: string };
