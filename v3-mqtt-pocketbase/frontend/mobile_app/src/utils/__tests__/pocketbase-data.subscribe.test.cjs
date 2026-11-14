/*
 * ACTUAL-code harness for the B5 PocketBase subscriber ordering matrix.
 *
 * Loads the REAL `../pocketbase-data.ts` (plus its `../device-record.ts`
 * dependency) through a minimal in-process transpile using the canonical
 * project's OWN installed `typescript`, with a synthetic PB transport, so the
 * assertions exercise the module's real request-ordering / error / unsubscribe
 * behavior — not just an import.
 *
 * Bug this pins (reviewer + parent adapter probe):
 *   Two realtime-triggered reads can be in flight at once. If the OLDER request
 *   settles last, it must not overwrite the NEWER result — on success OR on
 *   failure. Superseded reads are ignored; only the newest in-flight read wins.
 *
 * This harness is CommonJS on purpose: the canonical Expo tsconfig sets
 * `allowJs: true` but leaves `checkJs` unset, so a `.cjs` companion produces no
 * semantic diagnostics (which a `.ts` file importing `node:*` builtins without
 * `@types/node` would). The sibling `pocketbase-data.subscribe.test.ts` is a
 * thin, dependency-free typed entry that pulls this harness in, so both paths
 * run the same matrix — same split precedent as lane B8.
 *
 * The `typescript` compiler is resolved portably — via `PIGPULSE_APP_DIR`, then
 * the current working directory, then a walk-up from this file — through each
 * candidate directory's own `node_modules`. There is NO hardcoded machine path;
 * when it cannot be found the harness fails with a clear message.
 *
 * Run (from the mobile_app directory):
 *   node src/utils/__tests__/pocketbase-data.subscribe.test.cjs
 * or via the typed entry:
 *   ./node_modules/.bin/tsx src/utils/__tests__/pocketbase-data.subscribe.test.ts
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { createRequire } = require('module');

const HERE = __dirname;
const UTILS_DIR = path.resolve(HERE, '..');

// ── Portable `typescript` resolution (env var → cwd → walk-up) ───────────────
function resolveTypescript() {
  const searchDirs = [];
  if (process.env.PIGPULSE_APP_DIR) searchDirs.push(process.env.PIGPULSE_APP_DIR);
  searchDirs.push(process.cwd());
  let dir = HERE;
  for (;;) {
    searchDirs.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const candidate of searchDirs) {
    try {
      const req = createRequire(path.join(candidate, 'noop.js'));
      const resolved = req.resolve('typescript');
      return req(resolved);
    } catch {
      /* keep looking */
    }
  }
  throw new Error(
    'Cannot resolve the `typescript` compiler needed to transpile the real app modules. ' +
      'Run this from the mobile_app directory (its node_modules holds typescript) or set ' +
      'PIGPULSE_APP_DIR to the app directory that contains node_modules/typescript.',
  );
}

const ts = resolveTypescript();

// ── Synthetic PB transport + vm/transpile harness ────────────────────────────
const requests = [];
const listeners = new Map();

function transpile(relative) {
  const file = path.join(UTILS_DIR, relative + '.ts');
  const text = fs.readFileSync(file, 'utf8');
  const exports = {};
  const shim = {
    PB_URL: '',
    pbCreate: () => {
      throw new Error('writes forbidden in test');
    },
    pbList: (collection) =>
      new Promise((resolve, reject) => requests.push({ collection, resolve, reject })),
    pbSubscribeRealtime: (collection, callback) => {
      listeners.set(collection, callback);
      return () => listeners.delete(collection);
    },
  };
  const requireShim = (name) => {
    if (name === './device-record') return loadDeviceRecord();
    if (name === './pocketbase') return shim;
    throw new Error('Unexpected dependency ' + name);
  };
  vm.runInNewContext(
    ts.transpileModule(text, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { exports, require: requireShim },
    { timeout: 2000 },
  );
  return exports;
}

let deviceRecord = null;
function loadDeviceRecord() {
  if (!deviceRecord) deviceRecord = transpile('device-record');
  return deviceRecord;
}

const adapter = transpile('pocketbase-data');

const tick = () => new Promise((resolve) => setImmediate(resolve));
const last = (values) => values[values.length - 1];

async function main() {
  // ── A. sensors: realtime-triggered newer read must win over an older one ──
  {
    const emitted = [];
    const errors = [];
    const stop = adapter.subscribeSensors((rows) => emitted.push(rows), (e) => errors.push(e));
    const initial = requests.length - 1; // gen 1
    listeners.get('devices')(); // gen 2
    const newer = requests.length - 1;
    requests[newer].resolve({ items: [{ id: 'newer-sensor' }] });
    await tick();
    requests[initial].resolve({ items: [{ id: 'older-sensor' }] });
    await tick();
    stop();
    assert.equal(errors.length, 0, 'no error expected on happy path');
    assert.equal(
      last(emitted)[0] && last(emitted)[0].id,
      'newer-sensor',
      'older in-flight sensors read overwrote the newer result',
    );
  }

  // ── B. sensors: a superseded read that FAILS late must be ignored ──
  {
    const emitted = [];
    const errors = [];
    const stop = adapter.subscribeSensors((rows) => emitted.push(rows), (e) => errors.push(e));
    const initial = requests.length - 1; // gen 1
    listeners.get('devices')(); // gen 2
    const newer = requests.length - 1;
    requests[newer].resolve({ items: [{ id: 'fresh' }] });
    await tick();
    requests[initial].reject(new Error('stale failure'));
    await tick();
    stop();
    assert.equal(errors.length, 0, 'superseded read failure must not surface an error');
    assert.equal(emitted.length, 1, 'superseded read failure must not emit');
    assert.equal(emitted[0][0].id, 'fresh', 'newer sensors result retained');
  }

  // ── C. sensors: latest failure calls onError, never an invented empty list ──
  {
    const emitted = [];
    const errors = [];
    const stop = adapter.subscribeSensors((rows) => emitted.push(rows), (e) => errors.push(e));
    const initial = requests.length - 1;
    requests[initial].reject(new Error('unavailable'));
    await tick();
    stop();
    assert.equal(errors.length, 1, 'latest read failure must call onError');
    assert.equal(emitted.length, 0, 'failed read must not invent an empty success');
  }

  // ── D. sensors: metadata honesty + unsubscribe ignores a late success ──
  {
    const emitted = [];
    const stop = adapter.subscribeSensors((rows) => emitted.push(rows), () => {});
    const first = requests.length - 1;
    requests[first].resolve({ items: [{ id: 'record', deviceId: 's3-mic-01', name: 'Barn mic' }] });
    await tick();
    assert.equal(emitted[0][0].lastUpdated, '', 'unknown acquisition time must stay empty');
    assert.equal(Number.isNaN(emitted[0][0].value), true, 'unknown reading must be explicit NaN');
    assert.equal('firmware' in emitted[0][0], false, 'missing firmware must not be fabricated');
    assert.equal('rssi' in emitted[0][0], false, 'missing rssi must not be fabricated');
    listeners.get('devices')();
    stop();
    requests[requests.length - 1].resolve({ items: [{ id: 'late' }] });
    await tick();
    assert.equal(emitted.length, 1, 'unmounted subscription emitted a late response');
  }

  // ── E. sensors legacy (no onError): latest failure keeps callback([]) ──
  {
    const emitted = [];
    const stop = adapter.subscribeSensors((rows) => emitted.push(rows));
    requests[requests.length - 1].reject(new Error('legacy failure'));
    await tick();
    stop();
    assert.equal(emitted.length, 1, 'legacy caller must still receive an empty list once');
    // Cross-realm array (built inside the vm context) — compare shape, not prototype.
    assert.equal(Array.isArray(emitted[0]), true, 'legacy failure falls back to a list');
    assert.equal(emitted[0].length, 0, 'legacy failure falls back to an empty list');
  }

  // ── F. alerts: realtime-triggered newer read must win over an older one ──
  {
    const alerts = [];
    const stopAlerts = adapter.subscribeAlerts((rows) => alerts.push(rows));
    const initial = requests.length - 1; // gen 1
    listeners.get('alerts')(); // gen 2
    const newer = requests.length - 1;
    requests[newer].resolve({ items: [{ id: 'newer' }] });
    await tick();
    requests[initial].resolve({ items: [{ id: 'older' }] });
    await tick();
    stopAlerts();
    assert.equal(last(alerts)[0].id, 'newer', 'older in-flight alerts read overwrote the newer result');
  }

  // ── G. alerts: superseded success and superseded failure are both ignored ──
  {
    const alerts = [];
    const errors = [];
    const stopAlerts = adapter.subscribeAlerts(
      (rows) => alerts.push(rows),
      (e) => errors.push(e),
    );
    const stale = requests.length - 1; // gen 1
    listeners.get('alerts')(); // gen 2
    const newer = requests.length - 1;
    requests[newer].resolve({ items: [{ id: 'real' }] });
    await tick();
    requests[stale].resolve({ items: [{ id: 'ghost' }] });
    await tick();
    assert.equal(alerts.length, 1, 'superseded alerts success must not emit');
    assert.equal(alerts[0][0].id, 'real', 'newer alerts result retained');
    // Now supersede again and fail the stale one.
    listeners.get('alerts')(); // gen 3
    const gen3 = requests.length - 1;
    requests[gen3].resolve({ items: [{ id: 'real-2' }] });
    await tick();
    listeners.get('alerts')(); // gen 4
    const gen4 = requests.length - 1;
    requests[gen3].reject(new Error('stale failure'));
    await tick();
    assert.equal(errors.length, 0, 'superseded alerts failure must not surface');
    requests[gen4].resolve({ items: [{ id: 'real-4' }] });
    await tick();
    stopAlerts();
    assert.equal(alerts.length, 3, 'only non-superseded alerts reads may emit');
    assert.equal(last(alerts)[0].id, 'real-4', 'newest alerts result retained');
  }

  // eslint-disable-next-line no-console
  console.log('pocketbase-data.subscribe: all assertions passed');
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
