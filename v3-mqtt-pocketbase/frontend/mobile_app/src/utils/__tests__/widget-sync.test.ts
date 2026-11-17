/**
 * Behavioral tests for the native widget's pure sync helpers.
 *
 * These helpers decide which PocketBase rows are eligible for the widget and
 * keep the cache replacement safe. They deliberately avoid React, network and
 * Expo runtime dependencies so the contract can run under plain tsx.
 *
 * Run:
 *   node_modules/.bin/tsx src/utils/__tests__/widget-sync.test.ts
 */
import {
  isValidWidgetDeviceId,
  replaceWidgetStateFile,
  resolveWidgetIdentity,
  selectNewestAlert,
  selectNewestTelemetry,
  selectWidgetDevice,
  WIDGET_DEVICE_ID_PATTERN,
  type WidgetStateFileAdapter,
} from '../widget-sync';

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

// ── Newest telemetry is chosen by device time, not server sort order ─────
const newestTelemetry = selectNewestTelemetry([
  { id: 'older-iso', deviceId: 'pi-thermal-01', timestamp: '2023-11-14T22:12:40.000Z' },
  { id: 'newest-seconds', deviceId: 'pi-thermal-01', timestamp: 1_700_000_001 },
  { id: 'newest-milliseconds', deviceId: 'pi-thermal-01', timestamp: NOW + 2_000 },
  { id: 'invalid', deviceId: 'pi-thermal-01', timestamp: 'not-a-timestamp' },
]);

expectEq(newestTelemetry?.id, 'newest-milliseconds', 'newest telemetry is selected across mixed timestamp units');
expectEq(selectNewestTelemetry([]), null, 'an empty telemetry list has no selected frame');
expectEq(
  selectNewestTelemetry([{ id: 'invalid', timestamp: 'not-a-timestamp' }]),
  null,
  'telemetry without a usable acquisition time is not selected',
);

// ── Telemetry can be scoped locally to one device ─────────────────────────
// The caller also scopes the PocketBase query by device; this second local
// check prevents a widened or malformed response from letting another device's
// newer telemetry drive the widget.
const scopedTelemetry = selectNewestTelemetry(
  [
    { id: 'mine', deviceId: 'pi-thermal-01', timestamp: NOW },
    { id: 'other-device', deviceId: 's3-mic-01', timestamp: NOW + 9_999_999 },
    { id: 'unscoped', timestamp: NOW + 9_999_999 },
  ],
  'pi-thermal-01',
);
expectEq(scopedTelemetry?.id, 'mine', "another device's newer telemetry is never selected");
expectEq(
  selectNewestTelemetry([{ id: 'unscoped', timestamp: NOW }], 'pi-thermal-01'),
  null,
  'telemetry without a device identity is never selected for a device',
);
expectEq(
  selectNewestTelemetry([{ id: 'other', deviceId: 's3-mic-01', timestamp: NOW }], 'pi-thermal-01'),
  null,
  'telemetry from another device is never selected',
);
// Callers that omit the expected device keep the previous unscoped behavior.
expectEq(
  selectNewestTelemetry([
    { id: 'a', deviceId: 'pi-thermal-01', timestamp: NOW },
    { id: 'b', deviceId: 's3-mic-01', timestamp: NOW + 1_000 },
  ])?.id,
  'b',
  'telemetry selection stays unscoped when no expected device is given',
);

// ── Equal device times break deterministically: arrival, then record id ───
// `created` is PocketBase's arrival time, NOT the acquisition time; it is used
// only to break a tie between rows that already share the same device time.
const telemetryArrivalTie = selectNewestTelemetry([
  { id: 'a', deviceId: 'd', timestamp: NOW, created: '2023-11-14T22:13:20.000Z' },
  { id: 'b', deviceId: 'd', timestamp: NOW, created: '2023-11-14T22:13:21.000Z' },
]);
expectEq(telemetryArrivalTie?.id, 'b', 'equal telemetry times prefer the later arrival');

const telemetryIdTie = selectNewestTelemetry([
  { id: 'a', deviceId: 'd', timestamp: NOW, created: '2023-11-14T22:13:20.000Z' },
  { id: 'z', deviceId: 'd', timestamp: NOW, created: '2023-11-14T22:13:20.000Z' },
]);
expectEq(telemetryIdTie?.id, 'z', 'equal telemetry arrival prefers the larger record id');

const alertArrivalTie = selectNewestAlert(
  [
    { id: 'a', deviceId: 'd', timestamp: NOW, created: '2023-11-14T22:13:20.000Z' },
    { id: 'b', deviceId: 'd', timestamp: NOW, created: '2023-11-14T22:13:21.000Z' },
  ],
  'd',
);
expectEq(alertArrivalTie?.id, 'b', 'equal alert times prefer the later arrival');

const alertIdTie = selectNewestAlert(
  [
    { id: 'a', deviceId: 'd', timestamp: NOW, created: '2023-11-14T22:13:20.000Z' },
    { id: 'z', deviceId: 'd', timestamp: NOW, created: '2023-11-14T22:13:20.000Z' },
  ],
  'd',
);
expectEq(alertIdTie?.id, 'z', 'equal alert arrival prefers the larger record id');

// ── Alerts are newest-first and scoped to the selected device ─────────────
const newestScopedAlert = selectNewestAlert([
  { id: 'older-scoped', deviceId: 'pi-thermal-01', timestamp: NOW - 2_000 },
  { id: 'newer-other-device', deviceId: 's3-mic-01', timestamp: NOW + 5_000 },
  { id: 'newest-scoped', deviceId: 'pi-thermal-01', timestamp: NOW + 1_000 },
  { id: 'unscoped', timestamp: NOW + 10_000 },
], 'pi-thermal-01');

expectEq(newestScopedAlert?.id, 'newest-scoped', 'newest alert is selected across mixed timestamp units');
expectEq(
  selectNewestAlert(
    [{ id: 'created-fallback', deviceId: 'pi-thermal-01', timestamp: 'not-a-time', created: NOW }],
    'pi-thermal-01',
  )?.id,
  'created-fallback',
  'an unusable alert timestamp falls back to the record arrival time',
);
expectEq(
  selectNewestAlert([{ id: 'other-device', deviceId: 's3-mic-01', timestamp: NOW }], 'pi-thermal-01'),
  null,
  'an alert from another device is never selected',
);
expectEq(
  selectNewestAlert([{ id: 'unscoped', timestamp: NOW }], 'pi-thermal-01'),
  null,
  'an alert without a device identity is never selected for a device',
);

// ── One deterministic device is selected ──────────────────────────────────
// Newest usable `lastSeen` wins, across mixed second/millisecond units.
const newestDevice = selectWidgetDevice([
  { id: 'old-ms', deviceId: 'old-ms', lastSeen: NOW - 100_000 },
  { id: 'new-seconds', deviceId: 'new-seconds', lastSeen: (NOW + 100_000) / 1000 },
  { id: 'untimed', deviceId: 'untimed', lastSeen: 'not-a-time' },
]);
expectEq(newestDevice?.deviceId, 'new-seconds', 'the newest device is selected across mixed lastSeen units');

// An invalid identity is never selected, even when it reports the newest time.
const validOverNewestInvalid = selectWidgetDevice([
  { deviceId: 'good-1', lastSeen: NOW },
  { deviceId: 'bad id!', lastSeen: NOW + 10_000_000 },
]);
expectEq(validOverNewestInvalid?.deviceId, 'good-1', 'an invalid device identity is never selected');

// Equal times break by ascending deviceId, independent of server order.
const tieBroken = selectWidgetDevice([
  { deviceId: 'zeta', lastSeen: NOW },
  { deviceId: 'alpha', lastSeen: NOW },
]);
expectEq(tieBroken?.deviceId, 'alpha', 'equal lastSeen ties break by ascending deviceId');

// Duplicate logical device IDs are possible. Equal device ids and equal
// acquisition times still need a deterministic record-level fallback.
const duplicateDeviceTie = selectWidgetDevice([
  { id: 'a', deviceId: 'pi-thermal-01', name: 'Older record', lastSeen: NOW },
  { id: 'z', deviceId: 'pi-thermal-01', name: 'Newer record', lastSeen: NOW },
]);
expectEq(
  duplicateDeviceTie?.record.id,
  'z',
  'equal logical device ids and times break by descending record id',
);

// An untimed device ranks after every timed one.
const timedBeatsUntimed = selectWidgetDevice([
  { deviceId: 'untimed', lastSeen: 'nope' },
  { deviceId: 'timed', lastSeen: NOW - 10_000_000 },
]);
expectEq(timedBeatsUntimed?.deviceId, 'timed', 'a timed device outranks an untimed one');

// Empty and all-invalid lists select nothing.
expectEq(selectWidgetDevice([]), null, 'an empty device list selects nothing');
expectEq(
  selectWidgetDevice([{ deviceId: 'bad id' }, { deviceId: 42 }, { id: 'x' }]),
  null,
  'a list with no valid device identity selects nothing',
);

// The returned identity is trimmed.
expectEq(
  selectWidgetDevice([{ deviceId: '  pi-thermal-01  ', lastSeen: NOW }])?.deviceId,
  'pi-thermal-01',
  'the selected device identity is trimmed',
);

// The friendly label prefers name → deviceName → label, else empty.
expectEq(
  selectWidgetDevice([
    { deviceId: 'd1', name: 'Barn camera', deviceName: 'Other', label: 'Third', lastSeen: NOW },
  ])?.label,
  'Barn camera',
  'the device name supplies the friendly label',
);
expectEq(
  selectWidgetDevice([{ deviceId: 'd2', deviceName: 'Barn mic', lastSeen: NOW }])?.label,
  'Barn mic',
  'a missing name falls back to deviceName',
);
expectEq(
  selectWidgetDevice([{ deviceId: 'd3', lastSeen: NOW }])?.label,
  '',
  'a device record without a label yields an empty label',
);

// Identity regex boundary: 1..64 filter-safe characters, leading alphanumeric.
const id64 = `a${'b'.repeat(63)}`;
const id65 = `a${'b'.repeat(64)}`;
expectEq(WIDGET_DEVICE_ID_PATTERN.test(id64), true, 'a 64-character device id is valid');
expectEq(WIDGET_DEVICE_ID_PATTERN.test(id65), false, 'a 65-character device id is invalid');
expectEq(isValidWidgetDeviceId(id64), true, 'isValidWidgetDeviceId accepts 64 characters');
expectEq(isValidWidgetDeviceId(id65), false, 'isValidWidgetDeviceId rejects 65 characters');
expectEq(isValidWidgetDeviceId('-leading'), false, 'a leading non-alphanumeric device id is invalid');
expectEq(isValidWidgetDeviceId('has space'), false, 'a device id with a space is invalid');
expectEq(isValidWidgetDeviceId('  padded  '), true, 'a padded but otherwise valid device id is accepted');
expectEq(isValidWidgetDeviceId(''), false, 'an empty device id is invalid');
expectEq(isValidWidgetDeviceId(42), false, 'a non-string device id is invalid');

// ── A missing frame keeps the last known device identity ─────────────────
const previousIdentity = { deviceId: 'pi-thermal-01', deviceLabel: 'Barn camera' };
const noFrameIdentity = resolveWidgetIdentity(null, previousIdentity);

expectEq(noFrameIdentity.deviceId, 'pi-thermal-01', 'a missing frame retains the last known device id');
expectEq(noFrameIdentity.deviceLabel, 'Barn camera', 'a missing frame retains the last known device label');

const changedDeviceIdentity = resolveWidgetIdentity(
  { deviceId: 's3-mic-01' },
  previousIdentity,
);
expectEq(changedDeviceIdentity.deviceId, 's3-mic-01', 'a new frame replaces the device id');
expectEq(
  changedDeviceIdentity.deviceLabel,
  's3-mic-01',
  'the previous device label is not reused for a different device',
);

// ── Cache replacement never destroys the last valid file on failure ───────
class MemoryWidgetFiles implements WidgetStateFileAdapter {
  readonly files = new Map<string, string>();
  readonly operations: string[] = [];
  failWrite = false;
  failMove = false;

  async writeFile(path: string, contents: string): Promise<void> {
    this.operations.push(`write:${path}`);
    if (this.failWrite) throw new Error('write failed');
    this.files.set(path, contents);
  }

  async moveFile(source: string, destination: string): Promise<void> {
    this.operations.push(`move:${source}->${destination}`);
    if (this.failMove) throw new Error('move failed');
    const contents = this.files.get(source);
    if (contents === undefined) throw new Error('missing source');
    this.files.set(destination, contents);
    this.files.delete(source);
  }

  async deleteFile(path: string): Promise<void> {
    this.operations.push(`delete:${path}`);
    this.files.delete(path);
  }
}

async function runDurableReplacementTests(): Promise<void> {
  const targetPath = '/documents/pigpulse_widget_state.json';
  const temporaryPath = `${targetPath}.tmp`;

  const successfulFiles = new MemoryWidgetFiles();
  successfulFiles.files.set(targetPath, 'old-valid-json');
  await replaceWidgetStateFile(successfulFiles, targetPath, 'new-valid-json');
  expectEq(successfulFiles.files.get(targetPath), 'new-valid-json', 'a successful replacement publishes the new JSON');
  expectEq(successfulFiles.files.has(temporaryPath), false, 'a successful replacement removes the temporary file');
  expectEq(
    successfulFiles.operations.includes(`delete:${targetPath}`),
    false,
    'the canonical target is never pre-deleted',
  );

  const failedWriteFiles = new MemoryWidgetFiles();
  failedWriteFiles.files.set(targetPath, 'last-valid-json');
  failedWriteFiles.failWrite = true;
  let failedWrite = false;
  try {
    await replaceWidgetStateFile(failedWriteFiles, targetPath, 'replacement-json');
  } catch {
    failedWrite = true;
  }
  expectEq(failedWrite, true, 'a temporary write failure is reported');
  expectEq(failedWriteFiles.files.get(targetPath), 'last-valid-json', 'a write failure retains the last valid JSON');

  const failedMoveFiles = new MemoryWidgetFiles();
  failedMoveFiles.files.set(targetPath, 'last-valid-json');
  failedMoveFiles.failMove = true;
  let failedMove = false;
  try {
    await replaceWidgetStateFile(failedMoveFiles, targetPath, 'replacement-json');
  } catch {
    failedMove = true;
  }
  expectEq(failedMove, true, 'a replacement move failure is reported');
  expectEq(failedMoveFiles.files.get(targetPath), 'last-valid-json', 'a move failure retains the last valid JSON');
  expectEq(failedMoveFiles.files.has(temporaryPath), false, 'a failed replacement cleans up its temporary file');
}

runDurableReplacementTests()
  .then(() => {
    if (failures > 0) {
      report(`${failures} widget-sync assertion(s) failed`);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log('widget-sync: all assertions passed');
  })
  .catch((error: unknown) => {
    report(`widget-sync durable replacement test failed: ${String(error)}`);
    process.exit(1);
  });
