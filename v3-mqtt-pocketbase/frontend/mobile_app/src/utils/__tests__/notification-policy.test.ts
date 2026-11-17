/**
 * Behavioral tests for notification contract. Plain import-time assertions.
 */
import { alertNotification, channelSpec, permissionGuidance } from '../notification-policy';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);

function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// An alert with a severity gets a clear PigPulse title and honest body.
const notice = alertNotification({ id: 'a1', type: 'FEVER', message: ' Elevated surface ', severity: 'WATCH' });
expectEq(notice.title, 'PigPulse · WATCH', 'severity title');
expectEq(notice.body, 'Elevated surface', 'trimmed body');
expectEq(notice.data?.alertId, 'a1', 'alert id in data');

// No meaningful text means no notification at all.
expectEq(alertNotification({ id: 'a2', type: '', message: '' }).body, '', 'empty body');

// Channel spec must explicitly enable vibration to match the audit finding.
const spec = channelSpec();
expectEq(spec.id, 'alerts', 'channel id');
expectEq(spec.importance, 4, 'high importance');
expectEq(spec.enableVibrate, true, 'vibration enabled in spec');
expectEq(Array.isArray(spec.vibrationPattern) && spec.vibrationPattern.length > 0, true, 'vibration pattern');

// Permission outcomes give actionable guidance, never silent failure.
if (!/permission/i.test(permissionGuidance(false))) {
  failures += 1;
  report('FAIL denied permission guidance is not clear');
}
if (!/enabled|ready|allowed/i.test(permissionGuidance(true))) {
  failures += 1;
  report('FAIL granted permission guidance is not clear');
}

if (failures === 0) {
  // eslint-disable-next-line no-console
  console.log('notification-policy: 9 assertions passed');
} else {
  process.exitCode = 1;
}
