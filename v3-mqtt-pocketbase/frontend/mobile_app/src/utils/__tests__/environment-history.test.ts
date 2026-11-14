/**
 * B3 — environmental history / time / query foundation.
 *
 * TDD contract suite for `../environment-history`. No `node:assert` (this
 * sandbox has no Node type namespace); a tiny inline assertion helper keeps the
 * file dependency-free. No network, no PocketBase, no filesystem.
 *
 * Run with the repo's installed tsx (read-only invocation, no install):
 *   /home/solrahk/pig-health-monitor/v3-mqtt-pocketbase/frontend/mobile_app/node_modules/.bin/tsx \
 *     src/utils/__tests__/environment-history.test.ts
 *
 * Fixtures mirror the ACTUAL stored PocketBase `telemetry` row AFTER the ingest
 * guard (thermal_guard.py + local_bridge.py): `temperature`/`bodyTemp` are always
 * popped, mic `temperature` is rehomed to `ambient`. So the queryable fields are
 * `humidity` (SHT45, s3-mic-01) and `ambient` (SHT45 s3-mic-01 OR MLX90640
 * pi-thermal-01 — different quantities, never merged).
 */
import {
  ENVIRONMENTAL_FIELDS,
  NONQUERYABLE_STORED_TEMPERATURE,
  NONQUERYABLE_STORED_FIELDS,
  MAX_BUCKETS,
  QUERY_PAGE_CAP,
  isEnvironmentalField,
  findFieldSource,
  normalizeTimestamp,
  detectTimestampUnit,
  detectSeriesUnit,
  buildStorageBounds,
  isWithinWindow,
  parseEnvironmentalSample,
  normalizeSeries,
  aggregateBuckets,
  assessEnvironmentalReadiness,
  forecastEnvironmental,
  NO_MODEL_REASON,
  persistenceBaseline,
} from '../environment-history';

// ── tiny inline assertion helper (no node:assert) ───────────────────────────
let assertions = 0;

function fmt(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'number') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
    }
    return true;
  }
  return false;
}

function fail(msg: string): never {
  throw new Error(msg);
}

function assertEqual(actual: unknown, expected: unknown, msg?: string): void {
  assertions += 1;
  if (!Object.is(actual, expected)) fail(`expected ${fmt(expected)} but got ${fmt(actual)}${msg ? ' — ' + msg : ''}`);
}

function assertNotEqual(actual: unknown, unexpected: unknown, msg?: string): void {
  assertions += 1;
  if (Object.is(actual, unexpected)) fail(`expected value to differ from ${fmt(unexpected)}${msg ? ' — ' + msg : ''}`);
}

function assert(cond: unknown, msg?: string): void {
  assertions += 1;
  if (!cond) fail(`assertion failed${msg ? ' — ' + msg : ''}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, msg?: string): void {
  assertions += 1;
  if (!deepEqual(actual, expected)) fail(`expected ${fmt(expected)} but got ${fmt(actual)}${msg ? ' — ' + msg : ''}`);
}

function assertThrows(fn: () => unknown, ctor?: new (...args: never[]) => unknown, msg?: string): void {
  assertions += 1;
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
    if (ctor && !(e instanceof ctor)) fail(`threw ${(e as Error)?.name}, expected ${ctor.name}${msg ? ' — ' + msg : ''}`);
  }
  if (!threw) fail(`expected a throw${ctor ? ' of ' + ctor.name : ''}${msg ? ' — ' + msg : ''}`);
}

// ── fixtures ────────────────────────────────────────────────────────────────
const T0_S = 1700000000; // epoch SECONDS
const T0_MS = 1700000000000; // same instant in MILLISECONDS (bridge stores this)
const WIN = { start: T0_MS, end: T0_MS + 600000 }; // [start, end)

// ── normalizeTimestamp ──────────────────────────────────────────────────────
assertEqual(normalizeTimestamp(T0_S), T0_MS, 'epoch seconds → ms');
assertEqual(normalizeTimestamp(T0_MS), T0_MS, 'epoch ms passes through');
assertEqual(normalizeTimestamp(T0_MS + 123), T0_MS + 123, 'ms keeps sub-second');
assertEqual(normalizeTimestamp(String(T0_S)), T0_MS, 'numeric seconds string → ms');
assertEqual(
  normalizeTimestamp('2026-09-27T04:53:00.802Z'),
  Date.parse('2026-09-27T04:53:00.802Z'),
  'strict ISO instant parses',
);
assertEqual(normalizeTimestamp('2026-09-27T12:53:00+08:00'), Date.parse('2026-09-27T04:53:00Z'), 'ISO offset honours zone');
assertEqual(normalizeTimestamp('2026-09-27T04:53:00'), null, 'ISO without a zone is rejected (strict)');
assertEqual(normalizeTimestamp('2026-09-27 04:53:00Z'), null, 'space-separated date is rejected (strict)');
assertEqual(normalizeTimestamp('September 27, 2026'), null, 'lenient prose date rejected');
assertEqual(normalizeTimestamp(0), null, 'zero rejected');
assertEqual(normalizeTimestamp(-5), null, 'negative rejected');
assertEqual(normalizeTimestamp(''), null, 'empty string rejected');
assertEqual(normalizeTimestamp('not-a-date'), null, 'garbage rejected');
assertEqual(normalizeTimestamp(null), null, 'null rejected');
assertEqual(normalizeTimestamp(undefined), null, 'undefined rejected');
assertEqual(normalizeTimestamp(Number.NaN), null, 'NaN rejected');
assertEqual(normalizeTimestamp(Infinity), null, 'Infinity rejected');
assertEqual(normalizeTimestamp(true), null, 'boolean rejected');
assertEqual(normalizeTimestamp(Number.MAX_VALUE, { unit: 'seconds' }), null, 'seconds overflow → null, never Infinity');

// Explicit unit overrides the magnitude heuristic and is honoured strictly.
assertEqual(normalizeTimestamp(T0_S, { unit: 'milliseconds' }), T0_S, 'explicit ms: no ×1000');
assertEqual(normalizeTimestamp(T0_MS, { unit: 'seconds' }), T0_MS * 1000, 'explicit seconds: multiplies even large values');
assertThrows(() => normalizeTimestamp(T0_S, { unit: 'nope' as never }), TypeError, 'unknown unit rejected, never guessed');

// ── detectTimestampUnit / detectSeriesUnit ──────────────────────────────────
assertEqual(detectTimestampUnit(T0_S), 'seconds');
assertEqual(detectTimestampUnit(T0_MS), 'milliseconds');
assertEqual(detectTimestampUnit(0), 'unknown');
assertEqual(detectTimestampUnit('x'), 'unknown');
assertEqual(detectTimestampUnit(null), 'unknown');

assertEqual(detectSeriesUnit([{ timestamp: T0_S }, { timestamp: T0_S + 1 }]), 'seconds');
assertEqual(detectSeriesUnit([{ timestamp: T0_MS }, { timestamp: T0_MS + 1 }]), 'milliseconds');
assertEqual(detectSeriesUnit([{ timestamp: T0_S }, { timestamp: T0_MS }]), 'mixed', 'mixed units must be visible');
assertEqual(detectSeriesUnit([{ timestamp: T0_S }, { timestamp: 0 }]), 'mixed', 'a placed unit + an unplaceable row is mixed');
assertEqual(detectSeriesUnit([{ timestamp: 0 }, { timestamp: null }]), 'unknown');

// ── buildStorageBounds — explicit unit, EXACT seconds (never ceil/floor) ─────
assertThrows(() => buildStorageBounds(WIN, 'hours' as never), TypeError, 'bounds require an explicit storage unit');
assertDeepEqual(buildStorageBounds(WIN, 'seconds'), { lower: T0_S, upper: T0_S + 600, unit: 'seconds' });
assertDeepEqual(buildStorageBounds(WIN, 'milliseconds'), { lower: T0_MS, upper: T0_MS + 600000, unit: 'milliseconds' });
// Sub-second edges are preserved exactly: PocketBase compares fractional numerics,
// and rounding to whole seconds would clip a valid in-window sample.
assertDeepEqual(buildStorageBounds({ start: T0_MS + 500, end: T0_MS + 2500 }, 'seconds'), {
  lower: T0_S + 0.5,
  upper: T0_S + 2.5,
  unit: 'seconds',
});
assertThrows(() => buildStorageBounds({ start: 5, end: 5 }, 'seconds'), TypeError, 'empty window rejected');
assertThrows(() => buildStorageBounds({ start: Number.NaN, end: 5 }, 'seconds'), TypeError, 'NaN start rejected');

// ── isWithinWindow — [start, end) ───────────────────────────────────────────
assertEqual(isWithinWindow(WIN.start, WIN), true, 'start inclusive');
assertEqual(isWithinWindow(WIN.end, WIN), false, 'end exclusive');
assertEqual(isWithinWindow(WIN.start - 1, WIN), false, 'before start excluded');
assertEqual(isWithinWindow(WIN.start + 1, WIN), true, 'inside included');

// ── parseEnvironmentalSample ────────────────────────────────────────────────
const baseOpts = { field: 'ambient' as const, source: 's3-mic-01', unit: 'milliseconds' as const };
const declaredOpts = { ...baseOpts, measurementProvenance: 'declared' as const };

// Provenance: an in-range number is NOT asserted a measurement by default,
// because PocketBase numeric fields default to 0 and freshness is not stored.
const unknownZero = parseEnvironmentalSample({ deviceId: 's3-mic-01', timestamp: T0_MS, ambient: 0 }, baseOpts);
assertEqual(unknownZero.sample?.status, 'unknown', 'in-range number is unknown without declared provenance');
assertEqual(unknownZero.sample?.value, 0, 'unknown still carries the number (never dropped)');
assertEqual(unknownZero.sample?.provenance, 'unknown', 'default provenance is unknown');

const declaredZero = parseEnvironmentalSample({ deviceId: 's3-mic-01', timestamp: T0_MS, ambient: 0 }, declaredOpts);
assertEqual(declaredZero.sample?.status, 'valid', 'declared provenance makes an in-range 0 valid');
assertEqual(declaredZero.sample?.value, 0, 'a real 0 is preserved, never missing');
assertEqual(declaredZero.sample?.raw, 0, 'raw provenance retained');
assertEqual(declaredZero.sourceMatched, true);
assertEqual(declaredZero.sample?.instrument, 'SHT45', 's3-mic-01 ambient is the SHT45');

const missing = parseEnvironmentalSample({ deviceId: 's3-mic-01', timestamp: T0_MS, ambient: undefined }, declaredOpts);
assertEqual(missing.sample?.status, 'missing', 'absent field is missing, not 0');
assertEqual(missing.sample?.value, null, 'missing has no value');
assertEqual(
  parseEnvironmentalSample({ deviceId: 's3-mic-01', timestamp: T0_MS, ambient: null }, declaredOpts).sample?.status,
  'missing',
  'null is missing',
);
assertEqual(
  parseEnvironmentalSample({ deviceId: 's3-mic-01', timestamp: T0_MS, ambient: '' }, declaredOpts).sample?.status,
  'missing',
  'empty string is missing',
);
assertEqual(
  parseEnvironmentalSample({ deviceId: 's3-mic-01', timestamp: T0_MS, ambient: 'abc' }, declaredOpts).sample?.status,
  'invalid',
  'non-numeric is invalid',
);
assertEqual(
  parseEnvironmentalSample({ deviceId: 's3-mic-01', timestamp: T0_MS, ambient: Infinity }, declaredOpts).sample?.status,
  'invalid',
  'non-finite is invalid',
);
const oob = parseEnvironmentalSample({ deviceId: 's3-mic-01', timestamp: T0_MS, ambient: 999 }, declaredOpts);
assertEqual(oob.sample?.status, 'out-of-range', 'physically impossible value is out-of-range');
assertEqual(oob.sample?.value, null, 'out-of-range is not imputed into a value');
assertEqual(oob.sample?.raw, 999, 'out-of-range raw retained');

// Source scoping.
assertEqual(
  parseEnvironmentalSample({ deviceId: 'pi-thermal-01', timestamp: T0_MS, ambient: 30 }, declaredOpts).sourceMatched,
  false,
  'a row from another source does not match',
);
const thermal = parseEnvironmentalSample(
  { deviceId: 'pi-thermal-01', timestamp: T0_MS, ambient: 30 },
  { ...declaredOpts, source: 'pi-thermal-01' },
);
assertEqual(thermal.sample?.instrument, 'MLX90640', 'pi-thermal-01 ambient is the MLX90640 (different quantity)');

// Unsupported (field, source) pair.
const unsupported = parseEnvironmentalSample(
  { deviceId: 'pi-thermal-01', timestamp: T0_MS, humidity: 55 },
  { field: 'humidity', source: 'pi-thermal-01', unit: 'milliseconds' },
);
assertEqual(unsupported.unsupportedSource, true, 'humidity has no MLX90640 instrument');
assertEqual(unsupported.sample, null, 'unsupported pair yields no sample');

// Unknown / non-queryable field is refused outright.
assertThrows(
  () => parseEnvironmentalSample({ deviceId: 's3-mic-01', timestamp: T0_MS, temperature: 30 }, { ...baseOpts, field: 'temperature' as never }),
  TypeError,
  'non-queryable temperature field is refused',
);

// Age provenance: row age ≠ producer age.
const aged = parseEnvironmentalSample({ deviceId: 's3-mic-01', timestamp: T0_MS, ambient: 30 }, { ...declaredOpts, now: T0_MS + 30000 });
assertEqual(aged.sample?.rowAgeMs, 30000, 'rowAgeMs measured against explicit now');
assertEqual(aged.sample?.producerAgeMs, null, 'producerAgeMs is unknowable from a stored row → null');

// Future rejection (explicit now + tolerance).
const future = parseEnvironmentalSample(
  { deviceId: 's3-mic-01', timestamp: T0_S + 1000, ambient: 30 },
  { ...declaredOpts, unit: 'seconds', now: T0_MS, futureToleranceMs: 5000 },
);
assertEqual(future.sample, null, 'far-future timestamp yields no sample');
assertEqual(future.skipped, 'future-timestamp');
const borderline = parseEnvironmentalSample(
  { deviceId: 's3-mic-01', timestamp: T0_S + 2, ambient: 30 },
  { ...declaredOpts, unit: 'seconds', now: T0_MS, futureToleranceMs: 5000 },
);
assertEqual(borderline.sample?.status, 'valid', 'small future clock skew tolerated');

// ── normalizeSeries: source scoping, order, dedup, coverage ─────────────────
const seriesRows = [
  { deviceId: 's3-mic-01', timestamp: T0_S + 120, ambient: 32 }, // out of input order
  { deviceId: 's3-mic-01', timestamp: T0_S + 0, ambient: 30 },
  { deviceId: 's3-mic-01', timestamp: T0_S + 60, ambient: 31 },
  { deviceId: 'pi-thermal-01', timestamp: T0_S + 90, ambient: 99 }, // wrong source
  { deviceId: 's3-mic-01', timestamp: 0, ambient: 28 }, // invalid timestamp
  { deviceId: 's3-mic-01', timestamp: T0_S + 0, ambient: 30 }, // exact duplicate
  { deviceId: 's3-mic-01', timestamp: T0_S + 0, ambient: undefined }, // duplicate ts, missing loses
  { deviceId: 's3-mic-01', timestamp: T0_S + 360, ambient: 28 }, // later bucket
];

const series = normalizeSeries(seriesRows, {
  field: 'ambient',
  source: 's3-mic-01',
  unit: 'seconds',
  window: WIN,
  now: WIN.end,
  measurementProvenance: 'declared',
});
assertEqual(series.samples.length, 4, 'source-scoped, deduped, windowed samples');
assertDeepEqual(
  series.samples.map((s) => s.timestampMs),
  [T0_MS, T0_MS + 60000, T0_MS + 120000, T0_MS + 360000],
  'ascending order by timestamp',
);
assertEqual(series.samples[0].value, 30, 'duplicate-ts keeps the VALID reading, not the missing one');
assertEqual(series.coverage.duplicatesRemoved, 2, 'both same-ts duplicates counted');
assertEqual(series.coverage.skippedInvalidTimestamp, 1, 'invalid-timestamp row skipped, never placed in time');
assertEqual(series.coverage.excludedSourceMismatch, 1, 'source-mismatch rows excluded explicitly');
assertEqual(series.coverage.valid, 4, 'four valid readings');
assertEqual(series.coverage.coverage, 1, 'coverage = valid / accepted');
assertEqual(series.coverage.newestValidMs, T0_MS + 360000, 'newest valid tracked');
assertEqual(series.coverage.latestValidRowAgeMs, WIN.end - (T0_MS + 360000), 'latest-valid ROW age tracked');
assertEqual(series.instrument, 'SHT45', 'series instrument recorded');

// mixed-unit series is visible and blocks naive bounds reuse
assertEqual(detectSeriesUnit(seriesRows, 'timestamp'), 'mixed', 'seconds + an unplaceable row is mixed, never assumed uniform');

// ── aggregateBuckets: [start,end) buckets, gaps stay gaps ───────────────────
const aggRows = [
  { deviceId: 's3-mic-01', timestamp: T0_S + 0, ambient: 30 },
  { deviceId: 's3-mic-01', timestamp: T0_S + 60, ambient: 31 },
  { deviceId: 's3-mic-01', timestamp: T0_S + 120, ambient: 32 },
  { deviceId: 's3-mic-01', timestamp: T0_S + 150, ambient: undefined }, // missing, bucket0
  { deviceId: 's3-mic-01', timestamp: T0_S + 360, ambient: 28 }, // bucket1
];
const aggSeries = normalizeSeries(aggRows, {
  field: 'ambient',
  source: 's3-mic-01',
  unit: 'seconds',
  window: WIN,
  now: WIN.end,
  measurementProvenance: 'declared',
});
const agg = aggregateBuckets(aggSeries.samples, { ...WIN, buckets: 3 });
assertEqual(agg.field, 'ambient', 'field derived from agreeing samples');
assertEqual(agg.source, 's3-mic-01', 'source derived from agreeing samples');
assertEqual(agg.buckets.length, 3);
assertEqual(agg.buckets[0].start, WIN.start);
assertEqual(agg.buckets[0].end, WIN.start + 200000, 'bucket width = span / buckets');
assertEqual(agg.buckets[2].end, WIN.end, 'last bucket ends exactly at window end');
assertEqual(agg.buckets[0].valid, 3);
assertEqual(agg.buckets[0].missing, 1, 'missing retained in bucket coverage');
assertEqual(agg.buckets[0].mean, 31, 'mean over valid readings only');
assertEqual(agg.buckets[0].min, 30);
assertEqual(agg.buckets[0].max, 32);
assertEqual(agg.buckets[1].valid, 1);
assertEqual(agg.buckets[1].mean, 28);
assertEqual(agg.buckets[2].valid, 0);
assertEqual(agg.buckets[2].mean, null, 'empty bucket is a GAP (null), never imputed 0');
assertEqual(agg.buckets[2].empty, true);
assertEqual(agg.coverage.valid, 4);
assertEqual(agg.coverage.missing, 1);
assertEqual(agg.coverage.coverage, 0.8, 'coverage exposes partial data');
assertEqual(agg.coverage.emptyBuckets, 1);

// Empty samples NEVER fabricate a field/source.
const emptyAgg = aggregateBuckets([], { start: 1, end: 2, buckets: 1 });
assertEqual(emptyAgg.field, null, 'no sample → no invented field');
assertEqual(emptyAgg.source, null, 'no sample → no invented source');
assertNotEqual(emptyAgg.field, 'temperature', 'never temperature');
const emptyAggExplicit = aggregateBuckets([], { start: 1, end: 2, buckets: 1, field: 'ambient', source: 's3-mic-01' });
assertEqual(emptyAggExplicit.field, 'ambient', 'explicit field honoured when samples are empty');
assertEqual(emptyAggExplicit.source, 's3-mic-01');

// Mixed fields / sources are rejected (instruments must never be blended).
const ambSample = declaredZero.sample!;
const humSample = parseEnvironmentalSample(
  { deviceId: 's3-mic-01', timestamp: T0_MS, humidity: 55 },
  { field: 'humidity', source: 's3-mic-01', unit: 'milliseconds', measurementProvenance: 'declared' },
).sample!;
assertThrows(() => aggregateBuckets([ambSample, humSample], { ...WIN, buckets: 1 }), TypeError, 'mixed fields rejected');
assertThrows(() => aggregateBuckets([ambSample, thermal.sample!], { ...WIN, buckets: 1 }), TypeError, 'mixed sources rejected');

// Bucket-count validation and the pre-allocation cap.
assertThrows(() => aggregateBuckets([], { start: 1, end: 2, buckets: 0 }), TypeError, 'zero buckets rejected');
assertThrows(() => aggregateBuckets([], { start: 1, end: 2, buckets: 2.5 }), TypeError, 'non-integer buckets rejected');
assertThrows(() => aggregateBuckets([], { start: 1, end: 2, buckets: 10, maxBuckets: 0 }), TypeError, 'non-finite/zero cap rejected');
assertThrows(() => aggregateBuckets([], { start: 1, end: 2, buckets: MAX_BUCKETS + 1 }), TypeError, 'bucket count beyond the cap rejected before allocation');
assertEqual(MAX_BUCKETS, 4096, 'cap is a finite small constant');

// ── readiness (input sufficiency; no model field) ───────────────────────────
const readyCap = {
  sourceSupported: true,
  rowCount: 20,
  validCount: 18,
  requiredCoverage: 0.8,
  minValidSamples: 5,
  inputAgeMs: 1000,
  maxInputAgeMs: 120000,
  horizonMinutes: 30,
};
assertEqual(assessEnvironmentalReadiness(readyCap).status, 'ready');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, sourceSupported: false }).status, 'unsupported-source');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, rowCount: 0, validCount: 0 }).status, 'no-history');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, validCount: 2 }).status, 'partial-history');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, inputAgeMs: 999999 }).status, 'stale-input');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, inputAgeMs: null }).status, 'stale-input', 'no current valid input is stale, not ready');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, inputAgeMs: -100 }).status, 'ready', 'tiny future skew tolerated');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, inputAgeMs: -100000 }).status, 'stale-input', 'large future skew is stale');

// Every non-finite / out-of-domain numeric input is invalid, never ready.
assertEqual(assessEnvironmentalReadiness({ ...readyCap, inputAgeMs: Number.NaN }).status, 'invalid-input');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, horizonMinutes: -1 }).status, 'invalid-input');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, horizonMinutes: 0 }).status, 'invalid-input');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, horizonMinutes: Number.NaN }).status, 'invalid-input');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, rowCount: 10 }).status, 'invalid-input', 'validCount > rowCount rejected');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, validCount: -1 }).status, 'invalid-input');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, minValidSamples: -1 }).status, 'invalid-input');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, requiredCoverage: 1.5 }).status, 'invalid-input');
assertEqual(assessEnvironmentalReadiness({ ...readyCap, maxInputAgeMs: -1 }).status, 'invalid-input');
assertEqual(assessEnvironmentalReadiness(null as never).status, 'invalid-input', 'missing capability is invalid');

// ── forecastEnvironmental: fails closed, NEVER a number ─────────────────────
const readyForecast = forecastEnvironmental({ capability: readyCap, target: 'ambient', history: aggSeries.samples, cutoffMs: T0_MS + 120000 });
assertEqual(readyForecast.available, false, 'no model → unavailable');
assertEqual((readyForecast as { readiness: { status: string } }).readiness.status, 'no-implemented-model');
assertEqual(readyForecast.reason, NO_MODEL_REASON);
assert(!('predicted' in (readyForecast as object)), 'unavailable forecast carries no number');

const badCutoff = forecastEnvironmental({
  capability: readyCap,
  target: 'ambient',
  history: aggSeries.samples,
  cutoffMs: Number.NaN,
});
assertEqual(badCutoff.available, false, 'NaN cutoff → unavailable');
assertEqual((badCutoff as { readiness: { status: string } }).readiness.status, 'invalid-cutoff');

const partialForecast = forecastEnvironmental({ capability: { ...readyCap, validCount: 1 }, target: 'ambient', history: aggSeries.samples, cutoffMs: T0_MS });
assertEqual(partialForecast.available, false, 'partial history cannot produce numbers');
assertEqual((partialForecast as { readiness: { status: string } }).readiness.status, 'partial-history');

// A caller-supplied predictor is IGNORED, never trusted for a number.
const adversarial = forecastEnvironmental({
  capability: readyCap,
  target: 'ambient',
  history: [],
  cutoffMs: Number.NaN,
  predictor: { evaluation: { evaluatedOutOfSample: true, revision: 'other' }, predict: () => 99999 },
});
assertEqual(adversarial.available, false, 'empty history + attested predictor is still unavailable');
assert(!('predicted' in (adversarial as object)), 'ignored predictor yields no number');

// ── persistenceBaseline — synthetic-fixture only, never production ──────────
const newestMs = T0_MS + 360000;
const baselineHistory = aggSeries.samples;

const noFixture = persistenceBaseline({
  target: 'ambient',
  horizonMinutes: 30,
  history: baselineHistory,
  syntheticFixture: false as never,
  minValidSamples: 3,
  maxInputAgeMs: 120000,
  nowMs: newestMs + 1000,
});
assertEqual(noFixture.available, false, 'baseline refuses without the synthetic-fixture flag');
assert(!('predicted' in (noFixture as object)), 'refusal carries no number');

const baseline = persistenceBaseline({
  target: 'ambient',
  horizonMinutes: 30,
  history: baselineHistory,
  syntheticFixture: true,
  minValidSamples: 3,
  maxInputAgeMs: 120000,
  nowMs: newestMs + 1000,
});
assertEqual(baseline.available, true);
assertEqual((baseline as { predicted: number }).predicted, 28, 'persistence carries the last VALID value');
assertEqual((baseline as { algorithm: string }).algorithm, 'persistence');
assertEqual((baseline as { experimental: boolean }).experimental, true);
assertEqual((baseline as { evaluated: boolean }).evaluated, false, 'never claimed evaluated/production');
assertEqual((baseline as { syntheticFixture: boolean }).syntheticFixture, true);
assertEqual((baseline as { unit: string }).unit, '°C', 'unit taken from the field spec');

assertEqual(
  persistenceBaseline({ target: 'ambient', horizonMinutes: 30, history: baselineHistory, syntheticFixture: true, minValidSamples: 99, maxInputAgeMs: 120000, nowMs: newestMs + 1000 }).available,
  false,
  'insufficient valid history refused',
);
assertEqual(
  persistenceBaseline({ target: 'ambient', horizonMinutes: 30, history: baselineHistory, syntheticFixture: true, minValidSamples: 3, maxInputAgeMs: 1000, nowMs: newestMs + 999999 }).available,
  false,
  'stale input refused',
);
assertEqual(
  persistenceBaseline({ target: 'ambient', horizonMinutes: 0, history: baselineHistory, syntheticFixture: true, minValidSamples: 3, maxInputAgeMs: 120000, nowMs: newestMs + 1000 }).available,
  false,
  'invalid horizon refused',
);
assertEqual(
  persistenceBaseline({ target: 'ambient', horizonMinutes: 30, history: baselineHistory, syntheticFixture: true, minValidSamples: 3, maxInputAgeMs: 120000, nowMs: Number.NaN }).available,
  false,
  'invalid now refused',
);

// ── contract sanity ─────────────────────────────────────────────────────────
assertEqual(ENVIRONMENTAL_FIELDS.humidity.unit, '%');
assertEqual(ENVIRONMENTAL_FIELDS.ambient.unit, '°C');
assertEqual(ENVIRONMENTAL_FIELDS.ambient.sources.length, 2, 'ambient is dual-source');
assertEqual(findFieldSource('ambient', 'pi-thermal-01')?.instrument, 'MLX90640');
assertEqual(findFieldSource('humidity', 'pi-thermal-01'), null, 'humidity has no thermal source');
assertEqual(isEnvironmentalField('temperature'), false, 'temperature is not queryable');
assertEqual(NONQUERYABLE_STORED_TEMPERATURE, 'temperature');
assert(NONQUERYABLE_STORED_FIELDS.some((f) => f.field === 'temperature'), 'stored temperature is flagged non-queryable');
assertEqual(QUERY_PAGE_CAP, 100);

console.log(`environment-history: all assertions passed (${assertions} assertions)`);
