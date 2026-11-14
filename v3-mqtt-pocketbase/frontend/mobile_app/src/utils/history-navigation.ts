/**
 * History navigation contract (lane B2).
 *
 * The History tab hosts three sections behind `?section=`. This module is the
 * single source of that route/section vocabulary so the screen, the legacy
 * Live redirect and the nav bars never disagree about a string.
 *
 * Resolution is deliberately forgiving but explicit: an absent or blank value
 * is *defaulted* (History), a recognized value is *valid*, and a value the app
 * supplied but does not recognize is *invalid* (also falling back to History).
 * Callers that care can tell the three apart; callers that do not just read
 * `.section`.
 */

/** The three selectable sections inside the History tab. */
export type HistorySection = 'history' | 'live' | 'prediction';

/** Stable section order — also the on-screen segment order. */
export const HISTORY_SECTIONS: readonly HistorySection[] = ['history', 'live', 'prediction'] as const;

/** Which section an empty/absent `?section=` resolves to. */
export const DEFAULT_HISTORY_SECTION: HistorySection = 'history';

/** The retired top-level Live route; kept only as a redirect alias. */
export const LEGACY_LIVE_ROUTE = '/tabs/live';

/** Where the retired Live route sends users — the Live section of History. */
export const LEGACY_LIVE_REDIRECT_HREF = '/tabs/history?section=live';

/** Options for the shared `SegmentedControl`, in canonical order. */
export const HISTORY_SEGMENT_OPTIONS: readonly { key: HistorySection; label: string }[] = [
  { key: 'history', label: 'History' },
  { key: 'live', label: 'Live' },
  { key: 'prediction', label: 'Prediction' },
] as const;

/** Why a section was chosen — useful for surfacing an invalid-query notice. */
export type HistorySectionSource = 'valid' | 'defaulted' | 'invalid';

/** Narrow an arbitrary value to a known section. */
export function isHistorySection(value: unknown): value is HistorySection {
  return typeof value === 'string' && (HISTORY_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?section=` value (string, first-of-array, or absent) into a
 * concrete section plus the reason it was chosen.
 */
export function parseHistorySection(
  value: string | readonly string[] | null | undefined,
): { section: HistorySection; source: HistorySectionSource } {
  if (value === null || value === undefined) {
    return { section: DEFAULT_HISTORY_SECTION, source: 'defaulted' };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return { section: DEFAULT_HISTORY_SECTION, source: 'defaulted' };
    return parseOne(value[0]);
  }

  return parseOne(value as string);
}

function parseOne(raw: string | null | undefined): { section: HistorySection; source: HistorySectionSource } {
  if (raw === null || raw === undefined || raw === '') {
    return { section: DEFAULT_HISTORY_SECTION, source: 'defaulted' };
  }
  if (isHistorySection(raw)) return { section: raw, source: 'valid' };
  return { section: DEFAULT_HISTORY_SECTION, source: 'invalid' };
}

/** Canonical href for a section — the one place the query shape is written. */
export function historyHref(section: HistorySection): string {
  return `/tabs/history?section=${section}`;
}
