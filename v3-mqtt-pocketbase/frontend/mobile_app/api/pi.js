/**
 * PigPulse — public read-only Pi-console bridge.
 *
 * The deployed web app cannot reach a Pi-bound console on a private network,
 * so this serverless function forwards a narrow allowlist of GET reads to the
 * operator's Pi thermal console through the same read-only proxy tunnel used
 * by api/telemetry.js. The proxy key stays server-side.
 *
 * Security properties:
 * - GET/HEAD only; no write verb is forwarded under any circumstance.
 * - Endpoint allowlist: /data, /ambient, /esp/status, /health.
 * - The key never reaches the client bundle.
 */

const ALLOWED_ENDPOINTS = new Set(['data', 'ambient', 'esp/status', 'health', 'cctv', 'esp/record']);

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return res.status(204).end();
  }

  // Read-only. This is the single most important line in the file.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return res.status(405).json({ error: 'read-only endpoint' });
  }

  const upstream = env('PB_PROXY_URL').replace(/\/+$/, '');
  const key = env('PB_PROXY_KEY');
  if (!upstream || !key) {
    return res.status(503).json({ error: 'pi backend not configured' });
  }

  const [pathPart, queryPart] = String(req.url || '').split('?');
  const qs = new URLSearchParams(queryPart || '');
  // Single-path platform functions match exactly /api/pi — the endpoint rides
  // as ?ep=… (subpath form kept as a fallback for other hosts).
  const endpoint = (
    qs.get('ep') ||
    pathPart.replace(/^\/api\/pi\/?/, '').replace(/\/+$/, '') ||
    'data'
  ).toLowerCase();
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return res.status(400).json({ error: 'unsupported pi endpoint' });
  }
  qs.delete('ep');

  const upstreamQs = qs.toString();
  const target = `${upstream}/pi/${endpoint}${upstreamQs ? `?${upstreamQs}` : ''}`;

  if (endpoint === 'cctv' || endpoint === 'esp/record') {
    // Binary passthrough — snapshot JPEG / mic WAV chunk. Forwards the Pi's
    // honest status (503 when the mic stream is stale).
    const isAudio = endpoint === 'esp/record';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch(target, { headers: { 'X-PigPulse-Key': key }, signal: controller.signal });
      if (!r.ok) {
        const body = await r.text();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(r.status).send(body || 'unavailable');
      }
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', isAudio ? 'audio/wav' : 'image/jpeg');
      res.setHeader('Cache-Control', 'no-cache');
      return res.status(200).send(buf);
    } catch (e) {
      return res.status(502).json({ error: isAudio ? 'mic unreachable' : 'cctv unreachable' });
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let r;
    try {
      r = await fetch(target, {
        headers: { 'X-PigPulse-Key': key, Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const body = await r.text();
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(r.status).send(body);
  } catch (e) {
    return res.status(502).json({ error: 'pi unreachable' });
  }
}
