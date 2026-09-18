# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-09-18

### Added

- A document outline. The sidebar gains an Outline tab listing the document's
  headings, nested by depth, marking the one you are currently reading and
  jumping to any of them. The renderer had been producing the heading list
  since the first release and nothing was reading it; the setting that turns
  the outline on and off had been stored, synced and likewise ignored.
- Search across every document in the open folder, from a Search tab in the
  sidebar or with Ctrl+Shift+F. Results are grouped by document with the
  matching text marked, and opening one lands at the section it is in. The
  same folders the file tree skips are skipped here, so searching a checked-out
  repository does not mean reading node_modules.
- The sidebar now holds more than the file tree: its contents are tabs, and
  which one you chose survives opening the next document.
- The sidebar can be resized, by dragging its edge or with the arrow keys
  once the handle has focus, and the width is remembered for this device.
  The handle's styling had been in the stylesheet since the first release
  with nothing behind it.

### Changed

- Back and Forward move between the headings you jumped to from the outline,
  returning to the position you left rather than only changing the address
  bar. A browser restores that by itself for anchor links, but only for the
  page's own scrollbar, and this app scrolls a pane.

- Reloading or updating the extension now says so in any page left open,
  with a button to reload it, instead of leaving a sidebar that quietly
  does nothing. The page stays readable either way.
- The privacy policy and the README describe what the extension actually
  does: the sidebar width is stored, the outline and search exist, and a
  file that downloads instead of opening has an explanation and a fix.

## [0.1.0] - 2026-09-16

First release. Published to the Chrome Web Store on 2026-09-18, and
buildable from source or from the archive attached to this tag.

### Added

- Render local Markdown files (`.md`, `.markdown`, `.mdown`, `.mkd`, `.mkdn`,
  `.mdx`) opened from disk.
- Built-in file browser: a sidebar tree beside every document, and a full
  replacement for Chrome's own `file://` directory listing, so dropping a
  folder onto the browser opens it.
- Workspace page with document tabs, folder drag and drop, and recently opened
  folders.
- Relative links and images between documents resolve and navigate in place.
- Syntax highlighting (Shiki), math (KaTeX) and diagrams (Mermaid), each loaded
  only when a document actually uses it.
- Light, dark and system themes across every surface.
- Settings page, toolbar popup, and a first-run page that detects when file
  access has been granted.
- Opt-in Markdown rendering on websites, one origin at a time.
- Reading position restored per document.
- Settings changes reach open documents without a reload.
- Japanese, Chinese and Korean text renders without the spurious space a
  wrapped line would otherwise gain.
- English and Japanese. The interface follows the browser's language, and so
  do the extension's name and description. Messages live in one typed
  catalogue per language, so a key added to one and forgotten in the other is
  a build error rather than a string that quietly falls back.
- Keyboard navigation throughout: the file tree follows the ARIA tree pattern,
  a dropped folder starts with the list focused, and opening a document keeps
  the cursor there even though reader mode loads a new page each time. The
  options page lists the shortcuts, generated from the same table the matcher
  is tested against.

### Accessibility

- Every surface is operable without a pointer, and a whole reading session is
  driven that way in the test suite.
- Diagrams are announced as one image rather than as a list of their labels in
  document order, which for a flowchart is not the order of the flow. An
  author's `accTitle` and `accDescr` are used when present; otherwise the
  diagram's source is offered, since that is what says which node leads to
  which.
- Maths reaches a screen reader as MathML, with the visual rendering hidden
  from it so nothing is announced twice.
- A table or a code block too wide for the window can be scrolled from the
  keyboard, and only becomes a tab stop while it actually overflows.
- Syntax highlighting uses high-contrast themes, which the ordinary ones are
  not at WCAG AA.
- Automated checks report no WCAG 2.1 AA violations on any surface.

### Fixed

- The privacy policy described per-document storage that did not exist. What
  is stored is where you had scrolled to and when you last opened the document,
  and now that is what it says. The unused field behind the discrepancy is gone
  from the record too.
- Two failure messages reached the screen in English on a Japanese interface:
  the reason a folder would not open, shown in the sidebar's tooltip and to a
  screen reader, and the workspace's panel for a document that would not open.
  Both are now translated from the error's code rather than from prose written
  in a layer that has no translator.

### Reliability

- Reloading or updating the extension no longer raises "Extension context
  invalidated" in documents that were already open. Such a page keeps its
  rendered document and stops trying to reach an extension that is no longer
  there; reloading the page brings the sidebar, the settings and the reading
  position back.

### Security

- All rendered HTML passes through a single sanitization boundary, including
  output from the highlighter and the diagram renderer.
- `data:` URLs are confined to images, so a document cannot offer arbitrary
  bytes as a download with a rendered page vouching for them.
- Permissions are kept to `storage`, `contextMenus` and `scripting`, plus
  `file:///*`. Remote origins are requested one at a time, at the moment the
  user asks for them.
- No remote code, no analytics, no network request to anything but the document
  being read. The build is checked for this on every commit.

[Unreleased]: https://github.com/kamahei/markdown-workspace/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/kamahei/markdown-workspace/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kamahei/markdown-workspace/releases/tag/v0.1.0
