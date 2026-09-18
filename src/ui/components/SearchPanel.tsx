import { useMemo } from 'preact/hooks';
import { basename } from '@core/fs/types';
import { groupByFile, MIN_QUERY_LENGTH, type SearchMatch } from '@core/search';
import type { FolderSearchState } from '../hooks/useFolderSearch';
import { t } from '../i18n';

/**
 * Results of searching every document in the folder.
 *
 * Grouped by file, because "which document is this in" is the first thing a
 * reader wants and a flat list of lines makes them read the path on every
 * row to find out.
 *
 * Not virtualized, unlike the file tree, and deliberately: the walker caps
 * the total number of matches, so this list has a known small ceiling.
 * Virtualizing a list that cannot grow past a few hundred rows would be
 * machinery with nothing to do.
 */

interface SearchPanelProps extends FolderSearchState {
  setQuery: (value: string) => void;
  /** Set by the parent so a shortcut can focus the field. */
  inputRef?: { current: HTMLInputElement | null };
  /** Whether there is a folder to search at all. */
  available: boolean;
  onOpen: (path: string, line: number) => void;
}

export function SearchPanel({
  query,
  report,
  running,
  scanned,
  setQuery,
  inputRef,
  available,
  onOpen,
}: SearchPanelProps) {
  // Grouped once and passed to the status line, which used to group the
  // same list a second time just to count the documents.
  const groups = useMemo(() => (report ? groupByFile(report.matches) : []), [report]);
  const tooShort = query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH;

  return (
    <div class="mw-search">
      <div class="mw-tree-filter">
        <input
          ref={inputRef}
          type="search"
          class="mw-input"
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchLabel')}
          value={query}
          disabled={!available}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('');
          }}
        />
      </div>

      {/*
        Two lines, and the split is for the screen reader.

        The live region announces settled states only. Putting the running
        count in it meant a long search announced itself a hundred times --
        a polite region that never settles is worse than none. The count
        still shows, in a line the screen reader is told to ignore.
      */}
      <p class="mw-search-status" role="status">
        {describeStatus({ available, tooShort, running, report, groups })}
      </p>
      {running && scanned > 0 ? (
        <p class="mw-search-progress" aria-hidden="true">
          {t('searchScanning', [String(scanned)])}
        </p>
      ) : null}

      {report?.truncated ? <p class="mw-sidebar-note">{t('searchTruncated')}</p> : null}

      <div class="mw-search-results">
        {groups.map((group) => (
          <section key={group.path} class="mw-search-group">
            <h3 class="mw-search-file" title={group.path}>
              {basename(group.path)}
            </h3>
            <ul class="mw-search-lines">
              {group.matches.map((match) => (
                <li key={`${match.line}:${match.start}`}>
                  <button
                    type="button"
                    class="mw-search-hit"
                    onClick={() => onOpen(match.path, match.line)}
                  >
                    <span class="mw-search-line">{match.line}</span>
                    <span class="mw-search-text">
                      <Excerpt match={match} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * The matching line with the query marked.
 *
 * Trimmed around the match rather than from the start of the line, so a hit
 * 300 characters in is still visible instead of being scrolled off the end
 * of a 260px sidebar.
 *
 * The leading context is short on purpose. It was 32 characters, which is
 * about as much as the column fits, so a match late in a line was pushed to
 * the right edge and the highlight itself came out clipped — the one thing
 * the row exists to show. Twelve leaves the mark near the start and gives
 * the rest of the width to what follows it.
 */
function Excerpt({ match }: { match: SearchMatch }) {
  const LEAD = 12;
  const TRAIL = 120;
  const from = Math.max(0, match.start - LEAD);
  const to = Math.min(match.text.length, match.end + TRAIL);

  const before = match.text.slice(from, match.start);
  const hit = match.text.slice(match.start, match.end);
  const after = match.text.slice(match.end, to);

  return (
    <>
      {from > 0 ? '…' : ''}
      {before}
      <mark>{hit}</mark>
      {after}
      {to < match.text.length ? '…' : ''}
    </>
  );
}

function describeStatus({
  available,
  tooShort,
  running,
  report,
  groups,
}: {
  available: boolean;
  tooShort: boolean;
  running: boolean;
  report: FolderSearchState['report'];
  groups: ReturnType<typeof groupByFile>;
}): string {
  if (!available) return t('searchNoFolder');
  if (tooShort) return t('searchTooShort', [String(MIN_QUERY_LENGTH)]);
  // One announcement for the whole search, not one per batch of files.
  if (running) return t('searchRunning');
  if (!report) return t('searchPrompt');
  if (report.matches.length === 0) return t('searchNoMatches');
  return t('searchMatchCount', [String(report.matches.length), String(groups.length)]);
}
