/** Behavioral tests for the native top safe-area contract. */
import { rootTopPadding } from '../safe-area';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);

function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

expectEq(rootTopPadding({ top: 0 }), 0, 'no inset');
expectEq(rootTopPadding({ top: 47 }), 47, 'status bar inset applied');
expectEq(rootTopPadding({ top: -5 }), 0, 'negative inset ignored');

if (failures === 0) {
  report('safe-area: 3 assertions passed');
} else {
  process.exitCode = 1;
}
