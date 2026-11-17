/**
 * Behavioral tests for the React-free widget polling controller.
 *
 * The controller drives the whole widget cycle with injected dependencies so
 * the contract can be exercised under the repo's plain tsx runner with real
 * controller behavior and fake adapters (no mocked controller internals).
 *
 * Locked by this test:
 *   - the farmer setup / source is resolved BEFORE the first list request, and
 *     a malformed (null) source performs NO list request (fail closed);
 *   - one deterministic device is selected; telemetry and alert queries are
 *     scoped to that device and the newest rows are chosen locally;
 *   - polling is single-flight (cycles never overlap);
 *   - every list request carries a real AbortSignal that a deadline aborts;
 *   - a result arriving after stop/restart never writes;
 *   - only a material visible-state change writes the cache file, once;
 *   - a failed write retains the last valid file and the accepted signature,
 *     and never overlaps another write;
 *   - cleanup stops the timer and aborts the in-flight request.
 *
 * Run:
 *   node_modules/.bin/tsx src/utils/__tests__/widget-poll-controller.test.ts
 */
import {
  createWidgetPollController,
  type WidgetPollListAdapter,
  type WidgetPollListOptions,
  type WidgetPollSourceProvider,
} from '../widget-poll-controller';
import type { WidgetStateFileAdapter } from '../widget-sync';
import type { WidgetTheme } from '../widget-state';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);
function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
function expectTrue(actual: boolean, label: string) {
  if (actual !== true) {
    failures += 1;
    report(`FAIL ${label}: expected true`);
  }
}

const NOW = 1_700_000_000_000;
const BASE = 'http://192.168.69.1:8090';
const TARGET = '/documents/pigpulse_widget_state.json';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Handler = (
  options: WidgetPollListOptions,
) => Promise<readonly Record<string, unknown>[]>;

class FakeList implements WidgetPollListAdapter {
  readonly calls: { collection: string; options: WidgetPollListOptions }[] = [];
  handlers: Record<string, Handler> = {};

  async list(
    collection: string,
    options: WidgetPollListOptions,
  ): Promise<readonly Record<string, unknown>[]> {
    this.calls.push({ collection, options });
    const handler = this.handlers[collection];
    return handler ? handler(options) : [];
  }
}

class FakeFiles implements WidgetStateFileAdapter {
  readonly files = new Map<string, string>();
  writeAttempts = 0;
  published = 0;
  maxConcurrentOps = 0;
  private activeOps = 0;
  failWrite = false;
  failMove = false;

  private enter(): void {
    this.activeOps += 1;
    this.maxConcurrentOps = Math.max(this.maxConcurrentOps, this.activeOps);
  }

  private exit(): void {
    this.activeOps -= 1;
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.enter();
    this.writeAttempts += 1;
    try {
      if (this.failWrite) throw new Error('write failed');
      this.files.set(path, contents);
    } finally {
      this.exit();
    }
  }

  async moveFile(source: string, destination: string): Promise<void> {
    this.enter();
    try {
      if (this.failMove) throw new Error('move failed');
      const contents = this.files.get(source);
      if (contents === undefined) throw new Error('missing source');
      this.files.set(destination, contents);
      this.files.delete(source);
      this.published += 1;
    } finally {
      this.exit();
    }
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
  }
}

interface ControllerHarness {
  controller: ReturnType<typeof createWidgetPollController>;
  list: FakeList;
  files: FakeFiles;
  errors: unknown[];
}

function buildController(over: {
  list?: FakeList;
  files?: FakeFiles;
  source?: WidgetPollSourceProvider;
  theme?: () => WidgetTheme;
  intervalMs?: number;
  deadlineMs?: number;
  onError?: (error: unknown) => void;
} = {}): ControllerHarness {
  const list = over.list ?? new FakeList();
  const files = over.files ?? new FakeFiles();
  const errors: unknown[] = [];
  const controller = createWidgetPollController({
    list,
    files,
    targetPath: TARGET,
    source: over.source ?? { resolve: () => BASE },
    now: () => NOW,
    theme: over.theme ?? (() => 'light'),
    onError:
      over.onError ??
      ((error) => {
        errors.push(error);
      }),
    ...(over.intervalMs !== undefined ? { intervalMs: over.intervalMs } : {}),
    ...(over.deadlineMs !== undefined ? { deadlineMs: over.deadlineMs } : {}),
  });
  return { controller, list, files, errors };
}

/** Await a promise and classify settlement without throwing. */
async function settle(promise: Promise<void>): Promise<'resolved' | 'rejected'> {
  try {
    await promise;
    return 'resolved';
  } catch {
    return 'rejected';
  }
}

function writtenState(files: FakeFiles): Record<string, unknown> {
  const raw = files.files.get(TARGET);
  if (raw === undefined) throw new Error('no widget state was written');
  return JSON.parse(raw) as Record<string, unknown>;
}

// ── 1. Setup/source is resolved before the first list; malformed = no list ──
async function testSourcePrep(): Promise<void> {
  const timeline: string[] = [];
  const list = new FakeList();
  list.handlers = {
    devices: async () => {
      timeline.push('list:devices');
      return [];
    },
  };
  const source: WidgetPollSourceProvider = {
    resolve: async () => {
      timeline.push('resolve:start');
      await delay(1);
      timeline.push('resolve:end');
      return BASE;
    },
  };
  const harness = buildController({ list, source });
  await harness.controller.refresh();
  harness.controller.stop();

  expectTrue(timeline.includes('resolve:start'), 'the source is prepared');
  expectTrue(
    timeline.indexOf('resolve:end') < timeline.indexOf('list:devices'),
    'setup/source resolves before the first list request',
  );

  const malformed = new FakeList();
  const malformedHarness = buildController({ list: malformed, source: { resolve: () => null } });
  await malformedHarness.controller.refresh();
  malformedHarness.controller.stop();
  expectEq(
    malformed.calls.length,
    0,
    'a malformed (null) source performs no list request',
  );
}

// ── 2. Deterministic device selection + scoped, locally-newest queries ──────
async function testDeviceSelectionAndScoping(): Promise<void> {
  const list = new FakeList();
  list.handlers = {
    devices: async () => [
      { id: 'd1', deviceId: 'pi-thermal-01', name: 'Barn camera', lastSeen: NOW },
      { id: 'd2', deviceId: 's3-mic-01', name: 'Barn mic', lastSeen: 1_699_999_950 },
      { id: 'd3', deviceId: 'bad id!', name: 'Broken', lastSeen: NOW + 10_000_000 },
    ],
    // Deliberately ascending: server sort order is NOT authoritative.
    telemetry: async () => [
      { id: 'old', deviceId: 'pi-thermal-01', timestamp: NOW - 60_000, center: 37.0 },
      { id: 'mid', deviceId: 'pi-thermal-01', timestamp: NOW - 30_000, center: 38.0 },
      { id: 'new', deviceId: 'pi-thermal-01', timestamp: NOW - 1_000, center: 39.4 },
    ],
    alerts: async () => [
      { id: 'other', deviceId: 's3-mic-01', type: 'FEVER', severity: 'CRITICAL', timestamp: NOW },
      {
        id: 'mine',
        deviceId: 'pi-thermal-01',
        type: 'FEVER',
        severity: 'CRITICAL',
        timestamp: NOW - 20_000,
        message: 'Pen A needs checking',
      },
    ],
  };
  const harness = buildController({ list, theme: () => 'dark' });
  await harness.controller.refresh();
  harness.controller.stop();

  const devicesCalls = list.calls.filter((c) => c.collection === 'devices');
  const telemetryCalls = list.calls.filter((c) => c.collection === 'telemetry');
  const alertsCalls = list.calls.filter((c) => c.collection === 'alerts');
  expectEq(devicesCalls.length, 2, 'devices are queried once per timestamp-unit branch');
  expectEq(telemetryCalls.length, 2, 'telemetry is read as two unit-disjoint branches');
  expectEq(alertsCalls.length, 2, 'alerts are read as two unit-disjoint branches');

  const secondsFilter = "deviceId='pi-thermal-01'&&timestamp<1000000000000";
  const msFilter = "deviceId='pi-thermal-01'&&timestamp>=1000000000000";
  expectTrue(
    telemetryCalls.some((c) => c.options.filter === secondsFilter) &&
      telemetryCalls.some((c) => c.options.filter === msFilter),
    'telemetry branches are scoped to the selected device and each unit range',
  );
  expectTrue(
    alertsCalls.some((c) => c.options.filter === secondsFilter) &&
      alertsCalls.some((c) => c.options.filter === msFilter),
    'alert branches are scoped to the selected device and each unit range',
  );
  expectTrue(
    telemetryCalls.every((c) => (c.options.perPage ?? 0) >= 5 && (c.options.perPage ?? 0) <= 20),
    'every telemetry branch stays inside per-page 5..20',
  );
  expectTrue(
    alertsCalls.every((c) => c.options.perPage === 50),
    'every alert branch requests up to 50 rows',
  );

  const state = writtenState(harness.files);
  expectEq(state.theme, 'dark', 'the resolved theme is written');
  expectEq(state.deviceId, 'pi-thermal-01', 'the newest valid device is selected');
  expectEq(state.deviceLabel, 'Barn camera', 'the device record supplies the friendly label');
  expectEq((state.reading as { value: number }).value, 39.4, 'the locally-newest telemetry row is used');
  expectEq(state.freshness, 'fresh', 'freshness is derived from the injected now');
  expectEq((state.alert as { id: string }).id, 'mine', "another device's newer alert is never used");
}

// ── 3. Single-flight polling: cycles never overlap ─────────────────────────
async function testSingleFlight(): Promise<void> {
  const list = new FakeList();
  let resolveCalls = 0;
  let concurrentResolves = 0;
  let maxConcurrentResolves = 0;
  const source: WidgetPollSourceProvider = {
    resolve: async () => {
      resolveCalls += 1;
      concurrentResolves += 1;
      maxConcurrentResolves = Math.max(maxConcurrentResolves, concurrentResolves);
      await delay(20);
      concurrentResolves -= 1;
      return BASE;
    },
  };
  const harness = buildController({ list, source, intervalMs: 5 });
  harness.controller.start();
  await delay(200);
  harness.controller.stop();

  expectTrue(resolveCalls >= 2, 'the poll cadence repeats while running');
  expectEq(maxConcurrentResolves, 1, 'poll cycles never overlap (single-flight)');
}

// ── 4. A request deadline aborts a real, still-active AbortSignal ───────────
async function testDeadlineAbort(): Promise<void> {
  const list = new FakeList();
  let captured: AbortSignal | null = null;
  let abortedWhileReading = false;
  list.handlers = {
    devices: (options) => {
      captured = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          abortedWhileReading = true;
          reject(new Error('aborted'));
        });
      });
    },
  };
  const harness = buildController({ list, deadlineMs: 15 });
  await harness.controller.refresh();
  harness.controller.stop();

  expectTrue(captured !== null, 'the list adapter received a signal');
  const signal = captured as AbortSignal | null;
  expectTrue(signal instanceof AbortSignal, 'the list adapter received a real AbortSignal');
  expectEq(signal?.aborted, true, 'the request deadline aborts the signal');
  expectTrue(abortedWhileReading, 'the abort fires while the adapter is still reading the body');
  expectEq(harness.files.writeAttempts, 0, 'an aborted cycle writes nothing');
  expectTrue(harness.errors.length >= 1, 'the abort is reported through onError');
}

// ── 5. A result arriving after stop never writes; refresh() is then inert ───
async function testGenerationGuardAfterStop(): Promise<void> {
  const list = new FakeList();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  list.handlers = {
    devices: async () => {
      await gate;
      return [{ deviceId: 'pi-thermal-01', lastSeen: NOW }];
    },
    telemetry: async () => [{ deviceId: 'pi-thermal-01', timestamp: NOW, center: 38 }],
    alerts: async () => [],
  };
  const harness = buildController({ list });
  const pending = harness.controller.refresh();
  harness.controller.stop();
  release();
  await pending;

  expectEq(harness.files.writeAttempts, 0, 'a result arriving after stop never writes');
  const callsBefore = list.calls.length;
  await harness.controller.refresh();
  expectEq(list.calls.length, callsBefore, 'refresh() after cleanup performs no list');
}

// ── 5b. A stop/start during an in-flight cycle starts a fresh cycle ────────
async function testRestartDuringInflightStartsFreshCycle(): Promise<void> {
  const list = new FakeList();
  let resolveCalls = 0;
  let deviceCalls = 0;
  let releaseFirst = () => {};
  let markFirstStarted = () => {};
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve;
  });

  list.handlers = {
    devices: async () => {
      deviceCalls += 1;
      if (deviceCalls === 1) {
        markFirstStarted();
        await firstGate;
        return [{ deviceId: 'pi-thermal-01', lastSeen: NOW }];
      }
      return [{ deviceId: 'pi-thermal-01', lastSeen: NOW }];
    },
    telemetry: async () => [{ deviceId: 'pi-thermal-01', timestamp: NOW, center: 39.4 }],
    alerts: async () => [],
  };

  const harness = buildController({
    list,
    source: {
      resolve: async () => {
        resolveCalls += 1;
        return BASE;
      },
    },
    intervalMs: 10_000,
  });
  harness.controller.start();
  await firstStarted;

  harness.controller.stop();
  harness.controller.start();
  await delay(30);
  const callsAfterRestart = deviceCalls;

  releaseFirst();
  await delay(30);
  harness.controller.stop();

  expectEq(
    resolveCalls,
    2,
    'stop/start during an in-flight cycle starts a fresh cycle immediately',
  );
  expectEq(
    callsAfterRestart,
    4,
    'the stale and fresh cycles each issue both device-unit branches',
  );
  expectEq(harness.files.published, 1, 'the fresh cycle publishes while the stale cycle is discarded');
  if (harness.files.published > 0) {
    expectEq(
      (writtenState(harness.files).reading as { value: number }).value,
      39.4,
      'the fresh cycle publishes its own reading',
    );
  }
}

// ── 6. Material-write gate ─────────────────────────────────────────────────
async function testMaterialWriteGate(): Promise<void> {
  const list = new FakeList();
  list.handlers = {
    devices: async () => [{ deviceId: 'pi-thermal-01', lastSeen: NOW }],
    telemetry: async () => [{ deviceId: 'pi-thermal-01', timestamp: NOW, center: 38.0 }],
    alerts: async () => [],
  };
  const harness = buildController({ list });
  await harness.controller.refresh();
  expectEq(harness.files.published, 1, 'the initial widget state is written once');

  list.handlers.telemetry = async () => [
    { deviceId: 'pi-thermal-01', timestamp: NOW + 1_000, center: 38.0 },
  ];
  await harness.controller.refresh();
  expectEq(harness.files.writeAttempts, 1, 'a timestamp-only change does not write');

  list.handlers.telemetry = async () => [
    { deviceId: 'pi-thermal-01', timestamp: NOW + 2_000, center: 39.4 },
  ];
  await harness.controller.refresh();
  expectEq(harness.files.published, 2, 'a material reading change writes again');
  expectEq(
    (writtenState(harness.files).reading as { value: number }).value,
    39.4,
    'the material change is published',
  );
}

// ── 7. A failed write retains the file and signature, never overlaps ───────
async function testFailedWriteRetention(): Promise<void> {
  const list = new FakeList();
  list.handlers = {
    devices: async () => [{ deviceId: 'pi-thermal-01', lastSeen: NOW }],
    telemetry: async () => [{ deviceId: 'pi-thermal-01', timestamp: NOW, center: 38.0 }],
    alerts: async () => [],
  };
  const harness = buildController({ list });
  await harness.controller.refresh();
  expectEq(harness.files.published, 1, 'the first state is published');

  harness.files.failMove = true;
  list.handlers.telemetry = async () => [
    { deviceId: 'pi-thermal-01', timestamp: NOW + 5_000, center: 39.4 },
  ];
  await harness.controller.refresh();
  expectEq(harness.files.published, 1, 'a failed write publishes nothing');
  expectEq(
    (writtenState(harness.files).reading as { value: number }).value,
    38.0,
    'a failed write retains the last valid file',
  );

  // The accepted signature is still 38.0, so re-presenting that SAME material
  // state is suppressed as a redundant rewrite.
  list.handlers.telemetry = async () => [{ deviceId: 'pi-thermal-01', timestamp: NOW, center: 38.0 }];
  const attemptsBefore = harness.files.writeAttempts;
  await harness.controller.refresh();
  expectEq(
    harness.files.writeAttempts,
    attemptsBefore,
    'the retained accepted signature suppresses a redundant rewrite',
  );

  // With writes restored, the SAME un-published 39.4 state must be retried and
  // published — the failed write must not have accepted the signature.
  harness.files.failMove = false;
  list.handlers.telemetry = async () => [
    { deviceId: 'pi-thermal-01', timestamp: NOW + 5_000, center: 39.4 },
  ];
  await harness.controller.refresh();
  expectTrue(
    harness.files.writeAttempts > attemptsBefore,
    'the retried state is written again once writes are restored',
  );
  expectEq(harness.files.published, 2, 'the retried material state publishes successfully');
  expectEq(
    (writtenState(harness.files).reading as { value: number }).value,
    39.4,
    'the retried state replaces the retained file',
  );
  expectEq(harness.files.maxConcurrentOps, 1, 'writes never overlap');
}

// ── 8. Cleanup stops the timer and aborts the in-flight request ────────────
async function testCleanup(): Promise<void> {
  const list = new FakeList();
  list.handlers = { devices: async () => [] };
  const harness = buildController({ list, intervalMs: 5 });
  harness.controller.start();
  await delay(40);
  harness.controller.stop();
  const callsAfterStop = list.calls.length;
  await delay(60);
  expectEq(list.calls.length, callsAfterStop, 'cleanup stops the poll timer');

  const abortList = new FakeList();
  let captured: AbortSignal | null = null;
  abortList.handlers = {
    devices: (options) => {
      captured = options.signal;
      return new Promise(() => {
        /* never resolves without the abort */
      });
    },
  };
  const abortHarness = buildController({ list: abortList, intervalMs: 5 });
  abortHarness.controller.start();
  await delay(25);
  abortHarness.controller.stop();
  const capturedSignal = captured as AbortSignal | null;
  expectEq(capturedSignal?.aborted, true, 'cleanup aborts the in-flight request');
}

// ── 10. A widened telemetry response cannot leak another device ────────────
async function testTelemetryDeviceScope(): Promise<void> {
  const list = new FakeList();
  list.handlers = {
    devices: async () => [{ deviceId: 'pi-thermal-01', lastSeen: NOW }],
    telemetry: async () => [
      { id: 'mine', deviceId: 'pi-thermal-01', timestamp: NOW, center: 38.0 },
      { id: 'other-device', deviceId: 's3-mic-01', timestamp: NOW + 9_999, center: 45.5 },
      { id: 'unscoped', timestamp: NOW + 9_999, center: 46.6 },
    ],
    alerts: async () => [],
  };
  const harness = buildController({ list });
  await harness.controller.refresh();
  harness.controller.stop();

  expectEq(
    (writtenState(harness.files).reading as { value: number }).value,
    38.0,
    "a widened response's newer other-device telemetry never drives the widget",
  );
}

// ── 9. The resolved base origin reaches every list call, once per cycle ────
async function testBaseOriginPropagation(): Promise<void> {
  const list = new FakeList();
  list.handlers = {
    devices: async () => [{ deviceId: 'pi-thermal-01', lastSeen: NOW }],
    telemetry: async () => [{ deviceId: 'pi-thermal-01', timestamp: NOW, center: 38 }],
    alerts: async () => [],
  };
  let resolveCalls = 0;
  const source: WidgetPollSourceProvider = {
    resolve: async () => {
      resolveCalls += 1;
      return BASE;
    },
  };
  const harness = buildController({ list, source });
  await harness.controller.refresh();
  harness.controller.stop();

  expectEq(resolveCalls, 1, 'the source is resolved exactly once per cycle');
  const scoped = list.calls.filter(
    (c) => c.collection === 'devices' || c.collection === 'telemetry' || c.collection === 'alerts',
  );
  expectTrue(scoped.length >= 3, 'devices, telemetry and alerts are all queried');
  expectTrue(
    scoped.every((c) => c.options.baseUrl === BASE),
    'every list call carries the resolved base origin',
  );
}

// ── 10b. Device reads are unit-disjoint before local selection ─────────────
async function testDeviceUnitSplitScopedReads(): Promise<void> {
  const list = new FakeList();
  list.handlers = {
    devices: async (options) => {
      if (options.filter === 'lastSeen<1000000000000') {
        return [{ id: 'seconds', deviceId: 'seconds-device', lastSeen: 1_700_000_500 }];
      }
      if (options.filter === 'lastSeen>=1000000000000') {
        return [{ id: 'milliseconds', deviceId: 'milliseconds-device', lastSeen: NOW }];
      }
      return [
        { id: 'seconds', deviceId: 'seconds-device', lastSeen: 1_700_000_500 },
        { id: 'milliseconds', deviceId: 'milliseconds-device', lastSeen: NOW },
      ];
    },
    telemetry: async () => [
      { id: 'seconds-telemetry', deviceId: 'seconds-device', timestamp: NOW, center: 41.0 },
      { id: 'milliseconds-telemetry', deviceId: 'milliseconds-device', timestamp: NOW, center: 36.0 },
    ],
    alerts: async () => [],
  };

  const harness = buildController({ list });
  await harness.controller.refresh();
  harness.controller.stop();

  const deviceCalls = list.calls.filter((c) => c.collection === 'devices');
  expectEq(deviceCalls.length, 2, 'devices are read as two unit-disjoint branches');
  expectTrue(
    deviceCalls.some((c) => c.options.filter === 'lastSeen<1000000000000') &&
      deviceCalls.some((c) => c.options.filter === 'lastSeen>=1000000000000'),
    'device branches use exact second and millisecond lastSeen ranges',
  );
  expectTrue(
    deviceCalls.every((c) => c.options.perPage === 50),
    'every device branch requests up to 50 rows',
  );
  expectEq(
    writtenState(harness.files).deviceId,
    'seconds-device',
    'the newest device is selected after merging both unit branches',
  );
}

// ── 11. Unit-split scoped reads: neither unit's newer row can hide ─────────
async function testUnitSplitScopedReads(): Promise<void> {
  // A newer SECONDS row must win even though its raw value sorts numerically
  // below every millisecond row, so a single raw-sorted query would hide it.
  const secondsList = new FakeList();
  secondsList.handlers = {
    devices: async () => [{ deviceId: 'pi-thermal-01', lastSeen: NOW }],
    telemetry: async (options) =>
      options.filter?.includes('<1000000000000')
        ? [{ id: 'seconds-new', deviceId: 'pi-thermal-01', timestamp: 1_700_000_500, center: 41.0 }]
        : [{ id: 'ms-old', deviceId: 'pi-thermal-01', timestamp: NOW - 100_000, center: 36.0 }],
    alerts: async () => [],
  };
  const secondsHarness = buildController({ list: secondsList });
  await secondsHarness.controller.refresh();
  secondsHarness.controller.stop();
  expectEq(
    (writtenState(secondsHarness.files).reading as { value: number }).value,
    41.0,
    'a newer seconds-unit telemetry row wins over the milliseconds branch',
  );

  // A newer MILLISECONDS row must win even though the seconds row's raw value
  // is an order of magnitude smaller.
  const msList = new FakeList();
  msList.handlers = {
    devices: async () => [{ deviceId: 'pi-thermal-01', lastSeen: NOW }],
    telemetry: async (options) =>
      options.filter?.includes('<1000000000000')
        ? [{ id: 'seconds-old', deviceId: 'pi-thermal-01', timestamp: 1_699_999_000, center: 35.0 }]
        : [{ id: 'ms-new', deviceId: 'pi-thermal-01', timestamp: NOW, center: 39.4 }],
    alerts: async () => [],
  };
  const msHarness = buildController({ list: msList });
  await msHarness.controller.refresh();
  msHarness.controller.stop();
  expectEq(
    (writtenState(msHarness.files).reading as { value: number }).value,
    39.4,
    'a newer milliseconds-unit telemetry row wins over the seconds branch',
  );

  // Both branches stay device-scoped with ONLY the validated id, the unit
  // ranges are exact, per-page matches the contract, and devices stays one
  // request.
  const scopeList = new FakeList();
  scopeList.handlers = {
    devices: async () => [
      { id: 'd1', deviceId: 'pi-thermal-01', lastSeen: NOW },
      { id: 'd2', deviceId: 'bad id!', lastSeen: NOW + 9_999_999 },
    ],
    telemetry: async () => [{ id: 't', deviceId: 'pi-thermal-01', timestamp: NOW, center: 38 }],
    alerts: async () => [],
  };
  const scopeHarness = buildController({ list: scopeList });
  await scopeHarness.controller.refresh();
  scopeHarness.controller.stop();

  const deviceCalls = scopeList.calls.filter((c) => c.collection === 'devices');
  const telemetryCalls = scopeList.calls.filter((c) => c.collection === 'telemetry');
  const alertCalls = scopeList.calls.filter((c) => c.collection === 'alerts');
  expectEq(deviceCalls.length, 2, 'devices are read as two unit-disjoint branches');
  expectEq(telemetryCalls.length, 2, 'telemetry is read as two unit-disjoint branches');
  expectEq(alertCalls.length, 2, 'alerts are read as two unit-disjoint branches');

  const branches = [
    "deviceId='pi-thermal-01'&&timestamp<1000000000000",
    "deviceId='pi-thermal-01'&&timestamp>=1000000000000",
  ];
  expectTrue(
    branches.every((f) => telemetryCalls.some((c) => c.options.filter === f)),
    'telemetry branches filter on the validated device id and each unit range',
  );
  expectTrue(
    branches.every((f) => alertCalls.some((c) => c.options.filter === f)),
    'alert branches filter on the validated device id and each unit range',
  );
  expectTrue(
    telemetryCalls.every((c) => (c.options.perPage ?? 0) >= 5 && (c.options.perPage ?? 0) <= 20),
    'every telemetry branch stays inside per-page 5..20',
  );
  expectTrue(
    alertCalls.every((c) => c.options.perPage === 50),
    'every alert branch requests up to 50 rows',
  );
  expectTrue(
    scopeList.calls.every((c) => !String(c.options.filter ?? '').includes('bad id!')),
    'no request embeds an unvalidated device id',
  );
}

// ── 12. A throwing onError never rejects the poll or breaks the cadence ────
async function testThrowingOnErrorDoesNotBreakCadence(): Promise<void> {
  const list = new FakeList();
  let resolveCalls = 0;
  list.handlers = {
    devices: async () => {
      throw new Error('list failed');
    },
  };
  const harness = buildController({
    list,
    source: {
      resolve: async () => {
        resolveCalls += 1;
        return BASE;
      },
    },
    intervalMs: 5,
    onError: () => {
      throw new Error('onError exploded');
    },
  });

  const first = await settle(harness.controller.refresh());
  const second = await settle(harness.controller.refresh());
  harness.controller.stop();

  expectEq(first, 'resolved', 'a throwing onError never rejects refresh()');
  expectEq(second, 'resolved', 'the poll survives a throwing onError');
  expectEq(
    resolveCalls,
    2,
    'the next cycle still runs after a throwing onError',
  );
  expectEq(
    list.calls.filter((c) => c.collection === 'devices').length,
    4,
    'both device-unit branches run in each cycle after a throwing onError',
  );
}

async function main(): Promise<void> {
  await testSourcePrep();
  await testDeviceSelectionAndScoping();
  await testSingleFlight();
  await testDeadlineAbort();
  await testGenerationGuardAfterStop();
  await testRestartDuringInflightStartsFreshCycle();
  await testMaterialWriteGate();
  await testFailedWriteRetention();
  await testCleanup();
  await testBaseOriginPropagation();
  await testTelemetryDeviceScope();
  await testDeviceUnitSplitScopedReads();
  await testUnitSplitScopedReads();
  await testThrowingOnErrorDoesNotBreakCadence();

  if (failures > 0) {
    report(`${failures} widget-poll-controller assertion(s) failed`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('widget-poll-controller: all assertions passed');
}

main().catch((error: unknown) => {
  report(`widget-poll-controller test failed: ${String(error)}`);
  process.exit(1);
});
