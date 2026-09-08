/**
 * Backend inspector probes — measure the REAL deployment the sim emulates.
 *
 * Grounded in live readouts (re-measured 2026-09-08 13:20 PST):
 *   - PocketBase :8090 /api/health            -> {"code":200,"message":"API is healthy."}
 *   - OpenResty   :80   /health               -> 200
 *   - thermal-ws  :8080 HTTP root             -> 426 Upgrade Required (WS-only service, alive)
 *   - Mosquitto   :1883                       -> TCP refused (DOWN)
 *   - ValKey      :6380                       -> TCP-only, no HTTP surface
 *   - pigpulse-bridge.service                 -> ActiveState=activating, NRestarts climbing (5347)
 *
 * Probing rules (honesty first):
 *   - Verdict is a TRI-STATE: 'up' | 'down' | 'unreachable'. A browser
 *     CORS/network failure is NOT the same as a dead service — the dev
 *     sandbox must never blur those.
 *   - TCP services are only probeable from Node (net.connect); in a browser
 *     they report 'unreachable' with a local `nc -z` hint, never 'down'.
 *   - Every injectable probe (fetch / WebSocket / net) is unit-testable.
 */

export type ServiceKind = 'http' | 'ws' | 'tcp';
export type Verdict = 'up' | 'down' | 'unreachable';

export interface BackendServiceSpec {
  id: string;
  label: string;
  kind: ServiceKind;
  url?: string; // http(s) or ws(s) endpoint for http/ws kinds
  host?: string; // tcp kinds
  port?: number;
  /** Success predicates for http kinds. */
  healthyWhen?: {
    statuses?: number[]; // e.g. [200] or [426] for upgrade-required services
    bodyIncludes?: string | RegExp;
  };
}

export interface ProbeResult {
  service: BackendServiceSpec;
  verdict: Verdict;
  latencyMs: number;
  status?: number;
  body?: string;
  detail: string;
  /** Extra context (root-cause chain, mirror ids…) for the inspector UI. */
  evidence?: string;
}

export interface ProbeImpls {
  fetchImpl?: typeof fetch;
  wsImpl?: (url: string, timeoutMs: number) => Promise<{ opened: boolean; error?: string }>;
  netImpl?: (
    host: string,
    port: number,
    timeoutMs: number
  ) => Promise<{ connected: boolean; error?: string }>;
}

export const isNode = (): boolean =>
  typeof process !== 'undefined' && !!process.versions?.node;

// ---- individual probes -----------------------------------------------------

export async function probeHttp(
  spec: BackendServiceSpec,
  timeoutMs = 2500,
  fetchImpl: typeof fetch = fetch
): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetchImpl(spec.url!, { signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.text();
    const ok = !!spec.healthyWhen?.statuses?.includes(res.status) &&
      (spec.healthyWhen?.bodyIncludes === undefined ||
        (typeof spec.healthyWhen.bodyIncludes === 'string'
          ? body.includes(spec.healthyWhen.bodyIncludes)
          : spec.healthyWhen.bodyIncludes.test(body)));
    return {
      service: spec,
      verdict: ok ? 'up' : 'down',
      latencyMs: Date.now() - started,
      status: res.status,
      body,
      detail: ok
        ? `${spec.label} answered HTTP ${res.status} in ${Date.now() - started}ms`
        : `${spec.label} answered HTTP ${res.status} — expected ${spec.healthyWhen?.statuses?.join('/')}`
    };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    // A thrown fetch means we could not read the endpoint at all — CORS
    // blocks from a browser, ECONNREFUSED from Node. We cannot tell which
    // from the error alone, so the honest tri-state label is 'unreachable'.
    return {
      service: spec,
      verdict: 'unreachable',
      latencyMs: Date.now() - started,
      detail: `${spec.label} unreachable (${msg}) — live read requires a direct (non-CORS) request`
    };
  }
}

export async function probeWs(
  spec: BackendServiceSpec,
  timeoutMs = 2500,
  wsImpl = defaultWsProbe
): Promise<ProbeResult> {
  const started = Date.now();
  const { opened, error } = await wsImpl(spec.url!, timeoutMs);
  return {
    service: spec,
    verdict: opened ? 'up' : 'down',
    latencyMs: Date.now() - started,
    detail: opened
      ? `${spec.label} WebSocket handshake OK`
      : `${spec.label} handshake failed (${error ?? 'timeout'})`
  };
}

export async function probeTcp(
  spec: BackendServiceSpec,
  timeoutMs = 2500,
  netImpl = defaultTcpProbe
): Promise<ProbeResult> {
  const started = Date.now();
  if (!isNode()) {
    return {
      service: spec,
      verdict: 'unreachable',
      latencyMs: 0,
      detail: `${spec.label} is TCP-only — not probeable from the browser; check locally with \`nc -zv ${spec.host} ${spec.port}\``
    };
  }
  const { connected, error } = await netImpl(spec.host!, spec.port!, timeoutMs);
  return {
    service: spec,
    verdict: connected ? 'up' : 'down',
    latencyMs: Date.now() - started,
    detail: connected
      ? `${spec.label} TCP ${spec.host}:${spec.port} open`
      : `${spec.label} TCP ${spec.host}:${spec.port} refused${error ? ` (${error})` : ''}`
  };
}

export async function probeService(
  spec: BackendServiceSpec,
  impls: ProbeImpls = {}
): Promise<ProbeResult> {
  switch (spec.kind) {
    case 'http':
      return probeHttp(spec, 2500, impls.fetchImpl);
    case 'ws':
      return probeWs(spec, 2500, impls.wsImpl);
    case 'tcp':
      return probeTcp(spec, 2500, impls.netImpl);
  }
}

// ---- orchestrator with root-cause synthesis --------------------------------

export interface ProbeAllOptions {
  /** Measured systemd counter: `systemctl show pigpulse-bridge -p NRestarts`. */
  bridgeRestarts?: number;
}

export async function probeAll(
  specs: BackendServiceSpec[],
  impls: ProbeImpls = {},
  opts: ProbeAllOptions = {}
): Promise<{ results: ProbeResult[]; diagnosis: string[] }> {
  const results = await Promise.all(specs.map((s) => probeService(s, impls)));
  return { results, diagnosis: synthesize(results, opts.bridgeRestarts) };
}

function synthesize(results: ProbeResult[], bridgeRestarts = 0): string[] {
  const lines: string[] = [];
  const byId = new Map(results.map((r) => [r.service.id, r]));
  const mosquitto = byId.get('mosquitto');
  const openresty = byId.get('openresty');
  const pb = byId.get('pocketbase');

  if (mosquitto && mosquitto.verdict === 'down') {
    lines.push(
      'MQTT broker unreachable (TCP :1883 refused) — the firmware sink is dark.'
    );
    if (openresty?.verdict === 'up') {
      lines.push(
        'OpenResty gateway is UP, so its /mqtt WebSocket endpoint is a dead hop until Mosquitto returns.'
      );
    }
    lines.push(
      bridgeRestarts > 0
        ? `Root cause chain: Mosquitto DOWN → pigpulse-bridge cannot connect — bridge daemon crash-loops (NRestarts=${bridgeRestarts}, climbing).`
        : 'Root cause chain: Mosquitto DOWN → pigpulse-bridge cannot connect — bridge daemon will crash-loop (NRestarts not externally readable from the browser).'
    );
  }
  if (pb && pb.verdict === 'down' && openresty?.verdict === 'up') {
    lines.push('PocketBase DOWN behind a live gateway — telemetry cannot be persisted (bridge retries).');
  }
  return lines;
}

// ---- live deployment spec (measured) ----------------------------------------

export const LIVE_BACKEND: BackendServiceSpec[] = [
  {
    id: 'pocketbase',
    label: 'PocketBase',
    kind: 'http',
    url: 'http://127.0.0.1:8090/api/health',
    healthyWhen: { statuses: [200], bodyIncludes: 'API is healthy' }
  },
  {
    id: 'openresty',
    label: 'OpenResty gateway',
    kind: 'http',
    url: 'http://127.0.0.1:80/health',
    healthyWhen: { statuses: [200] }
  },
  {
    id: 'thermal-ws',
    label: 'Thermal WS service',
    kind: 'http',
    url: 'http://127.0.0.1:8080/',
    healthyWhen: { statuses: [426] } // WS-only: an upgrade-required answer IS alive
  },
  {
    id: 'mosquitto',
    label: 'Mosquitto MQTT',
    kind: 'tcp',
    host: '127.0.0.1',
    port: 1883
  },
  {
    id: 'valkey',
    label: 'ValKey (cache)',
    kind: 'tcp',
    host: '127.0.0.1',
    port: 6380
  }
];

// ---- default injectables -----------------------------------------------------

async function defaultWsProbe(
  url: string,
  timeoutMs: number
): Promise<{ opened: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (typeof WebSocket === 'undefined') {
      resolve({ opened: false, error: 'WebSocket unavailable in this runtime' });
      return;
    }
    let done = false;
    const finish = (r: { opened: boolean; error?: string }) => {
      if (!done) {
        done = true;
        resolve(r);
      }
    };
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      finish({ opened: false, error: String(err) });
      return;
    }
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      finish({ opened: false, error: 'timeout' });
    }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* noop */
      }
      finish({ opened: true });
    };
    ws.onerror = () => {
      clearTimeout(timer);
      finish({ opened: false, error: 'connection error' });
    };
  });
}

async function defaultTcpProbe(
  host: string,
  port: number,
  timeoutMs: number
): Promise<{ connected: boolean; error?: string }> {
  // Dynamic import keeps the browser bundle clean.
  const net = (await import('net')) as typeof import('net');
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    let done = false;
    const finish = (r: { connected: boolean; error?: string }) => {
      if (!done) {
        done = true;
        sock.destroy();
        resolve(r);
      }
    };
    sock.setTimeout(timeoutMs);
    sock.on('connect', () => finish({ connected: true }));
    sock.on('timeout', () => finish({ connected: false, error: 'timeout' }));
    sock.on('error', (err: NodeJS.ErrnoException) =>
      finish({
        connected: false,
        error: err.code === 'ECONNREFUSED' ? 'connection refused' : err.message
      })
    );
  });
}

export default { probeAll, probeService, LIVE_BACKEND, isNode };