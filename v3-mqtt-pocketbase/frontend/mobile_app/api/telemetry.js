/**
 * PigPulse — public read-only telemetry endpoint.
 *
 * The browser cannot reach a laptop-bound PocketBase, so this serverless
 * function is the bridge. It holds `PB_PROXY_URL` and `PB_PROXY_KEY` as
 * server-side environment variables and forwards ONLY allowlisted GET reads
 * to the read-only proxy running on the operator's machine.
 *
 * Security properties:
 * - GET/HEAD only; no write verb is forwarded under any circumstance.
 * - The collection allowlist is duplicated here so an unknown collection is
 *   rejected before the proxy is even contacted.
 * - The proxy key never reaches the client bundle.
 * - The query string is rebuilt from scratch; nothing is passed through blind.
 *
 * The upstream proxy performs a second, independent allowlist check.
 */

const ALLOWED_COLLECTIONS = new Set(['telemetry', 'alerts', 'pigs', 'devices']);
const ALLOWED_QUERY = new Set(['page', 'perPage', 'sort', 'filter', 'expand', 'fields']);
const SAFE_FILTER = /^[A-Za-z0-9_@=<>!.-]+$/;

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

function fail(res, code, message) {
  return res.status(code).json({ error: message });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return res.status(204).end();
  }

  // Read-only. This is the single most important line in the file.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return fail(res, 405, 'read-only endpoint');
  }

  const upstream = env('PB_PROXY_URL');
  const key = env('PB_PROXY_KEY');

  if (!upstream || !key) {
    return fail(res, 503, 'telemetry backend not configured');
  }

  // Accept either /api/telemetry?collection=alerts or /api/telemetry/alerts
  let collection = '';
  if (typeof req.query.collection === 'string') {
    collection = req.query.collection;
  } else if (typeof req.query.slug === 'string' && req.query.slug) {
    const parts = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug];
    collection = parts[0] || '';
  }

  if (!collection || !ALLOWED_COLLECTIONS.has(collection)) {
    return fail(res, 400, 'collection not readable');
  }

  // Rebuild the query string from an allowlist.
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(req.query)) {
    if (!ALLOWED_QUERY.has(name)) continue;
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== 'string' || raw.length === 0) continue;
    if (name === 'filter' && !SAFE_FILTER.test(raw)) {
      return fail(res, 400, 'unsupported filter expression');
    }
    if (name === 'perPage') {
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n)) return fail(res, 400, 'perPage must be an integer');
      params.set('perPage', String(Math.min(Math.max(n, 1), 100)));
      continue;
    }
    if (raw.length > 200) continue;
    params.set(name, raw);
  }

  const target =
    `${upstream.replace(/\/+$/, '')}/api/collections/${encodeURIComponent(collection)}/records` +
    (params.toString() ? `?${params.toString()}` : '');

  try {
    const upstreamRes = await fetch(target, {
      method: 'GET',
      headers: {
        // The secret lives here, on the server, and is never sent to a browser.
        'X-PigPulse-Key': key,
        Accept: 'application/json',
      },
      // Serverless invocations are short-lived; do not hang a request open.
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });

    if (!upstreamRes.ok) {
      return fail(res, 502, `upstream returned ${upstreamRes.status}`);
    }

    const payload = await upstreamRes.json();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Short shared cache: fresh enough for live telemetry, cheap for viewers.
    res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=5');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(JSON.stringify(payload));
  } catch (err) {
    const name = err && err.name === 'TimeoutError' ? 'upstream timeout' : 'upstream unreachable';
    return fail(res, 502, name);
  }
}
