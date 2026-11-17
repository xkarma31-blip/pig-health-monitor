/**
 * Expo Router server route: /api/pi
 *
 * Parity port of api/pi.js (Vercel). Read-only passthrough to the Pi console
 * through the laptop's read-only proxy. All keys stay server-side.
 */
const ALLOWED_ENDPOINTS = new Set([
  'data', 'ambient', 'esp/status', 'health', 'cctv',
  'esp/record', 'camera-audio', 'esp/stream', 'cough/api/status',
]);

// A HEAD must never start a real capture (the Pi allows one at a time).
const CAPTURE_ENDPOINTS = new Set(['esp/record', 'camera-audio', 'esp/stream']);

// Pi-clock headers for streamed/snapshot payloads — forwarded verbatim.
const CLOCK_HEADERS = [
  'x-stream-ts', 'x-frame-ts', 'x-audio-format', 'x-audio-rate', 'x-audio-channels',
];

function env(name: string): string {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers });
}

async function handle(request: Request): Promise<Response> {
  const upstream = env('PB_PROXY_URL').replace(/\/+$/, '');
  const key = env('PB_PROXY_KEY');
  if (!upstream || !key) return json({ error: 'pi backend not configured' }, 503);

  const url = new URL(request.url);
  const endpoint = (
    url.searchParams.get('ep') ||
    url.pathname.replace(/^\/api\/pi\/?/, '').replace(/\/+$/, '') ||
    'data'
  ).toLowerCase();
  if (!ALLOWED_ENDPOINTS.has(endpoint)) return json({ error: 'unsupported pi endpoint' }, 400);

  if (request.method === 'HEAD' && CAPTURE_ENDPOINTS.has(endpoint)) {
    return json({ error: 'this endpoint requires GET' }, 405, { Allow: 'GET, OPTIONS' });
  }

  const forwarded = new URLSearchParams(url.searchParams);
  forwarded.delete('ep');
  const query = forwarded.toString();
  const target = `${upstream}/pi/${endpoint}${query ? `?${query}` : ''}`;

  if (endpoint === 'esp/stream') {
    // Continuous barn-mic PCM: stream chunks as they arrive; the body never
    // ends, so buffering it would produce silence.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let r: Response;
    try {
      r = await fetch(target, {
        headers: { 'X-PigPulse-Key': key, Accept: 'application/octet-stream' },
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      return json({ error: 'mic stream unreachable' }, 502);
    }
    clearTimeout(timer);
    if (!r.ok) {
      return new Response((await r.text()) || 'mic stream unavailable', { status: r.status });
    }
    const headers: Record<string, string> = {
      'Content-Type': r.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Accel-Buffering': 'no',
    };
    for (const h of CLOCK_HEADERS) {
      const v = r.headers.get(h);
      if (v) headers[h] = v;
    }
    const upstreamBody = r.body;
    if (!upstreamBody) return new Response(null, { status: 200, headers });
    const stream = new ReadableStream<Uint8Array>({
      start(controller_) {
        const reader = upstreamBody.getReader();
        void (async () => {
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done || !value) break;
              controller_.enqueue(value);
            }
          } catch {
            // client aborted or upstream ended (idle-exit / ESP reconnect)
          } finally {
            try { controller_.close(); } catch { /* already closed */ }
          }
        })();
      },
      cancel() {
        controller.abort();
        void upstreamBody.cancel().catch(() => undefined);
      },
    });
    request.signal.addEventListener('abort', () => controller.abort());
    return new Response(stream, { status: 200, headers });
  }

  if (endpoint === 'cctv' || endpoint === 'esp/record' || endpoint === 'camera-audio') {
    // Binary passthrough; forward the Pi's honest status (e.g. 503 on stale mic).
    const isAudio = endpoint === 'esp/record' || endpoint === 'camera-audio';
    const ttl: Record<string, number> = { cctv: 15000, 'camera-audio': 35000, 'esp/record': 40000 };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ttl[endpoint]);
    try {
      const r = await fetch(target, { headers: { 'X-PigPulse-Key': key }, signal: controller.signal });
      if (!r.ok) {
        return new Response((await r.text()) || 'unavailable', {
          status: r.status,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      const buf = new Uint8Array(await r.arrayBuffer());
      const headers: Record<string, string> = {
        'Content-Type': isAudio ? 'audio/wav' : 'image/jpeg',
        'Cache-Control': 'no-cache',
      };
      for (const h of CLOCK_HEADERS) {
        const v = r.headers.get(h);
        if (v) headers[h] = v;
      }
      return new Response(buf, { status: 200, headers });
    } catch {
      const what = endpoint === 'camera-audio' ? 'camera audio unreachable' : 'mic unreachable';
      return json({ error: isAudio ? what : 'cctv unreachable' }, 502);
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let r: Response;
    try {
      r = await fetch(target, {
        headers: { 'X-PigPulse-Key': key, Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    return new Response(await r.text(), {
      status: r.status,
      headers: {
        'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return json({ error: 'pi unreachable' }, 502);
  }
}

export async function GET(request: Request) { return handle(request); }
export async function HEAD(request: Request) { return handle(request); }
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'GET, HEAD, OPTIONS' } });
}
