/**
 * Behavioral tests for the native home-screen widget state builder.
 *
 * Honesty rules locked by this test:
 *   - a barn SCENE centre never becomes a clinical or device-status verdict;
 *   - only an explicit reported status token may set normal/watch/alert;
 *   - a device-REPORTED temperature may carry only the legacy display band;
 *   - a stale alert is retained but never presented as a current alert;
 *   - a scene reading is labelled honestly as a scene reading.
 *
 * Pure module — run with the repo's installed tsx:
 *   node_modules/.bin/tsx src/utils/__tests__/widget-state.test.ts
 */
import {
  buildWidgetState,
  widgetStateSignature,
  type WidgetStateInput,
} from '../widget-state';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);
function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const NOW = 1_700_000_000_000;
const input = (patch: Partial<WidgetStateInput> = {}): WidgetStateInput => ({
  frame: null,
  alert: null,
  now: NOW,
  theme: 'light',
  ...patch,
});

// ── Scene readings never become a status verdict ─────────────────────
const scene = buildWidgetState(input({
  frame: {
    deviceId: 'pi-thermal-01',
    timestamp: NOW,
    center: 41.8,
    ambient: 39.9,
  },
}));
expectEq(scene.status.level, 'unknown', 'scene centre stays unknown status');
expectEq(scene.status.source, 'none', 'scene centre has no status source');
expectEq(scene.status.label, 'No reported device status', 'scene status label is honest');
expectEq(scene.reading.kind, 'scene', 'scene reading kind');
expectEq(scene.reading.value, 41.8, 'scene reading value');
expectEq(scene.reading.label, 'Scene centre', 'scene reading label');
expectEq(scene.status.label.includes('Fever'), false, 'scene is never labelled Fever');

// ── Explicit reported status tokens may drive the level ──────────────
const healthy = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW, healthStatus: 'NORMAL', center: 38 },
}));
expectEq(healthy.status.level, 'normal', 'explicit NORMAL is normal');
expectEq(healthy.status.source, 'healthStatus', 'healthStatus source retained');

const fever = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW, status: 'FEVER', center: 38 },
}));
expectEq(fever.status.level, 'alert', 'explicit FEVER is alert');
expectEq(fever.status.source, 'status', 'status source retained');
expectEq(fever.status.label, 'Reported: Fever', 'explicit status label');

const warned = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW, verdict: 'WARNING', center: 38 },
}));
expectEq(warned.status.level, 'watch', 'explicit WARNING is watch');
expectEq(warned.status.source, 'verdict', 'verdict source retained');

const critical = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW, healthStatus: 'CRITICAL', center: 38 },
}));
expectEq(critical.status.level, 'alert', 'explicit CRITICAL is alert');
expectEq(critical.status.source, 'healthStatus', 'explicit CRITICAL source retained');
expectEq(critical.status.label, 'Reported: Critical', 'explicit CRITICAL label');

const unknownToken = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW, status: 'BANANA', center: 38 },
}));
expectEq(unknownToken.status.level, 'unknown', 'unrecognised status token stays unknown');
expectEq(unknownToken.status.label, 'Reported: BANANA', 'unrecognised status token stays visible');

// ── Device-reported temperature carries only a legacy display band ───
const reportedTemperature = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW, temperature: 40.2 },
}));
expectEq(reportedTemperature.status.level, 'alert', 'reported temperature may carry legacy alert band');
expectEq(reportedTemperature.status.source, 'reportedTemperature', 'reported temperature source');
expectEq(reportedTemperature.status.label.includes('legacy'), true, 'temperature band is labelled legacy');
expectEq(reportedTemperature.reading.kind, 'temperature', 'reported temperature reading kind');
expectEq(reportedTemperature.reading.label, 'Reported temperature', 'reported temperature reading label');

// ── Alerts: current alerts may drive status; stale alerts may not ────
const currentAlert = buildWidgetState(input({
  alert: {
    id: 'a1',
    type: 'FEVER',
    severity: 'CRITICAL',
    message: 'Pen A needs checking',
    timestamp: NOW - 30_000,
  },
}));
expectEq(currentAlert.status.level, 'alert', 'current critical alert is alert');
expectEq(currentAlert.status.source, 'alert', 'current alert source');
expectEq(currentAlert.alert?.level, 'alert', 'current alert level');
expectEq(currentAlert.alert?.kind, 'thermal', 'current alert kind');
expectEq(currentAlert.alert?.typeToken, 'FEVER', 'current alert type token');
expectEq(currentAlert.alert?.message, 'Pen A needs checking', 'current alert message');

const staleAlert = buildWidgetState(input({
  alert: {
    id: 'a2',
    type: 'FEVER',
    severity: 'CRITICAL',
    message: 'Old event',
    timestamp: NOW - 60 * 60_000,
  },
}));
expectEq(staleAlert.status.level, 'unknown', 'stale alert never drives current status');
expectEq(staleAlert.alert?.id, 'a2', 'stale alert is retained');
expectEq(staleAlert.alert?.current, false, 'stale alert is marked not current');

// ── Freshness and stable signatures ──────────────────────────────────
const fresh = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW, center: 38 },
}));
expectEq(fresh.freshness, 'fresh', 'current frame is fresh');

const staleFrame = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW - 20 * 60_000, center: 38 },
}));
expectEq(staleFrame.freshness, 'stale', 'old frame is stale');

// ── sampleAt is null unless the frame carries a finite device time ───
// telemetryTime() returns NaN for an unparseable/missing timestamp, but the
// contract is `number | null`: a NaN would leak into the widget JSON, where it
// serialises to null and reads as "no timestamp" only by accident.
expectEq(fresh.sampleAt, NOW, 'a valid frame timestamp is retained as sampleAt');

const invalidTimestamp = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: 'not-a-timestamp', center: 38 },
}));
expectEq(invalidTimestamp.sampleAt, null, 'unparseable frame timestamp yields null sampleAt');

const missingTimestamp = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', center: 38 },
}));
expectEq(missingTimestamp.sampleAt, null, 'missing frame timestamp yields null sampleAt');

expectEq(
  JSON.parse(JSON.stringify(invalidTimestamp)).sampleAt,
  null,
  'invalid sampleAt stays JSON-safe as null',
);

// ── Device identity never borrows the PocketBase record id ───────────
const recordIdIdentity = buildWidgetState(input({
  frame: { id: 'pb_record_123', timestamp: NOW, center: 38 },
  deviceId: 'pi-thermal-01',
  deviceLabel: 'Barn camera',
}));
expectEq(recordIdIdentity.deviceId, 'pi-thermal-01', 'the record id is never used as the device identity');
expectEq(recordIdIdentity.deviceLabel, 'Barn camera', 'the selected identity survives a frame without a deviceId');

const frameDeviceIdWins = buildWidgetState(input({
  frame: { id: 'pb_record_123', deviceId: 's3-mic-01', timestamp: NOW, center: 38 },
  deviceId: 'pi-thermal-01',
}));
expectEq(frameDeviceIdWins.deviceId, 's3-mic-01', 'a frame deviceId still outranks the caller identity');

const noFrameWithIdentity = buildWidgetState(input({
  deviceId: 'pi-thermal-01',
  deviceLabel: 'Barn camera',
}));
expectEq(noFrameWithIdentity.deviceId, 'pi-thermal-01', 'a no-frame state retains the selected device id');
expectEq(noFrameWithIdentity.deviceLabel, 'Barn camera', 'a no-frame state retains the selected device label');

const first = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW - 1_000, center: 38 },
}));
const second = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW, center: 38 },
}));
expectEq(
  widgetStateSignature(first),
  widgetStateSignature(second),
  'timestamp-only telemetry changes do not trigger a widget write',
);
const changedReading = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW, center: 39 },
}));
expectEq(
  widgetStateSignature(first) === widgetStateSignature(changedReading),
  false,
  'a changed reading triggers a widget write',
);

// Tiny floating-point scene noise is not a material widget change. Only the
// signature is quantized to 0.1 °C; the state still carries exact display
// values for the native widget.
const sceneNoiseA = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW, center: 38.001 },
}));
const sceneNoiseB = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW + 1_000, center: 38.002 },
}));
expectEq(sceneNoiseA.reading.value, 38.001, 'scene display value A remains exact');
expectEq(sceneNoiseB.reading.value, 38.002, 'scene display value B remains exact');
expectEq(
  widgetStateSignature(sceneNoiseA),
  widgetStateSignature(sceneNoiseB),
  'sub-0.1 degree scene noise does not trigger a widget write',
);

const materialSceneChange = buildWidgetState(input({
  frame: { deviceId: 'pi-thermal-01', timestamp: NOW + 2_000, center: 38.2 },
}));
expectEq(
  widgetStateSignature(sceneNoiseA) === widgetStateSignature(materialSceneChange),
  false,
  'a material scene change still triggers a widget write',
);

if (failures > 0) {
  report(`${failures} widget-state assertion(s) failed`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('widget-state: all assertions passed');
