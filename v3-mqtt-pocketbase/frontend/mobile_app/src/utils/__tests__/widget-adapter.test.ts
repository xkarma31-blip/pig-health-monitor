/**
 * Behavioral tests for the React-free widget adapter boundary.
 *
 * This module is the ONLY place the poll controller's pure contracts meet the
 * outside world: PocketBase HTTP (fetch), the selected source (saved setup /
 * build / hotspot) and the Expo file system. It deliberately imports no React,
 * React Native or Expo runtime code, no Node-only module, and performs no side
 * effects at import time — so the whole boundary can be exercised under the
 * repo's plain tsx runner with real adapters and fake dependencies.
 *
 * Locked by this test:
 *   - the PocketBase list URL is exact: base without a trailing slash, the
 *     fixed collection path, then `filter`, `sort`, `perPage` in that order,
 *     URLSearchParams-encoded;
 *   - the SAME AbortSignal object is handed to fetch, and the response body is
 *     consumed before the list promise resolves, so a request deadline covers
 *     the body read;
 *   - a non-OK response and a payload without an `items` array are rejected;
 *   - source precedence is saved setup -> build -> hotspot, and a malformed
 *     explicit saved source fails closed (null) with no fallback;
 *   - the Expo file adapter writes the temp path, moves onto the canonical
 *     path with `{ overwrite: true }` and never pre-deletes it, and deletes
 *     only files that exist.
 *
 * Run:
 *   npx tsx src/utils/__tests__/widget-adapter.test.ts
 */
import {
  buildWidgetListUrl,
  createExpoFileSystemAdapter,
  createWidgetListAdapter,
  createWidgetSourceProvider,
  type ExpoFileLike,
  type WidgetFetchImpl,
} from '../widget-adapter';
import { replaceWidgetStateFile } from '../widget-sync';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);
function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const BASE = 'http://192.168.69.1:8090';
const FILTER = "deviceId='esp32-001'&&timestamp<1000000000000";
const TELEMETRY_URL =
  `${BASE}/api/collections/telemetry/records` +
  '?filter=deviceId%3D%27esp32-001%27%26%26timestamp%3C1000000000000&sort=-timestamp&perPage=10';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ── 1. Exact PocketBase list URL: path, encoding and parameter order ──────
const telemetryUrl = buildWidgetListUrl(BASE, 'telemetry', {
  filter: FILTER,
  sort: '-timestamp',
  perPage: 10,
});
expectEq(telemetryUrl, TELEMETRY_URL, 'the list URL is exact and URLSearchParams-encoded');

expectEq(
  buildWidgetListUrl(`${BASE}/`, 'devices', { perPage: 50 }),
  `${BASE}/api/collections/devices/records?perPage=50`,
  'a trailing base slash is not doubled and no extra path segment is added',
);
expectEq(
  buildWidgetListUrl(BASE, 'alerts', { sort: '-timestamp' }),
  `${BASE}/api/collections/alerts/records?sort=-timestamp`,
  'absent options are omitted and the collection name is used as-is',
);
expectEq(
  buildWidgetListUrl(BASE, 'telemetry', { perPage: 5, sort: '-timestamp' }),
  `${BASE}/api/collections/telemetry/records?sort=-timestamp&perPage=5`,
  'the query parameters follow filter, sort, perPage order regardless of key order',
);

// ── 2. The exact signal is passed and the body is consumed first ──────────
async function testSignalAndBody(): Promise<void> {
  const controller = new AbortController();
  const signal = controller.signal;
  let capturedSignal: AbortSignal | null = null;
  let capturedUrl = '';
  let jsonStarted = false;
  let sameSignalInBody = false;
  let releaseBody: () => void = () => {};
  const bodyGate = new Promise<void>((resolve) => {
    releaseBody = resolve;
  });

  const fetchImpl: WidgetFetchImpl = async (url, init) => {
    capturedUrl = url;
    capturedSignal = init.signal;
    return {
      ok: true,
      status: 200,
      async json(): Promise<unknown> {
        jsonStarted = true;
        sameSignalInBody = capturedSignal === signal;
        await bodyGate;
        return { items: [{ id: 'a' }, { id: 'b' }] };
      },
    };
  };

  const adapter = createWidgetListAdapter(fetchImpl);
  let settled = false;
  const pending = adapter.list('telemetry', {
    baseUrl: BASE,
    filter: FILTER,
    sort: '-timestamp',
    perPage: 10,
    signal,
  });
  void pending.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );

  await delay(0);

  expectEq(capturedSignal, signal, 'the exact signal object is passed to fetch');
  expectEq(capturedUrl, TELEMETRY_URL, 'the adapter fetches the built list URL');
  expectEq(jsonStarted, true, 'the adapter consumes the response body');
  expectEq(sameSignalInBody, true, 'the body read still holds the same signal object');
  expectEq(settled, false, 'the list promise stays pending until the body completes');

  releaseBody();
  const records = await pending;
  expectEq(settled, true, 'the list promise resolves after the body completes');
  expectEq(records.length, 2, 'the payload items are returned');
  expectEq((records[0] as { id: string }).id, 'a', 'the first record is returned');
  expectEq((records[1] as { id: string }).id, 'b', 'the second record is returned');
}

// ── 2b. Non-OK responses and payloads without items are rejected ──────────
async function testListResponseGuards(): Promise<void> {
  const notOk = createWidgetListAdapter(async () => ({
    ok: false,
    status: 500,
    async json(): Promise<unknown> {
      return { items: [] };
    },
  }));
  let rejected = false;
  try {
    await notOk.list('telemetry', { baseUrl: BASE, signal: new AbortController().signal });
  } catch {
    rejected = true;
  }
  expectEq(rejected, true, 'a non-OK response is rejected');

  const noItems = createWidgetListAdapter(async () => ({
    ok: true,
    status: 200,
    async json(): Promise<unknown> {
      return { page: 1 };
    },
  }));
  let missingRejected = false;
  try {
    await noItems.list('telemetry', { baseUrl: BASE, signal: new AbortController().signal });
  } catch {
    missingRejected = true;
  }
  expectEq(missingRejected, true, 'a payload without an items array is rejected');

  const networkError = new Error('network unavailable');
  const rejectingFetch = createWidgetListAdapter(async () => {
    throw networkError;
  });
  let caught: unknown;
  try {
    await rejectingFetch.list('telemetry', {
      baseUrl: BASE,
      signal: new AbortController().signal,
    });
  } catch (error) {
    caught = error;
  }
  expectEq(caught, networkError, 'a rejected fetch preserves the network failure');

  const emptyItems = createWidgetListAdapter(async () => ({
    ok: true,
    status: 200,
    async json(): Promise<unknown> {
      return { items: [] };
    },
  }));
  const empty = await emptyItems.list('telemetry', {
    baseUrl: BASE,
    signal: new AbortController().signal,
  });
  expectEq(empty.length, 0, 'an empty items array is a valid empty list');
}

// ── 3. Source precedence and fail-closed malformed saved source ───────────
async function testSourcePrecedence(): Promise<void> {
  const savedWins = createWidgetSourceProvider({
    loadSetup: async () => ({ pbUrl: 'http://192.168.69.50:8090' }),
    buildUrl: 'http://10.0.0.5:8090',
    hotspotUrl: 'http://192.168.4.1:8090',
  });
  expectEq(
    await savedWins.resolve(),
    'http://192.168.69.50:8090',
    'a valid saved source outranks a different build URL',
  );

  const buildUsed = createWidgetSourceProvider({
    loadSetup: async () => null,
    buildUrl: 'http://10.0.0.5:8090',
    hotspotUrl: 'http://192.168.4.1:8090',
  });
  expectEq(
    await buildUsed.resolve(),
    'http://10.0.0.5:8090',
    'the build URL is used when no saved source exists',
  );

  const hotspotFallback = createWidgetSourceProvider({
    loadSetup: async () => null,
    buildUrl: null,
    hotspotUrl: 'http://192.168.4.1:8090',
  });
  expectEq(
    await hotspotFallback.resolve(),
    'http://192.168.4.1:8090',
    'the hotspot is the final fallback',
  );

  const malformedSaved = createWidgetSourceProvider({
    loadSetup: async () => ({ pbUrl: '192.168.69.50:8090' }),
    buildUrl: 'http://10.0.0.5:8090',
    hotspotUrl: 'http://192.168.4.1:8090',
  });
  expectEq(
    await malformedSaved.resolve(),
    null,
    'a malformed saved source fails closed and never falls through to build/hotspot',
  );

  const blankSaved = createWidgetSourceProvider({
    loadSetup: async () => ({ pbUrl: '   ' }),
    buildUrl: 'http://10.0.0.5:8090',
    hotspotUrl: 'http://192.168.4.1:8090',
  });
  expectEq(
    await blankSaved.resolve(),
    'http://10.0.0.5:8090',
    'a blank saved source is treated as absent and falls through to the build URL',
  );
}

// ── 4. Expo file adapter: temp write, overwrite move, guarded delete ──────
class FakeExpoFile implements ExpoFileLike {
  exists = false;
  contents: string | null = null;
  failMove = false;
  readonly moves: { destination: string; overwrite: boolean | undefined }[] = [];

  constructor(
    readonly path: string,
    private readonly ops: string[],
  ) {}

  write(contents: string): void {
    this.contents = contents;
    this.exists = true;
    this.ops.push(`write:${this.path}`);
  }

  async move(destination: ExpoFileLike, options?: { overwrite?: boolean }): Promise<void> {
    const target = destination as FakeExpoFile;
    this.ops.push(`move:${this.path}->${target.path}`);
    this.moves.push({ destination: target.path, overwrite: options?.overwrite });
    if (this.failMove) throw new Error('move failed');
    target.contents = this.contents;
    target.exists = true;
    this.contents = null;
    this.exists = false;
  }

  delete(): void {
    this.contents = null;
    this.exists = false;
    this.ops.push(`delete:${this.path}`);
  }
}

function makeFilesHarness(): {
  ops: string[];
  files: Map<string, FakeExpoFile>;
  createFile: (path: string) => FakeExpoFile;
} {
  const ops: string[] = [];
  const files = new Map<string, FakeExpoFile>();
  const createFile = (path: string): FakeExpoFile => {
    let file = files.get(path);
    if (!file) {
      file = new FakeExpoFile(path, ops);
      files.set(path, file);
    }
    return file;
  };
  return { ops, files, createFile };
}

async function testExpoFileAdapter(): Promise<void> {
  const canonical = '/documents/pigpulse_widget_state.json';
  const temporary = `${canonical}.tmp`;

  // A successful replacement writes the temp path, then moves it over the
  // canonical path with overwrite — never deleting the canonical file first.
  const success = makeFilesHarness();
  const successAdapter = createExpoFileSystemAdapter(success.createFile);
  await replaceWidgetStateFile(successAdapter, canonical, '{"v":1}');

  expectEq(
    success.ops.includes(`write:${temporary}`),
    true,
    'the adapter writes the sibling temp path',
  );
  expectEq(
    success.ops.includes(`move:${temporary}->${canonical}`),
    true,
    'the adapter moves the temp file onto the canonical path',
  );
  expectEq(
    success.ops.includes(`delete:${canonical}`),
    false,
    'the canonical destination is never pre-deleted',
  );
  const moved = success.files.get(temporary)?.moves[0];
  expectEq(moved?.destination, canonical, 'move passes a destination File for the canonical path');
  expectEq(moved?.overwrite, true, 'move overwrites the destination');
  expectEq(success.files.get(canonical)?.contents, '{"v":1}', 'the canonical file receives the JSON');

  // A failed move must clean up the TEMP file only; a canonical file that
  // already holds the last-valid copy is left untouched.
  const failure = makeFilesHarness();
  failure.createFile(canonical).contents = 'last-valid';
  failure.createFile(canonical).exists = true;
  failure.createFile(temporary).failMove = true;
  const failureAdapter = createExpoFileSystemAdapter(failure.createFile);
  let threw = false;
  try {
    await replaceWidgetStateFile(failureAdapter, canonical, '{"v":2}');
  } catch {
    threw = true;
  }
  expectEq(threw, true, 'a failed move is reported');
  expectEq(
    failure.ops.includes(`delete:${temporary}`),
    true,
    'a failed replacement cleans up the temp file',
  );
  expectEq(
    failure.ops.includes(`delete:${canonical}`),
    false,
    'a failed replacement never deletes the canonical file',
  );
  expectEq(
    failure.files.get(canonical)?.contents,
    'last-valid',
    'a failed replacement keeps the canonical JSON',
  );

  // deleteFile deletes only a file that exists (Expo File exposes `exists`).
  const deletion = makeFilesHarness();
  const deletionAdapter = createExpoFileSystemAdapter(deletion.createFile);
  await deletionAdapter.deleteFile('/documents/never_written.json');
  expectEq(
    deletion.ops.includes('delete:/documents/never_written.json'),
    false,
    'deleteFile leaves a non-existent file alone',
  );
  deletion.createFile('/documents/present.json').exists = true;
  await deletionAdapter.deleteFile('/documents/present.json');
  expectEq(
    deletion.ops.includes('delete:/documents/present.json'),
    true,
    'deleteFile removes an existing file',
  );
}

async function main(): Promise<void> {
  await testSignalAndBody();
  await testListResponseGuards();
  await testSourcePrecedence();
  await testExpoFileAdapter();

  if (failures > 0) {
    report(`${failures} widget-adapter assertion(s) failed`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('widget-adapter: all assertions passed');
}

main().catch((error: unknown) => {
  report(`widget-adapter test failed: ${String(error)}`);
  process.exit(1);
});
