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

describe('the folder search shortcut', () => {
  it('resolves on Ctrl+Shift+F, in either case', () => {
    expect(matchShortcut(ev({ key: 'f', ctrlKey: true, shiftKey: true }))).toBe(
      'focusSearch',
    );
    expect(matchShortcut(ev({ key: 'F', ctrlKey: true, shiftKey: true }))).toBe(
      'focusSearch',
    );
  });

  it('leaves Ctrl+F to Chrome, which owns find-in-page', () => {
    expect(matchShortcut(ev({ key: 'f', ctrlKey: true }))).toBeNull();
  });

  it('is not claimed with Alt held as well', () => {
    expect(
      matchShortcut(ev({ key: 'f', ctrlKey: true, shiftKey: true, altKey: true })),
    ).toBeNull();
  });

  it('does not fire while the reader is typing', () => {
    expect(
      matchShortcut(
        ev({ key: 'f', ctrlKey: true, shiftKey: true, targetTagName: 'INPUT' }),
      ),
    ).toBeNull();
  });

  it('claims no other letter with the same modifiers', () => {
    // Ctrl+Shift+O is Chrome's bookmark manager and Ctrl+Shift+T reopens a
    // closed tab; returning an action for either would mean fighting the
    // browser for a key it wins.
    for (const key of ['o', 't', 'b', 'n', 'j']) {
      expect(matchShortcut(ev({ key, ctrlKey: true, shiftKey: true })), key).toBeNull();
    }
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
      'Ctrl+Shift+F': { key: 'F', ctrlKey: true, shiftKey: true },
      'Ctrl+\\': { key: '\\', ctrlKey: true },
      '/': { key: '/' },
      'Alt+W': { key: 'w', altKey: true },
      Esc: { key: 'Escape' },
    };

    // Tree navigation (arrows, Enter, Home/End) is handled by the tree
    // itself rather than by the matcher, so it has no probe here.
    const treeKeys = ['↑ ↓', '→', '←', 'Enter', 'Home / End'];

    for (const { keys } of shortcutList()) {
      const probe = resolvable[keys];
      // A listed shortcut with neither a probe nor a place on the tree list
      // would otherwise be skipped in silence -- which is how a documented
      // shortcut goes unimplemented in the first place.
      if (!probe) {
        expect(treeKeys, `${keys} needs a probe or an exemption`).toContain(keys);
        continue;
      }
      expect(matchShortcut(ev(probe)), `${keys} should resolve`).not.toBeNull();
    }
  });

  it('uses Cmd on macOS', () => {
    expect(shortcutList('mac').map((s) => s.keys)).toContain('Cmd+B');
  });
});

type ShortcutKey = Partial<KeyEventLike> & { key: string };
