# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-16

First release. Built from source or from the archive attached to this tag;
the Chrome Web Store listing is not live yet.

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

[Unreleased]: https://github.com/kamahei/markdown-workspace/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kamahei/markdown-workspace/releases/tag/v0.1.0
