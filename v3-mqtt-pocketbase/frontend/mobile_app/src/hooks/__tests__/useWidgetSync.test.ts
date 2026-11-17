/**
 * Behavioral tests for the widget-sync lifecycle helper.
 *
 * useWidgetSync is a thin React/Expo adapter. Its React-free lifecycle helper
 * owns the observable behavior that matters and is what these tests drive:
 *
 *   - exactly ONE runtime is started, even across a double start;
 *   - the saved setup is installed before the first controller cycle, and the
 *     dynamic-import/startup step resolves before the runtime begins;
 *   - the effective theme is read live, so a later theme change is reflected by
 *     the next write, and only a resolved 'light' | 'dark' is ever accepted;
 *   - cleanup cancels a runtime whose startup (dynamic imports/setup) is still
 *     pending, and stops a runtime that is already running.
 *
 * No Expo, React Native or test-renderer runtime is loaded: the module's Expo
 * imports are dynamic, so this boundary stays plain-tsx.
 *
 * Run:
 *   npx tsx src/hooks/__tests__/useWidgetSync.test.ts
 */
import {
  createWidgetSyncLifecycle,
  toWidgetTheme,
} from '../useWidgetSync';
import {
  createWidgetRuntime,
  type WidgetRuntime,
} from '../../utils/widget-runtime';
import type { ExpoFileLike, WidgetFetchImpl } from '../../utils/widget-adapter';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);
function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const SAVED = 'http://192.168.69.50:8090';
const BUILD = 'http://10.0.0.5:8090';
const HOTSPOT = 'http://192.168.4.1:8090';
const TARGET = 'file:///documents/pigpulse_widget_state.json';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, attempts = 50): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (predicate()) return true;
    await delay(1);
  }
  return predicate();
}

class FakeExpoFile implements ExpoFileLike {
  exists = false;
  contents: string | null = null;

  constructor(
    readonly path: string,
    private readonly files: Map<string, FakeExpoFile>,
  ) {
    if (!files.has(path)) files.set(path, this);
  }

  write(contents: string): void {
    this.contents = contents;
    this.exists = true;
  }

  async move(destination: ExpoFileLike, options?: { overwrite?: boolean }): Promise<void> {
    const target = destination as FakeExpoFile;
    if (!options?.overwrite && target.exists) throw new Error('destination exists');
    target.contents = this.contents;
    target.exists = true;
    this.contents = null;
    this.exists = false;
  }

  delete(): void {
    this.contents = null;
    this.exists = false;
  }
}

function fileHarness(): {
  createFile: (path: string) => FakeExpoFile;
  canonical: () => FakeExpoFile;
} {
  const files = new Map<string, FakeExpoFile>();
  const createFile = (path: string): FakeExpoFile => {
    const existing = files.get(path);
    if (existing) return existing;
    return new FakeExpoFile(path, files);
  };
  return { createFile, canonical: () => createFile(TARGET) };
}

function collectionFrom(url: string): string {
  const match = url.match(/\/api\/collections\/([^/]+)\/records/);
  return match?.[1] ?? '';
}

function successfulFetch(onUrl?: (url: string) => void): WidgetFetchImpl {
  return async (url) => {
    onUrl?.(url);
    const collection = collectionFrom(url);
    const items =
      collection === 'devices'
        ? [{ id: 'device-record', deviceId: 'esp32-001', name: 'Barn 1', lastSeen: 1_700_000_000 }]
        : collection === 'telemetry'
          ? [{ id: 'telemetry-record', deviceId: 'esp32-001', timestamp: 1_700_000_001, center: 39.4 }]
          : [];
    return {
      ok: true,
      status: 200,
      async json(): Promise<unknown> {
        return { items };
      },
    };
  };
}

interface RecordingRuntime {
  runtime: WidgetRuntime;
  state: { starts: number; stops: number; calls: string[]; releaseStart: () => void };
}

function makeFakeRuntime(deferredStart = false): RecordingRuntime {
  const state = { starts: 0, stops: 0, calls: [] as string[], releaseStart: () => {} };
  const runtime: WidgetRuntime = {
    start(): Promise<void> {
      state.starts += 1;
      state.calls.push('start');
      if (!deferredStart) return Promise.resolve();
      return new Promise<void>((resolve) => {
        state.releaseStart = resolve;
      });
    },
    stop(): void {
      state.stops += 1;
      state.calls.push('stop');
    },
    refresh(): Promise<void> {
      return Promise.resolve();
    },
  };
  return { runtime, state };
}

// ── 1. Exactly one runtime; saved setup precedes the first cycle ─────────
async function testSingleRuntimeAndStartupOrdering(): Promise<void> {
  const events: string[] = [];
  const urls: string[] = [];
  let createCount = 0;
  const harness = fileHarness();
  let created: WidgetRuntime | null = null;

  const lifecycle = createWidgetSyncLifecycle({
    createRuntime: async (getTheme) => {
      createCount += 1;
      // Stands in for the dynamic expo-file-system / setupStore / pocketbase
      // imports: the runtime is only built once those resolve.
      await delay(0);
      const runtime = createWidgetRuntime({
        loadSetup: async () => {
          events.push('setup');
          return { pbUrl: SAVED };
        },
        configureServer: (url) => {
          if (url) events.push(`configure:${url}`);
        },
        fetchImpl: successfulFetch((url) => {
          urls.push(url);
          events.push(`fetch:${url}`);
        }),
        createFile: harness.createFile,
        targetPath: TARGET,
        buildUrl: BUILD,
        hotspotUrl: HOTSPOT,
        theme: getTheme,
        now: () => 1_700_000_002_000,
      });
      created = runtime;
      return runtime;
    },
  });

  lifecycle.setTheme('light');
  lifecycle.start();
  // A second start (e.g. a re-render) must be a no-op, not a second runtime.
  lifecycle.start();

  const reached = await waitFor(() => events.some((e) => e.startsWith('fetch:')));
  expectEq(reached, true, 'the widget runtime reaches its first cycle');

  expectEq(createCount, 1, 'exactly one runtime is created for a double start');
  expectEq(created !== null, true, 'the runtime is built after the async startup step');

  const configureIndex = events.indexOf(`configure:${SAVED}`);
  const firstFetchIndex = events.findIndex((e) => e.startsWith('fetch:'));
  expectEq(configureIndex >= 0, true, 'the saved setup is installed into PocketBase');
  expectEq(
    configureIndex < firstFetchIndex,
    true,
    'the saved setup is installed before the first PocketBase request',
  );
  expectEq(urls[0]?.startsWith(`${SAVED}/`), true, 'the saved source drives the first cycle');

  lifecycle.stop();
}

// ── 2. The effective theme is read live; only light/dark are accepted ─────
async function testLiveTheme(): Promise<void> {
  const harness = fileHarness();
  const captured: { runtime: WidgetRuntime | null } = { runtime: null };

  const lifecycle = createWidgetSyncLifecycle({
    createRuntime: (getTheme) => {
      const runtime = createWidgetRuntime({
        loadSetup: async () => ({ pbUrl: SAVED }),
        configureServer: () => {},
        fetchImpl: successfulFetch(),
        createFile: harness.createFile,
        targetPath: TARGET,
        buildUrl: BUILD,
        hotspotUrl: HOTSPOT,
        theme: getTheme,
        now: () => 1_700_000_002_000,
      });
      captured.runtime = runtime;
      return runtime;
    },
  });

  lifecycle.setTheme('light');
  lifecycle.start();

  // Wait for the runtime's own first cycle to land, so a later explicit refresh
  // is not discarded as a stale generation by the (async) lifecycle start.
  const wrote = await waitFor(() => harness.canonical().exists);
  expectEq(wrote, true, 'the lifecycle runtime writes its first widget state');
  await delay(1);
  const first = JSON.parse(harness.canonical().contents ?? '{}') as { theme?: string };
  expectEq(first.theme, 'light', 'the first cycle writes the current light theme');

  lifecycle.setTheme('dark');
  await captured.runtime?.refresh();
  const second = JSON.parse(harness.canonical().contents ?? '{}') as { theme?: string };
  expectEq(second.theme, 'dark', 'a later cycle reads the changed dark theme live');

  // Only a resolved light/dark is ever accepted; anything else degrades to light.
  expectEq(toWidgetTheme('dark'), 'dark', "'dark' is accepted");
  expectEq(toWidgetTheme('light'), 'light', "'light' is accepted");
  expectEq(toWidgetTheme('auto'), 'light', "'auto' degrades to light");
  expectEq(toWidgetTheme(undefined), 'light', 'an absent theme degrades to light');

  lifecycle.stop();
}

// ── 3. Cleanup cancels a startup still awaiting its dynamic imports ───────
async function testCleanupCancelsPendingStartup(): Promise<void> {
  let releaseCreate: (runtime: WidgetRuntime) => void = () => {};
  const pending = new Promise<WidgetRuntime>((resolve) => {
    releaseCreate = resolve;
  });
  const fake = makeFakeRuntime();

  const lifecycle = createWidgetSyncLifecycle({
    createRuntime: () => pending,
  });

  lifecycle.setTheme('light');
  lifecycle.start();
  // Cleanup lands while the app's dynamic imports / setup are still pending.
  lifecycle.stop();

  releaseCreate(fake.runtime);
  await delay(0);
  await delay(0);

  expectEq(fake.state.starts, 0, 'a runtime whose startup was cancelled is never started');
  expectEq(fake.state.stops, 1, 'a runtime built after cleanup is cancelled immediately');
}

// ── 4. Cleanup stops a running runtime, even mid-start ───────────────────
async function testCleanupStopsRunningRuntime(): Promise<void> {
  const fake = makeFakeRuntime(true /* deferred start */);

  const lifecycle = createWidgetSyncLifecycle({
    createRuntime: () => fake.runtime,
  });

  lifecycle.setTheme('light');
  lifecycle.start();
  const started = await waitFor(() => fake.state.starts === 1);
  expectEq(started, true, 'the runtime begins starting');

  lifecycle.stop();
  fake.state.releaseStart();
  await delay(0);

  expectEq(fake.state.stops, 1, 'cleanup stops the running runtime');
  expectEq(fake.state.calls[0], 'start', 'the runtime is started exactly once');
  expectEq(fake.state.calls.filter((c) => c === 'start').length, 1, 'no second start after stop');
}

async function main(): Promise<void> {
  await testSingleRuntimeAndStartupOrdering();
  await testLiveTheme();
  await testCleanupCancelsPendingStartup();
  await testCleanupStopsRunningRuntime();

  if (failures > 0) {
    report(`${failures} useWidgetSync assertion(s) failed`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('useWidgetSync: all assertions passed');
}

main().catch((error: unknown) => {
  report(`useWidgetSync test failed: ${String(error)}`);
  process.exit(1);
});
