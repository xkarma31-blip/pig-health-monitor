/** Behavioral tests for periodic access re-probing. */
import { reprobeDue } from '../access-probe';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);

function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const t = 1_700_000_000_000;

// Never probed → probe now.
expectEq(reprobeDue(null, t, 0), true, 'first probe due');

// A healthy probe is retried after the base interval.
expectEq(reprobeDue(t, t + 9_999, 0), false, 'too early');
expectEq(reprobeDue(t, t + 10_000, 0), true, 'base interval due');

// Repeated failures back off, but never past the cap.
expectEq(reprobeDue(t, t + 19_999, 1), false, 'backoff not due');
expectEq(reprobeDue(t, t + 20_000, 1), true, 'backoff due');
expectEq(reprobeDue(t, t + 59_999, 9), false, 'capped not yet due');
expectEq(reprobeDue(t, t + 60_000, 9), true, 'capped due');

if (failures === 0) {
  report('access-probe: 7 assertions passed');
} else {
  process.exitCode = 1;
}
