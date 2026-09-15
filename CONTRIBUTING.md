# Contributing to Markdown Workspace

Thanks for your interest. This guide covers the development setup, how the
project is laid out, and what a mergeable change looks like.

## Prerequisites

- **Node.js** 20 or newer
- **pnpm** 9 or newer (`corepack enable` is the easiest way to get it)
- **Chrome** or a Chromium-based browser for manual testing

## Getting Started

```bash
git clone https://github.com/Kamahei/markdown-workspace.git
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
  highlight/          Shiki integration
  math/               KaTeX integration
  diagram/            Mermaid integration
  fs/                 File and folder access abstraction
  link/               Relative link and image resolution
  settings/           Settings schema, defaults, and migrations
src/ui/             Preact components and theme stylesheets
tests/              Unit and end-to-end tests
```

The important rule: **`src/core/` must not import Preact, touch the DOM
directly, or call `chrome.*` APIs.** It takes plain inputs and returns plain
outputs, which is what makes it testable without a browser. Browser and UI
concerns belong in `entrypoints/` and `src/ui/`.

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

Do not open a public issue for a security vulnerability. Use GitHub's private
vulnerability reporting on this repository instead.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
