import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { HandleSource, type DirectoryHandleLike } from '@core/fs/handle-source';
import type { FileSource } from '@core/fs/types';
import {
  applyContentWidth,
  applyTheme,
  migrateSettings,
  type Settings,
} from '@core/settings';
import { WorkspaceApp, type RecentEntry } from '@ui/WorkspaceApp';
import { send } from '../../src/platform/messaging';
import { loadScrollRatio, saveScrollRatio } from '../../src/platform/document-state';
import {
  acquireFromDrop,
  acquireFromInput,
  dragHasFolder,
} from '../../src/platform/folder-drop';
import {
  forgetFolder,
  getHandle,
  listRecent,
  pruneRecent,
  putHandle,
  queryHandlePermission,
  rememberFolder,
  requestHandlePermission,
  type RecentFolder,
} from '../../src/platform/recent-folders';

import '@ui/styles/theme.css';
import '@ui/styles/app.css';
import '@ui/styles/document.css';
import { useBrowserTranslations } from '../../src/platform/i18n';

/**
 * Composition root for the workspace page.
 *
 * This surface runs on the extension origin, which is what makes the File
 * System Access API available at all — reader mode runs on an opaque file://
 * origin where it is not (architecture.md).
 */

const toBlobUrl = async (file: { name: string }) =>
  URL.createObjectURL(file as unknown as Blob);

function Root({ initialSettings }: { initialSettings: Settings }) {
  const [fileSource, setFileSource] = useState<FileSource | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [initialPath, setInitialPath] = useState<string | null>(null);

  useEffect(() => {
    void pruneRecent().then((folders) =>
      setRecent(folders.map((f) => ({ id: f.id, displayName: f.displayName }))),
    );
  }, []);

  useEffect(() => {
    const target = new URL(location.href).searchParams.get('open');
    if (target) setInitialPath(target);
  }, []);

  const adoptFolder = useCallback(
    async (source: FileSource, handle: DirectoryHandleLike | null) => {
      setFileSource(source);

      // Only a persistable source is remembered: a snapshot cannot be
      // reopened, so listing it would offer an action that cannot work.
      if (!source.canPersist || !handle) return;

      const id = `handle:${source.displayName}:${Date.now()}`;
      try {
        // Storing the handle is what makes the entry reopenable. If the
        // structured clone fails the folder still opens for this session, but
        // it must not be listed as recent -- the entry would be a dead link.
        await putHandle(id, handle);
      } catch {
        return;
      }

      const folders = await rememberFolder({
        id,
        kind: 'handle',
        displayName: source.displayName,
        handleKey: id,
      });
      setRecent(folders.map((f) => ({ id: f.id, displayName: f.displayName })));
    },
    [],
  );

  const onDropFolder = useCallback(
    async (dataTransfer: DataTransfer) => {
      const acquired = await acquireFromDrop(dataTransfer);
      if (!acquired) return false;
      await adoptFolder(acquired.source, acquired.handle);
      return true;
    },
    [adoptFolder],
  );

  /**
   * The folder picker is a convenience, not a dependency.
   *
   * `showDirectoryPicker()` is unreliable in extension contexts, so this uses
   * a directory input instead — worse (a snapshot), but it always works.
   */
  const onPickFolder = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const acquired = input.files ? acquireFromInput(input.files) : null;
      if (acquired) void adoptFolder(acquired.source, acquired.handle);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  }, [adoptFolder]);

  const onOpenRecent = useCallback(async (id: string) => {
    const folders: RecentFolder[] = await listRecent();
    const entry = folders.find((f) => f.id === id);
    if (!entry?.handleKey) return;

    const handle = await getHandle(entry.handleKey);
    if (!handle) {
      setRecent((prev) => prev.filter((f) => f.id !== id));
      return;
    }

    // Permission can lapse while the handle survives. Requesting it needs a
    // user gesture, which this click is.
    let permission = await queryHandlePermission(handle);
    if (permission !== 'granted') permission = await requestHandlePermission(handle);
    if (permission !== 'granted') return;

    setFileSource(new HandleSource(handle, toBlobUrl));
    const updated = await rememberFolder({
      id: entry.id,
      kind: entry.kind,
      displayName: entry.displayName,
      handleKey: entry.handleKey,
    });
    setRecent(updated.map((f) => ({ id: f.id, displayName: f.displayName })));
  }, []);

  const onForgetRecent = useCallback(async (id: string) => {
    const folders = await forgetFolder(id);
    setRecent(folders.map((f) => ({ id: f.id, displayName: f.displayName })));
  }, []);

  return (
    <WorkspaceApp
      initialSettings={initialSettings}
      doc={document}
      fileSource={fileSource}
      recent={recent}
      initialPath={initialPath}
      onSaveSettings={(settings) => void send({ type: 'saveSettings', settings })}
      onDropFolder={onDropFolder}
      onPickFolder={onPickFolder}
      onOpenRecent={(id) => void onOpenRecent(id)}
      onForgetRecent={(id) => void onForgetRecent(id)}
      dragAccepts={dragHasFolder}
      loadScroll={loadScrollRatio}
      saveScroll={saveScrollRatio}
    />
  );
}

async function main() {
  // Before the first render: a label that paints in English and then
  // swaps is worse than one that waits a tick.
  useBrowserTranslations();

  let settings: Settings;
  try {
    settings = await send({ type: 'getSettings' });
  } catch {
    settings = migrateSettings(undefined);
  }

  // Before first paint, so there is no flash of the wrong theme.
  applyTheme(document.documentElement, settings.theme);
  applyContentWidth(document.documentElement, settings.contentWidth);

  render(<Root initialSettings={settings} />, document.getElementById('app')!);
}

void main();
