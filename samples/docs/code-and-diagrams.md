# Code, math and diagrams

Each of these loads only when a document actually contains one. A page of
plain prose downloads none of them.

## Syntax highlighting

```typescript
interface FileSource {
  readonly kind: 'handle' | 'file-url' | 'snapshot';
  readonly canPersist: boolean;
  readonly canRefresh: boolean;

  readFile(path: string): Promise<FileContent>;
  listDirectory(path: string): Promise<DirectoryEntry[]>;
}
```

```python
def slugify(text: str) -> str:
    """Heading anchors must stay stable across renders."""
    return re.sub(r"[^\w\s-]", "", text.lower()).strip().replace(" ", "-")
```

```bash
pnpm install
pnpm dev          # launches Chrome with the extension loaded
pnpm test         # 369 unit tests
```

An unrecognized language stays plain rather than showing an error:

```notalanguage
this is left exactly as written
```

## Math

Inline math sits in a sentence: $E = mc^2$ reads normally alongside text.

Display math gets its own line:

$$
\frac{\partial L}{\partial \theta} = \sum_{i=1}^{n} (y_i - \hat{y}_i) x_i
$$

Invalid math keeps its source rather than disappearing — losing what you wrote
because of a typo would be the worse failure.

## Diagrams

```mermaid
graph TD
    A[Drop a folder on Chrome] --> B{What is it?}
    B -->|A .md file| C[Render it]
    B -->|A folder| D[Show the file tree]
    C --> E[Sidebar shows siblings]
    D --> E
    E --> F[Relative links navigate in place]
```

```mermaid
sequenceDiagram
    participant U as You
    participant R as Reader
    participant W as Service worker
    U->>R: Open notes.md
    R->>R: Render text immediately
    R->>W: List the folder
    W-->>R: Files and directories
    R->>U: Sidebar appears
```

A diagram that will not parse falls back to showing its source with the error,
and the rest of the document is untouched.
