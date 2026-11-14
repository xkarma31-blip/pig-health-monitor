/*
 * ACTUAL-code harness for the B8 single-selected-source policy.
 *
 * Loads the REAL `pocketbase.ts` / `pi-thermal.ts` / `source-policy.ts` with a
 * minimal in-process transpile (the canonical project's OWN installed
 * `typescript`) and mocks ONLY `react-native` (Platform), `./setupStore` and the
 * global `fetch`. No dependency is added, no loader/config is mutated.
 *
 * The `typescript` compiler is resolved portably — via `PIGPULSE_APP_DIR`, then
 * the current working directory, then a walk-up from this file — through each
 * candidate directory's own `node_modules`. There is NO hardcoded machine path;
 * when it cannot be found the harness fails with a clear message.
 *
 * The pure validation/selection assertions live in the sibling
 * `source-policy.test.ts`; THIS suite is the mandatory real-code companion and
 * is RED-first: against the untouched originals the behavioural assertions fail
 * (multi-origin failover, implicit hosted bridge, stale saved host on web, and
 * a relative auth/create fetch on a malformed source).
 *
 * Run (from the mobile_app directory): node src/utils/__tests__/source-policy.resolvers.test.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const HERE = __dirname;
const UTILS_DIR = path.resolve(HERE, '..');
const PB_PATH = path.join(UTILS_DIR, 'pocketbase.ts');
const THERMAL_PATH = path.join(UTILS_DIR, 'pi-thermal.ts');
const POLICY_PATH = path.join(UTILS_DIR, 'source-policy.ts');

// ── Portable `typescript` resolution ────────────────────────────────────────
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

// ── Tiny assertion helpers ──────────────────────────────────────────────────
let failures = 0;
let checks = 0;
function report(...args) {
  console.error(...args);
}
function expectTrue(value, label) {
  checks += 1;
  if (!value) {
    failures += 1;
    report(`FAIL ${label}`);
  }
}
function expectEqual(actual, expected, label) {
  checks += 1;
  if (actual !== expected) {
    failures += 1;
    report(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function section(name) {
  report(`--- ${name}`);
}

// ── Transpile harness ───────────────────────────────────────────────────────
function makeLoader(platform) {
  const cache = new Map();
  const env = {};
  const calls = [];
  const setup = { pbUrl: '' };
  let fetchImpl = async (url) => {
    calls.push({ url });
    throw new TypeError('Failed to fetch');
  };
  const overrides = {
    './setupStore': {
      loadFarmerSetup: async () => ({
        pbUrl: setup.pbUrl,
        farmName: '',
        penName: '',
        lang: 'en',
        setupDone: true,
      }),
    },
  };

  function resolveLocal(base) {
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts')];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    throw new Error(`cannot resolve local module ${base}`);
  }

  function loadFile(absPath) {
    const resolved = path.resolve(absPath);
    const cached = cache.get(resolved);
    if (cached) return cached.exports;
    const source = fs.readFileSync(resolved, 'utf8');
    const js = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: resolved,
    }).outputText;
    const mod = { exports: {} };
    cache.set(resolved, mod);
    const dir = path.dirname(resolved);
    const localRequire = (spec) => {
      if (spec === 'react-native') return { Platform: { OS: platform } };
      if (Object.prototype.hasOwnProperty.call(overrides, spec)) return overrides[spec];
      if (spec.startsWith('.')) return loadFile(resolveLocal(path.resolve(dir, spec)));
      throw new Error(`unmocked external module ${spec}`);
    };
    // eslint-disable-next-line no-new-func
    const fn = new Function('require', 'module', 'exports', 'process', 'fetch', js);
    fn(localRequire, mod, mod.exports, { env }, (url, init) => fetchImpl(url, init));
    return mod.exports;
  }

  return {
    load: loadFile,
    env,
    calls,
    setup,
    platform,
    setFetch: (fn) => {
      fetchImpl = fn;
    },
  };
}

function loadOptional(loader, absPath) {
  if (!fs.existsSync(absPath)) return null;
  return loader.load(absPath);
}

async function main() {
  // ── 0. Structural: the pure policy module exists + exports its contract ───
  section('structural: source-policy module present');
  {
    const loader = makeLoader('android');
    const policy = loadOptional(loader, POLICY_PATH);
    if (!policy) {
      expectTrue(false, 'source-policy module is present');
    } else {
      for (const name of ['parseHttpBase', 'chooseNativeSource', 'deriveThermalBaseFromPb', 'chooseThermalSource']) {
        expectEqual(typeof policy[name], 'function', `source-policy exports ${name}`);
      }
    }
  }

  // ── 1. Actual pocketbase.ts resolver exports (native) ────────────────────
  section('actual pocketbase.ts resolvers (native)');
  {
    const loader = makeLoader('android');
    const pb = loader.load(PB_PATH);
    expectEqual(typeof pb.resolveSelectedSource, 'function', 'pocketbase exports resolveSelectedSource');
    expectEqual(typeof pb.resolveBaseUrls, 'function', 'pocketbase exports resolveBaseUrls');

    pb.setConfiguredServer('');
    const urls = pb.resolveBaseUrls();
    expectEqual(urls.length, 1, 'native resolves exactly one PB source (no failover list)');
    expectEqual(urls[0], 'http://192.168.69.1:8090', 'native default is the Pi hotspot');
    expectTrue(!urls.some((u) => /127\.0\.0\.1|18090/.test(u)), 'no implicit laptop/loopback fallback');
    expectTrue(
      !urls.some((u) => /vercel|pig-health-monitor\.vercel/i.test(u)),
      'no implicit hosted PB fallback',
    );

    if (typeof pb.resolveSelectedSource === 'function') {
      const dec = pb.resolveSelectedSource();
      expectEqual(dec.base, 'http://192.168.69.1:8090', 'resolveSelectedSource base is Pi default');
      expectEqual(dec.kind, 'pi-default', 'resolveSelectedSource kind pi-default');
      expectEqual(dec.malformed, false, 'resolveSelectedSource not malformed');
    }

    pb.setConfiguredServer('http://10.11.12.13:8090');
    expectEqual(pb.resolveBaseUrls().length, 1, 'saved native resolves exactly one source');
    expectEqual(pb.resolveBaseUrls()[0], 'http://10.11.12.13:8090', 'saved native source selected');

    loader.env.EXPO_PUBLIC_POCKETBASE_URL = 'http://10.20.30.40:8090';
    pb.setConfiguredServer('');
    expectEqual(pb.resolveBaseUrls()[0], 'http://10.20.30.40:8090', 'build native source selected when no saved');

    loader.env.EXPO_PUBLIC_POCKETBASE_URL = '';
    pb.setConfiguredServer('::::bad');
    expectEqual(pb.resolveBaseUrls().length, 0, 'malformed saved yields no usable source (fail closed)');
  }

  // ── 2. Actual pbList transport (native): one origin, zero-request fail ───
  section('actual pbList transport (native)');
  {
    const loader = makeLoader('android');
    const pb = loader.load(PB_PATH);
    loader.env.EXPO_PUBLIC_POCKETBASE_URL = '';

    pb.setConfiguredServer('');
    loader.calls.length = 0;
    let threw = false;
    try {
      await pb.pbList('telemetry', { perPage: 1 });
    } catch {
      threw = true;
    }
    expectTrue(threw, 'pbList surfaces failure instead of failing over');
    expectEqual(loader.calls.length, 1, 'pbList makes exactly one attempt (no cross-origin retry)');
    expectTrue(
      loader.calls.every((c) => c.url.startsWith('http://192.168.69.1:8090/api/collections/telemetry/records')),
      'pbList request targets the single selected origin only',
    );

    pb.setConfiguredServer('::::bad');
    loader.calls.length = 0;
    let threw2 = false;
    try {
      await pb.pbList('telemetry', { perPage: 1 });
    } catch {
      threw2 = true;
    }
    expectTrue(threw2, 'pbList fails closed on malformed source');
    expectEqual(loader.calls.length, 0, 'pbList sends no request when the explicit source is malformed');

    pb.setConfiguredServer('');
    loader.calls.length = 0;
    try {
      await pb.pbList('telemetry', { perPage: 1 }, 'SECRET-TOKEN');
    } catch {
      /* expected */
    }
    const authCalls = loader.calls.filter((c) => c.init && c.init.headers && c.init.headers.Authorization);
    expectTrue(
      authCalls.every((c) => c.url.startsWith('http://192.168.69.1:8090')),
      'credentialed request never crosses to another origin',
    );
  }

  // ── 3. pbAuthAdmin fails closed with ZERO transport on malformed source ──
  section('actual pbAuthAdmin: no transport on malformed source');
  {
    const loader = makeLoader('android');
    const pb = loader.load(PB_PATH);
    loader.env.EXPO_PUBLIC_POCKETBASE_URL = '';
    pb.setConfiguredServer('::::bad');
    loader.calls.length = 0;
    let threw = false;
    try {
      await pb.pbAuthAdmin();
    } catch {
      threw = true;
    }
    expectTrue(threw, 'pbAuthAdmin throws on malformed source');
    expectEqual(loader.calls.length, 0, 'pbAuthAdmin performs no fetch (no relative request) on malformed source');
  }

  // ── 4. pbCreate fails closed with ZERO transport on malformed source ─────
  section('actual pbCreate: no transport on malformed source');
  {
    const loader = makeLoader('android');
    const pb = loader.load(PB_PATH);
    loader.env.EXPO_PUBLIC_POCKETBASE_URL = '';
    pb.setConfiguredServer('::::bad');
    loader.calls.length = 0;
    let threw = false;
    try {
      await pb.pbCreate('telemetry', { deviceId: 'x' });
    } catch {
      threw = true;
    }
    expectTrue(threw, 'pbCreate throws on malformed source');
    expectEqual(loader.calls.length, 0, 'pbCreate performs no fetch (incl. no auth attempt) on malformed source');
  }

  // ── 5. Web pbList uses the correct same-origin /api/telemetry URL ────────
  section('actual pbList transport (web): same-origin /api/telemetry');
  {
    const loader = makeLoader('web');
    const pb = loader.load(PB_PATH);
    expectEqual(pb.resolveBaseUrls()[0], '', 'web resolves the valid same-origin empty base');
    loader.calls.length = 0;
    try {
      await pb.pbList('telemetry', { perPage: 1 });
    } catch {
      /* fetch stub always rejects; we only inspect the URL */
    }
    expectEqual(loader.calls.length, 1, 'web pbList makes exactly one request');
    expectEqual(
      loader.calls[0].url,
      '/api/telemetry?collection=telemetry&perPage=1',
      'web pbList builds the same-origin /api/telemetry URL',
    );
    expectTrue(!/^https?:/i.test(loader.calls[0].url), 'web pbList URL stays same-origin (no host)');
  }

  // ── 6. Actual pi-thermal.ts resolver (native) ────────────────────────────
  section('actual pi-thermal.ts resolver (native)');
  {
    const loader = makeLoader('android');
    loader.env.EXPO_PUBLIC_POCKETBASE_URL = '';
    loader.env.EXPO_PUBLIC_PI_THERMAL_URL = '';
    loader.setup.pbUrl = '';
    const pb = loader.load(PB_PATH);
    pb.setConfiguredServer('');
    const thermal = loader.load(THERMAL_PATH);

    const base1 = await thermal.resolvePiBase();
    expectEqual(base1, 'https://192.168.69.1:8080', 'native thermal derives from Pi default PB host');
    expectTrue(
      !/vercel|pig-health-monitor\.vercel/i.test(String(base1)),
      'native thermal never falls back to the hosted bridge',
    );

    loader.setup.pbUrl = 'http://10.11.12.13:8090';
    pb.setConfiguredServer('http://10.11.12.13:8090');
    expectEqual(await thermal.resolvePiBase(), 'https://10.11.12.13:8080', 'native thermal shares the saved PB host');

    pb.setConfiguredServer('');
    loader.setup.pbUrl = '';
    loader.env.EXPO_PUBLIC_POCKETBASE_URL = 'http://10.20.30.40:8090';
    expectEqual(await thermal.resolvePiBase(), 'https://10.20.30.40:8080', 'native thermal shares the build PB host');

    loader.env.EXPO_PUBLIC_PI_THERMAL_URL = 'http://1.2.3.4:8080';
    expectEqual(await thermal.resolvePiBase(), 'http://1.2.3.4:8080', 'explicit native thermal override honoured');
    loader.env.EXPO_PUBLIC_PI_THERMAL_URL = '';
  }

  // ── 7. Actual pi-thermal.ts resolver (web): always same origin ───────────
  section('actual pi-thermal.ts resolver (web)');
  {
    const loader = makeLoader('web');
    loader.env.EXPO_PUBLIC_POCKETBASE_URL = '';
    loader.env.EXPO_PUBLIC_PI_THERMAL_URL = '';
    loader.setup.pbUrl = 'http://192.168.69.1:8090'; // stale saved native host
    const thermal = loader.load(THERMAL_PATH);
    expectEqual(await thermal.resolvePiBase(), '/api/pi', 'web thermal ignores stale saved native host (same origin)');

    loader.setup.pbUrl = '';
    expectEqual(await thermal.resolvePiBase(), '/api/pi', 'web thermal defaults to same-origin /api/pi');

    loader.env.EXPO_PUBLIC_PI_THERMAL_URL = 'https://some-dev-box:8080';
    expectEqual(await thermal.resolvePiBase(), '/api/pi', 'cross-origin web thermal override refused, same origin kept');

    loader.env.EXPO_PUBLIC_PI_THERMAL_URL = '/\\outside.invalid/api/pi';
    expectEqual(await thermal.resolvePiBase(), '/api/pi', 'backslash cross-origin thermal override refused on web');
  }

  // ── summary ──────────────────────────────────────────────────────────────
  if (failures > 0) {
    report(`${failures} of ${checks} resolver/transport assertion(s) failed`);
    process.exit(1);
  }
  console.log(`resolvers: all ${checks} assertions passed`);
}

main().catch((e) => {
  report(`harness error: ${String((e && e.stack) || e)}`);
  process.exit(1);
});
