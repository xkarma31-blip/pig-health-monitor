/**
 * Behavioral tests for the pure device-record mapping (B5 Settings).
 *
 * Regression focus:
 *   - Missing firmware / RSSI / timestamp are explicit (null), never fabricated.
 *   - Unknown acquisition time is UNKNOWN freshness (not a definitive Offline):
 *     `deviceOnline` reads false (never silently online) while `deviceFreshness`
 *     stays 'unknown', so no screen may claim the hardware is offline.
 *   - Unknown numeric readings are explicit (NaN), never a normal-looking 0.
 *
 * Pure module — run with the repo's installed tsx, no app/React imports:
 *   node_modules/.bin/tsx src/utils/__tests__/device-record.test.ts
 */
import {
  toDeviceFields,
  formatFirmware,
  formatRssi,
  formatPower,
  deviceOnline,
  deviceFreshness,
  freshnessLabel,
  hasReading,
  UNKNOWN_READING,
} from '../device-record';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);
function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ── toDeviceFields ─────────────────────────────────────────────────
const full = toDeviceFields({
  id: 'd1',
  name: 'Pi 4B',
  firmware: 'v2.1.0-2026041312',
  rssi: -61,
  lastUpdated: '2026-09-27T04:53:00.802Z',
});
expectEq(full.id, 'd1', 'id read');
expectEq(full.name, 'Pi 4B', 'name read');
expectEq(full.firmware, 'v2.1.0-2026041312', 'firmware preserved');
expectEq(full.rssiDbm, -61, 'rssi preserved');
expectEq(full.lastSeenRaw, '2026-09-27T04:53:00.802Z', 'lastSeenRaw passthrough');

// Explicit missing values — never fabricated.
const bare = toDeviceFields({ deviceId: 'esp32-s3' });
expectEq(bare.id, 'esp32-s3', 'id falls back to deviceId');
expectEq(bare.name, 'esp32-s3', 'name falls back to deviceId');
expectEq(bare.firmware, null, 'missing firmware is null');
expectEq(bare.rssiDbm, null, 'missing rssi is null');
expectEq(bare.lastSeenRaw, null, 'missing timestamp is null');

expectEq(toDeviceFields({ id: 'x', firmware: '   ' }).firmware, null, 'blank firmware is null');
expectEq(toDeviceFields({ id: 'x' }, 'fallback').id, 'x', 'explicit id wins');
expectEq(toDeviceFields({}, 'fallback').id, 'fallback', 'fallback id used');
expectEq(toDeviceFields({ label: 'Mic node' }).name, 'Mic node', 'name falls back to label');

// rssi: numeric strings coerce, empty/garbage are explicit null, 0 is kept.
expectEq(toDeviceFields({ id: 'x', rssi: '-61' }).rssiDbm, -61, 'numeric string rssi coerced');
expectEq(toDeviceFields({ id: 'x', rssi: '' }).rssiDbm, null, 'empty rssi is null');
expectEq(toDeviceFields({ id: 'x', rssi: 'n/a' }).rssiDbm, null, 'garbage rssi is null');
expectEq(toDeviceFields({ id: 'x', rssi: 0 }).rssiDbm, 0, 'rssi 0 kept');

// ── formatFirmware / formatRssi ────────────────────────────────────
expectEq(formatFirmware(null), 'unknown', 'null firmware displays unknown');
expectEq(formatFirmware('v2.1.0'), 'v2.1.0', 'firmware displayed as-is');
expectEq(formatRssi(null), '—', 'null rssi displays em dash');
expectEq(formatRssi(-61), '-61 dBm', 'rssi formatted with unit');
expectEq(formatRssi(0), '0 dBm', 'rssi 0 formatted');

// ── deviceOnline ───────────────────────────────────────────────────
const now = Date.now();
const FIVE_MIN = 5 * 60 * 1000;
expectEq(deviceOnline(null, now, FIVE_MIN), false, 'unknown time reads offline');
expectEq(deviceOnline(now - 30_000, now, FIVE_MIN), true, '30s old is online');
expectEq(deviceOnline(now - 10 * 60_000, now, FIVE_MIN), false, '10min old is offline');
expectEq(deviceOnline(now + 2_000, now, FIVE_MIN), true, '2s future within tolerance online');
expectEq(deviceOnline(now + 60_000, now, FIVE_MIN), false, 'far future rejected');
expectEq(deviceOnline(NaN, now, FIVE_MIN), false, 'NaN time reads offline');

// ── hasReading — explicit unknown, never normal ────────────────────
expectEq(hasReading(0), true, '0 is a real reading');
expectEq(hasReading(-3.2), true, 'negative is a real reading');
expectEq(Object.is(hasReading(UNKNOWN_READING), false), true, 'UNKNOWN_READING is not a reading');
expectEq(Object.is(UNKNOWN_READING, NaN), true, 'UNKNOWN_READING is NaN');
expectEq(hasReading(NaN), false, 'NaN is not a reading');
expectEq(hasReading(Infinity), false, 'Infinity is not a reading');
expectEq(hasReading('5'), false, 'string is not a reading');
expectEq(hasReading(null), false, 'null is not a reading');
expectEq(hasReading(undefined), false, 'undefined is not a reading');

// ── deviceFreshness (tri-state) + freshnessLabel ───────────────────
// The screen must distinguish "no time reported" from "reported time is old".
// A known-but-old device stamp is NOT proof the hardware is offline.
expectEq(deviceFreshness(null, now, FIVE_MIN), 'unknown', 'null time is unknown freshness');
expectEq(deviceFreshness(NaN, now, FIVE_MIN), 'unknown', 'NaN time is unknown freshness');
expectEq(deviceFreshness(now - 30_000, now, FIVE_MIN), 'recent', '30s old is recent');
expectEq(deviceFreshness(now - 10 * 60_000, now, FIVE_MIN), 'stale', '10min old is stale');
expectEq(deviceFreshness(now + 2_000, now, FIVE_MIN), 'recent', '2s future within tolerance is recent');
expectEq(deviceFreshness(now + 60_000, now, FIVE_MIN), 'stale', 'far-future stamp is not recent');

expectEq(freshnessLabel('unknown'), 'Unknown', 'unknown freshness label');
expectEq(freshnessLabel('recent'), 'Active', 'recent freshness label');
expectEq(freshnessLabel('stale'), 'Not recently seen', 'stale freshness label');
expectEq(freshnessLabel('stale').includes('Offline'), false, 'old stamp never claims definitive Offline');
expectEq(freshnessLabel('unknown').includes('Offline'), false, 'no time never claims definitive Offline');

// ── power: missing is explicit, never invented ─────────────────────
expectEq(toDeviceFields({ id: 'x' }).power, null, 'missing power is null');
expectEq(formatPower(null), '—', 'missing power renders em dash');
expectEq(toDeviceFields({ id: 'x', power: 'Battery 82%' }).power, 'Battery 82%', 'reported power preserved');
expectEq(toDeviceFields({ id: 'x', battery: 'Plugged' }).power, 'Plugged', 'device-reported power is preserved');
expectEq(formatPower(null).includes('Plugged'), false, 'no invented Plugged power');
expectEq(formatPower('Battery 82%'), 'Battery 82%', 'reported power formatted as-is');

if (failures > 0) {
  report(`${failures} device-record assertion(s) failed`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('device-record: all assertions passed');
