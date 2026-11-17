/**
 * PURE direct tests for the B8 single-selected-source policy.
 *
 * This file imports ONLY `../source-policy` (a dependency-free module) so it
 * type-checks under the canonical Expo tsconfig with no added dependencies and
 * no `node:` builtins. The ACTUAL resolver + transport behaviour of the real
 * `pocketbase.ts` / `pi-thermal.ts` — which needs a transpile harness and
 * `node:*` — lives in the sibling CommonJS harness
 * `source-policy.resolvers.test.cjs`; both suites are mandatory.
 *
 * Covers: strict HTTP(S) validation (including malformed IPv6/IPv4 literals),
 * native selection order (saved > build > Pi default), malformed fail-closed,
 * bench labelling, IPv6-safe thermal derivation with an invalid-port guard,
 * and web always resolving to the fixed same-origin `/api/pi`.
 *
 * RED-first: before `../source-policy` exists the import fails (structural RED);
 * against a naive policy the validation and web-origin assertions fail.
 *
 * Run: node_modules/.bin/tsx src/utils/__tests__/source-policy.test.ts
 */
import {
  parseHttpBase,
  chooseNativeSource,
  deriveThermalBaseFromPb,
  chooseThermalSource,
} from '../source-policy';

let failures = 0;
let checks = 0;

function expectTrue(value: boolean, label: string): void {
  checks += 1;
  if (!value) {
    failures += 1;
    console.error(`FAIL ${label}`);
  }
}

function expectEqual(actual: unknown, expected: unknown, label: string): void {
  checks += 1;
  if (actual !== expected) {
    failures += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function section(name: string): void {
  console.error(`--- ${name}`);
}

// ── 1. Strict HTTP(S) URL validation ─────────────────────────────────────────
section('pure source-policy: URL validation');

for (const good of [
  'http://192.168.69.1:8090',
  'https://pi.local:8080',
  'http://127.0.0.1:18090',
  'http://[::1]:8090',
  'https://[fe80::1]:8080',
  'https://[1:2:3:4:5:6:7:8]:8080',
  'https://[::ffff:192.168.1.1]:8080',
]) {
  expectTrue(parseHttpBase(good).ok === true, `accepts valid base ${good}`);
}

for (const bad of [
  '',
  '   ',
  'ftp://host:8090',
  '192.168.69.1:8090',
  'http://',
  'http://user:pass@host:8090',
  'http://host:8090?x=1',
  'http://host:8090#frag',
  'http://host:99999',
  'http://[::1',
  'http://a:b:c',
  'http://host:80 port',
  // P1 adversarial probes: malformed IPv6 / IPv4 literals that a naive
  // `[0-9a-fA-F:.]+` test wrongly accepts.
  'http://[:::]',
  'http://[:::]:8090',
  'http://[1:2]:8090',
  'http://[1:2:3:4:5:6:7:8:9]:8090',
  'http://999.999.999.999:8090',
  'http://256.1.1.1:8090',
]) {
  expectTrue(parseHttpBase(bad).ok === false, `rejects invalid base ${JSON.stringify(bad)}`);
}

const v6 = parseHttpBase('http://[::1]:8090');
expectEqual(v6.ok && v6.parsed.host, '::1', 'IPv6 host parsed without colon split');
expectEqual(v6.ok && v6.parsed.port, 8090, 'IPv6 port parsed');
expectEqual(v6.ok && v6.parsed.isIpv6, true, 'IPv6 flag set');

// ── 2. Native selection order + fail-closed ─────────────────────────────────
section('pure source-policy: native selection');

const sel1 = chooseNativeSource({
  saved: 'http://10.0.0.5:8090',
  build: 'http://10.0.0.6:8090',
  piDefault: 'http://192.168.69.1:8090',
});
expectEqual(sel1.base, 'http://10.0.0.5:8090', 'saved outranks build and default');
expectEqual(sel1.kind, 'saved', 'saved labelled saved');
expectEqual(sel1.malformed, false, 'saved valid is not malformed');

const sel2 = chooseNativeSource({
  saved: '',
  build: 'http://10.0.0.6:8090',
  piDefault: 'http://192.168.69.1:8090',
});
expectEqual(sel2.base, 'http://10.0.0.6:8090', 'build used when no saved');
expectEqual(sel2.kind, 'build', 'build labelled build');

const sel3 = chooseNativeSource({
  saved: '',
  build: '',
  piDefault: 'http://192.168.69.1:8090',
});
expectEqual(sel3.base, 'http://192.168.69.1:8090', 'Pi default when nothing explicit');
expectEqual(sel3.kind, 'pi-default', 'Pi default labelled');
expectEqual(sel3.explicit, false, 'Pi default is not explicit');

// Malformed explicit config is visible + fail-closed (never replaced).
const bad1 = chooseNativeSource({
  saved: 'not a url',
  build: 'http://10.0.0.6:8090',
  piDefault: 'http://192.168.69.1:8090',
});
expectEqual(bad1.malformed, true, 'malformed saved flagged');
expectEqual(bad1.base, null, 'malformed saved fails closed (no build/default substitution)');

const bad2 = chooseNativeSource({
  saved: '',
  build: 'http://host:99999',
  piDefault: 'http://192.168.69.1:8090',
});
expectEqual(bad2.malformed, true, 'malformed build flagged');
expectEqual(bad2.base, null, 'malformed build fails closed');

// Explicit bench (loopback) source is honoured and labelled.
const bench = chooseNativeSource({
  saved: 'http://127.0.0.1:18090',
  build: '',
  piDefault: 'http://192.168.69.1:8090',
});
expectEqual(bench.base, 'http://127.0.0.1:18090', 'explicit bench source honoured');
expectEqual(bench.kind, 'bench', 'loopback source labelled bench');
expectEqual(bench.explicit, true, 'bench source is explicit');

// ── 3. Thermal derivation ───────────────────────────────────────────────────
section('pure source-policy: thermal derivation');

const derived = deriveThermalBaseFromPb('http://192.168.69.1:8090', { scheme: 'https', port: 8080 });
expectEqual(derived.ok && derived.parsed.url, 'https://192.168.69.1:8080', 'thermal derives from PB host');

const derivedV6 = deriveThermalBaseFromPb('http://[::1]:8090', { scheme: 'https', port: 8080 });
expectEqual(derivedV6.ok && derivedV6.parsed.url, 'https://[::1]:8080', 'thermal derivation is IPv6 safe');

const derivedBuild = deriveThermalBaseFromPb('http://10.20.30.40:8090', { scheme: 'https', port: 8080 });
expectEqual(derivedBuild.ok && derivedBuild.parsed.url, 'https://10.20.30.40:8080', 'thermal derives from build host');

// Invalid thermal port is refused rather than producing a broken URL.
expectTrue(deriveThermalBaseFromPb('http://192.168.69.1:8090', { port: 70000 }).ok === false, 'port 70000 refused');
expectTrue(deriveThermalBaseFromPb('http://192.168.69.1:8090', { port: 0 }).ok === false, 'port 0 refused');
expectTrue(deriveThermalBaseFromPb('http://192.168.69.1:8090', { port: 1.5 }).ok === false, 'fractional port refused');

// ── 4. Web thermal is ALWAYS the fixed same-origin path ─────────────────────
section('pure source-policy: web same-origin');

const web = chooseThermalSource({
  isWeb: true,
  explicitOverride: '',
  pbDecision: sel1, // a stale native/saved decision must be ignored on web
});
expectEqual(web.base, '/api/pi', 'web thermal is same-origin /api/pi');
expectEqual(web.kind, 'web-same-origin', 'web thermal labelled same-origin');

const webCross = chooseThermalSource({
  isWeb: true,
  explicitOverride: 'https://some-dev-box:8080',
  pbDecision: sel1,
});
expectEqual(webCross.base, '/api/pi', 'cross-origin web thermal override refused (same origin kept)');

const webRel = chooseThermalSource({
  isWeb: true,
  explicitOverride: '/api/pi',
  pbDecision: sel1,
});
expectEqual(webRel.base, '/api/pi', 'same-origin relative web thermal override honoured');

// P1 adversarial probe: `/\outside.invalid/api/pi` folds to `//outside.invalid`
// under WHATWG parsing (backslash == slash for special schemes). Web must not
// label it same-origin — it must keep the fixed `/api/pi`.
const webBackslash = chooseThermalSource({
  isWeb: true,
  explicitOverride: '/\\outside.invalid/api/pi',
  pbDecision: sel1,
});
expectEqual(webBackslash.base, '/api/pi', 'backslash cross-origin bypass refused on web');

const webProtoRel = chooseThermalSource({
  isWeb: true,
  explicitOverride: '//outside.invalid/api/pi',
  pbDecision: sel1,
});
expectEqual(webProtoRel.base, '/api/pi', 'protocol-relative cross-origin override refused on web');

// ── 5. Native thermal derives from the SAME selected PB source ──────────────
section('pure source-policy: native thermal');

const natDefault = chooseThermalSource({ isWeb: false, explicitOverride: '', pbDecision: sel3 });
expectEqual(natDefault.base, 'http://192.168.69.1/api/pi', 'native thermal uses the Pi portal proxy');
expectTrue(
  !/vercel|pig-health-monitor\.vercel/i.test(String(natDefault.base)),
  'native thermal has no hosted bridge',
);

const natBuild = chooseThermalSource({ isWeb: false, explicitOverride: '', pbDecision: sel2 });
expectEqual(natBuild.base, 'http://10.0.0.6/api/pi', 'native thermal proxy derives from build source');

const natMalformed = chooseThermalSource({ isWeb: false, explicitOverride: '', pbDecision: bad1 });
expectEqual(natMalformed.base, null, 'native thermal fails closed when PB source malformed');

const natOverrideBad = chooseThermalSource({
  isWeb: false,
  explicitOverride: 'user:pass@host',
  pbDecision: sel3,
});
expectEqual(natOverrideBad.malformed, true, 'malformed native thermal override flagged');
expectEqual(natOverrideBad.base, null, 'malformed native thermal override yields no base');

// ── summary ─────────────────────────────────────────────────────────────────
if (failures > 0) {
  throw new Error(`${failures} of ${checks} pure source-policy assertion(s) failed`);
}
console.log(`pure source-policy: all ${checks} assertions passed`);
