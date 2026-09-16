/**
 * Per-document reading state (FR-30, data-model.md).
 *
 * Two decisions here are deliberate and both are about not lying to the user
 * later:
 *
 * - The key is a **hash of the path**, not the path. Storage keys are visible
 *   to anything that can read extension storage, and hashing avoids spilling
 *   directory structure into key names for no benefit.
 * - Scroll is stored as a **ratio, not a pixel offset**. A pixel offset is
 *   wrong the moment the window width, theme or font changes, and those will
 *   change.
 */

export interface DocumentState {
  /** 0..1 through the scrollable height. */
  scrollRatio: number;
  lastOpenedAt: number;
}

export const DOC_STATE_PREFIX = 'docState:';

/** Records kept before pruning. Without a cap this grows without limit. */
export const DOC_STATE_LIMIT = 500;

/**
 * A short, stable, non-reversible key for a path.
 *
 * FNV-1a: not cryptographic, and does not need to be. It only has to spread
 * well enough that two documents rarely collide, and be identical across
 * sessions.
 */
export function hashPath(path: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < path.length; i += 1) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // A second pass over the reversed string widens the key enough to make
  // collisions unlikely across a few hundred documents.
  let second = 0x811c9dc5;
  for (let i = path.length - 1; i >= 0; i -= 1) {
    second ^= path.charCodeAt(i);
    second = Math.imul(second, 0x01000193) >>> 0;
  }
  return hash.toString(36) + second.toString(36);
}

export function documentStateKey(path: string): string {
  return `${DOC_STATE_PREFIX}${hashPath(path)}`;
}

export function defaultDocumentState(): DocumentState {
  return { scrollRatio: 0, lastOpenedAt: 0 };
}

/** Coerces stored data into a usable state, falling back field by field. */
export function normalizeDocumentState(value: unknown): DocumentState {
  const base = defaultDocumentState();
  if (typeof value !== 'object' || value === null) return base;

  const record = value as Partial<DocumentState>;
  const ratio =
    typeof record.scrollRatio === 'number' && Number.isFinite(record.scrollRatio)
      ? Math.min(Math.max(record.scrollRatio, 0), 1)
      : base.scrollRatio;

  return {
    scrollRatio: ratio,
    lastOpenedAt:
      typeof record.lastOpenedAt === 'number' && Number.isFinite(record.lastOpenedAt)
        ? record.lastOpenedAt
        : base.lastOpenedAt,
  };
}

/** Converts a scroll offset to a ratio, guarding against a zero-height page. */
export function toScrollRatio(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const scrollable = scrollHeight - clientHeight;
  if (scrollable <= 0) return 0;
  return Math.min(Math.max(scrollTop / scrollable, 0), 1);
}

/** Converts a stored ratio back to an offset for the current layout. */
export function fromScrollRatio(
  ratio: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const scrollable = scrollHeight - clientHeight;
  if (scrollable <= 0) return 0;
  return Math.round(Math.min(Math.max(ratio, 0), 1) * scrollable);
}

/**
 * Picks the keys to drop so the store stays bounded.
 *
 * Least recently opened first, which is the only ordering that matches how
 * people actually revisit documents.
 */
export function selectExpiredKeys(
  records: Array<{ key: string; lastOpenedAt: number }>,
  limit = DOC_STATE_LIMIT,
): string[] {
  if (records.length <= limit) return [];
  return [...records]
    .sort((a, b) => a.lastOpenedAt - b.lastOpenedAt)
    .slice(0, records.length - limit)
    .map((record) => record.key);
}
