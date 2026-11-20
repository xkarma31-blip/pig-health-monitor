/**
 * Behavioral tests for PCM chunk-boundary sample integrity (lane B9).
 *
 * The bug these pin: `fetch` delivers the barn-mic stream as ARBITRARY byte
 * chunks. Decoding each chunk in isolation drops the partial frame at every
 * chunk edge, so samples are lost and the samples after the edge are shifted —
 * a click at every boundary plus a slow drift between the audio and the frames
 * it must line up with.
 *
 * Two layers:
 *   A. The production decoder (`pcm-frames.ts`) driven directly over every
 *      split partition, 1-byte chunks, non-zero `byteOffset`, empty chunks,
 *      end-residual and reset.
 *   B. The real consumer (`pcm-stream.ts` `startPcmStream`) driven end to end
 *      with a mocked fetch / AudioContext / worklet, so the pushed worklet
 *      blocks and the Pi-clock observations can be inspected.
 *
 * Fixtures are synthetic mono/stereo and do NOT assert the device's real PCM
 * format; mono and stereo are just the two supported shapes.
 *
 * Plain `.ts`, run with tsx. The modules are VM-loaded (they import
 * `react-native` / `./pi-clock`, which this sandbox does not ship) using the
 * same transpile+run technique as the parent's characterization script.
 *
 * Portability: the canonical app ships no `@types/node`, so this file imports
 * no `node:*` specifier (that would raise TS2591 in the combined overlay
 * typecheck). It borrows the Node builtins through the ambient `require` and
 * declares only the one global that is genuinely absent (`__dirname`). The
 * TypeScript compiler is discovered at runtime (env → cwd → walk-up), never
 * from a pinned machine path.
 */

// ── dependency-free Node surface (no `node:*` imports, no blanket `any`) ───
interface NodeFs {
  readFileSync(file: string, encoding: string): string;
  existsSync(file: string): boolean;
  readdirSync(dir: string): string[];
}
interface NodePath {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
  dirname(part: string): string;
}
interface NodeVm {
  runInNewContext(code: string, context: object, options: { filename?: string; timeout?: number }): unknown;
}
interface NodeModuleApi {
  createRequire(filename: string): (id: string) => unknown;
}
interface TsApi {
  transpileModule(src: string, opts: unknown): { outputText: string };
  ModuleKind: { CommonJS: number };
  ScriptTarget: { ES2022: number };
}

declare const __dirname: string;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as unknown as NodeFs;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path') as unknown as NodePath;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vm = require('node:vm') as unknown as NodeVm;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const createRequire = (require('node:module') as unknown as NodeModuleApi).createRequire;

const UTILS = path.resolve(__dirname, '..');
const PCM_STREAM = path.join(UTILS, 'pcm-stream.ts');
const PCM_FRAMES = path.join(UTILS, 'pcm-frames.ts');

// ── portable compiler discovery (env → cwd → walk-up) ─────────────────────
// Borrow the app's TypeScript install instead of adding a dependency, WITHOUT
// pinning a machine path. An explicit override wins; then the current
// directory and every ancestor are tried directly, and finally by locating the
// app via its `src/utils/pi-clock.ts` marker (covers running from a scratch
// checkout beside the app, as the parent's runner does).
const APP_MARKER = path.join('src', 'utils', 'pi-clock.ts');

function typescriptFrom(dir: string): TsApi | null {
  try {
    const mod = createRequire(path.join(dir, 'package.json'))('typescript') as TsApi | null;
    return mod && typeof mod.transpileModule === 'function' ? mod : null;
  } catch {
    return null;
  }
}

function isAppDir(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, APP_MARKER));
  } catch {
    return false;
  }
}

function discoverCompiler(): TsApi | null {
  const roots: string[] = [];
  const override = process.env.PIGPULSE_APP_ROOT || process.env.PIGPULSE_CANONICAL_APP;
  if (override) roots.push(override);
  for (let dir = process.cwd(); ; ) {
    roots.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Direct hit: the app itself, or any directory whose node_modules has
  // `typescript` (e.g. running with cwd inside the app).
  for (const base of roots) {
    const direct = typescriptFrom(base);
    if (direct) return direct;
  }
  // Marker hit: locate the app inside an ancestor's children (scratch checkout
  // sitting beside the app). Only structural names are assumed, never a user or
  // machine path.
  for (const base of roots) {
    let children: string[];
    try {
      children = fs.readdirSync(base);
    } catch {
      continue;
    }
    for (const child of children) {
      const childDir = path.join(base, child);
      for (const candidate of [childDir, path.join(childDir, 'v3-mqtt-pocketbase', 'frontend', 'mobile_app')]) {
        if (isAppDir(candidate)) {
          const found = typescriptFrom(candidate);
          if (found) return found;
        }
      }
    }
  }
  return null;
}

const ts: TsApi | null = discoverCompiler();

// ── failure bookkeeping (accumulate, never abort mid-suite) ───────────────
let failures = 0;
const fail = (label: string, detail?: unknown) => {
  failures += 1;
  console.error(`FAIL ${label}${detail === undefined ? '' : `: ${String(detail)}`}`);
};
const ok = (cond: boolean, label: string) => {
  if (!cond) fail(label);
};
const eqJson = (actual: unknown, expected: unknown, label: string) => {
  ok(JSON.stringify(actual) === JSON.stringify(expected), label);
};

// F1.3: a missing compiler is a clean, recorded failure — never an unhandled
// throw before the bookkeeping exists. Every suite is still attempted; the
// non-zero exit comes from the normal `failures > 0` path at the bottom.
if (!ts) {
  fail(
    'TypeScript compiler not found — set PIGPULSE_APP_ROOT to the app directory ' +
      '(searched the env override, cwd and its ancestors for `typescript`; no machine path is hardcoded)',
  );
}

// ── VM module loading ─────────────────────────────────────────────────────
type Exports = Record<string, unknown>;

function loadTsModule(
  file: string,
  requireFn: (name: string) => unknown,
  globals: Record<string, unknown> = {},
): Exports {
  if (!ts) throw new Error('TypeScript compiler unavailable (set PIGPULSE_APP_ROOT to the app directory)');
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exportsObject: Exports = {};
  const context: Record<string, unknown> = {
    exports: exportsObject,
    module: { exports: exportsObject },
    require: requireFn,
    // Share the host realm's typed arrays + errors so cross-VM values compare.
    Uint8Array,
    Int16Array,
    ArrayBuffer,
    DataView,
    Error,
    TypeError,
    RangeError,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    AbortController,
    URL,
    console,
    ...globals,
  };
  vm.runInNewContext(code, context, { filename: file, timeout: 4000 });
  return exportsObject;
}

// ── fixtures ──────────────────────────────────────────────────────────────
const MONO = [-32768, -12345, -1, 0, 1, 12345, 32767, 42];
const STEREO = [-32768, 32767, -1, 1, 0, 0, 12345, -12345, 7, -7, 300, -300];

function encodeLE(samples: number[]): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((s, i) => view.setInt16(i * 2, s, true));
  return bytes;
}

function randPartition(total: number, maxChunk: number, seed: number): number[] {
  let s = seed >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const sizes: number[] = [];
  let left = total;
  while (left > 0) {
    const take = Math.max(1, Math.min(left, Math.ceil(next() * maxChunk)));
    sizes.push(take);
    left -= take;
  }
  return sizes;
}

function chunkBySizes(bytes: Uint8Array, sizes: number[]): Uint8Array[] {
  const out: Uint8Array[] = [];
  let o = 0;
  for (const s of sizes) {
    out.push(bytes.slice(o, o + s));
    o += s;
  }
  return out;
}

// ── layer A: the production decoder ───────────────────────────────────────
let framesModule: Exports | null = null;
try {
  framesModule = loadTsModule(PCM_FRAMES, (n) => {
    throw new Error(`pcm-frames.ts must have no imports, got "${n}"`);
  });
} catch (e) {
  fail('pcm-frames.ts failed to load', e);
}

const create = framesModule
  ? (framesModule.createPcmFrameDecoder as ((channels?: number) => {
      push(chunk: Uint8Array): Int16Array;
      reset(): void;
      readonly carriedBytes: number;
      readonly emittedBytes: number;
      readonly bytesPerFrame: number;
      readonly channels: number;
    }) | undefined)
  : undefined;

const MAX_PCM_CHANNELS = framesModule ? (framesModule.MAX_PCM_CHANNELS as number) : undefined;

const decodeAll = (chunks: Uint8Array[], channels: number): number[] => {
  const d = create!(channels);
  const out: number[] = [];
  for (const c of chunks) out.push(...Array.from(d.push(c)));
  return out;
};

if (typeof create !== 'function') {
  fail('createPcmFrameDecoder export missing');
} else {
  // supported-format guard (fail closed, no runtime format guessing)
  ok(MAX_PCM_CHANNELS === 8, `MAX_PCM_CHANNELS is 8 (got ${String(MAX_PCM_CHANNELS)})`);
  for (const bad of [0, -1, 1.5, 9, Number.NaN, Number.POSITIVE_INFINITY, 100]) {
    let threw = false;
    try {
      create(bad as number);
    } catch (e) {
      threw = e instanceof TypeError;
    }
    ok(threw, `createPcmFrameDecoder(${String(bad)}) throws TypeError`);
  }
  const dflt = create();
  ok(dflt.channels === 2, 'default decoder is stereo');
  ok(dflt.bytesPerFrame === 4, 'stereo bytesPerFrame is 4');
  const mono1 = create(1);
  ok(mono1.bytesPerFrame === 2, 'mono bytesPerFrame is 2');
  ok(mono1.carriedBytes === 0, 'fresh decoder carries nothing');
  ok(mono1.emittedBytes === 0, 'fresh decoder has emitted nothing');

  for (const [channels, samples] of [
    [1, MONO],
    [2, STEREO],
  ] as const) {
    const bytes = encodeLE(samples);
    const bpf = 2 * channels;

    // whole buffer, no split
    eqJson(decodeAll([bytes], channels), samples, `whole decode channels=${channels}`);

    // every 2-chunk split
    let bad2 = 0;
    for (let split = 1; split < bytes.length; split++) {
      if (JSON.stringify(decodeAll([bytes.slice(0, split), bytes.slice(split)], channels)) !== JSON.stringify(samples)) {
        bad2 += 1;
      }
    }
    ok(bad2 === 0, `channels=${channels}: all 2-chunk splits preserve samples (bad=${bad2})`);

    // every 3-chunk split
    let bad3 = 0;
    for (let a = 1; a < bytes.length - 1; a++) {
      for (let b = a + 1; b < bytes.length; b++) {
        const got = decodeAll([bytes.slice(0, a), bytes.slice(a, b), bytes.slice(b)], channels);
        if (JSON.stringify(got) !== JSON.stringify(samples)) bad3 += 1;
      }
    }
    ok(bad3 === 0, `channels=${channels}: all 3-chunk splits preserve samples (bad=${bad3})`);

    // 1-byte chunks
    const oneByte = Array.from({ length: bytes.length }, (_, i) => bytes.slice(i, i + 1));
    if (JSON.stringify(decodeAll(oneByte, channels)) !== JSON.stringify(samples)) {
      fail(`channels=${channels}: 1-byte chunks preserve samples`);
    }
    eqJson(decodeAll(oneByte, channels), samples, `channels=${channels}: 1-byte chunks preserve samples`);

    // random bounded partitions + carry invariant
    let randomBad = 0;
    let carryViolation = 0;
    for (const seed of [1, 7, 42, 1337, 99991]) {
      const sizes = randPartition(bytes.length, 5, seed);
      const d = create(channels);
      const out: number[] = [];
      for (const part of chunkBySizes(bytes, sizes)) {
        const got = d.push(part);
        ok(got.length % channels === 0, `channels=${channels}: partial frames never emitted`);
        out.push(...Array.from(got));
        if (d.carriedBytes >= bpf) carryViolation += 1;
      }
      if (JSON.stringify(out) !== JSON.stringify(samples)) randomBad += 1;
    }
    ok(randomBad === 0, `channels=${channels}: random partitions preserve samples (bad=${randomBad})`);
    ok(carryViolation === 0, `channels=${channels}: carried bytes always < bytesPerFrame (bad=${carryViolation})`);

    // non-zero byteOffset views (padded buffer)
    const padded = new Uint8Array(bytes.length + 3);
    padded.set([9, 9, 9], 0);
    padded.set(bytes, 3);
    const view = padded.subarray(3);
    ok(view.byteOffset === 3, 'fixture view has non-zero byteOffset');
    eqJson(decodeAll([view], channels), samples, `channels=${channels}: non-zero byteOffset view decodes`);
    const mid = padded.subarray(3, 3 + Math.floor(bytes.length / 2));
    const tail = padded.subarray(3 + Math.floor(bytes.length / 2), 3 + bytes.length);
    eqJson(decodeAll([mid, tail], channels), samples, `channels=${channels}: split non-zero byteOffset views decode`);

    // emittedBytes accounting
    const d = create(channels);
    const enc = encodeLE(samples);
    d.push(enc);
    ok(d.emittedBytes === samples.length * 2, `channels=${channels}: emittedBytes counts completed samples`);
    ok(d.carriedBytes === 0, `channels=${channels}: no carry after a whole buffer`);
  }

  // empty chunks are inert
  {
    const d = create(1);
    const before = d.carriedBytes;
    ok(d.push(new Uint8Array(0)).length === 0, 'empty chunk yields no samples');
    ok(d.carriedBytes === before, 'empty chunk does not change carry');
  }

  // end residual: a trailing partial frame is held, then completed
  {
    const d = create(1);
    const first = encodeLE([-12345]);
    ok(d.push(first.slice(0, 1)).length === 0, 'half a frame emits nothing');
    ok(d.carriedBytes === 1, 'half a frame is carried');
    eqJson(Array.from(d.push(first.slice(1))), [-12345], 'carried half completes the frame');
    ok(d.carriedBytes === 0, 'no carry once the frame is complete');
  }

  // reset drops the carry and the counter, so a new stream/session starts clean
  {
    const d = create(1);
    d.push(encodeLE([1111]).slice(0, 1)); // leave a residual byte
    ok(d.carriedBytes === 1, 'reset fixture carries a byte');
    d.reset();
    ok(d.carriedBytes === 0, 'reset clears the carry');
    ok(d.emittedBytes === 0, 'reset clears the emitted counter');
    // If the old byte were carried, this would decode to (old, newLo) instead.
    eqJson(Array.from(d.push(encodeLE([-2222]))), [-2222], 'reset prevents carry bleed into the next stream');
    // Prove the carry would otherwise splice: a decoder that is NOT reset mixes.
    const d2 = create(1);
    d2.push(encodeLE([0x1234 & 0xffff]).slice(0, 1));
    const spliced = Array.from(d2.push(encodeLE([-1])));
    ok(spliced.length === 1 && spliced[0] !== -1, 'without reset the old byte does splice (control)');
  }
}

// ── layer B: the real consumer, per-stream lifecycle ──────────────────────
interface StreamSpec {
  chunks: Uint8Array[];
  headers?: Record<string, string>;
}

function runConsumer(streams: StreamSpec[], ready = false) {
  const events: Array<Record<string, unknown>> = [];
  const observes: Array<{ ts: number; arrival: number }> = [];
  let calls = 0;

  class MockNode {
    port = { postMessage: (m: Record<string, unknown>) => events.push(m) };
    connect() {}
    disconnect() {}
  }
  class MockAudioContext {
    state = 'running';
    currentTime = 0;
    sampleRate = 48000;
    destination = {};
    audioWorklet = { addModule: async () => {} };
    resume = async () => {};
    close = async () => {};
  }
  const windowObj = { AudioContext: MockAudioContext, AudioWorkletNode: MockNode };

  const requireFn = (name: string): unknown => {
    if (name === 'react-native') return { Platform: { OS: 'web' } };
    if (name === './pi-clock') {
      return {
        MAX_LAG_MS: 8000,
        piClock: {
          lagMs: 0,
          get ready() {
            return ready;
          },
          observe: (ts: number, arrival: number) => observes.push({ ts, arrival }),
          now: () => Date.now(),
          ensureForAge: () => {},
          offsetMs: () => 0,
        },
      };
    }
    if (name === './pcm-frames') {
      if (!framesModule) throw new Error('pcm-frames.ts is not loaded');
      return framesModule;
    }
    throw new Error(`unexpected import in pcm-stream.ts: ${name}`);
  };

  const globals: Record<string, unknown> = {
    window: windowObj,
    document: { baseURI: 'http://localhost/' },
    location: { origin: 'http://localhost' },
    ReadableStream: class {},
    fetch: async () => {
      const spec = calls < streams.length ? streams[calls] : { chunks: [] };
      calls += 1;
      const chunks = spec.chunks;
      let i = 0;
      const reader = {
        read: () => Promise.resolve(i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }),
        cancel: () => Promise.resolve(),
        releaseLock: () => {},
      };
      const headers = spec.headers ?? {};
      return {
        ok: true,
        status: 200,
        headers: { get: (n: string) => headers[n] ?? null },
        body: { getReader: () => reader },
        text: async () => '',
      };
    },
  };

  const mod = loadTsModule(PCM_STREAM, requireFn, globals);
  const start = mod.startPcmStream as (o: { url: string }) => { stop: () => void };
  if (typeof start !== 'function') throw new Error('startPcmStream export missing');
  const handle = start({ url: 'http://localhost/pi/esp/stream' });
  return { handle, events, observes };
}

const tick = (n: number) =>
  new Promise<void>((resolve) => {
    let i = 0;
    const step = () => {
      if (i++ >= n) return resolve();
      setTimeout(step, 0);
    };
    step();
  });

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const blocks = (h: { events: Array<Record<string, unknown>> }): Int16Array[] =>
  h.events.filter((e) => e.cmd === 'block').map((e) => e.data as Int16Array);
const flat = (h: { events: Array<Record<string, unknown>> }): number[] =>
  blocks(h).flatMap((d) => Array.from(d));

async function collect(streams: StreamSpec[], ready = false) {
  const h = runConsumer(streams, ready);
  await tick(20);
  h.handle.stop();
  await tick(3);
  return h;
}

async function consumerSuite() {
  for (const [channels, samples] of [
    [1, MONO],
    [2, STEREO],
  ] as const) {
    const bytes = encodeLE(samples);
    const header = { 'x-audio-rate': '16000', 'x-audio-channels': String(channels) };

    // whole single chunk
    {
      const h = await collect([{ chunks: [bytes], headers: header }]);
      eqJson(flat(h), samples, `consumer channels=${channels}: single whole chunk`);
    }
    // 1-byte chunks
    {
      const oneByte = Array.from({ length: bytes.length }, (_, i) => bytes.slice(i, i + 1));
      const h = await collect([{ chunks: oneByte, headers: header }]);
      eqJson(flat(h), samples, `consumer channels=${channels}: 1-byte chunks`);
    }
    // arbitrary partitions
    for (const seed of [3, 77, 20261113]) {
      const sizes = randPartition(bytes.length, 5, seed);
      const h = await collect([{ chunks: chunkBySizes(bytes, sizes), headers: header }]);
      eqJson(flat(h), samples, `consumer channels=${channels}: partition seed=${seed}`);
      ok(
        blocks(h).every((d) => d.length % channels === 0),
        `consumer channels=${channels}: no partial frames pushed`,
      );
    }
    // non-zero byteOffset chunk views + an empty chunk in the middle
    {
      const padded = new Uint8Array(bytes.length + 3);
      padded.set([1, 2, 3], 0);
      padded.set(bytes, 3);
      const mid = padded.subarray(3, 3 + Math.floor(bytes.length / 2));
      const tail = padded.subarray(3 + Math.floor(bytes.length / 2), 3 + bytes.length);
      const h = await collect([{ chunks: [mid, new Uint8Array(0), tail], headers: header }]);
      eqJson(flat(h), samples, `consumer channels=${channels}: byteOffset views + empty chunk`);
    }
    // end residual: one extra trailing byte is never emitted
    {
      const withTail = new Uint8Array(bytes.length + 1);
      withTail.set(bytes, 0);
      withTail[bytes.length] = 0xab;
      const h = await collect([
        { chunks: [withTail.slice(0, Math.floor(bytes.length / 2)), withTail.slice(Math.floor(bytes.length / 2))], headers: header },
      ]);
      eqJson(flat(h), samples, `consumer channels=${channels}: trailing partial byte is dropped`);
    }
  }

  // session reset: a second, unrelated stream must not inherit the first's tail
  {
    const a = encodeLE(MONO);
    const b = encodeLE([500, -500, 1000, -1000]);
    const hA = await collect([{ chunks: [a.slice(0, 15), a.slice(15)] }]);
    const hB = await collect([{ chunks: [b] }]);
    eqJson(flat(hA), MONO, 'consumer session A decodes its own stream');
    eqJson(flat(hB), [500, -500, 1000, -1000], 'consumer session B starts clean (no carry bleed)');
  }

  // reconnect inside ONE handle: stream A ends mid-frame, then stream B arrives
  {
    const a = encodeLE(MONO);
    const withTail = new Uint8Array(a.length + 1);
    withTail.set(a, 0);
    withTail[a.length] = 0xab;
    const b = encodeLE([500, -500, 1000, -1000]);
    const h = runConsumer([
      { chunks: [withTail.slice(0, 15), withTail.slice(15)] },
      { chunks: [b] },
    ]);
    await sleepMs(650);
    h.handle.stop();
    await tick(3);
    const all = flat(h);
    eqJson(all.slice(-4), [500, -500, 1000, -1000], 'reconnect: new stream decodes cleanly after the old one');
    ok(all.length === MONO.length + 4, `reconnect: only whole frames from both streams were pushed (got ${all.length})`);
  }

  // clock agreement: the stream timestamp/picture clock must advance by
  // COMPLETED samples, never by a raw byte count that includes partial frames.
  for (const [channels, samples] of [
    [1, MONO],
    [2, STEREO],
  ] as const) {
    const bytes = encodeLE(samples);
    const bpf = 2 * channels;
    const bytesPerMs = (16000 * channels * 2) / 1000;
    const headerTs = 1_700_000_000_000;
    // 1-byte chunks guarantee partial-frame chunks exist (RED diverges).
    const chunks = Array.from({ length: bytes.length }, (_, i) => bytes.slice(i, i + 1));
    const h = await collect(
      [{ chunks, headers: { 'x-audio-rate': '16000', 'x-audio-channels': String(channels), 'x-stream-ts': String(headerTs) } }],
      false,
    );
    // expected: one observation per COMPLETED block, stamped at completed bytes
    let carry = 0;
    let emitted = 0;
    const expected: number[] = [];
    for (const c of chunks) {
      const total = carry + c.length;
      const frames = Math.floor(total / bpf);
      if (frames <= 0) {
        carry = total;
        continue;
      }
      expected.push(headerTs + emitted / bytesPerMs);
      emitted += frames * bpf;
      carry = total - frames * bpf;
    }
    eqJson(h.observes.map((o) => o.ts), expected, `clock channels=${channels}: observations match completed samples`);
    ok(
      h.observes.length === expected.length && expected.length > 1,
      `clock channels=${channels}: one observation per completed block (got ${h.observes.length})`,
    );
  }
}

// ── run ───────────────────────────────────────────────────────────────────
void (async () => {
  try {
    await consumerSuite();
  } catch (e) {
    fail('consumer suite threw', e);
  }
  if (failures > 0) {
    console.error(`pcm-frames: ${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('pcm-frames: all assertions passed');
  process.exit(0);
})();
