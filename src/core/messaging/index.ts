/**
 * The typed message contract between extension surfaces.
 *
 * Defined once and imported by both sides so a sender and its handler cannot
 * drift apart. Core owns the shapes; the `chrome.runtime` calls that carry
 * them live in entrypoints.
 */

import type { Settings } from '../settings';

export interface FileContentPayload {
  /** Decoded text, when the file is text. */
  text: string | null;
  /** Data URL, when the file is binary (images in the document). */
  dataUrl: string | null;
  mimeType: string | null;
  size: number;
}

export interface DirectoryEntryPayload {
  name: string;
  kind: 'file' | 'directory';
  /** Absolute path for file:// sources, relative for handle-backed ones. */
  path: string;
  /** Epoch milliseconds, when the source reports it. */
  modifiedAt: number | null;
  size: number | null;
}

/** Discriminates recoverable failures so the UI can respond specifically. */
export type FileErrorCode =
  /** Chrome is blocking file:// access; the user must enable it themselves. */
  | 'file-access-denied'
  | 'not-found'
  | 'not-readable'
  /** Chrome's directory listing could not be parsed into entries. */
  | 'unparseable-listing'
  | 'unknown';

export interface FileError {
  code: FileErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: FileError };

// --- Requests -------------------------------------------------------------

export interface ReadFileRequest {
  type: 'readFile';
  url: string;
  /** Return a data URL instead of text. Used for images. */
  binary?: boolean;
}

export interface ListDirectoryRequest {
  type: 'listDirectory';
  url: string;
}

export interface CheckFileAccessRequest {
  type: 'checkFileAccess';
}

export interface OpenWorkspaceRequest {
  type: 'openWorkspace';
  /** file:// URL to open once the workspace is up. */
  target?: string;
}

export interface GetWorkspaceRootRequest {
  type: 'getWorkspaceRoot';
}

export interface SetWorkspaceRootRequest {
  type: 'setWorkspaceRoot';
  /** Directory the user opened, or null to forget it. */
  root: string | null;
}

export interface GetSettingsRequest {
  type: 'getSettings';
}

export interface SaveSettingsRequest {
  type: 'saveSettings';
  settings: Settings;
}

export interface AddOriginRequest {
  type: 'addOrigin';
  pattern: string;
}

export interface RemoveOriginRequest {
  type: 'removeOrigin';
  pattern: string;
}

export type Request =
  | ReadFileRequest
  | ListDirectoryRequest
  | CheckFileAccessRequest
  | GetWorkspaceRootRequest
  | SetWorkspaceRootRequest
  | OpenWorkspaceRequest
  | GetSettingsRequest
  | SaveSettingsRequest
  | AddOriginRequest
  | RemoveOriginRequest;

// --- Responses ------------------------------------------------------------

export interface ResponseMap {
  readFile: Result<FileContentPayload>;
  listDirectory: Result<DirectoryEntryPayload[]>;
  checkFileAccess: { granted: boolean };
  getWorkspaceRoot: { root: string | null };
  setWorkspaceRoot: { saved: boolean };
  openWorkspace: { opened: boolean };
  getSettings: Settings;
  saveSettings: { saved: boolean; reason?: string };
  addOrigin: { granted: boolean; settings: Settings };
  removeOrigin: { removed: boolean; settings: Settings };
}

export type ResponseFor<T extends Request['type']> = ResponseMap[T];

// --- Broadcasts -----------------------------------------------------------

export interface SettingsChangedEvent {
  type: 'settingsChanged';
  settings: Settings;
}

export type Broadcast = SettingsChangedEvent;

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = <T>(code: FileErrorCode, message: string): Result<T> => ({
  ok: false,
  error: { code, message },
});
