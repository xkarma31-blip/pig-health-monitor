/**
 * Behavioral tests for the React-free Android widget runtime.
 *
 * The runtime is the small composition layer between Expo/PocketBase and the
 * already-tested polling controller. It must keep the selected source aligned
 * with the farmer's saved setup, survive an unavailable first cycle, read the
 * effective theme live, and stop cleanly without a late write.
 *
 * Run:
 *   npx tsx src/utils/__tests__/widget-runtime.test.ts
 */
import {
  createWidgetRuntime,
  type WidgetRuntimeOptions,
} from '../widget-runtime';
import type { ExpoFileLike, WidgetFetchImpl } from '../widget-adapter';

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
const signalIsAborted = (signal: AbortSignal | null): boolean => signal?.aborted === true;

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
  files: Map<string, FakeExpoFile>;
  createFile: (path: string) => FakeExpoFile;
  canonical: () => FakeExpoFile;
} {
  const files = new Map<string, FakeExpoFile>();
  const createFile = (path: string): FakeExpoFile => {
    const existing = files.get(path);
    if (existing) return existing;
    return new FakeExpoFile(path, files);
  };
  return {
    files,
    createFile,
    canonical: () => createFile(TARGET),
  };
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
        ? [
            {
              id: 'device-record',
              deviceId: 'esp32-001',
              name: 'Barn 1',
              lastSeen: 1_700_000_000,
            },
          ]
        : collection === 'telemetry'
          ? [
              {
                id: 'telemetry-record',
                deviceId: 'esp32-001',
                timestamp: 1_700_000_001,
                center: 39.4,
              },
            ]
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

function runtimeOptions(
  overrides: Partial<WidgetRuntimeOptions> = {},
): WidgetRuntimeOptions {
  const harness = fileHarness();
  return {
    loadSetup: async () => ({ pbUrl: SAVED }),
    configureServer: () => {},
    fetchImpl: successfulFetch(),
    createFile: harness.createFile,
    targetPath: TARGET,
    buildUrl: BUILD,
    hotspotUrl: HOTSPOT,
    theme: () => 'light',
    now: () => 1_700_000_002_000,
    ...overrides,
  };
}

// ── 1. Saved setup is installed before the first request and wins ─────────
async function testSetupFirstAndSavedPrecedence(): Promise<void> {
  const events: string[] = [];
  const urls: string[] = [];
  const options = runtimeOptions({
    loadSetup: async () => {
      events.push('setup');
      return { pbUrl: SAVED };
    },
    configureServer: (url) => {
      events.push(`configure:${String(url)}`);
    },
    fetchImpl: successfulFetch((url) => {
      urls.push(url);
      events.push(`fetch:${url}`);
    }),
  });

  const runtime = createWidgetRuntime(options);
  await runtime.start();
  await runtime.refresh();

  expectEq(urls.length > 0, true, 'the runtime performs a first poll');
  expectEq(urls[0]?.startsWith(`${SAVED}/`), true, 'the saved source outranks build and hotspot');
  expectEq(urls[0]?.startsWith(`${BUILD}/`), false, 'the build source is not used when setup exists');
  expectEq(urls[0]?.startsWith(`${HOTSPOT}/`), false, 'the hotspot source is not used when setup exists');

  const configureIndex = events.indexOf(`configure:${SAVED}`);
  const firstFetchIndex = events.findIndex((event) => event.startsWith('fetch:'));
  expectEq(configureIndex >= 0, true, 'the saved source is installed into PocketBase');
  expectEq(
    configureIndex < firstFetchIndex,
    true,
    'the saved source is installed before the first PocketBase request',
  );

  runtime.stop();
}

// ── 2. An unavailable first cycle is contained and writes nothing ────────
async function testSafeInitialCycle(): Promise<void> {
  const errors: unknown[] = [];
  const harness = fileHarness();
  const options = runtimeOptions({
    fetchImpl: async () => {
      throw new Error('PocketBase unavailable');
    },
    createFile: harness.createFile,
    onError: (error) => errors.push(error),
  });

  const runtime = createWidgetRuntime(options);
  let threw = false;
  try {
    await runtime.start();
    await runtime.refresh();
  } catch {
    threw = true;
  }

  expectEq(threw, false, 'an unavailable first cycle does not escape the runtime');
  expectEq(errors.length > 0, true, 'the unavailable cycle is reported to the runtime owner');
  expectEq(harness.canonical().exists, false, 'an unavailable cycle does not create a partial cache file');

  runtime.stop();
}

// ── 3. The effective theme is read live, without restarting the runtime ──
async function testLiveTheme(): Promise<void> {
  let theme: 'light' | 'dark' = 'light';
  const harness = fileHarness();
  const runtime = createWidgetRuntime(
    runtimeOptions({
      createFile: harness.createFile,
      theme: () => theme,
    }),
  );

  await runtime.start();
  await runtime.refresh();
  const first = JSON.parse(harness.canonical().contents ?? '{}') as { theme?: string };
  expectEq(first.theme, 'light', 'the first cycle writes the current light theme');

  theme = 'dark';
  await runtime.refresh();
  const second = JSON.parse(harness.canonical().contents ?? '{}') as { theme?: string };
  expectEq(second.theme, 'dark', 'a later cycle reads the changed dark theme live');

  runtime.stop();
}

// ── 4. Cleanup cancels pending startup and in-flight work ─────────────────
async function testCleanup(): Promise<void> {
  let releaseSetup: (setup: { pbUrl: string }) => void = () => {};
  let fetchCount = 0;
  const pendingSetup = new Promise<{ pbUrl: string }>((resolve) => {
    releaseSetup = resolve;
  });
  const pendingRuntime = createWidgetRuntime(
    runtimeOptions({
      loadSetup: async () => pendingSetup,
      fetchImpl: async () => {
        fetchCount += 1;
        throw new Error('unexpected request');
      },
    }),
  );

  const startPromise = pendingRuntime.start();
  pendingRuntime.stop();
  releaseSetup({ pbUrl: SAVED });
  await startPromise;
  await delay(0);

  expectEq(fetchCount, 0, 'cleanup before setup resolution prevents the first request');

  let capturedSignal: AbortSignal | null = null;
  const harness = fileHarness();
  const activeRuntime = createWidgetRuntime(
    runtimeOptions({
      createFile: harness.createFile,
      fetchImpl: async (_url, init) => {
        capturedSignal = init.signal;
        return await new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      },
    }),
  );

  await activeRuntime.start();
  for (let attempt = 0; attempt < 20 && capturedSignal === null; attempt += 1) {
    await delay(1);
  }
  activeRuntime.stop();

  expectEq(capturedSignal !== null, true, 'the runtime reaches an in-flight request');
  expectEq(signalIsAborted(capturedSignal), true, 'cleanup aborts the in-flight request');
  await activeRuntime.refresh();
  expectEq(harness.canonical().exists, false, 'cleanup prevents a late cache write');
}

async function main(): Promise<void> {
  await testSetupFirstAndSavedPrecedence();
  await testSafeInitialCycle();
  await testLiveTheme();
  await testCleanup();

  if (failures > 0) {
    report(`${failures} widget-runtime assertion(s) failed`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('widget-runtime: all assertions passed');
}

main().catch((error: unknown) => {
  report(`widget-runtime test failed: ${String(error)}`);
  process.exit(1);
});
