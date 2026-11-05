/**
 * Behavioural tests for the public Pi bridge (`api/pi.js`).
 *
 * The one invariant that matters most here: a HEAD must never start a real
 * capture on the Pi. The Pi allows exactly one capture at a time, so a stray
 * HEAD from a health probe or a link prefetcher would occupy the capture slot
 * and delay a legitimate GET. The proxy refuses HEAD on capture routes too,
 * but the bridge turns every upstream call into a GET — so if the bridge did
 * not refuse HEAD itself, the proxy's protection would never engage.
 *
 * Run:  node --test api/__tests__/pi.bridge.test.mjs
 */

/* global Buffer, process, Response */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.join(HERE, '..', 'pi.js');

// The bridge is ESM (`export default`). This package has no "type": "module",
// so Node would parse `api/pi.js` as CommonJS and choke on the export. Load
// it through a data: URL instead — same semantics, no build step, no rewrite.
const src = fs.readFileSync(BRIDGE, 'utf8');
const { default: handler } = await import(
  'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64')
);

/** A minimal stand-in for the Vercel Node request object. */
function makeReq(method, url) {
  return { method, url, headers: {} };
}

/** A minimal stand-in for the Vercel Node response object. */
function makeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    ended: false,
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      this.ended = true;
      return this;
    },
    send(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

/** Run the handler with a recording fetch stub. */
async function call(method, url, { env = {} } = {}) {
  const savedEnv = { ...process.env };
  const calls = [];
  Object.assign(process.env, {
    PB_PROXY_URL: 'https://proxy.example.test',
    PB_PROXY_KEY: 'test-key',
    ...env,
  });
  globalThis.fetch = async (target, opts) => {
    calls.push({ target, opts });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const res = makeRes();
    await handler(makeReq(method, url), res);
    return { res, calls };
  } finally {
    globalThis.fetch = undefined;
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  }
}

// ── the invariant: HEAD must not burn a capture ────────────────────────

test('HEAD on camera-audio is refused with 405 and no upstream fetch', async () => {
  const { res, calls } = await call('HEAD', '/api/pi?ep=camera-audio');
  assert.equal(res.statusCode, 405);
  assert.equal(calls.length, 0, 'HEAD must not reach upstream — that would start a capture');
  assert.equal(res.headers.allow, 'GET, OPTIONS');
  assert.deepEqual(res.body, { error: 'this endpoint requires GET' });
});

test('HEAD on esp/record is refused with 405 and no upstream fetch', async () => {
  const { res, calls } = await call('HEAD', '/api/pi?ep=esp/record');
  assert.equal(res.statusCode, 405);
  assert.equal(calls.length, 0, 'HEAD must not reach upstream — that would start a capture');
});

test('HEAD on camera-audio WITH a query is still refused without a fetch', async () => {
  const { res, calls } = await call('HEAD', '/api/pi?ep=camera-audio&seconds=8');
  assert.equal(res.statusCode, 405);
  assert.equal(calls.length, 0);
});

test('HEAD on the capture routes via the subpath form is also refused', async () => {
  const { res, calls } = await call('HEAD', '/api/pi/camera-audio');
  assert.equal(res.statusCode, 405);
  assert.equal(calls.length, 0);
});

// ── non-capture reads keep working ─────────────────────────────────────

test('HEAD on data still reads normally', async () => {
  const { res, calls } = await call('HEAD', '/api/pi?ep=data');
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1, 'a non-capture HEAD must still read upstream');
  assert.equal(calls[0].target, 'https://proxy.example.test/pi/data');
});

test('GET on camera-audio does fetch (the capture is the feature)', async () => {
  const { res, calls } = await call('GET', '/api/pi?ep=camera-audio&seconds=3');
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target, 'https://proxy.example.test/pi/camera-audio?seconds=3');
  assert.equal(calls[0].opts.headers['X-PigPulse-Key'], 'test-key');
});

test('GET on data fetches the JSON endpoint', async () => {
  const { res, calls } = await call('GET', '/api/pi?ep=data');
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target, 'https://proxy.example.test/pi/data');
});

test('the upstream key is never exposed to the caller', async () => {
  const { res } = await call('GET', '/api/pi?ep=data');
  assert.ok(!JSON.stringify(res.body).includes('test-key'));
});

// ── read-only + allowlist discipline ───────────────────────────────────

test('a write verb is refused with 405 and no upstream fetch', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const { res, calls } = await call(method, '/api/pi?ep=data');
    assert.equal(res.statusCode, 405, method);
    assert.equal(calls.length, 0, method);
    assert.deepEqual(res.body, { error: 'read-only endpoint' });
  }
});

test('an endpoint outside the allowlist is refused with 400', async () => {
  const { res, calls } = await call('GET', '/api/pi?ep=bogus-ep');
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
  assert.deepEqual(res.body, { error: 'unsupported pi endpoint' });
});

test('OPTIONS answers 204 with the allowed verbs', async () => {
  const { res, calls } = await call('OPTIONS', '/api/pi?ep=data');
  assert.equal(res.statusCode, 204);
  assert.equal(calls.length, 0);
  assert.equal(res.headers.allow, 'GET, HEAD, OPTIONS');
});

test('an unconfigured bridge answers 503 instead of pretending to work', async () => {
  const { res, calls } = await call('GET', '/api/pi?ep=data', {
    env: { PB_PROXY_URL: '', PB_PROXY_KEY: '' },
  });
  assert.equal(res.statusCode, 503);
  assert.equal(calls.length, 0);
  assert.deepEqual(res.body, { error: 'pi backend not configured' });
});
