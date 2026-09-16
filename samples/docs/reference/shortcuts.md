# Keyboard shortcuts

Everything is reachable without a pointer.

| Shortcut                            | Action                           |
| ----------------------------------- | -------------------------------- |
| <kbd>Ctrl</kbd>+<kbd>B</kbd>        | Toggle the sidebar               |
| <kbd>Ctrl</kbd>+<kbd>&#92;</kbd>    | Toggle raw / rendered            |
| <kbd>/</kbd>                        | Focus the file filter            |
| <kbd>Alt</kbd>+<kbd>W</kbd>         | Close the active tab (workspace) |
| <kbd>Esc</kbd>                      | Clear the filter                 |
| <kbd>&uarr;</kbd> <kbd>&darr;</kbd> | Move through the file tree       |
| <kbd>&rarr;</kbd>                   | Open a folder, or step into it   |
| <kbd>&larr;</kbd>                   | Close it, or go to the one above |
| <kbd>Enter</kbd>                    | Open the selected file           |
| <kbd>Home</kbd> <kbd>End</kbd>      | Jump to the first or last file   |

On macOS, use <kbd>Cmd</kbd> wherever <kbd>Ctrl</kbd> appears.

## Why not Ctrl+P and Ctrl+W

Chrome owns both, and an extension cannot take them back.

<kbd>Ctrl</kbd>+<kbd>W</kbd> closes the tab and is **reserved** — Chrome never
delivers it to a page, so no extension can bind it however it is written.
<kbd>Ctrl</kbd>+<kbd>P</kbd> opens the print dialog; a page can technically
cancel it, but taking print away from a document you are reading would be
hostile. <kbd>Ctrl</kbd>+<kbd>1</kbd>–<kbd>9</kbd> switch browser tabs and are
likewise reserved.

So the filter is a bare <kbd>/</kbd>, the convention readers already know, and
closing a tab is <kbd>Alt</kbd>+<kbd>W</kbd>.

## In the tree

The file tree is a single tab stop. Once it has focus, the arrow keys move
within it — the standard pattern for a tree, and the reason tabbing does not
walk through five thousand rows one at a time. The current row is outlined
while the tree has focus.

<kbd>&rarr;</kbd> and <kbd>&larr;</kbd> move through the folder structure
rather than up and down the list. On a folder, <kbd>&rarr;</kbd> opens it and
a second press steps inside; on a file it does nothing, because there is
nothing to open. <kbd>&larr;</kbd> closes an open folder, and otherwise takes
you to the folder containing whatever you are on — so it is how you climb
back out.

## Getting into the tree

Drop a folder on the browser and the tree already has focus: that page is the
file list, so the arrow keys work straight away.

Opening a document from the tree keeps you in the tree, so you can keep
arrowing and pressing <kbd>Enter</kbd> without reaching for the mouse. Press
<kbd>Esc</kbd> when you want to go back to the document — that returns focus
to the text, so <kbd>Space</kbd> and <kbd>PageDown</kbd> scroll again.

From the filter, <kbd>&darr;</kbd> drops you into the list, which makes
<kbd>/</kbd> a complete way in: <kbd>/</kbd>, type a few letters,
<kbd>&darr;</kbd>, <kbd>Enter</kbd>.

## Getting back

- [Writing](../writing.md)
- [Code and diagrams](../code-and-diagrams.md)
- [Back to the tour](../../README.md)
