/**
 * The English catalogue, and the source of truth for every message key.
 *
 * `scripts/build-locales.mjs` turns this and `ja.ts` into the
 * `_locales/<lang>/messages.json` files Chrome reads. Keeping the catalogue
 * in TypeScript rather than in JSON buys the thing a catalogue this size
 * needs most: `keyof typeof en` makes a mistyped key a build error, and a
 * test asserts both languages carry the same keys, so a message cannot be
 * added in one and forgotten in the other.
 *
 * Two kinds of slot, and the difference matters:
 *
 * - `$1`, `$2` are **string** substitutions, filled by Chrome itself the way
 *   `chrome.i18n.getMessage(key, [value])` fills them.
 * - `{1}`, `{2}` are **markup** slots, filled by `interpolate()` with real
 *   elements. They have to be braces: Chrome consumes `$n` before we see the
 *   string, replacing it with nothing when no substitution was passed.
 *
 * Keys are `[A-Za-z0-9_]` because Chrome requires that.
 */
export const en = {
  // --- Extension identity, also used for the store listing --------------
  extName: 'Markdown Workspace',
  extDescription:
    'Read Markdown files and whole folders in Chrome, with a built-in file browser. Everything stays on your device.',

  // --- Shared chrome ----------------------------------------------------
  skipToContent: 'Skip to content',
  filesNav: 'Files',
  toggleSidebar: 'Toggle sidebar',
  reload: 'Reload',
  reloadFromDisk: 'Reload from disk',
  themeIs: 'Theme: $1',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  openInWorkspace: 'Open in Workspace',
  showMarkdownSource: 'Show Markdown source',
  showRenderedDocument: 'Show rendered document',
  untitledDocument: 'Document',
  loading: 'Loading…',

  // --- File tree --------------------------------------------------------
  filterFilesPlaceholder: 'Filter files…',
  filterFilesLabel: 'Filter files by name',
  noFilesMatchFilter: 'No files match this filter.',
  folderIsEmpty: 'This folder is empty.',
  openParentFolder: 'Open the parent folder: $1',

  // --- Reader and directory views ---------------------------------------
  folderCouldNotBeRead: 'This folder could not be read.',
  folderCouldNotBeOpened: 'This folder could not be opened.',
  folderListingUnreadable:
    'This folder listing could not be read. Try opening the folder in the workspace instead.',
  folderHasIndexDocument: 'This folder has an index document.',
  pickADocument: 'Pick a document from the sidebar to start reading.',
  openNamedDocument: 'Open $1',
  frontMatterUnparseable: 'Front matter could not be parsed: $1',

  // --- Workspace --------------------------------------------------------
  workspaceFolders: 'Folders',
  workspaceRecent: 'Recent',
  openAFolder: 'Open a folder',
  chooseAFolder: 'Choose a folder',
  dropAFolderHere: 'Drop a folder here to start.',
  dropAFolderAnywhere:
    'Drop a folder anywhere on this page to open it, or choose one below.',
  snapshotFolderNote:
    'This folder is a one-time snapshot. It cannot be reloaded or reopened later.',
  documentCouldNotBeOpened: 'This document could not be opened.',
  forgetFolder: 'Forget $1',
  openDocumentsTabs: 'Open documents',
  closeTab: 'Close $1',

  // --- Drag and drop ----------------------------------------------------
  dropToOpenFolder: 'Drop to open this folder',
  dropUnsupported: 'Only folders and Markdown files can be opened',
  readingFolder: 'Reading folder…',

  // --- File access failure ----------------------------------------------
  fileAccessBlockedTitle: 'Chrome is blocking access to this file',
  fileAccessBlockedBody:
    'Markdown Workspace needs permission to read local files. Chrome requires you to enable this yourself — an extension cannot do it for you.',
  fileAccessStep1: 'Open {1}',
  fileAccessStep2: 'Find Markdown Workspace and click Details',
  fileAccessStep3: 'Enable “Allow access to file URLs”',
  copyExtensionsAddress: 'Copy chrome://extensions',
  checkAgain: 'Check again',
  checking: 'Checking…',
  fileCouldNotBeOpened: 'This file could not be opened',
  tryAgain: 'Try again',

  // --- Onboarding -------------------------------------------------------
  onboardingTitle: 'Set up Markdown Workspace',
  onboardingHeading: 'Markdown Workspace is installed',
  onboardingLead:
    'One step left. Chrome blocks extensions from reading local files until you allow it, and this is the only thing it will not let the extension do for you.',
  onboardingStep1: 'Open {1}',
  onboardingStep1Note:
    'Chrome does not allow an extension to open this page, so the address has to be pasted into the address bar.',
  onboardingStep2: 'Find {1} and click {2}',
  onboardingStep2Name: 'Markdown Workspace',
  onboardingStep2Details: 'Details',
  onboardingStep3: 'Turn on {1}',
  onboardingStep3Toggle: 'Allow access to file URLs',
  copyAddress: 'Copy address',
  copied: 'Copied',
  onboardingNotEnabled: 'Not enabled yet.',
  onboardingNotEnabledBody:
    'This updates on its own once you flip the toggle — no need to come back and reload.',
  onboardingReady: 'Ready.',
  onboardingReadyBody: 'Local Markdown files will now render.',
  onboardingOpenWorkspace: 'Open the workspace',
  onboardingHowToUse: 'How to use it',
  onboardingUseFile: 'Drag a {1} file onto Chrome to read it.',
  onboardingUseFolder:
    'Drag a {1} onto Chrome to browse it, with a sidebar and working links between documents.',
  onboardingUseFolderWord: 'folder',
  onboardingUseToolbar: 'Click the toolbar icon any time to open the workspace.',
  onboardingPrivacyNote:
    'Markdown on websites is ignored unless you add the site in Settings. Nothing is enabled by default and nothing you open leaves your device.',

  // --- Popup ------------------------------------------------------------
  popupOpenWorkspace: 'Open Workspace',
  popupOpenWorkspaceHint: 'Browse a folder of Markdown',
  popupTheme: 'Theme',
  popupSettings: 'Settings',
  popupSettingsHint: 'Themes, rendering, websites',
  popupRenderThisSite: 'Render Markdown on this site',
  popupStopThisSite: 'Stop rendering this site',
  popupFileAccessBlocked:
    'Local files are blocked. Enable “Allow access to file URLs” on this extension’s details page.',

  // --- Options: page ----------------------------------------------------
  optionsTitle: 'Markdown Workspace — Settings',
  optionsStorageNote: 'Settings are stored locally and never leave your device.',
  optionsSaveFailedTitle: 'That setting was not saved',
  optionsSaveFailedBody:
    'Chrome refused the write, so what you see here is not what will be used. Chrome limits how much and how often an extension may store synced settings; shortening the hidden folder list or removing an origin usually clears it.',
  optionsSaveFailedUnknown: 'Unknown error',
  optionsFileAccessTitle: 'Local files are blocked',
  optionsFileAccessBody:
    'Chrome requires you to enable file access yourself — an extension cannot do it for you. Open {1}, find Markdown Workspace, click Details, and enable “Allow access to file URLs”.',

  // --- Options: appearance ----------------------------------------------
  optionsAppearance: 'Appearance',
  optionsTheme: 'Theme',
  optionsThemeHint: 'System follows your operating system setting.',
  optionsContentWidth: 'Content width',
  optionsContentWidthHint: 'How wide a line of text gets before wrapping.',
  widthNarrow: 'Narrow',
  widthNormal: 'Normal',
  widthWide: 'Wide',

  // --- Options: rendering -----------------------------------------------
  optionsRendering: 'Rendering',
  optionsRenderingNote:
    'Each of these loads only when a document actually uses it, so turning one off changes what is rendered, not what is downloaded.',
  optionsHighlight: 'Syntax highlighting',
  optionsMath: 'Math (KaTeX)',
  optionsDiagrams: 'Diagrams (Mermaid)',

  // --- Options: markdown ------------------------------------------------
  optionsMarkdown: 'Markdown',
  optionsFlavour: 'Flavour',
  optionsFlavourHint: 'GFM adds tables, task lists and strikethrough.',
  flavourGfm: 'GitHub Flavored Markdown',
  flavourCommonmark: 'CommonMark only',
  optionsLinkify: 'Turn bare URLs into links',
  optionsTypographer: 'Smart quotes and dashes',
  optionsBreaks: 'Treat single newlines as line breaks',

  // --- Options: file browser --------------------------------------------
  optionsFileBrowser: 'File browser',
  optionsShowHidden: 'Show hidden files and folders',
  optionsSortBy: 'Sort by',
  sortByName: 'Name',
  sortByModified: 'Last modified',
  optionsHiddenFolders: 'Hidden folders',
  optionsHiddenFoldersHint:
    'One per line. These are skipped in the tree; node_modules is why this exists.',
  optionsRestoreDefaults: 'Restore defaults',

  // --- Options: websites ------------------------------------------------
  optionsWebsites: 'Websites',
  optionsWebsitesNote:
    'Markdown on the web is ignored unless you add its origin here. Nothing is enabled by default, and each origin asks Chrome for permission separately.',
  optionsOriginPlaceholder: 'https://docs.example.com/*',
  optionsOriginLabel: 'Origin pattern',
  optionsAdd: 'Add',
  optionsNoWebsites: 'No websites added.',
  optionsPermissionRevoked: 'permission revoked',
  optionsPermissionRevokedHint:
    'Chrome no longer grants this permission. Remove and add it again to restore it.',
  optionsRemoveOrigin: 'Remove $1',
  originNotGranted: 'Chrome did not grant access to that site.',
  originNotSaved: 'That site was allowed but could not be saved.',
  originNotAdded: 'That origin could not be added.',
  siteNotGranted: 'Chrome did not grant access to this site.',
  siteNotSaved: 'That site was allowed but could not be saved.',
  siteNotAdded: 'That site could not be added.',

  // --- Options: shortcuts -----------------------------------------------
  optionsShortcuts: 'Keyboard shortcuts',
  optionsShortcutsNote:
    'These are fixed. Chrome reserves combinations like {1} for itself and never delivers them to a page, so they are not offered here.',
  shortcutToggleSidebar: 'Toggle the sidebar',
  shortcutToggleRaw: 'Toggle raw / rendered',
  shortcutFocusFilter: 'Focus the file filter',
  shortcutCloseTab: 'Close the active tab (workspace)',
  shortcutClearFilter: 'Clear the filter',
  shortcutMoveTree: 'Move through the file tree',
  shortcutOpenFolder: 'Open a folder, or step into it',
  shortcutCloseFolder: 'Close a folder, or go to the one above',
  shortcutOpenFile: 'Open the selected file',
  shortcutFirstLast: 'Jump to the first or last file',

  // --- Options: reset ---------------------------------------------------
  optionsReset: 'Reset',
  optionsResetBody:
    'Clears every setting, all reading state, and the folders this extension remembers — including the permission to reopen them.',
  optionsResetButton: 'Reset all settings',
  optionsResetConfirm: 'Yes, reset everything',
  optionsResetting: 'Resetting…',
  optionsCancel: 'Cancel',

  // --- Enrichment failures ----------------------------------------------
  diagramFailed: 'Could not render this diagram',
  expressionFailed: 'Could not render this expression',
  diagramLabel: '$1 diagram',
  diagramFallbackLabel: 'Diagram',
  diagramSourceIntro: 'Diagram source. $1',
} as const;
