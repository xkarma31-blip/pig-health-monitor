/**
 * Behavioral tests for telemetry time normalization and freshness.
 * Plain import-time assertions; run with any TS-aware test runner or the
 * repo's jest config once jest is wired (AGENTS.md mandates `npm run test`).
 */
import { telemetryTime, telemetryFresh } from '../telemetry-time';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);
function expectEq(actual: unknown, expected: unknown, label: string) {
  const ok = Object.is(actual, expected);
  if (!ok) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// Epoch seconds → milliseconds
expectEq(telemetryTime(1790573433), 1790573433000, 'seconds→ms');
// Epoch milliseconds pass through
expectEq(telemetryTime(1790573433384), 1790573433384, 'ms passthrough');
// ISO strings parse
expectEq(telemetryTime('2026-09-27T04:53:00.802Z'), Date.parse('2026-09-27T04:53:00.802Z'), 'ISO string');
// Invalid values → NaN, never a fake fresh zero
expectEq(Number.isNaN(telemetryTime(0)), true, 'zero rejected');
expectEq(Number.isNaN(telemetryTime(-5)), true, 'negative rejected');
expectEq(Number.isNaN(telemetryTime('')), true, 'empty string rejected');
expectEq(Number.isNaN(telemetryTime('not-a-date')), true, 'garbage string rejected');
expectEq(Number.isNaN(telemetryTime(null)), true, 'null rejected');
expectEq(Number.isNaN(telemetryTime(undefined)), true, 'undefined rejected');

// Freshness: 30 s old is fresh, 2 min old is stale, future within tolerance fresh
const now = Date.now();
expectEq(telemetryFresh(now - 30_000, now), true, '30s old is fresh');
expectEq(telemetryFresh(now - 120_000, now), false, '2min old is stale');
expectEq(telemetryFresh(now + 2_000, now), true, '2s future within tolerance');
expectEq(telemetryFresh(now + 60_000, now), false, 'far future rejected');
expectEq(telemetryFresh(undefined, now), false, 'invalid never fresh');

if (failures > 0) {
  report(`${failures} telemetry-time assertion(s) failed`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('telemetry-time: all assertions passed');
