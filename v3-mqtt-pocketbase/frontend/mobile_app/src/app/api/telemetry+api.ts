/**
 * Expo Router server route: /api/telemetry
 *
 * Parity port of api/telemetry.js (Vercel). Public GET bridge to the laptop's
 * read-only PocketBase proxy. The proxy key never reaches the client bundle.
 */
const ALLOWED_COLLECTIONS = new Set(['telemetry', 'alerts', 'pigs', 'devices']);
const ALLOWED_QUERY = new Set(['page', 'perPage', 'sort', 'filter', 'expand', 'fields']);
// Keep identical to SAFE_FILTER in backend/workers/readonly_pb_proxy.py.
const SAFE_FILTER = /^[A-Za-z0-9_@=<>!.,()'"&~:/\- ]+$/;

function env(name: string): string {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

function fail(message: string, status: number, headers: Record<string, string> = {}): Response {
  return Response.json({ error: message }, { status, headers });
}

async function handle(request: Request): Promise<Response> {
  const upstream = env('PB_PROXY_URL');
  const key = env('PB_PROXY_KEY');
  if (!upstream || !key) return fail('telemetry backend not configured', 503);

  const url = new URL(request.url);
  const collection = url.searchParams.get('collection') || url.searchParams.get('slug') || '';
  if (!collection || !ALLOWED_COLLECTIONS.has(collection)) return fail('collection not readable', 400);

  const params = new URLSearchParams();
  for (const [name, raw] of url.searchParams.entries()) {
    if (!ALLOWED_QUERY.has(name) || !raw) continue;
    if (name === 'filter' && !SAFE_FILTER.test(raw)) return fail('unsupported filter expression', 400);
    if (name === 'perPage') {
      if (!/^\d+$/.test(raw)) return fail('perPage must be an integer', 400);
      const n = Number(raw);
      if (!Number.isFinite(n)) return fail('perPage must be an integer', 400);
      params.set('perPage', String(Math.min(Math.max(n, 1), 100)));
      continue;
    }
    if (raw.length > 200) return fail(`${name} too long`, 400);
    params.set(name, raw);
  }

  const target =
    `${upstream.replace(/\/+$/, '')}/api/collections/${encodeURIComponent(collection)}/records` +
    (params.toString() ? `?${params.toString()}` : '');

  try {
    const upstreamRes = await fetch(target, {
      method: 'GET',
      headers: { 'X-PigPulse-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (!upstreamRes.ok) return fail(`upstream returned ${upstreamRes.status}`, 502);
    const payload = await upstreamRes.json();
    return Response.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=5, s-maxage=5',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const timeout = err instanceof Error && err.name === 'TimeoutError';
    return fail(timeout ? 'upstream timeout' : 'upstream unreachable', 502);
  }
}

export async function GET(request: Request) { return handle(request); }
export async function HEAD(request: Request) { return handle(request); }
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'GET, HEAD, OPTIONS' } });
}
