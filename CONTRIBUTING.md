# Contributing to Markdown Workspace

Thanks for your interest. This guide covers the development setup, how the
project is laid out, and what a mergeable change looks like.

## Prerequisites

- **Node.js** 20 or newer
- **pnpm** 9 or newer (`corepack enable` is the easiest way to get it)
- **Chrome** or a Chromium-based browser for manual testing

## Getting Started

```bash
git clone https://github.com/kamahei/markdown-workspace.git
cd markdown-workspace
pnpm install
pnpm dev
```

`pnpm dev` starts [WXT](https://wxt.dev/) in development mode: it builds the
extension, launches a fresh Chrome profile with it loaded, and hot-reloads on
change.

**Before local Markdown files will render**, open `chrome://extensions`, find
Markdown Workspace, click **Details**, and enable **Allow access to file URLs**.
Chrome does not let an extension enable this itself, and the development profile
starts with it off.

## Project Layout

```
entrypoints/        Extension entry points (WXT convention)
  reader.content.ts   Content script: renders file:// and opted-in http(s) pages
  background.ts       Service worker: file reads, network rules, toolbar action
  workspace/          The workspace page — file tree, tabs, rendered document
  options/            Settings page
  popup/              Toolbar popup
  onboarding/         Post-install setup guidance
src/core/           Framework-free logic. Unit-tested, no DOM or Preact imports.
  markdown/           markdown-it pipeline and plugins
  sanitize/           DOMPurify configuration
  enrich/             Placeholder contract for highlighting, math and diagrams
  fs/                 File and folder access abstraction, and the tree model
  link/               Relative link and image resolution
  reader/             Deciding what a page is before touching it
  keyboard/           Shortcut matching and the list that documents it
  messaging/          The request and response contract between surfaces
  origins/            Opt-in http(s) origin patterns and network rules
  settings/           Settings schema, defaults, and migrations
src/ui/             Preact components, hooks and theme stylesheets
src/platform/       Adapter layer: the only place outside entrypoints/ that
                    may call extension APIs
src/lazy/           Shiki, KaTeX and Mermaid, built as separate chunks and
                    loaded by URL only when a document needs them
tests/              Unit and end-to-end tests
```

The important rule: **`src/core/` must not import Preact, touch the DOM
directly, or call `chrome.*` APIs.** It takes plain inputs and returns plain
outputs, which is what makes it testable without a browser. Browser and UI
concerns belong in `entrypoints/` and `src/ui/`.

This is enforced by ESLint, not by convention — see the boundary rules in
`eslint.config.js`. Core may still _operate on_ a `Document` or a
`FileSystemDirectoryHandle`; what it may not do is reach for one as a global.

## Commands

```bash
pnpm dev          # development build with hot reload
pnpm build        # production build to .output/chrome-mv3
pnpm zip          # packaged archive for store submission
pnpm test         # unit tests (Vitest)
pnpm test:e2e     # end-to-end tests (Playwright)
pnpm lint         # lint and format check
pnpm typecheck    # TypeScript check
```

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before opening a pull
request. If your change touches rendering or file access, run `pnpm test:e2e`
too.

### Running against another browser

The end-to-end suite drives the Chromium that Playwright installs. To run the
same suite against an installed browser instead:

```bash
MW_BROWSER_CHANNEL=msedge pnpm test:e2e     # or =chrome
```

This is how the "other Chromium browsers" line in the release checklist gets
answered — by running it, rather than by assuming a shared engine means
shared behaviour. Firefox is not covered this way: Playwright cannot load an
extension into it, so `pnpm build:firefox` still has to be checked by hand.

**`=chrome` takes a different route, and it matters if you touch the
fixtures.** Google Chrome stable no longer honours `--load-extension`; it
launches and the extension simply is not there. The supported replacement is
the CDP `Extensions.loadUnpacked` command, which Playwright's own launcher
cannot reach — it refuses `--remote-debugging-pipe`, and the browser session
it hands out has no browser context attached. So for that channel the fixture
starts Chrome itself, attaches with `connectOverCDP`, and installs the
extension over CDP. Set `MW_CHROME_PATH` if Chrome is somewhere unusual.

Two things surprised us there and are worth knowing before you trust a green
run:

- A real Chrome profile runs service workers of its own, so the extension is
  found **by name** rather than by being first in `serviceWorkers()`.
- `chrome.extension.isAllowedFileSchemeAccess()` reports `false` in that mode
  while the content script demonstrably runs on `file://`. The `hasFileAccess`
  fixture therefore opens a real Markdown file and looks, instead of taking
  the answer at face value. Believing it skipped every `file://` test while
  reporting a pass.

## Adding Dependencies

Manifest V3 forbids loading remote code, so **every dependency is bundled into
the extension package**. That makes bundle size a user-facing cost. Before
adding a library:

- Check whether an existing dependency already covers the need.
- Prefer libraries that work without `eval` or `new Function`, which the
  Manifest V3 content security policy blocks.
- Large libraries must be loaded through a dynamic `import()` so they become a
  separate lazy chunk rather than part of the initial payload.

Pull requests that add a dependency should say what it is for and what it costs
in bundle size.

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(workspace): persist sidebar width across sessions
fix(reader): resolve relative image paths in nested folders
docs(readme): clarify file URL permission steps
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`.

Write commits in your own name. Do not add machine-generated attribution
trailers such as `Co-Authored-By:` lines naming an AI assistant, or
"Generated with ..." footers. If you use an AI tool to help write code, that is
fine — you are still the author, and you are responsible for the change.

## Pull Requests

1. Branch from `main` using a descriptive name (`feat/folder-tree-search`).
2. Keep the change focused. Unrelated refactors belong in their own PR.
3. Update `CHANGELOG.md` under `## [Unreleased]` for user-visible changes.
4. Describe what you changed, why, and how you verified it.
5. Include before/after screenshots for UI changes.

## Reporting Bugs

Open an issue with:

- Your Chrome version and operating system
- Whether **Allow access to file URLs** is enabled
- Whether the file was local (`file://`) or remote (`http(s)`)
- A minimal Markdown sample that reproduces the problem, if rendering is wrong
- Any errors from the extension's service worker console
  (`chrome://extensions` → **Details** → **Inspect views: service worker**)

## Security Issues

Do not open a public issue for a security vulnerability. See
[SECURITY.md](SECURITY.md) for how to report one privately, and for what this
project treats as a vulnerability.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
