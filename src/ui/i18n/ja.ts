import type { en } from './en';

/**
 * The Japanese catalogue.
 *
 * Typed against `en`, so a key added there and forgotten here is a build
 * error rather than a string that silently falls back to English.
 *
 * Two things this translation tries to get right rather than transliterate:
 * the product speaks plainly about what Chrome will not let it do, and it
 * does not apologise for limitations that are not its own. A sentence like
 * "an extension cannot do it for you" is a statement of fact in both
 * languages, so it stays a statement of fact.
 */
export const ja: Record<keyof typeof en, string> = {
  // --- Extension identity, also used for the store listing --------------
  extName: 'Markdown Workspace',
  extDescription:
    'Chrome で Markdown ファイルを、フォルダごと読めます。ファイルブラウザ内蔵。すべて端末内で完結します。',

  // --- Shared chrome ----------------------------------------------------
  skipToContent: '本文へスキップ',
  filesNav: 'ファイル',
  toggleSidebar: 'サイドバーの表示切替',
  resizeSidebar: 'サイドバーの幅を変更',
  reload: '再読み込み',
  reloadFromDisk: 'ディスクから再読み込み',
  themeIs: 'テーマ: $1',
  themeSystem: 'システム',
  themeLight: 'ライト',
  themeDark: 'ダーク',
  openInWorkspace: 'ワークスペースで開く',
  showMarkdownSource: 'Markdown ソースを表示',
  showRenderedDocument: '描画結果を表示',
  untitledDocument: 'ドキュメント',
  loading: '読み込み中…',

  // --- Sidebar sections -------------------------------------------------
  sidebarSections: 'サイドバーのセクション',
  sidebarTabOutline: 'アウトライン',
  sidebarTabSearch: '検索',
  outlineEmpty: 'この文書に見出しはありません。',

  // --- Extension reloaded under an open page ----------------------------
  extensionReloadedTitle: 'Markdown Workspace が更新されました',
  extensionReloadedBody:
    'このページはそのまま読めますが、サイドバー・検索・設定を使うには再読み込みが必要です。',
  reloadThisPage: 'このページを再読み込み',

  // --- File tree --------------------------------------------------------
  filterFilesPlaceholder: 'ファイルを絞り込む…',
  filterFilesLabel: 'ファイル名で絞り込む',
  noFilesMatchFilter: '一致するファイルはありません。',
  folderIsEmpty: 'このフォルダは空です。',
  openParentFolder: '親フォルダを開く: $1',

  // --- Folder search ----------------------------------------------------
  searchPlaceholder: 'このフォルダを検索…',
  searchLabel: 'このフォルダ内の全文書の本文を検索します',
  searchPrompt: '入力すると、このフォルダ内の全文書を検索します。',
  searchNoFolder: '検索できるフォルダが開いていません。',
  searchTooShort: '$1 文字以上入力してください。',
  searchRunning: '検索中…',
  searchScanning: '検索中… $1 件の文書を読みました。',
  searchNoMatches: '一致するものはありません。',
  searchMatchCount: '$2 件の文書で $1 件一致。',
  searchTruncated:
    '途中で打ち切ったため、まだあるかもしれません。検索語を絞るか、もっと小さいフォルダを開いてください。',

  // --- Reader and directory views ---------------------------------------
  folderCouldNotBeRead: 'このフォルダを読み取れませんでした。',
  localFilesBlocked: 'Chrome がローカルファイルへのアクセスをブロックしています。',
  folderNoLongerThere: 'このフォルダはすでに存在しません。',
  fileNoLongerThere: 'このファイルはすでに存在しません。',
  folderCouldNotBeOpened: 'このフォルダを開けませんでした。',
  folderListingUnreadable:
    'このフォルダ一覧を読み取れませんでした。ワークスペースから開いてみてください。',
  folderHasIndexDocument: 'このフォルダにはインデックス文書があります。',
  pickADocument: 'サイドバーからドキュメントを選ぶと読み始められます。',
  openNamedDocument: '$1 を開く',
  frontMatterUnparseable: 'フロントマターを解析できませんでした: $1',

  // --- Workspace --------------------------------------------------------
  workspaceFolders: 'フォルダ',
  workspaceRecent: '最近開いたもの',
  openAFolder: 'フォルダを開く',
  chooseAFolder: 'フォルダを選ぶ',
  dropAFolderHere: 'フォルダをここにドロップすると始まります。',
  dropAFolderAnywhere:
    'このページのどこにでもフォルダをドロップすると開きます。下から選ぶこともできます。',
  snapshotFolderNote:
    'このフォルダは一度きりのスナップショットです。再読み込みも、後から開き直すこともできません。',
  documentCouldNotBeOpened: 'このドキュメントを開けませんでした。',
  forgetFolder: '$1 を忘れる',
  openDocumentsTabs: '開いているドキュメント',
  closeTab: '$1 を閉じる',

  // --- Drag and drop ----------------------------------------------------
  dropToOpenFolder: 'ドロップしてこのフォルダを開く',
  dropUnsupported: '開けるのはフォルダと Markdown ファイルだけです',
  readingFolder: 'フォルダを読み取り中…',

  // --- File access failure ----------------------------------------------
  fileAccessBlockedTitle: 'Chrome がこのファイルへのアクセスを止めています',
  fileAccessBlockedBody:
    'ローカルファイルを読むには許可が必要です。この許可は Chrome の仕様上ご自身で有効にしていただく必要があり、拡張機能から行うことはできません。',
  fileAccessStep1: '{1} を開く',
  fileAccessStep2: 'Markdown Workspace を探して「詳細」をクリック',
  fileAccessStep3: '「ファイルの URL へのアクセスを許可する」を有効にする',
  copyExtensionsAddress: 'chrome://extensions をコピー',
  checkAgain: 'もう一度確認',
  checking: '確認中…',
  fileCouldNotBeOpened: 'このファイルを開けませんでした',
  tryAgain: 'やり直す',

  // --- Onboarding -------------------------------------------------------
  onboardingTitle: 'Markdown Workspace のセットアップ',
  onboardingHeading: 'Markdown Workspace をインストールしました',
  onboardingLead:
    'あと1ステップです。Chrome は、許可するまで拡張機能がローカルファイルを読むことを止めます。これだけは拡張機能側で代わりに行うことができません。',
  onboardingStep1: '{1} を開く',
  onboardingStep1Note:
    'Chrome はこのページを拡張機能から開くことを許していないため、アドレスバーに貼り付けていただく必要があります。',
  onboardingStep2: '{1} を探して {2} をクリック',
  onboardingStep2Name: 'Markdown Workspace',
  onboardingStep2Details: '詳細',
  onboardingStep3: '{1} を有効にする',
  onboardingStep3Toggle: 'ファイルの URL へのアクセスを許可する',
  copyAddress: 'アドレスをコピー',
  copied: 'コピーしました',
  onboardingNotEnabled: 'まだ有効になっていません。',
  onboardingNotEnabledBody:
    'トグルを切り替えれば自動で反映されます。ここに戻って再読み込みする必要はありません。',
  onboardingReady: '準備できました。',
  onboardingReadyBody: 'ローカルの Markdown ファイルが描画されます。',
  onboardingOpenWorkspace: 'ワークスペースを開く',
  onboardingHowToUse: '使い方',
  onboardingUseFile: '{1} ファイルを Chrome にドラッグすると読めます。',
  onboardingUseFolder:
    '{1} を Chrome にドラッグすると、サイドバー付きで閲覧でき、ドキュメント間のリンクも機能します。',
  onboardingUseFolderWord: 'フォルダ',
  onboardingUseToolbar:
    'ツールバーのアイコンをクリックすれば、いつでもワークスペースを開けます。',
  onboardingPrivacyNote:
    'ウェブ上の Markdown は、設定でサイトを追加しない限り何もしません。既定では何も有効になっておらず、開いたものが端末の外に出ることもありません。',

  // --- Popup ------------------------------------------------------------
  popupOpenWorkspace: 'ワークスペースを開く',
  popupOpenWorkspaceHint: 'Markdown のフォルダを閲覧する',
  popupTheme: 'テーマ',
  popupSettings: '設定',
  popupSettingsHint: 'テーマ、描画、ウェブサイト',
  popupRenderThisSite: 'このサイトの Markdown を描画する',
  popupStopThisSite: 'このサイトでの描画をやめる',
  popupFileAccessBlocked:
    'ローカルファイルがブロックされています。この拡張機能の詳細ページで「ファイルの URL へのアクセスを許可する」を有効にしてください。',

  // --- Options: page ----------------------------------------------------
  optionsTitle: 'Markdown Workspace — 設定',
  optionsStorageNote: '設定は端末内に保存され、外に出ることはありません。',
  optionsSaveFailedTitle: 'その設定は保存されませんでした',
  optionsSaveFailedBody:
    'Chrome が書き込みを拒否したため、ここに表示されている内容は実際には使われません。同期設定には保存量と書き込み頻度の上限があります。非表示フォルダの一覧を短くするか、オリジンを減らすと解消することが多いです。',
  optionsSaveFailedUnknown: '原因不明のエラー',
  optionsFileAccessTitle: 'ローカルファイルがブロックされています',
  optionsFileAccessBody:
    'ファイルへのアクセスは Chrome の仕様上ご自身で有効にしていただく必要があり、拡張機能から行うことはできません。{1} を開き、Markdown Workspace の「詳細」から「ファイルの URL へのアクセスを許可する」を有効にしてください。',

  // --- Options: appearance ----------------------------------------------
  optionsAppearance: '外観',
  optionsTheme: 'テーマ',
  optionsThemeHint: '「システム」は OS の設定に従います。',
  optionsContentWidth: '本文の幅',
  optionsContentWidthHint: '1行が折り返されるまでの長さです。',
  widthNarrow: '狭い',
  widthNormal: '標準',
  widthWide: '広い',

  // --- Options: rendering -----------------------------------------------
  optionsRendering: '描画',
  optionsRenderingNote:
    'いずれも、実際に使っているドキュメントを開いたときだけ読み込まれます。オフにすると変わるのは描画内容であって、ダウンロード量ではありません。',
  optionsHighlight: 'シンタックスハイライト',
  optionsMath: '数式 (KaTeX)',
  optionsDiagrams: '図 (Mermaid)',
  optionsTableOfContents: '文書アウトライン',
  optionsTableOfContentsHint:
    'サイドバーに「アウトライン」タブを追加し、文書の見出しを一覧します。',

  // --- Options: markdown ------------------------------------------------
  optionsMarkdown: 'Markdown',
  optionsFlavour: '方言',
  optionsFlavourHint: 'GFM では表・タスクリスト・打ち消し線が使えます。',
  flavourGfm: 'GitHub Flavored Markdown',
  flavourCommonmark: 'CommonMark のみ',
  optionsLinkify: '裸の URL をリンクにする',
  optionsTypographer: '引用符とダッシュを整形する',
  optionsBreaks: '単独の改行を改行として扱う',

  // --- Options: file browser --------------------------------------------
  optionsFileBrowser: 'ファイルブラウザ',
  optionsShowHidden: '隠しファイルと隠しフォルダを表示する',
  optionsSortBy: '並び順',
  sortByName: '名前',
  sortByModified: '更新日時',
  optionsHiddenFolders: '非表示にするフォルダ',
  optionsHiddenFoldersHint:
    '1行に1つ。ツリーから除外されます。node_modules のような大きなフォルダのための設定です。',
  optionsRestoreDefaults: '既定に戻す',

  // --- Options: websites ------------------------------------------------
  optionsWebsites: 'ウェブサイト',
  optionsWebsitesNote:
    'ウェブ上の Markdown は、ここにオリジンを追加しない限り何もしません。既定では何も有効になっておらず、オリジンごとに Chrome が個別に許可を求めます。',
  optionsOriginPlaceholder: 'https://docs.example.com/*',
  optionsOriginLabel: 'オリジンのパターン',
  optionsAdd: '追加',
  optionsNoWebsites: '追加されたウェブサイトはありません。',
  optionsPermissionRevoked: '許可が取り消されています',
  optionsPermissionRevokedHint:
    'Chrome がこの許可を与えなくなっています。いったん削除して追加し直すと復旧します。',
  optionsRemoveOrigin: '$1 を削除',
  originNotGranted: 'Chrome はそのサイトへのアクセスを許可しませんでした。',
  originNotSaved: 'そのサイトは許可されましたが、保存できませんでした。',
  originNotAdded: 'そのオリジンを追加できませんでした。',
  siteNotGranted: 'Chrome はこのサイトへのアクセスを許可しませんでした。',
  siteNotSaved: 'このサイトは許可されましたが、保存できませんでした。',
  siteNotAdded: 'このサイトを追加できませんでした。',

  // --- Options: shortcuts -----------------------------------------------
  optionsShortcuts: 'キーボードショートカット',
  optionsShortcutsNote:
    '変更はできません。{1} のような組み合わせは Chrome が自分で使うため、ページには一切渡されません。そのためここでは提供していません。',
  shortcutToggleSidebar: 'サイドバーの表示切替',
  shortcutToggleRaw: 'ソース／描画の切替',
  shortcutFocusFilter: 'ファイル絞り込みにフォーカス',
  shortcutFocusSearch: 'フォルダ内の全文書を検索',
  shortcutCloseTab: 'アクティブなタブを閉じる（ワークスペース）',
  shortcutClearFilter: '絞り込みを解除',
  shortcutMoveTree: 'ファイルツリー内を移動',
  shortcutOpenFolder: 'フォルダを開く、または中に入る',
  shortcutCloseFolder: '閉じる、または親フォルダへ戻る',
  shortcutOpenFile: '選択中のファイルを開く',
  shortcutFirstLast: '先頭／末尾のファイルへ',

  // --- Options: reset ---------------------------------------------------
  optionsReset: 'リセット',
  optionsResetBody:
    'すべての設定、読書状態、この拡張機能が覚えているフォルダを消去します。それらを開き直すための許可も含めてです。',
  optionsResetButton: 'すべての設定をリセット',
  optionsResetConfirm: 'はい、すべてリセットします',
  optionsResetting: 'リセット中…',
  optionsCancel: 'キャンセル',

  // --- Enrichment failures ----------------------------------------------
  diagramFailed: 'この図を描画できませんでした',
  expressionFailed: 'この数式を描画できませんでした',
  diagramLabel: '$1 の図',
  diagramFallbackLabel: '図',
  diagramSourceIntro: '図のソース。$1',
};
