import type { FileUrlTransport } from '@core/fs/file-url-source';
import { send } from './messaging';

/**
 * Routes `file://` reads through the service worker.
 *
 * A content script on a `file://` page has an opaque origin and cannot fetch
 * its siblings; the extension origin can. This is the adapter that turns the
 * core transport interface into extension messaging.
 */
export const fileUrlTransport: FileUrlTransport = {
  readFile(url, binary) {
    return send({ type: 'readFile', url, binary });
  },
  listDirectory(url) {
    return send({ type: 'listDirectory', url });
  },
};
