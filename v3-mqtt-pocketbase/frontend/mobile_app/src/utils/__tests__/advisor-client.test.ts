/**
 * Behavioral tests for the pure advisor client (B4).
 *
 * RED-first: imports modules that do not exist yet, so this file must fail with
 * a module-resolution error before implementation. Plain assertion style, same
 * convention as telemetry-time.test.ts; run with the canonical local tsx:
 *   node_modules/.bin/tsx <this file>
 *
 * Every transport here is a fake in-memory function. No network, no real
 * timers (an injected fake clock), no provider/system access.
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
function expectTrue(value: boolean, label: string) {
  if (!value) {
    failures += 1;
    report(`FAIL ${label}`);
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

interface FakeClock {
  clock: AdvisorClientConfig['clock'];
  pending(): number;
  fire(): void;
}
function fakeClock(): FakeClock & { clock: NonNullable<AdvisorClientConfig['clock']> } {
  let nextId = 0;
  const timers = new Map<number, () => void>();
  const clock = {
    setTimeout: (handler: () => void, _ms: number) => {
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
    fire: () => {
      const handlers = [...timers.values()];
      timers.clear();
      for (const handler of handlers) handler();
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const CLOUD_ENDPOINT = 'https://trusted.example/v1/advisor';
function enabledCloud(overrides: Partial<NonNullable<AdvisorClientConfig['cloud']>> = {}) {
  return { enabled: true, destination: 'trusted-free-provider', consent: true, endpoint: CLOUD_ENDPOINT, ...overrides };
}

async function main() {
  // ── Offline help makes ZERO external calls ─────────────────────────────
  {
    const { transport, calls } = recorder(async () => response(200, { reply: 'never used' }));
    const client = createAdvisorClient({ transport });
    const result = await client.send({ mode: 'offline', messages: [user('help')] });
    expectEq(result.ok, true, 'offline send succeeds');
    if (result.ok) {
      expectEq(result.response.mode, 'offline', 'offline response mode');
      expectTrue(result.response.reply.trim().length > 0, 'offline reply is nonempty');
      expectEq(result.response.engine, 'offline-help', 'offline engine label');
    }
    expectEq(calls.length, 0, 'offline makes zero transport calls');
  }

  // ── Local unavailable → unavailable, NEVER a cloud fallback ────────────
  {
    const { transport, calls } = recorder(async () => response(200, { reply: 'sneaky cloud' }));
    const client = createAdvisorClient({ transport, local: { available: false }, cloud: enabledCloud() });
    const result = await client.send({ mode: 'local', messages: [user('hi')] });
    expectEq(result.ok, false, 'local unavailable fails');
    if (!result.ok) expectEq(result.error.code, 'unavailable', 'local unavailable code');
    expectEq(calls.length, 0, 'local failure never falls back to the cloud transport');
  }
  {
    const client = createAdvisorClient({ local: { available: true } }); // no transport at all
    const result = await client.send({ mode: 'local', messages: [user('hi')] });
    expectEq(result.ok, false, 'local without a transport fails');
    if (!result.ok) expectEq(result.error.code, 'unavailable', 'no-transport local is unavailable');
  }

  // ── Cloud is DISABLED by default and needs every explicit gate ─────────
  {
    const noConfig = createAdvisorClient({});
    const a = await noConfig.send({ mode: 'cloud', messages: [user('hi')] });
    expectEq(a.ok, false, 'cloud with no config fails');
    if (!a.ok) expectEq(a.error.code, 'disabled', 'cloud defaults to disabled');

    const noConsent = createAdvisorClient({ transport: recorder(async () => response(200, { reply: 'x' })).transport, cloud: enabledCloud({ consent: false }) });
    const b = await noConsent.send({ mode: 'cloud', messages: [user('hi')] });
    expectEq(b.ok, false, 'cloud without consent fails');
    if (!b.ok) expectEq(b.error.code, 'disabled', 'missing consent -> disabled');

    const noDestination = createAdvisorClient({ transport: recorder(async () => response(200, { reply: 'x' })).transport, cloud: enabledCloud({ destination: '' }) });
    const c = await noDestination.send({ mode: 'cloud', messages: [user('hi')] });
    expectEq(c.ok, false, 'cloud without destination fails');
    if (!c.ok) expectEq(c.error.code, 'disabled', 'missing destination -> disabled');

    const noTransport = createAdvisorClient({ cloud: enabledCloud() });
    const d = await noTransport.send({ mode: 'cloud', messages: [user('hi')] });
    expectEq(d.ok, false, 'cloud without transport fails');
    if (!d.ok) expectEq(d.error.code, 'disabled', 'missing transport -> disabled');
  }

  // ── No opaque context field in the foundation (rejected for every mode) ─
  {
    const { transport, calls } = recorder(async () => response(200, { reply: 'x' }));
    const client = createAdvisorClient({ transport, cloud: enabledCloud(), local: { available: true } });
    const cloudCtx = await client.send({ mode: 'cloud', messages: [user('hi')], context: { sensors: [{ id: 'a' }] } });
    expectEq(cloudCtx.ok, false, 'cloud with context fails');
    if (!cloudCtx.ok) expectEq(cloudCtx.error.code, 'invalid', 'cloud context -> invalid');
    const localCtx = await client.send({ mode: 'local', messages: [user('hi')], context: { sensors: [{ id: 'a' }] } });
    expectEq(localCtx.ok, false, 'local with context fails');
    if (!localCtx.ok) expectEq(localCtx.error.code, 'invalid', 'local context -> invalid');
    expectEq(calls.length, 0, 'a context field never reaches the transport');
  }

  // ── An explicitly empty endpoint is rejected, never sent as relative '' ─
  {
    const { transport, calls } = recorder(async () => response(200, { reply: 'x' }));
    const cloudEmpty = createAdvisorClient({ transport, cloud: enabledCloud({ endpoint: '' }) });
    const a = await cloudEmpty.send({ mode: 'cloud', messages: [user('hi')] });
    expectEq(a.ok, false, 'cloud with an empty endpoint fails');
    if (!a.ok) expectEq(a.error.code, 'disabled', 'empty cloud endpoint -> disabled');
    const localEmpty = createAdvisorClient({ transport, local: { available: true, endpoint: '' } });
    const b = await localEmpty.send({ mode: 'local', messages: [user('hi')] });
    expectEq(b.ok, false, 'local with an empty endpoint fails');
    if (!b.ok) expectEq(b.error.code, 'unavailable', 'empty local endpoint -> unavailable');
    expectEq(calls.length, 0, 'an empty endpoint never reaches the transport');
  }

  // ── Cloud happy path: versioned payload, no context, trusted endpoint ──
  {
    const { transport, calls } = recorder(async () => response(200, { reply: '  trimmed reply  ' }));
    const client = createAdvisorClient({ transport, cloud: enabledCloud() });
    const result = await client.send({ mode: 'cloud', messages: [user('hello there')] });
    expectEq(result.ok, true, 'cloud send succeeds');
    if (result.ok) {
      expectEq(result.response.reply, 'trimmed reply', 'cloud reply trimmed');
      expectEq(result.response.mode, 'cloud', 'cloud response mode');
    }
    expectEq(calls.length, 1, 'cloud makes exactly one call');
    if (calls.length === 1) {
      const call = calls[0];
      expectEq(call.endpoint, CLOUD_ENDPOINT, 'endpoint comes from trusted config');
      expectEq(call.init.method, 'POST', 'cloud uses POST');
      const body = JSON.parse(call.init.body) as Record<string, unknown>;
      expectEq(body.version, 1, 'payload carries contract version');
      expectEq(body.mode, 'cloud', 'payload carries mode');
      expectTrue(Array.isArray(body.messages), 'payload carries messages');
      expectEq('context' in body, false, 'cloud payload has no context field');
      const serialized = JSON.stringify(call.init);
      expectEq(serialized.includes('apiKey'), false, 'no apiKey smuggled into the request');
      expectEq(serialized.includes('Bearer'), false, 'no bearer token smuggled into the request');
    }
  }

  // ── Local happy path: versioned payload, trusted endpoint, no context ──
  {
    const { transport, calls } = recorder(async () => response(200, { reply: 'ok' }));
    const client = createAdvisorClient({ transport, local: { available: true, endpoint: 'local://pi-advisor' } });
    const result = await client.send({ mode: 'local', messages: [user('how are the pens?')] });
    expectEq(result.ok, true, 'local send succeeds');
    if (result.ok) expectEq(result.response.mode, 'local', 'local response mode');
    expectEq(calls.length, 1, 'local makes exactly one call');
    if (calls.length === 1) {
      expectEq(calls[0].endpoint, 'local://pi-advisor', 'local endpoint comes from trusted config');
      const body = JSON.parse(calls[0].init.body) as Record<string, unknown>;
      expectEq(body.version, 1, 'local payload carries contract version');
      expectEq(body.mode, 'local', 'local payload carries mode');
      expectEq('context' in body, false, 'local payload has no context field');
    }
  }

  // ── Status → stable error mapping ──────────────────────────────────────
  {
    const cases: Array<[number, string]> = [
      [401, 'auth'],
      [403, 'auth'],
      [429, 'rate'],
      [400, 'upstream'],
      [500, 'upstream'],
      [503, 'upstream'],
    ];
    for (const [status, code] of cases) {
      const { transport } = recorder(async () => response(status, { error: 'ignored detail' }));
      const client = createAdvisorClient({ transport, cloud: enabledCloud() });
      const result = await client.send({ mode: 'cloud', messages: [user('hi')] });
      expectEq(result.ok, false, `status ${status} fails`);
      if (!result.ok) expectEq(result.error.code, code, `status ${status} maps to ${code}`);
      if (!result.ok) expectTrue(!result.error.message.includes('ignored detail'), `status ${status} hides upstream detail`);
    }
  }

  // ── Blank / malformed / oversized replies are errors, not accepted ─────
  {
    const blank = createAdvisorClient({ transport: recorder(async () => response(200, { reply: '' })).transport, cloud: enabledCloud() });
    const a = await blank.send({ mode: 'cloud', messages: [user('hi')] });
    expectEq(a.ok, false, 'blank reply is rejected');
    if (!a.ok) expectEq(a.error.code, 'upstream', 'blank reply -> upstream');

    const malformed = createAdvisorClient({ transport: recorder(async () => response(200, 'not json')).transport, cloud: enabledCloud() });
    const b = await malformed.send({ mode: 'cloud', messages: [user('hi')] });
    expectEq(b.ok, false, 'malformed JSON reply is rejected');

    const empty = createAdvisorClient({ transport: recorder(async () => response(200, {})).transport, cloud: enabledCloud() });
    const c = await empty.send({ mode: 'cloud', messages: [user('hi')] });
    expectEq(c.ok, false, 'missing reply field is rejected');

    const huge = createAdvisorClient({ transport: recorder(async () => response(200, { reply: 'z'.repeat(9001) })).transport, cloud: enabledCloud() });
    const d = await huge.send({ mode: 'cloud', messages: [user('hi')] });
    expectEq(d.ok, false, 'oversized reply is rejected');
  }

  // ── Invalid requests never reach the transport ─────────────────────────
  {
    const { transport, calls } = recorder(async () => response(200, { reply: 'x' }));
    const client = createAdvisorClient({ transport, cloud: enabledCloud() });
    expectEq((await client.send({ mode: 'cloud' })).ok, false, 'missing messages rejected');
    expectEq((await client.send(null)).ok, false, 'null request rejected');
    expectEq((await client.send({ mode: 'cloud', messages: [user('hi')], apiKey: 'sk-secret' })).ok, false, 'unknown field rejected');
    expectEq(calls.length, 0, 'invalid requests make zero calls');
  }

  // ── Full-body deadline: one injected timer, aborts on timeout ──────────
  {
    const fake = fakeClock();
    let signalAborted = false;
    const { transport } = recorder(async (call) => {
      if (call.init.signal.aborted) signalAborted = true;
      else call.init.signal.addEventListener('abort', () => { signalAborted = true; });
      return new Promise<AdvisorTransportResponse>(() => {});
    });
    const client = createAdvisorClient({ transport, cloud: enabledCloud(), timeoutMs: 8000, clock: fake.clock });
    const pending = client.send({ mode: 'cloud', messages: [user('hi')] });
    expectEq(fake.pending(), 1, 'one deadline timer is armed per request');
    fake.fire();
    const result = await pending;
    expectEq(result.ok, false, 'timeout fails');
    if (!result.ok) expectEq(result.error.code, 'timeout', 'deadline expiry -> timeout');
    expectEq(signalAborted, true, 'transport signal is aborted on timeout');
    expectEq(fake.pending(), 0, 'deadline timer is cleared after settling');
  }

  // ── cancel() → cancelled (distinct from timeout) ───────────────────────
  {
    const fake = fakeClock();
    const gate = deferred<AdvisorTransportResponse>();
    const { transport } = recorder(async () => gate.promise);
    const client = createAdvisorClient({ transport, cloud: enabledCloud(), timeoutMs: 8000, clock: fake.clock });
    const pending = client.send({ mode: 'cloud', messages: [user('hi')] });
    client.cancel();
    const result = await pending;
    expectEq(result.ok, false, 'cancel fails the request');
    if (!result.ok) expectEq(result.error.code, 'cancelled', 'cancel -> cancelled');
    expectEq(fake.pending(), 0, 'cancel clears the deadline timer');
  }

  // ── Late completion after cancel is ignored ────────────────────────────
  {
    const fake = fakeClock();
    const gate = deferred<AdvisorTransportResponse>();
    const { transport } = recorder(async () => gate.promise);
    const client = createAdvisorClient({ transport, cloud: enabledCloud(), timeoutMs: 8000, clock: fake.clock });
    const pending = client.send({ mode: 'cloud', messages: [user('hi')] });
    client.cancel();
    gate.resolve(response(200, { reply: 'too late' }));
    const result = await pending;
    expectEq(result.ok, false, 'late completion is discarded');
    if (!result.ok) expectEq(result.error.code, 'cancelled', 'late completion stays cancelled');
  }

  // ── A newer send supersedes the in-flight one ──────────────────────────
  {
    const fake = fakeClock();
    let call = 0;
    const gate = deferred<AdvisorTransportResponse>();
    const { transport, calls } = recorder(async () => {
      call += 1;
      return call === 1 ? gate.promise : response(200, { reply: 'second wins' });
    });
    const client = createAdvisorClient({ transport, cloud: enabledCloud(), timeoutMs: 8000, clock: fake.clock });
    const first = client.send({ mode: 'cloud', messages: [user('first')] });
    const second = client.send({ mode: 'cloud', messages: [user('second')] });
    const [r1, r2] = await Promise.all([first, second]);
    expectEq(r1.ok, false, 'superseded request fails');
    if (!r1.ok) expectEq(r1.error.code, 'cancelled', 'superseded request is cancelled');
    expectEq(r2.ok, true, 'newest request succeeds');
    if (r2.ok) expectEq(r2.response.reply, 'second wins', 'newest reply is returned');
    expectEq(calls.length, 2, 'supersede still issued the new request');
  }

  // ── No automatic retry on failure ──────────────────────────────────────
  {
    const { transport, calls } = recorder(async () => response(500, { error: 'boom' }));
    const client = createAdvisorClient({ transport, cloud: enabledCloud(), clock: fakeClock().clock });
    const result = await client.send({ mode: 'cloud', messages: [user('hi')] });
    expectEq(result.ok, false, 'upstream failure surfaces');
    expectEq(calls.length, 1, 'a failed request is never retried automatically');
  }
}

// Run asynchronously; the runner (cjs output) has no top-level await, so the
// summary is emitted from the promise callbacks instead.
main()
  .then(() => {
    if (failures > 0) {
      report(`${failures} advisor-client assertion(s) failed`);
      process.exit(1);
    }
    console.log('advisor-client: all assertions passed');
  })
  .catch((error: unknown) => {
    report('advisor-client: unexpected harness error', error);
    process.exit(1);
  });
