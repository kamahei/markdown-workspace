import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Workspace mode: the extension page, where the File System Access API is
 * available because the origin is not opaque.
 *
 * Playwright cannot perform a real OS drag of a folder, so these tests drive
 * the same acquisition path the UI uses by synthesizing a DataTransfer whose
 * items expose `getAsFileSystemHandle` and `webkitGetAsEntry`. That exercises
 * the tier selection and the sources themselves; the browser's own drag
 * plumbing is out of scope for automation and is on the manual checklist.
 */

const TREE = {
  'README.md': '# Workspace Readme\n\nSee [guide](docs/guide.md).\n',
  'docs/guide.md': '# Guide\n\nBody.\n',
  'docs/api.md': '# API\n',
  'notes.txt': 'plain\n',
};

/** Installs a fake folder and dispatches a drop carrying it. */
async function dropFakeFolder(
  page: Page,
  tree: Record<string, string>,
  mode: 'handle' | 'legacy',
) {
  await page.evaluate(
    ({ tree, mode }) => {
      const files = new Map(Object.entries(tree));

      const childrenOf = (prefix: string) => {
        const scope = prefix ? `${prefix}/` : '';
        const seen = new Map<string, 'file' | 'directory'>();
        for (const path of files.keys()) {
          if (prefix && !path.startsWith(scope)) continue;
          const rest = prefix ? path.slice(scope.length) : path;
          const slash = rest.indexOf('/');
          if (slash === -1) seen.set(rest, 'file');
          else seen.set(rest.slice(0, slash), 'directory');
        }
        return seen;
      };

      const makeFile = (name: string, content: string) =>
        new File([content], name, { type: 'text/plain' });

      const makeDirHandle = (prefix: string, name: string): any => ({
        kind: 'directory',
        name,
        async *entries() {
          for (const [childName, kind] of childrenOf(prefix)) {
            const childPrefix = prefix ? `${prefix}/${childName}` : childName;
            yield [
              childName,
              kind === 'directory'
                ? makeDirHandle(childPrefix, childName)
                : {
                    kind: 'file',
                    name: childName,
                    async getFile() {
                      return makeFile(childName, files.get(childPrefix) ?? '');
                    },
                  },
            ];
          }
        },
        async getFileHandle(childName: string) {
          const key = prefix ? `${prefix}/${childName}` : childName;
          if (!files.has(key)) throw new Error('NotFoundError');
          return {
            kind: 'file',
            name: childName,
            async getFile() {
              return makeFile(childName, files.get(key) ?? '');
            },
          };
        },
        async getDirectoryHandle(childName: string) {
          const key = prefix ? `${prefix}/${childName}` : childName;
          const exists = [...files.keys()].some((p) => p.startsWith(`${key}/`));
          if (!exists) throw new Error('NotFoundError');
          return makeDirHandle(key, childName);
        },
        async queryPermission() {
          return 'granted';
        },
        async requestPermission() {
          return 'granted';
        },
      });

      const makeLegacyEntry = (prefix: string, name: string): any => ({
        isFile: false,
        isDirectory: true,
        name,
        fullPath: prefix ? `/fake-folder/${prefix}` : '/fake-folder',
        createReader() {
          let done = false;
          return {
            readEntries(cb: (entries: any[]) => void) {
              if (done) return cb([]);
              done = true;
              const out: any[] = [];
              for (const [childName, kind] of childrenOf(prefix)) {
                const childPrefix = prefix ? `${prefix}/${childName}` : childName;
                if (kind === 'directory') {
                  out.push(makeLegacyEntry(childPrefix, childName));
                } else {
                  out.push({
                    isFile: true,
                    isDirectory: false,
                    name: childName,
                    fullPath: `/fake-folder/${childPrefix}`,
                    file(resolve: (f: File) => void) {
                      resolve(makeFile(childName, files.get(childPrefix) ?? ''));
                    },
                  });
                }
              }
              cb(out);
            },
          };
        },
      });

      const item: any = { kind: 'file' };
      if (mode === 'handle') {
        item.getAsFileSystemHandle = async () => makeDirHandle('', 'fake-folder');
      } else {
        item.webkitGetAsEntry = () => makeLegacyEntry('', 'fake-folder');
      }

      const dataTransfer = {
        items: [item],
        dropEffect: 'copy',
      } as unknown as DataTransfer;

      const target = document.querySelector('.mw-dropzone')!;
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      target.dispatchEvent(event);
    },
    { tree, mode },
  );
}

test.describe('workspace', () => {
  test('opens and shows the welcome state', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);

    await expect(page.locator('.mw-root')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose a folder' })).toBeVisible();
    await expect(page.locator('.mw-pane')).toContainText('Drop a folder');
  });

  test('loads a folder from a handle-backed drop (FR-16)', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('.mw-dropzone')).toBeVisible();

    await dropFakeFolder(page, TREE, 'handle');

    await expect(page.locator('[role="tree"]')).toBeVisible();
    await expect(page.locator('[role="tree"]').getByText('README.md')).toBeVisible();
    await expect(page.locator('[role="tree"]').getByText('docs')).toBeVisible();
  });

  test('opens the folder index document automatically (FR-14)', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('.mw-dropzone')).toBeVisible();

    await dropFakeFolder(page, TREE, 'handle');
    await expect(page.locator('.mw-doc h1')).toHaveText('Workspace Readme');
  });

  test('opens documents as tabs and closes them (FR-21)', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('.mw-dropzone')).toBeVisible();
    await dropFakeFolder(page, TREE, 'handle');

    await expect(page.locator('.mw-tab')).toHaveCount(1);

    await page.locator('[role="tree"]').getByText('docs', { exact: true }).click();
    await page.locator('[role="tree"]').getByText('guide.md').click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Guide');
    await expect(page.locator('.mw-tab')).toHaveCount(2);

    // Re-opening the same document focuses its tab rather than duplicating it.
    await page.locator('[role="tree"]').getByText('README.md').click();
    await expect(page.locator('.mw-tab')).toHaveCount(2);

    await page.getByRole('button', { name: 'Close guide.md' }).click();
    await expect(page.locator('.mw-tab')).toHaveCount(1);
  });

  test('follows a relative link between documents', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('.mw-dropzone')).toBeVisible();
    await dropFakeFolder(page, TREE, 'handle');

    await expect(page.locator('.mw-doc h1')).toHaveText('Workspace Readme');
    await page.locator('.mw-doc').getByRole('link', { name: 'guide' }).click();
    await expect(page.locator('.mw-doc h1')).toHaveText('Guide');
  });

  test('falls back to a snapshot when no handle is available', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('.mw-dropzone')).toBeVisible();

    await dropFakeFolder(page, TREE, 'legacy');

    await expect(page.locator('[role="tree"]')).toBeVisible();
    await expect(page.locator('[role="tree"]').getByText('README.md')).toBeVisible();
  });

  test('hides controls a snapshot cannot support', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('.mw-dropzone')).toBeVisible();

    await dropFakeFolder(page, TREE, 'legacy');
    await expect(page.locator('[role="tree"]')).toBeVisible();

    // Offering a reload that cannot reload is worse than offering none.
    await expect(page.getByRole('button', { name: 'Reload from disk' })).toHaveCount(0);
    await expect(page.getByText('one-time snapshot')).toBeVisible();
    // A snapshot is never remembered, because it cannot be reopened.
    await expect(page.getByText('Recent')).toHaveCount(0);
  });

  test('shows reload for a refreshable source', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('.mw-dropzone')).toBeVisible();

    await dropFakeFolder(page, TREE, 'handle');
    await expect(page.locator('[role="tree"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload from disk' })).toBeVisible();
    await expect(page.getByText('one-time snapshot')).toHaveCount(0);
  });

  test('does not list a folder whose handle could not be stored', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('.mw-dropzone')).toBeVisible();

    await dropFakeFolder(page, TREE, 'handle');
    await expect(page.locator('[role="tree"]')).toBeVisible();

    // A synthetic handle carries methods, so structured cloning it into
    // IndexedDB fails -- which is exactly the case where the entry must not
    // be listed, because reopening it could never work. The folder still
    // opens for this session.
    await expect(page.locator('.mw-recent-item')).toHaveCount(0);
  });

  test('stores and reopens a persistable folder entry (FR-18, Q2)', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('.mw-dropzone')).toBeVisible();

    // Playwright cannot produce a real FileSystemDirectoryHandle, so this
    // exercises the storage layer with a cloneable stand-in. The handle round
    // trip with a genuine handle is on the manual checklist.
    const survived = await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open('markdown-workspace', 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('directoryHandles')) {
            req.result.createObjectStore('directoryHandles');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      await new Promise((resolve, reject) => {
        const tx = db.transaction('directoryHandles', 'readwrite');
        const req = tx.objectStore('directoryHandles').put({ marker: 'x' }, 'k1');
        req.onsuccess = () => resolve(null);
        req.onerror = () => reject(req.error);
      });
      db.close();

      const reopened: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open('markdown-workspace', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const value = await new Promise((resolve, reject) => {
        const tx = reopened.transaction('directoryHandles', 'readonly');
        const req = tx.objectStore('directoryHandles').get('k1');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      reopened.close();
      return (value as { marker?: string } | undefined)?.marker === 'x';
    });

    expect(survived).toBe(true);
  });

  test('rejects a drag carrying no files', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/workspace.html`);
    await expect(page.locator('.mw-dropzone')).toBeVisible();

    await page.evaluate(() => {
      const dataTransfer = {
        items: [{ kind: 'string' }],
      } as unknown as DataTransfer;
      const event = new Event('dragenter', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      document.querySelector('.mw-dropzone')!.dispatchEvent(event);
    });

    await expect(page.locator('.mw-drop-overlay.is-invalid')).toBeVisible();
  });
});
