/**
 * Behavioral tests for the pure Home telemetry helper (B6).
 *
 * Regression focus (track-d1-ui.md defect list):
 *   - a device with NO explicit reported status must stay `unknown`, never be
 *     promoted to a healthy-pig count (the old `inferStatus` returned healthy);
 *   - the Home summary is device monitoring / explicit reported status, never a
 *     count of "healthy pigs";
 *   - a barn SCENE centre ("center") is never evaluated against a clinical
 *     temperature threshold — only a device-reported `temperature` may carry the
 *     legacy *display* band, which is labelled legacy, not clinical;
 *   - an invalid-timestamp record must not overwrite a valid / newer one;
 *   - a SOURCE-SCOPED, versioned cache; the legacy unsourced bare-map cache is
 *     NOT restored;
 *   - freshness keeps aging when the transport is down (driven by a ticking now).
 *
 * Pure module — run with the repo's installed tsx, no app/React imports:
 *   node_modules/.bin/tsx src/utils/__tests__/home-telemetry.test.ts
 */
import {
  CACHE_KEY_PREFIX,
  FRESH_MS,
  AGING_MS,
  FUTURE_TOLERANCE_MS,
  LEGACY_WATCH_C,
  LEGACY_ALERT_C,
  frameTime,
  sourceScope,
  cacheKeyFor,
  stripCredentials,
  sanitizeFrame,
  deviceKey,
  parseCache,
  serializeCache,
  acceptIncomingFrame,
  reportedStatus,
  readDeviceValue,
  legacyDisplayBand,
  freshnessBand,
  aggregateFreshness,
  summarizeDevices,
  usableNumber,
  type TelemetryFrame,
} from '../home-telemetry';

let failures = 0;
// eslint-disable-next-line no-console
const report = (...args: unknown[]) => console.error(...args);
function expectEq(actual: unknown, expected: unknown, label: string) {
  if (!Object.is(actual, expected)) {
    failures += 1;
    report(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
function expectTrue(value: boolean, label: string) {
  expectEq(value, true, label);
}

// `acceptIncomingFrame` returns the retained frame, or `undefined` when a reject
// left no current frame. Every call below supplies a current or an incoming
// frame, so narrow the union once here and keep the assertions readable.
function accepted(
  current: TelemetryFrame | null | undefined,
  incoming: TelemetryFrame | null | undefined,
  now: number,
): TelemetryFrame {
  return acceptIncomingFrame(current ?? undefined, incoming ?? undefined, now) as TelemetryFrame;
}

const NOW = 1_700_000_000_000;
const iso = (ms: number) => new Date(ms).toISOString();

// ── frameTime (mirror of canonical telemetryTime) ───────────────────
expectEq(frameTime(iso(NOW)), NOW, 'ISO parses to ms');
expectEq(frameTime(1_700_000_000), 1_700_000_000_000, 'epoch seconds → ms');
expectEq(frameTime(NOW), NOW, 'epoch ms stays ms');
expectEq(Number.isFinite(frameTime('')), false, 'empty string is not a time');
expectEq(Number.isFinite(frameTime('   ')), false, 'blank string is not a time');
expectEq(Number.isFinite(frameTime(undefined)), false, 'undefined is not a time');
expectEq(Number.isFinite(frameTime(0)), false, 'zero is not a time');
expectEq(Number.isFinite(frameTime(-5)), false, 'negative is not a time');
expectEq(Number.isFinite(frameTime('nope')), false, 'garbage is not a time');
expectEq(Number.isFinite(frameTime(NaN)), false, 'NaN is not a time');

// ── sourceScope / cacheKeyFor / stripCredentials ────────────────────
expectEq(sourceScope('', 'web'), 'web+same-origin', 'web empty base is same-origin');
expectEq(
  sourceScope('http://192.168.69.1:8090', 'native'),
  'native+lan+192.168.69.1:8090',
  'native lan host scope',
);
expectEq(
  sourceScope('http://127.0.0.1:8090', 'native'),
  'native+loopback+127.0.0.1:8090',
  'native loopback scope',
);
expectEq(
  sourceScope('http://localhost:8090', 'native'),
  'native+loopback+localhost:8090',
  'native localhost scope',
);
expectEq(
  sourceScope('http://[::1]:8090', 'native'),
  'native+loopback+[::1]:8090',
  'native IPv6 loopback scope',
);
expectTrue(
  sourceScope('http://192.168.69.1:8090', 'native') !==
    sourceScope('http://192.168.70.1:8090', 'native'),
  'distinct hosts → distinct scopes',
);
expectTrue(
  sourceScope('', 'web') !== sourceScope('http://farm.example:8090', 'web'),
  'web same-origin and absolute origin differ (local-proxy distinction)',
);
expectEq(sourceScope('/api', 'web'), 'web+local-proxy+/api', 'web relative path is local-proxy');
// Credentials must never appear in a scope key.
const credScope = sourceScope('http://user:secret@host:8090', 'native');
expectEq(credScope.includes('secret'), false, 'scope never carries credentials');
expectEq(credScope.includes('user'), false, 'scope never carries the username');
expectEq(cacheKeyFor('web+same-origin'), `${CACHE_KEY_PREFIX}:web+same-origin`, 'cache key shape');
expectEq(CACHE_KEY_PREFIX, 'pigpulse.realtime.cache.v2', 'cache prefix is versioned + namespaced');
expectEq(
  stripCredentials('polar failed at http://user:secret@host:8090/api?x=1 now').includes('secret'),
  false,
  'stripCredentials removes userinfo',
);
expectEq(
  stripCredentials('polar failed at http://user:secret@host:8090/api?x=1 now'),
  'polar failed at <source> now',
  'stripCredentials replaces the URL with <source>',
);

// ── sanitizeFrame / deviceKey ───────────────────────────────────────
const good = sanitizeFrame({ id: 'r1', deviceId: 'esp-1', timestamp: iso(NOW), temperature: 38.4 });
expectEq(good?.deviceId, 'esp-1', 'sanitize keeps deviceId');
expectEq(good?.timestamp, iso(NOW), 'sanitize keeps the device timestamp string');
expectEq(good?.temperature, 38.4, 'sanitize keeps a finite numeric field');
expectEq(sanitizeFrame(null), null, 'sanitize rejects null');
expectEq(sanitizeFrame([1, 2]), null, 'sanitize rejects an array');
expectEq(sanitizeFrame({ timestamp: iso(NOW) }), null, 'sanitize rejects a frame with no device identity');
const noTime = sanitizeFrame({ deviceId: 'esp-2' });
expectEq(Object.prototype.hasOwnProperty.call(noTime, 'timestamp'), false, 'sanitize never invents a timestamp');
const badNums = sanitizeFrame({ deviceId: 'esp-3', temperature: NaN, humidity: Infinity, ambient: 25 });
expectEq(Object.prototype.hasOwnProperty.call(badNums, 'temperature'), false, 'sanitize drops NaN');
expectEq(Object.prototype.hasOwnProperty.call(badNums, 'humidity'), false, 'sanitize drops Infinity');
expectEq(badNums?.ambient, 25, 'sanitize keeps the finite sibling');
expectEq(deviceKey({ deviceId: 'a' }), 'a', 'deviceKey prefers deviceId');
expectEq(deviceKey({ id: 'b' }), 'b', 'deviceKey falls back to id');
expectEq(deviceKey({}), '', 'deviceKey is empty with no identity');
expectEq(
  sanitizeFrame({ deviceId: 'esp-9', timestamp: 1_700_000_000 })?.timestamp,
  '1700000000',
  'sanitize stringifies a numeric seconds timestamp without inventing a time',
);

// ── parseCache / serializeCache (source-scoped, versioned) ──────────
const scope = 'native+lan+192.168.69.1:8090';
const cacheFrames: Record<string, TelemetryFrame> = {
  'esp-1': { id: 'r1', deviceId: 'esp-1', timestamp: iso(NOW), temperature: 38.4 },
};
expectEq(
  Object.keys(parseCache(JSON.stringify(cacheFrames), scope)).length,
  0,
  'legacy unsourced bare-map cache is NOT restored',
);
expectEq(
  Object.keys(parseCache(JSON.stringify({ v: 1, scope, frames: cacheFrames }), scope)).length,
  0,
  'a wrong cache version is not restored',
);
expectEq(
  Object.keys(parseCache(JSON.stringify({ v: 2, scope: 'other', frames: cacheFrames }), scope)).length,
  0,
  'a cache from another source scope is not restored',
);
expectEq(parseCache('{not json', scope)['esp-1'], undefined, 'malformed cache yields nothing');
expectEq(parseCache(null, scope)['esp-1'], undefined, 'null cache yields nothing');
const restored = parseCache(serializeCache(cacheFrames, scope), scope);
expectEq(restored['esp-1']?.temperature, 38.4, 'a scoped round-trip restores the frame');
expectEq(
  Object.keys(parseCache(serializeCache(cacheFrames, scope), 'native+lan+10.0.0.9:8090')).length,
  0,
  'round-trip is not readable under a different scope',
);
expectEq(
  Object.keys(
    parseCache(JSON.stringify({ v: 2, scope, frames: { bad: { nope: true } } }), scope),
  ).length,
  0,
  'an invalid cached frame is dropped on load',
);

// ── acceptIncomingFrame ─────────────────────────────────────────────
const f = (over: Partial<TelemetryFrame>): TelemetryFrame => ({
  id: 'r',
  deviceId: 'd',
  timestamp: iso(NOW),
  ...over,
});
expectEq(accepted(undefined, f({ timestamp: undefined }), NOW).deviceId, 'd', 'first untimed frame accepted');
expectEq(accepted(undefined, f({}), NOW).timestamp, iso(NOW), 'first timed frame accepted');
expectEq(
  accepted(
    f({ timestamp: iso(NOW), temperature: 38.1 }),
    f({ timestamp: 'nonsense', temperature: 41.9 }),
    NOW,
  ).temperature,
  38.1,
  'invalid-timestamp frame cannot overwrite a valid current',
);
expectEq(
  accepted(f({ timestamp: iso(NOW) }), f({ timestamp: iso(NOW - 60_000) }), NOW).timestamp,
  iso(NOW),
  'an older frame is rejected',
);
expectEq(
  accepted(f({ timestamp: iso(NOW - 60_000) }), f({ timestamp: iso(NOW) }), NOW).timestamp,
  iso(NOW),
  'a newer frame is accepted',
);
expectEq(
  accepted(f({ timestamp: iso(NOW) }), f({ timestamp: iso(NOW + FUTURE_TOLERANCE_MS + 1) }), NOW).timestamp,
  iso(NOW),
  'an implausibly future frame is rejected',
);
expectEq(
  accepted(f({ timestamp: undefined }), f({ timestamp: iso(NOW) }), NOW).timestamp,
  iso(NOW),
  'a timed frame replaces an untimed current',
);
expectEq(
  accepted(f({ timestamp: undefined }), f({ timestamp: undefined, temperature: 39.9 }), NOW).temperature,
  39.9,
  'two untimed frames: latest wins (nothing newer to protect)',
);
const guarded = sanitizeFrame({ deviceId: 'd', timestamp: iso(NOW), temperature: 38.1 });
const stripped = sanitizeFrame({ deviceId: 'd', timestamp: iso(NOW), ambient: 24 });
// Replace wholesale: the thermal guard's stripped field must not be resurrected.
expectEq(
  Object.prototype.hasOwnProperty.call(
    accepted(guarded, stripped, NOW),
    'temperature',
  ),
  false,
  'accepted frame is replaced wholesale, not merged (stripped temperature stays gone)',
);

// ── reportedStatus (no numeric fallback) ────────────────────────────
expectEq(reportedStatus({ healthStatus: 'NORMAL' }), 'normal', 'NORMAL → normal');
expectEq(reportedStatus({ healthStatus: 'healthy' }), 'normal', 'healthy → normal');
expectEq(reportedStatus({ healthStatus: 'OK' }), 'normal', 'OK → normal');
expectEq(reportedStatus({ healthStatus: 'WATCH' }), 'watch', 'WATCH → watch');
expectEq(reportedStatus({ healthStatus: 'ELEVATED' }), 'watch', 'ELEVATED → watch');
expectEq(reportedStatus({ healthStatus: 'WARNING' }), 'watch', 'WARNING → watch');
expectEq(reportedStatus({ healthStatus: 'CRITICAL' }), 'alert', 'CRITICAL → alert');
expectEq(reportedStatus({ healthStatus: 'ALERT' }), 'alert', 'ALERT → alert');
expectEq(reportedStatus({ healthStatus: 'HIGH' }), 'alert', 'HIGH → alert');
expectEq(reportedStatus({ healthStatus: 'DANGER' }), 'alert', 'DANGER → alert');
expectEq(reportedStatus({}), 'unknown', 'missing status → unknown');
expectEq(reportedStatus({ healthStatus: 'BANANA' }), 'unknown', 'unrecognised status → unknown');
expectEq(
  reportedStatus({ healthStatus: undefined, temperature: 45 }),
  'unknown',
  'a hot temperature alone never becomes healthy/watch/alert — unknown',
);

// ── readDeviceValue / legacyDisplayBand (scene is never thresholded) ─
expectEq(readDeviceValue({ deviceId: 'd', timestamp: iso(NOW), temperature: 38.4 }).kind, 'temperature', 'reported temp kind');
const zeroTemp = readDeviceValue({ deviceId: 'd', timestamp: iso(NOW), temperature: 0, center: 41.2 });
expectEq(zeroTemp.kind, 'scene', 'temperature 0 is "no reading" — falls through to scene centre');
expectEq(zeroTemp.value, 41.2, 'scene centre value is kept raw');
expectEq(readDeviceValue({ deviceId: 'd', timestamp: iso(NOW), ambient: 25 }).kind, 'ambient', 'ambient kind');
const none = readDeviceValue({ deviceId: 'd', timestamp: iso(NOW) });
expectEq(none.value, null, 'no reading → null value');
expectEq(none.kind, null, 'no reading → null kind');
expectEq(legacyDisplayBand(null), null, 'legacy band: no temperature → null (nothing to band)');
expectEq(legacyDisplayBand(38.0), 'normal', `legacy band normal at <= ${LEGACY_WATCH_C}`);
expectEq(legacyDisplayBand(39.2), 'watch', 'legacy band watch');
expectEq(legacyDisplayBand(39.6), 'alert', 'legacy band alert');
// A scene-only frame exposes kind 'scene' (so the screen MUST NOT band it).
const sceneOnly = readDeviceValue({ deviceId: 'd', timestamp: iso(NOW), center: 55 });
expectEq(sceneOnly.kind, 'scene', 'scene-only frame is kind scene, never temperature');
expectEq(usableNumber(0), null, 'usableNumber treats 0 as absent');
expectEq(usableNumber(41.2), 41.2, 'usableNumber keeps a real value');

// ── freshnessBand / aggregateFreshness (keeps aging when transport is down) ─
expectEq(freshnessBand({ deviceId: 'd', timestamp: iso(NOW) }, NOW), 'fresh', 'just-now is fresh');
expectEq(
  freshnessBand({ deviceId: 'd', timestamp: iso(NOW) }, NOW + FRESH_MS + 1),
  'aging',
  'freshness ages past the fresh window',
);
expectEq(
  freshnessBand({ deviceId: 'd', timestamp: iso(NOW) }, NOW + AGING_MS + 1),
  'stale',
  'freshness goes stale past the aging window',
);
expectEq(freshnessBand({ deviceId: 'd' }, NOW), 'unknown', 'no timestamp → unknown freshness');
expectEq(
  freshnessBand({ deviceId: 'd', timestamp: iso(NOW + 60_000) }, NOW),
  'unknown',
  'implausibly future timestamp → unknown freshness',
);
const agg = aggregateFreshness(
  {
    a: { deviceId: 'a', timestamp: iso(NOW) },
    b: { deviceId: 'b', timestamp: iso(NOW - 10 * 60_000) },
  },
  NOW,
);
expectEq(agg.newestTime, NOW, 'aggregate uses the NEWEST finite timestamp');
expectEq(agg.band, 'fresh', 'aggregate band follows the newest');
expectEq(agg.count, 2, 'aggregate counts frames examined');
const aggEmpty = aggregateFreshness({}, NOW);
expectEq(aggEmpty.band, 'unknown', 'empty aggregate is unknown, not fresh');
expectEq(aggEmpty.count, 0, 'empty aggregate count is 0');

// ── summarizeDevices (device monitoring, never a herd-health count) ─
const summary = summarizeDevices(
  {
    a: { deviceId: 'a', timestamp: iso(NOW), healthStatus: 'NORMAL' },
    b: { deviceId: 'b', timestamp: iso(NOW - 2 * 60_000), healthStatus: 'WATCH' },
    c: { deviceId: 'c', timestamp: iso(NOW - 10 * 60_000) },
    d: { deviceId: 'd', healthStatus: 'CRITICAL' },
  },
  NOW,
);
expectEq(summary.total, 4, 'summary counts devices');
expectEq(summary.status.normal, 1, 'summary counts reported normal');
expectEq(summary.status.watch, 1, 'summary counts reported watch');
expectEq(summary.status.alert, 1, 'summary counts reported alert');
expectEq(summary.status.unknown, 1, 'summary counts unreported status');
expectEq(summary.freshness.fresh, 1, 'summary counts fresh');
expectEq(summary.freshness.aging, 1, 'summary counts aging');
expectEq(summary.freshness.stale, 1, 'summary counts stale');
expectEq(summary.freshness.unknown, 1, 'summary counts unknown-time');
expectEq(summary.newestBand, 'fresh', 'summary newest band');
expectEq('healthy' in summary, false, 'summary has no healthy-pig key at top level');
expectEq('healthy' in summary.status, false, 'summary.status has no healthy-pig key');

if (failures > 0) {
  report(`${failures} home-telemetry assertion(s) failed`);
  process.exit(1);
}
// eslint-disable-next-line no-console
console.log('home-telemetry: all assertions passed');
