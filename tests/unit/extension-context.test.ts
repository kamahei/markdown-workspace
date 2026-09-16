import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  guard,
  guardAsync,
  isExtensionAlive,
} from '../../src/platform/extension-context';

/**
 * The liveness check a content script makes before touching an extension API.
 *
 * The end-to-end test in `tests/e2e/extension-reload.spec.ts` proves the real
 * behaviour against a real Chrome; this pins the two cases that are awkward
 * to arrange there -- a context that dies *between* the check and the call,
 * and one where reading `chrome.runtime` itself throws.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** What a live context looks like, and what a dead one looks like. */
const alive = () => vi.stubGlobal('chrome', { runtime: { id: 'abcdef' } });
const dead = () => vi.stubGlobal('chrome', { runtime: {} });

describe('isExtensionAlive', () => {
  it('is true while runtime.id is there', () => {
    alive();
    expect(isExtensionAlive()).toBe(true);
  });

  it('is false once the id has gone, which is what invalidation looks like', () => {
    dead();
    expect(isExtensionAlive()).toBe(false);
  });

  it('is false where there is no chrome at all', () => {
    vi.stubGlobal('chrome', undefined);
    expect(isExtensionAlive()).toBe(false);
  });

  it('is false rather than throwing when the lookup itself throws', () => {
    vi.stubGlobal('chrome', {
      get runtime(): never {
        throw new Error('gone');
      },
    });
    expect(isExtensionAlive()).toBe(false);
  });
});

describe('guard', () => {
  it('runs the call and returns its value while the context is live', () => {
    alive();
    expect(guard(() => 'value', 'fallback')).toBe('value');
  });

  it('does not run the call at all once the context is dead', () => {
    dead();
    const call = vi.fn(() => 'value');
    expect(guard(call, 'fallback')).toBe('fallback');
    expect(call).not.toHaveBeenCalled();
  });

  it('catches a synchronous throw, which is the shape invalidation takes', () => {
    // `browser.storage` becomes undefined, so `.local` throws before there is
    // any promise for a `.catch` to attach to. This is the case the check
    // alone cannot cover: an update can land between the two.
    alive();
    expect(
      guard(() => {
        throw new TypeError("Cannot read properties of undefined (reading 'local')");
      }, 'fallback'),
    ).toBe('fallback');
  });
});

describe('guardAsync', () => {
  it('resolves with the call’s value while the context is live', async () => {
    alive();
    await expect(guardAsync(() => Promise.resolve('value'), 'fallback')).resolves.toBe(
      'value',
    );
  });

  it('skips the call once the context is dead', async () => {
    dead();
    const call = vi.fn(() => Promise.resolve('value'));
    await expect(guardAsync(call, 'fallback')).resolves.toBe('fallback');
    expect(call).not.toHaveBeenCalled();
  });

  it('absorbs a rejection as well as a throw', async () => {
    alive();
    await expect(
      guardAsync(() => Promise.reject(new Error('gone')), 'fallback'),
    ).resolves.toBe('fallback');
    await expect(
      guardAsync(() => {
        throw new Error('gone');
      }, 'fallback'),
    ).resolves.toBe('fallback');
  });
});
