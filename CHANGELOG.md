# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Feature-complete for the first Chrome Web Store release. Not yet published.

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

### Security

- All rendered HTML passes through a single sanitization boundary, including
  output from the highlighter and the diagram renderer.
- No remote code, no analytics, no network request to anything but the document
  being read.

[Unreleased]: https://github.com/kamahei/markdown-workspace/commits/main
