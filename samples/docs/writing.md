# Writing

CommonMark plus the GitHub extensions people actually use.

## Text

Regular text, **bold**, _italic_, ~~struck through~~, `inline code`, and
[a link to the reference](reference/shortcuts.md).

Autolinked URLs work too: https://example.com

## Lists

- Nested lists
  - keep their indentation
    - as deep as you need
- And numbered lists:

1. First
2. Second
3. Third

## Task lists

- [x] Render Markdown
- [x] Browse a folder
- [x] Resolve relative links
- [ ] Read your mind

## Tables

| Feature             | Loaded when                    |      Size |
| ------------------- | ------------------------------ | --------: |
| Markdown core       | Always                         |    ~86 KB |
| Syntax highlighting | A document has a code block    | On demand |
| Math                | A document has `$...$`         | On demand |
| Diagrams            | A document has a Mermaid block | On demand |

## Quotes and footnotes

> A folder of Markdown is a small website that nobody built.

Footnotes work as you would expect[^why].

[^why]: And the reference jumps back to where you were reading.

## Definition lists

Workspace
: The extension page with tabs and a folder tree.

Reader
: What you get when you open a single file directly.

## Alerts

GitHub's five callout kinds render the same way here, which is the point:
a `docs/` folder written for GitHub should not look different when you read
it from disk.

> [!NOTE]
> Useful to know, but you can keep reading without it.

> [!TIP]
> A shortcut. Try <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> to search
> every document in this folder at once.

> [!IMPORTANT]
> Chrome will not let an extension read local files until you allow it.

> [!WARNING]
> `pnpm build` overwrites the contents of `.output/`.

> [!CAUTION]
> Resetting the extension clears every folder it remembers, including the
> permission to reopen them.

Anything else in the same shape stays an ordinary quote:

> [!NOPE]
> Undefined syntax is left alone rather than guessed at.

## Emoji

Shortcodes render too: `:tada:` becomes :tada:, and a release note full of
:rocket: :sparkles: :bug: reads the way its author meant it to.
