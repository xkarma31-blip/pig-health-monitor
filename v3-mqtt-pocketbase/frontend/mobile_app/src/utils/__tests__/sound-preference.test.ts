/** Behavioral tests for the default-off sound preference. */
import { soundAllowed } from '../sound-preference';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);

function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

expectEq(soundAllowed(false), false, 'default off');
expectEq(soundAllowed(true), true, 'enabled after settings choice');

if (failures === 0) {
  report('sound-preference: 2 assertions passed');
} else {
  process.exitCode = 1;
}
