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

const ALLOWED_ENDPOINTS = new Set(['data', 'ambient', 'esp/status', 'health', 'cctv', 'esp/record', 'camera-audio', 'esp/stream']);

// Endpoints that start a REAL capture on the Pi (the Pi allows one capture at
// a time) or hold a live subscription (the barn-mic stream, which blocks
// waiting for the first mic chunk). A HEAD must never burn that slot — the
// upstream proxy refuses it too, but the bridge would otherwise turn every
// HEAD into an upstream GET.
const CAPTURE_ENDPOINTS = new Set(['esp/record', 'camera-audio', 'esp/stream']);

// Upstream headers that pin a streamed/snapshot payload to the Pi's clock.
// Forwarded verbatim: `X-Stream-Ts` = Pi epoch ms of the first PCM sample,
// `X-Frame-Ts` = Pi epoch ms when a CCTV frame finished arriving there.
const CLOCK_HEADERS = ['x-stream-ts', 'x-frame-ts', 'x-audio-format', 'x-audio-rate', 'x-audio-channels'];

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

  // A HEAD must never start a real capture on the Pi (one capture at a time),
  // so refuse it HERE, before any upstream fetch. Otherwise a stray health
  // probe or link prefetcher turns into a full capture and occupies the slot
  // a legitimate GET needs. Non-capture HEADs still read normally.
  if (req.method === 'HEAD' && CAPTURE_ENDPOINTS.has(endpoint)) {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'this endpoint requires GET' });
  }

  const upstreamQs = qs.toString();
  const target = `${upstream}/pi/${endpoint}${upstreamQs ? `?${upstreamQs}` : ''}`;

  if (endpoint === 'esp/stream') {
    // Continuous barn-mic PCM, streamed through to the browser as it arrives.
    // This must NOT use the buffered path below: the body never ends, so
    // `arrayBuffer()` would wait for a close that never comes and the phone
    // would hear silence. Chunks are written on as the Pi produces them.
    const controller = new AbortController();
    // Header/first-byte budget only. The Pi answers 503 within ~2 s when the
    // mic is silent and the proxy gives up after ~15 s; the stream itself is
    // unbounded, so the timer is cleared the moment headers arrive.
    const timer = setTimeout(() => controller.abort(), 20000);
    let r;
    try {
      r = await fetch(target, {
        headers: { 'X-PigPulse-Key': key, Accept: 'application/octet-stream' },
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      return res.status(502).json({ error: 'mic stream unreachable' });
    }
    clearTimeout(timer);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(r.status).send(body || 'mic stream unavailable');
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    for (const h of CLOCK_HEADERS) {
      const v = r.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Ask any intermediary not to sit on the first bytes.
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    // When the listener closes the tab, stop reading: aborting the upstream
    // fetch makes the proxy drop its Pi connection, which unsubscribes the
    // mic there. Nobody pays for a stream nobody hears.
    let clientGone = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientGone = true;
        controller.abort();
      }
    });
    try {
      for await (const chunk of r.body) {
        if (clientGone) break;
        res.write(chunk);
      }
    } catch {
      // client aborted, or the upstream ended (Pi idle-exit / ESP reconnect) —
      // either way the client reconnects; nothing is claimed here.
    }
    try {
      res.end();
    } catch {
      /* already closed */
    }
    return;
  }

  if (endpoint === 'cctv' || endpoint === 'esp/record' || endpoint === 'camera-audio') {
    // Binary passthrough — snapshot JPEG / mic WAV / camera-audio WAV. Forwards
    // the upstream's honest status (e.g. 503 when the mic stream is stale).
    const isAudio = endpoint === 'esp/record' || endpoint === 'camera-audio';
    // Abort budgets must exceed the upstream proxy's own timeout, otherwise a
    // slow-but-alive capture is killed here and misreported as unreachable
    // instead of the Pi's honest 503.
    //   cctv         → Pi answers 503 after ~5 s of camera silence; the proxy
    //                  gives up at ~8 s
    //   camera-audio → proxy waits up to 30 s (ffmpeg capture ceiling)
    //   esp/record   → proxy waits up to 35 s (Pi capture deadline + grace)
    const ttl = {
      cctv: 15000,
      'camera-audio': 35000,
      'esp/record': 40000,
    }[endpoint];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ttl);
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
      // CCTV snapshots carry `X-Frame-Ts`; the app aligns the picture to the
      // same clock as thermal and audio with it. Losing it here would make
      // the frame un-alignable, so it rides along with the bytes.
      for (const h of CLOCK_HEADERS) {
        const v = r.headers.get(h);
        if (v) res.setHeader(h, v);
      }
      return res.status(200).send(buf);
    } catch {
      const what = endpoint === 'camera-audio' ? 'camera audio unreachable' : 'mic unreachable';
      return res.status(502).json({ error: isAudio ? what : 'cctv unreachable' });
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
  } catch {
    return res.status(502).json({ error: 'pi unreachable' });
  }
}
