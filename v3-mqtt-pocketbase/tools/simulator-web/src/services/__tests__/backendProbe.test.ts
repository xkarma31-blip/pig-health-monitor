import { describe, it, expect, vi } from 'vitest';
import {
  probeAll,
  probeHttp,
  probeService,
  probeTcp,
  probeWs,
  LIVE_BACKEND,
  ProbeImpls
} from '../backendProbe';
import type { BackendServiceSpec } from '../backendProbe';

const httpSpec = (id: string, url: string): BackendServiceSpec => ({
  id,
  label: id,
  kind: 'http',
  url,
  healthyWhen: { statuses: [200], bodyIncludes: 'healthy' }
});

const okFetch = () =>
  vi.fn(async () => {
    return {
      status: 200,
      text: async () => 'API is healthy'
    } as unknown as Response;
  });

describe('probeHttp', () => {
  it('reports up when status and body match the healthy predicate', async () => {
    const r = await probeHttp(httpSpec('pb', 'http://x/api/health'), 500, okFetch());
    expect(r.verdict).toBe('up');
    expect(r.status).toBe(200);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports down when the body does not match', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200, text: async () => 'oops' })) as unknown as typeof fetch;
    const r = await probeHttp(httpSpec('pb', 'http://x/api/health'), 500, fetchImpl);
    expect(r.verdict).toBe('down');
    expect(r.detail).toContain('HTTP 200');
  });

  it('reports down on unexpected status', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 503, text: async () => 'down' })) as unknown as typeof fetch;
    const r = await probeHttp(httpSpec('pb', 'http://x/api/health'), 500, fetchImpl);
    expect(r.verdict).toBe('down');
  });

  it('treats a fetch network error as unreachable, not down (browser honesty)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const r = await probeHttp(httpSpec('pb', 'http://x/api/health'), 500, fetchImpl);
    expect(r.verdict).toBe('unreachable');
    expect(r.detail).toContain('unreachable');
  });
});

describe('probeWs', () => {
  it('reports up when the WebSocket handshake opens', async () => {
    const wsImpl = vi.fn(async () => ({ opened: true }));
    const r = await probeWs(
      { id: 'mqtt', label: 'MQTT ws', kind: 'ws', url: 'ws://localhost/mqtt' },
      500,
      wsImpl
    );
    expect(r.verdict).toBe('up');
    expect(wsImpl).toHaveBeenCalledWith('ws://localhost/mqtt', 500);
  });

  it('reports down on a failed handshake', async () => {
    const r = await probeWs(
      { id: 'mqtt', label: 'MQTT ws', kind: 'ws', url: 'ws://localhost/mqtt' },
      500,
      async () => ({ opened: false, error: 'connection refused' })
    );
    expect(r.verdict).toBe('down');
    expect(r.detail).toContain('connection refused');
  });
});

describe('probeTcp', () => {
  it('reports down on connection refused — the mosquitto story', async () => {
    const netImpl = vi.fn(async () => ({ connected: false, error: 'connection refused' }));
    const r = await probeTcp(
      { id: 'mosquitto', label: 'Mosquitto', kind: 'tcp', host: '127.0.0.1', port: 1883 },
      500,
      netImpl
    );
    expect(r.verdict).toBe('down');
    expect(r.detail).toContain('refused');
  });

  it('reports up when the port is open', async () => {
    const r = await probeTcp(
      { id: 'valkey', label: 'ValKey', kind: 'tcp', host: '127.0.0.1', port: 6380 },
      500,
      async () => ({ connected: true })
    );
    expect(r.verdict).toBe('up');
  });
});

describe('probeService dispatch', () => {
  it('routes by kind and uses injected impls', async () => {
    const impls: ProbeImpls = {
      fetchImpl: okFetch(),
      wsImpl: async () => ({ opened: true }),
      netImpl: async () => ({ connected: true })
    };
    expect((await probeService({ id: 'a', label: 'A', kind: 'http', url: 'http://x', healthyWhen: { statuses: [200], bodyIncludes: 'healthy' } }, impls)).verdict).toBe('up');
    expect((await probeService({ id: 'b', label: 'B', kind: 'ws', url: 'ws://x' }, impls)).verdict).toBe('up');
    expect((await probeService({ id: 'c', label: 'C', kind: 'tcp', host: 'h', port: 1 }, impls)).verdict).toBe('up');
  });
});

describe('probeAll + root-cause synthesis', () => {
  it('synthesizes the mosquitto-down → bridge-crash-loop chain', async () => {
    const impls: ProbeImpls = {
      // PB + gateway answer 200; thermal-ws answers 426 (WS-only service alive)
      fetchImpl: vi.fn(async (url: string) => {
        const status = String(url).includes('8080') ? 426 : 200;
        return { status, text: async () => 'API is healthy' } as unknown as Response;
      }) as unknown as typeof fetch,
      wsImpl: async () => ({ opened: true }),
      netImpl: async (_host: string, port: number) =>
        ({ connected: port !== 1883 }) // mosquitto refused, others open
    };
    const { results, diagnosis } = await probeAll(LIVE_BACKEND, impls, {
      bridgeRestarts: 5347
    });
    const byId = Object.fromEntries(results.map((r) => [r.service.id, r.verdict]));
    expect(byId['pocketbase']).toBe('up');
    expect(byId['openresty']).toBe('up');
    expect(byId['thermal-ws']).toBe('up');
    expect(byId['mosquitto']).toBe('down');
    expect(byId['valkey']).toBe('up');
    expect(diagnosis.some((l) => l.includes('Root cause chain'))).toBe(true);
    expect(diagnosis.some((l) => l.includes('NRestarts=5347'))).toBe(true);
  });

  it('omits the mosquitto chain when the broker is reachable', async () => {
    const impls: ProbeImpls = {
      fetchImpl: okFetch(),
      wsImpl: async () => ({ opened: true }),
      netImpl: async () => ({ connected: true })
    };
    const { diagnosis } = await probeAll(LIVE_BACKEND, impls, { bridgeRestarts: 1 });
    expect(diagnosis.some((l) => l.includes('Root cause chain'))).toBe(false);
  });
});