# Security Policy

## Reporting a Vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private vulnerability reporting on this repository: **Security →
Report a vulnerability**. That opens a private thread visible only to the
maintainers.

Include what you would need to reproduce it yourself: the Chrome version, a
minimal Markdown document or folder that triggers the behaviour, and what you
observed against what you expected.

Expect an acknowledgement within a week. This is a small project maintained in
spare time, so a fix may take longer than an acknowledgement — you will be told
where it stands rather than left waiting.

## Supported Versions

The latest published release, and `main`. There are no long-term support
branches.

## What Is In Scope

This extension renders untrusted content: a Markdown file is not safe merely
because it is on your own disk. The following are treated as vulnerabilities:

- Script execution from the content of a document, a file name, or a directory
  listing — anything that escapes the sanitization boundary in
  `src/core/sanitize/`.
- A document reaching data outside what the user opened, or causing a network
  request the user did not ask for.
- The extension acquiring or retaining a permission the user did not grant, or
  failing to release one they revoked.
- Rendered output that leads the reader to a destination or a download they did
  not choose.

## What Is Not

- Chrome requiring **Allow access to file URLs** to be enabled by hand. An
  extension cannot grant that to itself; that is the point of the setting.
- The extension being detectable by a web page. Its rendering libraries are
  declared as web-accessible resources because a content script must be able to
  load them, and the alternative silently breaks rendering.
- Markdown rendering differences against another implementation, unless the
  difference has a security consequence.

## Design Notes

Two properties the code is written to hold, and worth knowing when you look for
a way around them:

- **One sanitization boundary.** Every string that becomes HTML passes through
  `src/core/sanitize/`, including output from the syntax highlighter and the
  diagram renderer. There is no trusted path.
- **No remote code.** Every rendering library is bundled, as Manifest V3
  requires. The extension makes no network request other than reading the
  document you opened.
