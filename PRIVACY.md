# Privacy Policy — Markdown Workspace

**Last updated:** 2026-09-16

## Summary

Markdown Workspace does not collect, transmit, or sell any data. There is no
backend server, no analytics, no telemetry, and no third-party service. Every
file you open is read and rendered locally inside your own browser.

## What The Extension Accesses

To do its job, the extension reads content you explicitly point it at:

- **Local files (`file://`)** — the Markdown file you open, and, when you open a
  folder, the names and contents of files in that folder. This requires you to
  manually enable _Allow access to file URLs_ in Chrome's extension settings.
- **Websites you opt into** — Markdown served over `http(s)`, but only from
  origins you add yourself in the options page. No origin is enabled by default.

This content is read into memory, converted to HTML, and displayed. It is never
uploaded.

## What The Extension Stores

All storage is local to your browser:

| Data                                                                                                | Where                                                   | Why                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Your settings (theme, enabled features, allowed origins)                                            | `chrome.storage.sync`                                   | So your preferences persist, and follow your Chrome profile if you have Chrome Sync enabled                                    |
| Recently opened folders and their permission handles                                                | `IndexedDB`                                             | So the workspace can reopen a folder without asking you to pick it again                                                       |
| Where you had scrolled to in a document, when you last opened it, and how wide you made the sidebar | `chrome.storage.local`                                  | So documents reopen where you left off, and the sidebar stays the width you chose on this device                               |
| The folder a tab is browsing, and whether the file list had keyboard focus                          | `chrome.storage.session` and the tab's `sessionStorage` | So moving between documents keeps the sidebar and the cursor where you left them. Discarded when the tab or the browser closes |

If you use Chrome Sync, your **settings** sync between your own devices through
Google's infrastructure under your own Google account. This is standard Chrome
behavior and involves no server operated by this project. Document content and
file paths are never placed in synced storage.

You can erase everything by removing the extension, or by using **Reset all
settings** in the options page.

## What The Extension Does Not Do

- No data is sent to the developer or to any third party.
- No analytics, crash reporting, advertising, or tracking of any kind.
- No remote code is loaded or executed. All rendering libraries are bundled into
  the extension package, as required by Manifest V3.
- Your file contents, file paths, and browsing history are never transmitted.

## Permissions Explained

| Permission                | Why it is needed                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `storage`                 | Save your settings and reading state locally                                                    |
| `file:///*`               | Read the local Markdown files and folders you open                                              |
| `contextMenus`            | Provide the right-click entry that opens a file in the workspace                                |
| `scripting`               | Register the rendering script on origins you have explicitly approved; unused until you add one |
| Optional host permissions | Requested only when you add a specific origin for remote Markdown rendering                     |

## Changes

Material changes to this policy will be recorded in
[CHANGELOG.md](CHANGELOG.md) and reflected in the extension's store listing.

## Contact

Questions or concerns: open an issue at
<https://github.com/kamahei/markdown-workspace/issues>.
