/**
 * Behavioral tests for the History navigation contract (lane B2).
 *
 * These pin the exact invariants the History screen and the legacy Live
 * redirect ship on: a query-backed section selection with a predictable
 * fallback (absent → default; supplied-but-unknown → default), a stable
 * segment order, and the canonical destination that the old `/tabs/live`
 * route must alias.
 *
 * Plain import-time assertions, same convention as pi-clock.test.ts; run with
 * any TS-aware runner (`npx tsx`).
 */
import {
  DEFAULT_HISTORY_SECTION,
  HISTORY_SECTIONS,
  HISTORY_SEGMENT_OPTIONS,
  LEGACY_LIVE_REDIRECT_HREF,
  LEGACY_LIVE_ROUTE,
  historyHref,
  isHistorySection,
  parseHistorySection,
  type HistorySection,
} from '../history-navigation';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);
function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ── Section inventory + segment order ────────────────────────────────────
expectEq(HISTORY_SECTIONS.length, 3, 'three History sections');
expectEq(HISTORY_SECTIONS.join(','), 'history,live,prediction', 'section order is stable');
expectEq(DEFAULT_HISTORY_SECTION, 'history', 'default section is history');
expectEq(
  HISTORY_SEGMENT_OPTIONS.map((o) => o.key).join(','),
  HISTORY_SECTIONS.join(','),
  'segment options follow section order',
);
expectEq(
  HISTORY_SEGMENT_OPTIONS.map((o) => o.label).join(','),
  'History,Live,Prediction',
  'segment labels are the visible names',
);

// ── isHistorySection guard ───────────────────────────────────────────────
expectEq(isHistorySection('history'), true, 'guard accepts history');
expectEq(isHistorySection('live'), true, 'guard accepts live');
expectEq(isHistorySection('prediction'), true, 'guard accepts prediction');
expectEq(isHistorySection('bogus'), false, 'guard rejects unknown');
expectEq(isHistorySection(''), false, 'guard rejects empty string');
expectEq(isHistorySection(undefined), false, 'guard rejects undefined');
expectEq(isHistorySection(3), false, 'guard rejects non-string');

// ── parseHistorySection: valid recognized values ─────────────────────────
for (const section of HISTORY_SECTIONS) {
  const r = parseHistorySection(section);
  expectEq(r.section, section, `valid ${section} resolves to itself`);
  expectEq(r.source, 'valid', `valid ${section} is reported valid`);
}

// ── parseHistorySection: absent / empty → defaulted (history) ────────────
for (const [label, value] of [
  ['undefined', undefined],
  ['null', null],
  ['empty string', ''],
  ['empty array', []],
] as const) {
  const r = parseHistorySection(value as never);
  expectEq(r.section, 'history', `${label} falls back to history`);
  expectEq(r.source, 'defaulted', `${label} is reported defaulted`);
}

// ── parseHistorySection: supplied-but-unrecognized → invalid ─────────────
for (const value of ['bogus', 'LIVE', 'History', 'prediction ', 'history/']) {
  const r = parseHistorySection(value);
  expectEq(r.section, 'history', `unknown "${value}" falls back to history`);
  expectEq(r.source, 'invalid', `unknown "${value}" is reported invalid`);
}

// ── parseHistorySection: array form (first entry wins) ───────────────────
const arrValid = parseHistorySection(['prediction', 'live']);
expectEq(arrValid.section, 'prediction', 'array uses the first entry');
expectEq(arrValid.source, 'valid', 'recognized array entry is valid');
const arrBad = parseHistorySection(['bogus', 'live']);
expectEq(arrBad.section, 'history', 'unknown first entry falls back');
expectEq(arrBad.source, 'invalid', 'unknown first entry is invalid');
const arrEmptyFirst = parseHistorySection(['']);
expectEq(arrEmptyFirst.section, 'history', 'blank first entry falls back');
expectEq(arrEmptyFirst.source, 'defaulted', 'blank first entry is defaulted');

// ── Destinations: canonical href + legacy Live compatibility ─────────────
expectEq(historyHref('history'), '/tabs/history?section=history', 'history destination');
expectEq(historyHref('live'), '/tabs/history?section=live', 'live destination');
expectEq(historyHref('prediction'), '/tabs/history?section=prediction', 'prediction destination');
expectEq(historyHref('live'), LEGACY_LIVE_REDIRECT_HREF, 'legacy Live href is the live destination');
expectEq(LEGACY_LIVE_REDIRECT_HREF, '/tabs/history?section=live', 'legacy Live redirect target is fixed');
expectEq(LEGACY_LIVE_ROUTE, '/tabs/live', 'legacy Live route is preserved');
// Every href must be parseable back to the section it encodes.
for (const section of HISTORY_SECTIONS) {
  const href = historyHref(section);
  const parsed = parseHistorySection(href.split('section=')[1] as HistorySection);
  expectEq(parsed.section, section, `round-trip href for ${section}`);
  expectEq(parsed.source, 'valid', `round-trip href for ${section} is valid`);
}

// ── Result ───────────────────────────────────────────────────────────────
if (failures > 0) {
  report(`history-navigation: ${failures} assertion(s) failed`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('history-navigation: all assertions passed');
