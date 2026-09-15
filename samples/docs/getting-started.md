# Getting started

One setup step, and it is the only thing the extension cannot do for you.

## Allow access to local files

Chrome blocks extensions from reading `file://` pages until you allow it. An
extension cannot request this permission, prompt for it, or open the page
where you grant it — it can only detect the result.

1. Open `chrome://extensions`
2. Find **Markdown Workspace** and click **Details**
3. Turn on **Allow access to file URLs**

If you skipped the setup page after installing, you can reach it again from
**Settings**.

## Then what

Open a folder and start reading. [Back to the tour](../README.md).

## Markdown on websites

Markdown served over `http(s)` is ignored unless you add that site yourself in
Settings. Nothing is enabled by default.

This matters more than it sounds. A server that sends
`Content-Type: text/markdown` makes Chrome download the file instead of
displaying it, so there is no page for the extension to act on at all. Adding
an origin lets the extension correct that one header, for that one site.
