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
  const groups = report ? groupByFile(report.matches) : [];
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
        Live region: a search that finishes while focus is still in the
        field produces no other announcement, so somebody using a screen
        reader would have no idea the results had arrived.
      */}
      <p class="mw-search-status" role="status">
        {describeStatus({ available, tooShort, running, scanned, report })}
      </p>

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
 * A long line is trimmed around the match rather than from the start, so a
 * hit 300 characters in is still visible instead of being scrolled off the
 * end of a 260px sidebar.
 */
function Excerpt({ match }: { match: SearchMatch }) {
  const CONTEXT = 32;
  const from = Math.max(0, match.start - CONTEXT);
  const to = Math.min(match.text.length, match.end + CONTEXT * 2);

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
  scanned,
  report,
}: {
  available: boolean;
  tooShort: boolean;
  running: boolean;
  scanned: number;
  report: FolderSearchState['report'];
}): string {
  if (!available) return t('searchNoFolder');
  if (tooShort) return t('searchTooShort', [String(MIN_QUERY_LENGTH)]);
  if (running) return scanned > 0 ? t('searchScanning', [String(scanned)]) : t('loading');
  if (!report) return t('searchPrompt');
  if (report.matches.length === 0) return t('searchNoMatches');
  return t('searchMatchCount', [
    String(report.matches.length),
    String(groupByFile(report.matches).length),
  ]);
}
