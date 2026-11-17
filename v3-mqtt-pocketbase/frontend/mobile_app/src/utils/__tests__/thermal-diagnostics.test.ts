/**
 * Behavioral tests for honest thermal frame errors and screening labels.
 * Plain import-time assertions, same convention as pi-clock.test.ts; run with
 * any TS-aware runner (`npx tsx`, jest).
 */
import {
  explainThermalFrameError,
  screeningLabel,
  thermalSubtitle,
} from '../thermal-diagnostics';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);

function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function expectMatch(actual: string, pattern: RegExp, label: string) {
  if (!pattern.test(actual)) {
    failures += 1;
    report(`FAIL ${label}: ${JSON.stringify(actual)} did not match ${pattern}`);
  }
}

// A failed console fetch must say what failed, not silently go blank.
expectMatch(explainThermalFrameError('fetch-failed'), /Pi console unreachable/i, 'fetch reason');

// A rejected frame must expose the measured pixel count.
expectMatch(explainThermalFrameError('frame-too-small:767'), /768.*767|767.*768/, 'pixel reason');

// An unresolved console base must be named explicitly.
expectMatch(explainThermalFrameError('no-base'), /no Pi console configured/i, 'no-base reason');

// A dangerous verdict must be relabelled as a screening signal.
expectEq(screeningLabel('FEVER'), 'ELEVATED SURFACE — SCREENING ONLY', 'fever label');

// A normal verdict must not imply clinical health.
expectEq(screeningLabel('NORMAL'), 'NORMAL SURFACE RANGE', 'normal label');

// An absent verdict must not be inferred from an alert row.
expectEq(screeningLabel(''), 'NO VERDICT — SURFACE ESTIMATE', 'empty label');

// The subtitle must surface the concrete frame failure.
expectMatch(
  thermalSubtitle({
    live: false,
    frame: null,
    pbStats: null,
    pbFresh: false,
    now: 1_700_000_000_000,
    frameError: 'frame-too-small:767',
  }),
  /767/,
  'subtitle reason',
);

// A live frame keeps the existing honest subtitle.
expectEq(
  thermalSubtitle({
    live: true,
    frame: { verdict: 'NORMAL' } as never,
    pbStats: null,
    pbFresh: false,
    now: 1_700_000_000_000,
    frameError: null,
  }),
  'Live barn thermal — pi-thermal-01',
  'live subtitle',
);

if (failures === 0) {
  // eslint-disable-next-line no-console
  console.log('thermal-diagnostics: 8 assertions passed');
} else {
  process.exitCode = 1;
}
