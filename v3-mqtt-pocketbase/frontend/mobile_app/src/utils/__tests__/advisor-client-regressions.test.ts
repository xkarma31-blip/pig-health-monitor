/**
 * Behavioral regressions for the advisor client (B4, parent-3 round).
 *
 * These import the REAL client and exercise stalls that ignore abort, a
 * pre-aborted external signal, and a mode switch while a request is pending.
 * They are behavioral RED before the fix (not a missing-module proof): the
 * client must settle, must not call the transport, and must cancel the
 * preceding request.
 *
 * Fakes only: injected transport + injected fake clock. No network, no real
 * long timers.
 */
import {
  createAdvisorClient,
  type AdvisorClientConfig,
  type AdvisorTransport,
  type AdvisorTransportInit,
  type AdvisorTransportResponse,
} from '../advisor-client';

let failures = 0;
const report = (...args: unknown[]) => console.error(...args);
function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const user = (content: string) => ({ role: 'user' as const, content });

function response(status: number, body: unknown): AdvisorTransportResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

interface RecordedCall {
  endpoint: string;
  init: AdvisorTransportInit;
}
function recorder(handler: (call: RecordedCall) => Promise<AdvisorTransportResponse>) {
  const calls: RecordedCall[] = [];
  const transport: AdvisorTransport = (endpoint, init) => {
    const call: RecordedCall = { endpoint, init };
    calls.push(call);
    return handler(call);
  };
  return { transport, calls };
}

function fakeClock() {
  let nextId = 0;
  let lastMs: number | null = null;
  const timers = new Map<number, () => void>();
  const clock: NonNullable<AdvisorClientConfig['clock']> = {
    setTimeout: (handler: () => void, ms: number) => {
      lastMs = ms;
      const id = (nextId += 1);
      timers.set(id, handler);
      return id;
    },
    clearTimeout: (handle: unknown) => {
      timers.delete(handle as number);
    },
  };
  return {
    clock,
    pending: () => timers.size,
    lastMs: () => lastMs,
    fire: () => {
      const handlers = [...timers.values()];
      timers.clear();
      for (const handler of handlers) handler();
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Flush microtasks until `predicate` holds (or `ticks` elapse). */
async function flushed(predicate: () => boolean, ticks = 60): Promise<boolean> {
  for (let index = 0; index < ticks; index += 1) {
    if (predicate()) return true;
    await Promise.resolve();
  }
  return predicate();
}

const CLOUD_ENDPOINT = 'https://trusted.example/v1/advisor';
function enabledCloud(overrides: Partial<NonNullable<AdvisorClientConfig['cloud']>> = {}) {
  return { enabled: true, destination: 'trusted-free-provider', consent: true, endpoint: CLOUD_ENDPOINT, ...overrides };
}

async function main() {
  // (1a) Headers arrive, then the body (text()) never resolves AND ignores
  //      abort. The deadline fires only AFTER headers were processed, so the
  //      client must race the full-body read against the deadline for the send
  //      to settle (not stay pending) as `timeout`.
  {
    const fake = fakeClock();
    let settled: unknown = null;
    const { transport, calls } = recorder(async () => ({
      ok: true,
      status: 200,
      text: () => new Promise<string>(() => {}),
    }));
    const client = createAdvisorClient({ transport, cloud: enabledCloud(), timeoutMs: 8000, clock: fake.clock });
    const pending = client.send({ mode: 'cloud', messages: [user('hi')] });
    void pending.then((result) => {
      settled = result;
    });
    // Let the headers land so the client is blocked inside the full-body read.
    await flushed(() => false, 16);
    expectEq(settled, null, 'body stall is still pending before the deadline fires');
    fake.fire();
    const done = await flushed(() => settled !== null);
    expectEq(done, true, 'body stall that ignores abort must settle after the deadline (not stay pending)');
    if (settled) expectEq((settled as { error?: { code?: string } }).error?.code, 'timeout', 'body stall -> timeout');
    expectEq(calls.length, 1, 'body stall issues exactly one transport call');
  }

  // (1b) Headers arrive, then the body read rejects when the signal aborts.
  //      That must classify as `timeout`, NOT be masked as `upstream`.
  {
    const fake = fakeClock();
    let settled: unknown = null;
    const { transport } = recorder(async (call) => ({
      ok: true,
      status: 200,
      text: () =>
        new Promise<string>((_resolve, reject) => {
          const fail = () => reject(new Error('body read aborted'));
          if (call.init.signal.aborted) fail();
          else call.init.signal.addEventListener('abort', fail);
        }),
    }));
    const client = createAdvisorClient({ transport, cloud: enabledCloud(), timeoutMs: 8000, clock: fake.clock });
    const pending = client.send({ mode: 'cloud', messages: [user('hi')] });
    void pending.then((result) => {
      settled = result;
    });
    await flushed(() => false, 16);
    fake.fire();
    const done = await flushed(() => settled !== null);
    expectEq(done, true, 'abort-rejecting body read settles');
    if (settled) expectEq((settled as { error?: { code?: string } }).error?.code, 'timeout', 'abort-rejecting body read -> timeout (not upstream)');
  }

  // (2) Transport never resolves AND ignores abort (header stall).
  {
    const fake = fakeClock();
    let settled: unknown = null;
    const { transport } = recorder(() => new Promise<AdvisorTransportResponse>(() => {}));
    const client = createAdvisorClient({ transport, cloud: enabledCloud(), timeoutMs: 8000, clock: fake.clock });
    const pending = client.send({ mode: 'cloud', messages: [user('hi')] });
    void pending.then((result) => {
      settled = result;
    });
    fake.fire();
    const done = await flushed(() => settled !== null);
    expectEq(done, true, 'header stall that ignores abort must settle after the deadline');
    if (settled) expectEq((settled as { error?: { code?: string } }).error?.code, 'timeout', 'header stall -> timeout');
  }

  // (3) A pre-aborted external signal must issue ZERO transport calls.
  {
    const { transport, calls } = recorder(async () => response(200, { reply: 'should not happen' }));
    const client = createAdvisorClient({ transport, cloud: enabledCloud() });
    const controller = new AbortController();
    controller.abort();
    const result = await client.send({ mode: 'cloud', messages: [user('hi')] }, { signal: controller.signal });
    expectEq(result.ok, false, 'pre-aborted signal fails');
    if (!result.ok) expectEq(result.error.code, 'cancelled', 'pre-aborted signal -> cancelled');
    expectEq(calls.length, 0, 'pre-aborted signal issues zero transport calls');
  }

  // (4) Switching to offline while a cloud request is pending must invalidate
  //     and cancel the preceding request; a late cloud success must not revive.
  {
    const fake = fakeClock();
    let firstSettled: unknown = null;
    const gate = deferred<AdvisorTransportResponse>();
    const { transport, calls } = recorder(async () => gate.promise);
    const client = createAdvisorClient({ transport, cloud: enabledCloud(), clock: fake.clock });
    const cloudPending = client.send({ mode: 'cloud', messages: [user('cloud question')] });
    void cloudPending.then((result) => {
      firstSettled = result;
    });
    const offline = await client.send({ mode: 'offline', messages: [user('hello')] });
    expectEq(offline.ok, true, 'mode switch to offline succeeds');
    const cancelledSoon = await flushed(() => firstSettled !== null);
    expectEq(cancelledSoon, true, 'preceding cloud request is invalidated by the mode switch');
    if (firstSettled) expectEq((firstSettled as { error?: { code?: string } }).error?.code, 'cancelled', 'preceding cloud request -> cancelled');
    gate.resolve(response(200, { reply: 'late cloud success' }));
    await flushed(() => false, 8);
    if (firstSettled) expectEq((firstSettled as { ok?: boolean }).ok, false, 'late cloud completion does not succeed');
    expectEq(calls.length, 1, 'mode switch does not re-issue the cloud request');
  }

  // (4b) A superseding send that FAILS VALIDATION must still cancel the
  //      preceding request (supersede happens before validation).
  {
    const fake = fakeClock();
    let firstSettled: unknown = null;
    const gate = deferred<AdvisorTransportResponse>();
    const { transport, calls } = recorder(async () => gate.promise);
    const client = createAdvisorClient({ transport, cloud: enabledCloud(), clock: fake.clock });
    const first = client.send({ mode: 'cloud', messages: [user('a')] });
    void first.then((result) => {
      firstSettled = result;
    });
    const bad = await client.send({ mode: 'cloud' }); // missing messages -> invalid
    expectEq(bad.ok, false, 'invalid send fails');
    if (!bad.ok) expectEq(bad.error.code, 'invalid', 'invalid send -> invalid');
    const cancelledSoon = await flushed(() => firstSettled !== null);
    expectEq(cancelledSoon, true, 'invalid send cancels the preceding request');
    if (firstSettled) expectEq((firstSettled as { error?: { code?: string } }).error?.code, 'cancelled', 'preceding -> cancelled on invalid send');
    expectEq(calls.length, 1, 'an invalid send issues no new transport call');
  }

  // (4c) A superseding send into the DISABLED early return must still cancel
  //      the preceding request.
  {
    const fake = fakeClock();
    let firstSettled: unknown = null;
    const gate = deferred<AdvisorTransportResponse>();
    const { transport, calls } = recorder(async () => gate.promise);
    const cloud = enabledCloud();
    const client = createAdvisorClient({ transport, cloud, clock: fake.clock });
    const first = client.send({ mode: 'cloud', messages: [user('a')] });
    void first.then((result) => {
      firstSettled = result;
    });
    cloud.enabled = false; // withdrawn consent/config before the next send
    const disabled = await client.send({ mode: 'cloud', messages: [user('b')] });
    expectEq(disabled.ok, false, 'disabled send fails');
    if (!disabled.ok) expectEq(disabled.error.code, 'disabled', 'disabled send -> disabled');
    const cancelledSoon = await flushed(() => firstSettled !== null);
    expectEq(cancelledSoon, true, 'disabled send cancels the preceding request');
    if (firstSettled) expectEq((firstSettled as { error?: { code?: string } }).error?.code, 'cancelled', 'preceding -> cancelled on disabled send');
    expectEq(calls.length, 1, 'a disabled send issues no new transport call');
  }

  // (5) Timeout configuration: non-finite/huge values must not disable the deadline.
  {
    const huge = fakeClock();
    const { transport } = recorder(() => new Promise<AdvisorTransportResponse>(() => {}));
    const client = createAdvisorClient({ transport, cloud: enabledCloud(), timeoutMs: 9_999_999, clock: huge.clock });
    void client.send({ mode: 'cloud', messages: [user('hi')] });
    const capped = huge.lastMs();
    expectEq(capped !== null && capped <= 60_000, true, 'a huge timeoutMs is capped to a sane maximum');
    client.cancel();

    const infinite = fakeClock();
    const infiniteClient = createAdvisorClient({
      transport,
      cloud: enabledCloud(),
      timeoutMs: Number.POSITIVE_INFINITY,
      clock: infinite.clock,
    });
    let settled: unknown = null;
    void infiniteClient.send({ mode: 'cloud', messages: [user('hi')] }).then((result) => {
      settled = result;
    });
    expectEq(infinite.pending(), 1, 'non-finite timeoutMs still arms a finite deadline');
    infinite.fire();
    await flushed(() => settled !== null);
    if (settled) expectEq((settled as { error?: { code?: string } }).error?.code, 'timeout', 'non-finite timeoutMs still times out');
  }
}

main()
  .then(() => {
    if (failures > 0) {
      report(`${failures} advisor-client-regressions assertion(s) failed`);
      process.exit(1);
    }
    console.log('advisor-client-regressions: all assertions passed');
  })
  .catch((error: unknown) => {
    report('advisor-client-regressions: unexpected harness error', error);
    process.exit(1);
  });
