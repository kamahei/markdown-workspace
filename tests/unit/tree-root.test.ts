import { describe, expect, it } from 'vitest';
import { ancestorDirectories, isInside, resolveTreeRoot } from '@core/reader/classify';

describe('resolveTreeRoot', () => {
  it('keeps the folder the user opened when the document is inside it', () => {
    // The reported bug: this returned '/samples/docs/reference/'.
    expect(resolveTreeRoot('/samples/docs/reference/', '/samples/')).toBe('/samples/');
  });

  it('keeps the root for a document directly inside it', () => {
    expect(resolveTreeRoot('/samples/', '/samples/')).toBe('/samples/');
  });

  it('falls back to the document directory when nothing is remembered', () => {
    expect(resolveTreeRoot('/samples/docs/', null)).toBe('/samples/docs/');
  });

  it('gives up the remembered root once the user leaves it', () => {
    // Navigating somewhere else entirely; pretending the old root still
    // applies would show a tree that has nothing to do with the document.
    expect(resolveTreeRoot('/elsewhere/notes/', '/samples/')).toBe('/elsewhere/notes/');
  });

  it('is not fooled by a sibling folder with a shared prefix', () => {
    // '/samples-ja/' must not count as being inside '/samples/'.
    expect(resolveTreeRoot('/samples-ja/docs/', '/samples/')).toBe('/samples-ja/docs/');
  });

  it('handles a missing document directory', () => {
    expect(resolveTreeRoot(null, '/samples/')).toBe('/samples/');
    expect(resolveTreeRoot(null, null)).toBeNull();
  });
});

describe('isInside', () => {
  it.each([
    ['/a/b/', '/a/', true],
    ['/a/', '/a/', true],
    ['/a/b/c/', '/a/', true],
    ['/a/', '/a/b/', false],
    ['/ab/', '/a/', false],
    ['/a-b/', '/a/', false],
    ['/', '/', true],
  ])('%s inside %s -> %s', (path, root, expected) => {
    expect(isInside(path, root)).toBe(expected);
  });

  it('tolerates a missing trailing slash on either side', () => {
    expect(isInside('/a/b', '/a')).toBe(true);
    expect(isInside('/a/b', '/a/')).toBe(true);
  });
});

describe('ancestorDirectories', () => {
  it('lists each level with a usable path', () => {
    expect(ancestorDirectories('/home/me/docs/')).toEqual([
      { name: 'home', path: '/home/' },
      { name: 'me', path: '/home/me/' },
      { name: 'docs', path: '/home/me/docs/' },
    ]);
  });

  it('handles a Windows drive path', () => {
    expect(ancestorDirectories('/D:/md-viewer/samples/')).toEqual([
      { name: 'D:', path: '/D:/' },
      { name: 'md-viewer', path: '/D:/md-viewer/' },
      { name: 'samples', path: '/D:/md-viewer/samples/' },
    ]);
  });

  it('returns nothing for the filesystem root', () => {
    expect(ancestorDirectories('/')).toEqual([]);
  });
});
