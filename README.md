# Markdown Workspace

A Chrome extension that renders Markdown files in the browser — and gives you a
built-in file browser so you can read a whole folder of documents, not just one
file at a time.

Drop a `.md` file onto Chrome and it renders. Drop a **folder** onto Chrome and
you get a sidebar file tree you can navigate without ever leaving the browser.

> **Status:** feature-complete, not yet published to the Chrome Web Store.
> Build it from source with the steps below.

## Why This Exists

Most Markdown viewer extensions are built around a single file: you open one
document, you read it, you go back. That breaks down for the way Markdown is
actually used — as folders of linked documents, such as a project's `docs/`
directory, an exported notes vault, or a cloned repository you want to read
without opening an editor.

Markdown Workspace treats **the folder** as the unit of work. Relative links
between documents resolve and navigate in place, so a documentation tree reads
like a small static site, with no build step and nothing uploaded anywhere.

## Core Capabilities

- **Render local Markdown** — `.md`, `.markdown`, `.mdown`, `.mkd` and `.mkdn`
  files opened from disk render as formatted documents. `.mdx` is rendered as
  plain Markdown where your system knows the type; some systems hand it to the
  downloader instead, and no extension can override that.
- **Built-in file browser** — a sidebar tree for the current folder. Click
  through documents without returning to the file manager.
- **Open a folder by drag and drop** — drop a directory onto the browser window
  or onto the workspace page and its tree loads immediately.
- **Relative links that work** — links and images pointing at sibling documents
  resolve correctly and navigate inside the workspace.
- **Syntax highlighting** — code blocks are highlighted with
  [Shiki](https://shiki.style/), using the same grammars as VS Code.
- **Math** — `$inline$` and `$$block$$` LaTeX rendered with
  [KaTeX](https://katex.org/).
- **Diagrams** — ` ```mermaid ` fenced blocks rendered with
  [Mermaid](https://mermaid.js.org/).
- **Themes** — light, dark and system-following themes for reading comfort.
- **CJK-aware** — Japanese, Chinese and Korean text renders without the
  spurious space a wrapped line would otherwise gain mid-sentence.
- **Opt-in remote rendering** — Markdown served over `http(s)` renders only for
  origins you explicitly add in the options page. Nothing is enabled by default.
- **Usable without a mouse** — arrow through the file tree, <kbd>Enter</kbd> to
  open, <kbd>/</kbd> to filter. Opening a document keeps the cursor in the tree,
  so a folder can be read end to end from the keyboard. The full list is on the
  options page.

## Try it

`samples/` and `samples-ja/` are short feature tours. Drag either folder onto
Chrome once the extension is set up.

## Privacy

Markdown Workspace does **not** send your documents, file paths, or browsing
activity anywhere. All rendering happens locally in your browser, and the
extension has no backend. See [PRIVACY.md](PRIVACY.md) for the full statement.

## Installation

### From the Chrome Web Store

Not yet available. This section will link to the store listing at release.

### From source (development build)

```bash
git clone https://github.com/kamahei/markdown-workspace.git
cd markdown-workspace
pnpm install
pnpm dev
```

`pnpm dev` builds the extension and launches a Chrome instance with it loaded.
To load a build into your own Chrome profile instead:

```bash
pnpm build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load
unpacked**, and select the `.output/chrome-mv3` directory.

`pnpm build` regenerates the icons and the lazily loaded rendering libraries
before building the extension, so a clean clone needs no extra steps.

## Required Setup: Allow Access to File URLs

Chrome blocks extensions from reading `file://` pages unless you grant
permission explicitly, and **an extension cannot turn this on for you**. Without
it, local Markdown files will not render.

1. Open `chrome://extensions`.
2. Find **Markdown Workspace** and click **Details**.
3. Enable **Allow access to file URLs**.

The extension shows an onboarding page after installation that walks through
this and detects whether the permission is active.

## Usage

| What you want                  | What to do                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Read one Markdown file         | Drag the file onto a Chrome window, or open it with <kbd>Ctrl</kbd>+<kbd>O</kbd>  |
| Read a whole folder            | Drag the folder onto a Chrome window, or onto the workspace page                  |
| Open the workspace directly    | Click the Markdown Workspace toolbar icon                                         |
| See the unrendered source      | Use the raw/rendered toggle in the toolbar, or <kbd>Ctrl</kbd>+<kbd>&#92;</kbd>   |
| Move around without a mouse    | <kbd>/</kbd> to filter, <kbd>&darr;</kbd> into the list, <kbd>Enter</kbd> to open |
| Render Markdown from a website | Add that origin in the options page, then reload                                  |

## Browser Support

Chrome and Chromium-based browsers (Edge, Brave, Vivaldi, Opera) on Manifest V3.
Firefox builds are produced by the same toolchain and are a secondary target;
some `file://` behavior differs and is not yet verified there.

## Development

The project uses [WXT](https://wxt.dev/) with TypeScript and Preact.

```bash
pnpm dev          # development build with hot reload
pnpm build        # production build
pnpm zip          # packaged archive for store submission
pnpm test         # unit tests
pnpm test:e2e     # end-to-end tests, including accessibility and performance
pnpm lint         # lint and format check
pnpm typecheck    # TypeScript check
pnpm check:budget # fail if the reader's initial payload grew
```

The end-to-end suite needs `pnpm build` first, and the tests that read local
files skip themselves unless Chrome has granted the extension file access.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide, project
layout, and pull request process.

## License

[MIT](LICENSE) © 2026 Kamahei

### Bundled third-party software

Manifest V3 forbids loading remote code, so every rendering library ships
inside the extension package. Each remains under its own license:

| Library                                                               | License                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [markdown-it](https://github.com/markdown-it/markdown-it) and plugins | MIT, except `markdown-it-anchor` (Unlicense) and `markdown-it-task-lists` (ISC) |
| [DOMPurify](https://github.com/cure53/DOMPurify)                      | MPL-2.0 or Apache-2.0                                                           |
| [Shiki](https://shiki.style/)                                         | MIT                                                                             |
| [KaTeX](https://katex.org/)                                           | MIT                                                                             |
| [Mermaid](https://mermaid.js.org/)                                    | MIT                                                                             |
| [Preact](https://preactjs.com/)                                       | MIT                                                                             |
| [js-yaml](https://github.com/nodeca/js-yaml)                          | MIT                                                                             |
