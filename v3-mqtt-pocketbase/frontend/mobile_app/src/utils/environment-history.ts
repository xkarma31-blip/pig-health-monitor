/**
 * PigPulse — B3 environmental history / time / query foundation (isolated sandbox).
 *
 * Pure, dependency-free, side-effect-free helpers for reading recorded
 * environmental data. No network, no PocketBase, no filesystem, no model
 * inference. Data in → data out, so a caller can inject mocked transports.
 *
 * STORED-ROW CONTRACT (grounded in canonical source, read-only, 2026-11-13):
 *
 *   firmware `esp32s3_telemetry.ino::publish_telemetry` emits the SHT45 pair
 *   `{"temperature":..,"humidity":..}` ONLY when a fresh cached reading exists:
 *     if (shtValid && shtLastGood && (millis()-shtLastGood) < SHT_MAX_STALE_MS)
 *   `mic`, `rms`, `peak`, `sr` and the counter fragment (`srf`/`sage`/…) are
 *   emitted on EVERY message.
 *
 *   `backend/bridge/thermal_guard.py::apply_telemetry_guard` then ALWAYS removes
 *   `bodyTemp`, `verdict`, `alerts`, `status`, and `temperature`; on mic-like
 *   rows (humidity or mic present) it REHOMES `temperature` → `ambient` first.
 *   `backend/bridge/local_bridge.py` calls the guard before the PocketBase
 *   insert, so `telemetry.temperature` and `telemetry.bodyTemp` are NEVER
 *   written by the pipeline — whatever a reader sees there is only the schema
 *   default `0`, not a measurement.
 *
 *   `deploy/pocketbase/bin/pb_migrations/` declares deviceId, timestamp,
 *   temperature, bodyTemp, pigId, synced, mic, rms, peak, sr, verdict, alerts,
 *   hotspot, center, max, min, ambient (1798000000) and humidity (1798100000).
 *   `sage` (the producer-side age of the last good SHT45 reading) is emitted on
 *   the wire but is NOT declared, and PocketBase 0.24 silently drops undeclared
 *   fields — so the producer age of a stored row is UNKNOWABLE from the row.
 *
 * Consequences this module enforces:
 *   - `temperature` is NON-QUERYABLE for history (see
 *     `NONQUERYABLE_STORED_TEMPERATURE`); the queryable pair is
 *     `humidity` and `ambient`.
 *   - `ambient` is DUAL-SOURCE with DIFFERENT instrument semantics:
 *       s3-mic-01   → SHT45 air temperature (rehomed from mic `temperature`)
 *       pi-thermal-01 → MLX90640 thermal frame-average Ta (scene IR)
 *     These are not the same physical quantity and are NEVER merged into one
 *     trend by default: the source is explicit and per-source.
 *   - PocketBase numeric fields default to `0`, and neither `sage` nor a
 *     freshness flag is stored, so an in-range stored number cannot be asserted
 *     to be a real measurement. A present number is surfaced with status
 *     `unknown` unless the caller explicitly declares measurement provenance.
 *   - row age ≠ producer age: `rowAgeMs` is derived from the DB stamp;
 *     `producerAgeMs` is always `null` (unknown) here.
 *   - `mic:true` is NOT proof of a fresh SHT reading (the flag stays true while
 *     the SHT fragment is omitted).
 *
 * Other invariants: real 0 vs missing kept distinct; samples source-scoped,
 * ascending and deterministically de-duplicated; half-open `[start, end)`
 * windows; query bounds require an explicit storage unit; fractional seconds
 * are preserved exactly; a numeric forecast is NEVER produced (no implemented,
 * validated model exists) — `forecastEnvironmental` always fails closed.
 */

// ── fields and their instruments ────────────────────────────────────────────

/**
 * Fields that can be read back from stored telemetry rows.
 *
 * `temperature` is deliberately NOT a member: the ingest guard always removes
 * it before insert, so a stored `temperature` is the schema default, not data.
 */
export type EnvironmentalField = 'humidity' | 'ambient';

/** Stored schema field that is present but never written by the ingest path. */
export const NONQUERYABLE_STORED_TEMPERATURE = 'temperature' as const;

/** A stored-but-always-default field (schema declares it; the guard removes it). */
export interface NonQueryableStoredField {
  field: string;
  reason: string;
}

export const NONQUERYABLE_STORED_FIELDS: readonly NonQueryableStoredField[] = [
  {
    field: NONQUERYABLE_STORED_TEMPERATURE,
    reason:
      'thermal_guard.py always pops `temperature` before the PocketBase insert ' +
      '(rehoming it to `ambient` on mic rows); a stored value is only the schema ' +
      'default 0 — never a measurement',
  },
  {
    field: 'bodyTemp',
    reason:
      'thermal_guard.py always pops `bodyTemp` (a scene-camera pig-temperature claim); ' +
      'a stored value is only the schema default 0',
  },
];

/** One physical instrument that publishes a field into `telemetry`. */
export interface FieldSource {
  /** `telemetry.deviceId`. */
  source: string;
  /** Physical sensor. */
  instrument: string;
  /** What the stored number actually measures (semantics differ per source). */
  semantics: string;
}

export interface EnvironmentalFieldSpec {
  field: EnvironmentalField;
  unit: '°C' | '%';
  min: number;
  max: number;
  sources: readonly FieldSource[];
}

/**
 * Queryable field specs. Ranges are bounded physical-plausibility sanity ranges,
 * NOT clinical or comfort thresholds.
 */
export const ENVIRONMENTAL_FIELDS: Record<EnvironmentalField, EnvironmentalFieldSpec> = {
  humidity: {
    field: 'humidity',
    unit: '%',
    min: 0,
    max: 100,
    sources: [
      {
        source: 's3-mic-01',
        instrument: 'SHT45',
        semantics: 'relative humidity (%RH) from the ESP32-S3 mic board',
      },
    ],
  },
  ambient: {
    field: 'ambient',
    unit: '°C',
    min: -40,
    max: 85,
    sources: [
      {
        source: 's3-mic-01',
        instrument: 'SHT45',
        semantics:
          'SHT45 air temperature, rehomed from the mic `temperature` field to ' +
          '`ambient` by thermal_guard.py',
      },
      {
        source: 'pi-thermal-01',
        instrument: 'MLX90640',
        semantics:
          'MLX90640 thermal frame-average Ta (scene infrared) — a DIFFERENT ' +
          'quantity from SHT45 air temperature and never comparable to it',
      },
    ],
  },
};

export function isEnvironmentalField(value: unknown): value is EnvironmentalField {
  return value === 'humidity' || value === 'ambient';
}

/** The declared instrument for a (field, source) pair, or `null` if unsupported. */
export function findFieldSource(field: EnvironmentalField, source: string): FieldSource | null {
  if (!isEnvironmentalField(field)) return null;
  for (const candidate of ENVIRONMENTAL_FIELDS[field].sources) {
    if (candidate.source === source) return candidate;
  }
  return null;
}

/** Proposed hard cap on rows returned by one PocketBase page (analytics.tsx). */
export const QUERY_PAGE_CAP = 100;

// ── numeric coercion ────────────────────────────────────────────────────────

function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    if (!raw.trim()) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ── timestamps ──────────────────────────────────────────────────────────────

/** The unit a stored `timestamp` value is expressed in. Must be stated, never guessed. */
export type TimestampUnit = 'seconds' | 'milliseconds';

/** Epoch-ms threshold below which a bare number is treated as seconds. */
const SECONDS_MAX = 1e12;

export interface NormalizeTimestampOptions {
  /**
   * Interpret a NUMERIC value strictly in this unit (no magnitude heuristic).
   * Unknown units throw — silently guessing the unit is how the seconds-vs-ms
   * defect reached production.
   */
  unit?: TimestampUnit;
}

/** Strict ISO-8601 instant with an explicit zone (no lenient date parsing). */
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Normalize a stored timestamp to epoch MILLISECONDS.
 *
 * Numeric values: with an explicit `unit`, that unit is honoured strictly.
 * Without one, a value < 1e12 is treated as seconds. Only strict ISO-8601
 * strings parse (a lenient `Date.parse` would accept nonsense). Anything
 * invalid — non-positive, non-finite, or a conversion that overflows to
 * Infinity — returns `null`, never a fabricated fresh 0.
 */
export function normalizeTimestamp(value: unknown, opts: NormalizeTimestampOptions = {}): number | null {
  const { unit } = opts;
  if (unit !== undefined && unit !== 'seconds' && unit !== 'milliseconds') {
    throw new TypeError(`normalizeTimestamp: unknown timestamp unit ${String(unit)}`);
  }

  const numeric = toFiniteNumber(value);
  if (numeric !== null) {
    if (numeric <= 0) return null;
    if (unit === 'milliseconds') return numeric;
    // `.toFiniteNumber` guarantees a finite input, but a seconds→ms multiply can
    // overflow to Infinity (e.g. Number.MAX_VALUE): reject, never return it.
    const ms = numeric * 1000;
    if (!Number.isFinite(ms)) return null;
    if (unit === 'seconds') return ms;
    return numeric < SECONDS_MAX ? ms : numeric;
  }

  // Non-numeric string fallback: only a strict ISO-8601 instant is a timestamp.
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (ISO_8601.test(trimmed)) {
      const parsed = Date.parse(trimmed);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
  }
  return null;
}

/** Classify a single raw value's unit by magnitude. `unknown` = unusable. */
export function detectTimestampUnit(value: unknown): TimestampUnit | 'unknown' {
  const numeric = toFiniteNumber(value);
  if (numeric === null || numeric <= 0) return 'unknown';
  return numeric < SECONDS_MAX ? 'seconds' : 'milliseconds';
}

/**
 * Classify a series' uniform unit.
 *
 * `mixed` means the records do NOT share one determinable unit and therefore MUST
 * NOT be handed the same naive query bound. Returned both when determinate units
 * disagree (seconds AND milliseconds) and when a determinate unit coexists with
 * records whose timestamp cannot be placed at all (0 / invalid / null).
 * `unknown` means no record had a usable timestamp.
 */
export function detectSeriesUnit(
  rows: readonly Record<string, unknown>[],
  key = 'timestamp',
): TimestampUnit | 'mixed' | 'unknown' {
  let seconds = 0;
  let millis = 0;
  let unknown = 0;
  for (const row of rows) {
    const u = detectTimestampUnit(row?.[key]);
    if (u === 'seconds') seconds += 1;
    else if (u === 'milliseconds') millis += 1;
    else unknown += 1;
  }
  if (seconds && millis) return 'mixed';
  if (unknown && (seconds || millis)) return 'mixed';
  if (millis) return 'milliseconds';
  if (seconds) return 'seconds';
  return 'unknown';
}

// ── windows and query bounds ────────────────────────────────────────────────

/** Half-open time window in epoch MILLISECONDS: [start, end). */
export interface TimeWindow {
  start: number;
  end: number;
}

/** Bounds ready for a PocketBase filter `timestamp>=lower && timestamp<upper`. */
export interface StorageBounds {
  lower: number;
  upper: number;
  unit: TimestampUnit;
}

/**
 * Convert an epoch-ms window into storage-unit filter bounds.
 *
 * An EXPLICIT unit is mandatory: bounds are only correct against storage whose
 * unit is known. Seconds are divided EXACTLY (PocketBase compares fractional
 * numeric fields), so a sub-second edge is preserved and no in-window row is
 * silently under-fetched; rounding to whole seconds would clip it.
 */
export function buildStorageBounds(window: TimeWindow, unit: TimestampUnit): StorageBounds {
  if (unit !== 'seconds' && unit !== 'milliseconds') {
    throw new TypeError(
      `buildStorageBounds: explicit timestamp unit required (got ${String(unit)}); ` +
        'mixed-unit records cannot share one bound — normalize first',
    );
  }
  if (!Number.isFinite(window?.start) || !Number.isFinite(window?.end) || window.end <= window.start) {
    throw new TypeError('buildStorageBounds: window must have finite start < end');
  }
  const lower = unit === 'seconds' ? window.start / 1000 : window.start;
  const upper = unit === 'seconds' ? window.end / 1000 : window.end;
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    throw new TypeError('buildStorageBounds: unit conversion overflowed');
  }
  return { lower, upper, unit };
}

/** Half-open membership test: start inclusive, end exclusive. */
export function isWithinWindow(timestampMs: number, window: TimeWindow): boolean {
  return Number.isFinite(timestampMs) && timestampMs >= window.start && timestampMs < window.end;
}

// ── rows and samples ────────────────────────────────────────────────────────

export type SampleStatus = 'valid' | 'missing' | 'invalid' | 'out-of-range' | 'unknown';

/**
 * How a number's measurement status was established.
 *
 * `unknown` (the default): the row carries a number but the helper cannot prove
 * it is a measurement — PocketBase numeric fields default to 0 and no freshness
 * or producer-age field is stored. `declared`: the caller explicitly asserts
 * that an in-range stored number in this read is a real measurement.
 */
export type MeasurementProvenance = 'declared' | 'unknown';

export interface EnvironmentalSample {
  field: EnvironmentalField;
  source: string;
  instrument: string;
  /** Epoch ms (normalized from the stored stamp). */
  timestampMs: number;
  status: SampleStatus;
  /**
   * Numeric value present in the row (retained for `valid` and `unknown`),
   * `null` when absent/invalid/out-of-range. A real 0 stays 0.
   */
  value: number | null;
  provenance: MeasurementProvenance;
  /** Age of the STORED ROW (`now - timestampMs`) — NOT the producer's reading age. */
  rowAgeMs: number | null;
  /**
   * Producer-side age of the underlying measurement. Always `null`: `sage` is
   * not a declared/stored field, so it is unknowable from a stored row.
   */
  producerAgeMs: null;
  /** Value exactly as stored, retained for provenance. */
  raw: unknown;
}

export type SkipReason = 'invalid-timestamp' | 'future-timestamp';

export interface RowParseResult {
  sample: EnvironmentalSample | null;
  skipped: SkipReason | null;
  /** `row.deviceId` equals the requested source (or the pair is unsupported — see below). */
  sourceMatched: boolean;
  /** The requested (field, source) pair is not a declared instrument combination. */
  unsupportedSource: boolean;
}

export interface ParseOptions {
  field: EnvironmentalField;
  source: string;
  unit: TimestampUnit;
  /**
   * `declared` promotes an in-range stored number to `valid`. Default `unknown`,
   * because PB defaults numeric fields to 0 and freshness is not stored.
   */
  measurementProvenance?: MeasurementProvenance;
  /** Reference instant (epoch ms) used for age + future checks. */
  now?: number;
  /** Future clock skew tolerated before a stamp is rejected. Default 5000 ms. */
  futureToleranceMs?: number;
  /** Override the default field spec (unit/ranges). */
  spec?: EnvironmentalFieldSpec;
}

const DEFAULT_FUTURE_TOLERANCE_MS = 5000;

function specFor(opts: ParseOptions): EnvironmentalFieldSpec {
  if (opts.spec) return opts.spec;
  if (!isEnvironmentalField(opts.field)) {
    throw new TypeError(`parseEnvironmentalSample: unknown field ${String(opts.field)}`);
  }
  return ENVIRONMENTAL_FIELDS[opts.field];
}

function classifyValue(
  raw: unknown,
  spec: EnvironmentalFieldSpec,
  provenance: MeasurementProvenance,
): { status: SampleStatus; value: number | null } {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { status: 'missing', value: null };
  }
  const n = toFiniteNumber(raw);
  if (n === null) return { status: 'invalid', value: null };
  if (n < spec.min || n > spec.max) return { status: 'out-of-range', value: null };
  // In-range number: only a declared provenance can make it a real reading.
  return provenance === 'declared' ? { status: 'valid', value: n } : { status: 'unknown', value: n };
}

/**
 * Parse one stored telemetry row into a provenance-carrying sample.
 *
 * A row whose timestamp cannot be placed in time yields no sample (`skipped`).
 * A row whose VALUE is missing/invalid/out-of-range is still returned as a sample
 * with `value: null` — coverage and missingness are retained, never dropped.
 * An in-range number is `unknown` unless `measurementProvenance: 'declared'`.
 */
export function parseEnvironmentalSample(
  row: Record<string, unknown>,
  opts: ParseOptions,
): RowParseResult {
  const spec = specFor(opts);

  const matched = findFieldSource(spec.field, opts.source);
  if (!matched) {
    return { sample: null, skipped: null, sourceMatched: false, unsupportedSource: true };
  }

  const deviceId = String(row?.deviceId ?? '');
  if (deviceId !== opts.source) {
    return { sample: null, skipped: null, sourceMatched: false, unsupportedSource: false };
  }

  const timestampMs = normalizeTimestamp(row?.timestamp, { unit: opts.unit });
  if (timestampMs === null) {
    return { sample: null, skipped: 'invalid-timestamp', sourceMatched: true, unsupportedSource: false };
  }
  const tolerance = opts.futureToleranceMs ?? DEFAULT_FUTURE_TOLERANCE_MS;
  if (opts.now !== undefined && !Number.isFinite(opts.now)) {
    throw new TypeError('parseEnvironmentalSample: `now` must be a finite epoch-ms instant');
  }
  if (opts.now !== undefined && timestampMs > opts.now + tolerance) {
    return { sample: null, skipped: 'future-timestamp', sourceMatched: true, unsupportedSource: false };
  }

  const provenance = opts.measurementProvenance ?? 'unknown';
  const raw = row?.[spec.field];
  const { status, value } = classifyValue(raw, spec, provenance);
  const rowAgeMs = opts.now !== undefined ? opts.now - timestampMs : null;
  return {
    sample: {
      field: spec.field,
      source: opts.source,
      instrument: matched.instrument,
      timestampMs,
      status,
      value,
      provenance,
      rowAgeMs,
      producerAgeMs: null,
      raw,
    },
    skipped: null,
    sourceMatched: true,
    unsupportedSource: false,
  };
}

// ── series normalization ────────────────────────────────────────────────────

export interface SeriesCoverage {
  /** Rows supplied to the normalizer. */
  rows: number;
  /** Samples retained after source/window/dedup filtering. */
  accepted: number;
  valid: number;
  unknown: number;
  missing: number;
  invalid: number;
  outOfRange: number;
  /** Rows excluded because `deviceId` did not equal the requested source. */
  excludedSourceMismatch: number;
  /** Rows excluded because the (field, source) pair is not a declared instrument. */
  excludedUnsupportedSource: number;
  skippedInvalidTimestamp: number;
  skippedFutureTimestamp: number;
  duplicatesRemoved: number;
  /** `valid / accepted` (0 when nothing was accepted). */
  coverage: number;
  firstMs: number | null;
  lastMs: number | null;
  newestValidMs: number | null;
  /** Row age of the newest valid sample, relative to `now` (null without `now`). */
  latestValidRowAgeMs: number | null;
}

export interface EnvironmentalSeries {
  field: EnvironmentalField;
  source: string;
  instrument: string;
  unit: TimestampUnit;
  samples: readonly EnvironmentalSample[];
  coverage: SeriesCoverage;
}

export interface NormalizeSeriesOptions extends ParseOptions {
  /** Restrict to this epoch-ms half-open window when supplied. */
  window?: TimeWindow;
}

const STATUS_RANK: Record<SampleStatus, number> = {
  valid: 0,
  unknown: 1,
  'out-of-range': 2,
  invalid: 3,
  missing: 4,
};

/**
 * Normalize stored rows into a source-scoped, ascending, de-duplicated series
 * with explicit coverage. Deterministic: same-timestamp rows rank `valid` first,
 * then keep the earliest input order, so a duplicate never shadows a real value.
 */
export function normalizeSeries(
  rows: readonly Record<string, unknown>[],
  opts: NormalizeSeriesOptions,
): EnvironmentalSeries {
  const indexed: { sample: EnvironmentalSample; i: number }[] = [];
  let skippedInvalidTimestamp = 0;
  let skippedFutureTimestamp = 0;
  let excludedSourceMismatch = 0;
  let excludedUnsupportedSource = 0;

  rows.forEach((row, i) => {
    const parsed = parseEnvironmentalSample(row, opts);
    if (parsed.unsupportedSource) excludedUnsupportedSource += 1;
    else if (!parsed.sourceMatched) excludedSourceMismatch += 1;
    if (parsed.skipped === 'invalid-timestamp') skippedInvalidTimestamp += 1;
    else if (parsed.skipped === 'future-timestamp') skippedFutureTimestamp += 1;
    if (!parsed.sample) return;
    if (opts.window && !isWithinWindow(parsed.sample.timestampMs, opts.window)) return;
    indexed.push({ sample: parsed.sample, i });
  });

  indexed.sort(
    (a, b) =>
      a.sample.timestampMs - b.sample.timestampMs ||
      STATUS_RANK[a.sample.status] - STATUS_RANK[b.sample.status] ||
      a.i - b.i,
  );

  const samples: EnvironmentalSample[] = [];
  let duplicatesRemoved = 0;
  for (const { sample } of indexed) {
    const prev = samples[samples.length - 1];
    if (prev && prev.timestampMs === sample.timestampMs) {
      duplicatesRemoved += 1;
      continue;
    }
    samples.push(sample);
  }

  let valid = 0;
  let unknown = 0;
  let missing = 0;
  let invalid = 0;
  let outOfRange = 0;
  let newestValidMs: number | null = null;
  for (const s of samples) {
    if (s.status === 'valid') {
      valid += 1;
      newestValidMs = s.timestampMs;
    } else if (s.status === 'unknown') unknown += 1;
    else if (s.status === 'missing') missing += 1;
    else if (s.status === 'invalid') invalid += 1;
    else outOfRange += 1;
  }

  const accepted = samples.length;
  const coverage: SeriesCoverage = {
    rows: rows.length,
    accepted,
    valid,
    unknown,
    missing,
    invalid,
    outOfRange,
    excludedSourceMismatch,
    excludedUnsupportedSource,
    skippedInvalidTimestamp,
    skippedFutureTimestamp,
    duplicatesRemoved,
    coverage: accepted > 0 ? valid / accepted : 0,
    firstMs: samples.length ? samples[0].timestampMs : null,
    lastMs: samples.length ? samples[samples.length - 1].timestampMs : null,
    newestValidMs,
    latestValidRowAgeMs:
      opts.now !== undefined && newestValidMs !== null ? opts.now - newestValidMs : null,
  };

  const matched = findFieldSource(opts.field, opts.source);
  return {
    field: opts.field,
    source: opts.source,
    instrument: matched?.instrument ?? 'unknown',
    unit: opts.unit,
    samples,
    coverage,
  };
}

// ── aggregation ─────────────────────────────────────────────────────────────

export interface EnvBucket {
  start: number;
  end: number;
  valid: number;
  unknown: number;
  missing: number;
  invalid: number;
  outOfRange: number;
  /** Mean over VALID samples only — null when none (a gap, never 0). */
  mean: number | null;
  min: number | null;
  max: number | null;
  /** True when the bucket contains no sample at all. */
  empty: boolean;
}

export interface BucketCoverage {
  windowStart: number;
  windowEnd: number;
  bucketCount: number;
  valid: number;
  missing: number;
  coverage: number;
  emptyBuckets: number;
}

export interface BucketAggregate {
  /** Derived from samples when they agree, else the explicit option, else null. */
  field: EnvironmentalField | null;
  /** Derived from samples when they agree, else the explicit option, else null. */
  source: string | null;
  buckets: readonly EnvBucket[];
  coverage: BucketCoverage;
}

export interface AggregateOptions extends TimeWindow {
  buckets: number;
  /** Explicit target field. Required when `samples` disagrees or is empty. */
  field?: EnvironmentalField;
  /** Explicit source. Required when `samples` disagrees or is empty. */
  source?: string;
  /** Hard cap on bucket allocation. Default `MAX_BUCKETS`. */
  maxBuckets?: number;
}

/** Hard ceiling on bucket allocation, checked BEFORE any array is created. */
export const MAX_BUCKETS = 4096;

/**
 * Split a window into `buckets` half-open sub-windows [start, end) and aggregate
 * valid samples per bucket. Empty/gap buckets keep a slot with `mean: null`; no
 * zero is ever imputed.
 *
 * The field/source of the result is explicit: derived from the samples when they
 * all agree, otherwise taken from the options, otherwise `null`. An empty sample
 * set NEVER fabricates a field. Mixed fields or sources are rejected.
 */
export function aggregateBuckets(
  samples: readonly EnvironmentalSample[],
  opts: AggregateOptions,
): BucketAggregate {
  if (!Number.isFinite(opts?.start) || !Number.isFinite(opts?.end) || opts.end <= opts.start) {
    throw new TypeError('aggregateBuckets: window must have finite start < end');
  }
  const cap = opts.maxBuckets ?? MAX_BUCKETS;
  if (!Number.isFinite(cap) || cap < 1) {
    throw new TypeError('aggregateBuckets: maxBuckets must be a finite value >= 1');
  }
  const count = opts.buckets;
  if (!Number.isFinite(count) || !Number.isInteger(count) || count < 1) {
    throw new TypeError('aggregateBuckets: buckets must be a finite integer >= 1');
  }
  if (count > cap) {
    throw new TypeError(`aggregateBuckets: buckets (${count}) exceeds the cap of ${cap}`);
  }

  let field: EnvironmentalField | null = opts.field ?? null;
  let source: string | null = opts.source ?? null;
  for (const s of samples) {
    if (field === null) field = s.field;
    else if (field !== s.field) {
      throw new TypeError('aggregateBuckets: samples mix fields; aggregate one field at a time');
    }
    if (source === null) source = s.source;
    else if (source !== s.source) {
      throw new TypeError(
        'aggregateBuckets: samples mix sources (instruments); aggregate one source at a time',
      );
    }
  }

  const width = (opts.end - opts.start) / count;
  const buckets: EnvBucket[] = [];
  for (let i = 0; i < count; i++) {
    const start = opts.start + i * width;
    const end = i === count - 1 ? opts.end : opts.start + (i + 1) * width;
    buckets.push({
      start,
      end,
      valid: 0,
      unknown: 0,
      missing: 0,
      invalid: 0,
      outOfRange: 0,
      mean: null,
      min: null,
      max: null,
      empty: true,
    });
  }

  const sums = new Array<number>(count).fill(0);
  for (const s of samples) {
    if (s.timestampMs < opts.start || s.timestampMs >= opts.end) continue;
    let idx = width > 0 ? Math.floor((s.timestampMs - opts.start) / width) : 0;
    if (idx < 0) idx = 0;
    if (idx >= count) idx = count - 1;
    const b = buckets[idx];
    b.empty = false;
    if (s.status === 'valid' && s.value !== null) {
      b.valid += 1;
      sums[idx] += s.value;
      b.min = b.min === null ? s.value : Math.min(b.min, s.value);
      b.max = b.max === null ? s.value : Math.max(b.max, s.value);
    } else if (s.status === 'unknown') b.unknown += 1;
    else if (s.status === 'missing') b.missing += 1;
    else if (s.status === 'invalid') b.invalid += 1;
    else b.outOfRange += 1;
  }

  let valid = 0;
  let missing = 0;
  let emptyBuckets = 0;
  buckets.forEach((b, i) => {
    if (b.valid > 0) b.mean = sums[i] / b.valid;
    valid += b.valid;
    missing += b.missing;
    if (b.empty) emptyBuckets += 1;
  });

  const accepted = buckets.reduce(
    (a, b) => a + b.valid + b.unknown + b.missing + b.invalid + b.outOfRange,
    0,
  );
  return {
    field,
    source,
    buckets,
    coverage: {
      windowStart: opts.start,
      windowEnd: opts.end,
      bucketCount: count,
      valid,
      missing,
      coverage: accepted > 0 ? valid / accepted : 0,
      emptyBuckets,
    },
  };
}

// ── readiness (input sufficiency) ───────────────────────────────────────────

export interface ForecastCapability {
  sourceSupported: boolean;
  rowCount: number;
  validCount: number;
  requiredCoverage: number;
  minValidSamples: number;
  /** Row age of the newest valid input, or null when there is none. */
  inputAgeMs: number | null;
  maxInputAgeMs: number;
  horizonMinutes: number;
}

export type EnvironmentalReadiness =
  | { status: 'unsupported-source'; reason: string }
  | { status: 'invalid-input'; reason: string }
  | { status: 'no-history'; reason: string }
  | { status: 'partial-history'; reason: string; coverage: number }
  | { status: 'stale-input'; reason: string; inputAgeMs: number | null }
  | { status: 'ready'; horizonMinutes: number; rowAgeMs: number };

/**
 * Classify whether the app's INPUTS are sufficient for a future forecast. These
 * are capability states, not a delivered forecast; `ready` means the inputs look
 * complete and current — the numeric forecast is still unavailable (no
 * implemented, validated model). Ordered most-fundamental first. Every numeric
 * field is validated for finiteness before it is compared.
 */
export function assessEnvironmentalReadiness(cap: ForecastCapability): EnvironmentalReadiness {
  if (!cap || typeof cap !== 'object') {
    return { status: 'invalid-input', reason: 'capability descriptor is missing' };
  }
  if (cap.sourceSupported !== true) {
    return { status: 'unsupported-source', reason: 'selected source is not supported for environmental history' };
  }

  const numeric = [cap.rowCount, cap.validCount, cap.minValidSamples, cap.requiredCoverage, cap.maxInputAgeMs, cap.horizonMinutes];
  if (!numeric.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return { status: 'invalid-input', reason: 'capability counts/limits must be finite numbers' };
  }
  if (cap.inputAgeMs !== null && !(typeof cap.inputAgeMs === 'number' && Number.isFinite(cap.inputAgeMs))) {
    return { status: 'invalid-input', reason: 'inputAgeMs must be a finite number or null' };
  }
  if (cap.rowCount < 0 || cap.validCount < 0 || cap.minValidSamples < 0) {
    return { status: 'invalid-input', reason: 'counts must be non-negative' };
  }
  if (cap.validCount > cap.rowCount) {
    return { status: 'invalid-input', reason: 'validCount cannot exceed rowCount' };
  }
  if (cap.requiredCoverage < 0 || cap.requiredCoverage > 1) {
    return { status: 'invalid-input', reason: 'requiredCoverage must be within [0, 1]' };
  }
  if (cap.maxInputAgeMs < 0) {
    return { status: 'invalid-input', reason: 'maxInputAgeMs must be non-negative' };
  }
  if (cap.horizonMinutes <= 0) {
    return { status: 'invalid-input', reason: 'horizonMinutes must be positive' };
  }

  if (cap.rowCount === 0) {
    return { status: 'no-history', reason: 'no recorded readings in the requested window' };
  }
  const coverage = cap.validCount / cap.rowCount;
  if (cap.validCount < cap.minValidSamples || coverage < cap.requiredCoverage) {
    return {
      status: 'partial-history',
      reason: `valid coverage ${coverage.toFixed(2)} below required ${cap.requiredCoverage}`,
      coverage,
    };
  }
  if (
    cap.inputAgeMs === null ||
    cap.inputAgeMs > cap.maxInputAgeMs ||
    cap.inputAgeMs < -DEFAULT_FUTURE_TOLERANCE_MS
  ) {
    return { status: 'stale-input', reason: 'no current valid input within the age limit', inputAgeMs: cap.inputAgeMs };
  }
  return { status: 'ready', horizonMinutes: cap.horizonMinutes, rowAgeMs: cap.inputAgeMs };
}

// ── forecast (fails closed; no numeric forecast exists) ─────────────────────

export type ForecastBlockStatus = 'invalid-cutoff' | 'no-implemented-model';

export interface EnvironmentalForecast {
  available: false;
  readiness: EnvironmentalReadiness | { status: ForecastBlockStatus; reason: string };
  reason: string;
}

/**
 * A request to forecast. `predictor`/`history`/`target` are accepted for
 * call-compatibility only and are IGNORED: the evaluated-predictor API was
 * deliberately REMOVED because no implemented, out-of-sample-validated
 * environmental model exists, and a caller-attested `evaluated` boolean is not
 * evidence. Real forecasting stays unavailable.
 */
export interface ForecastRequest {
  capability: ForecastCapability;
  target?: EnvironmentalField;
  history?: readonly EnvironmentalSample[];
  cutoffMs?: number;
  predictor?: unknown;
}

export const NO_MODEL_REASON =
  'no implemented, out-of-sample-validated environmental model exists; no numeric forecast is produced';

/**
 * Always returns `available: false`. It NEVER produces a number: there is no
 * model to back one, and inventing a value, interval, probability or confidence
 * would be fabrication. It reports why (input readiness, invalid cutoff, or the
 * absence of a model).
 */
export function forecastEnvironmental(req: ForecastRequest): EnvironmentalForecast {
  const readiness = assessEnvironmentalReadiness(req?.capability);
  if (readiness.status !== 'ready') {
    return { available: false, readiness, reason: readiness.reason };
  }
  if (!Number.isFinite(req?.cutoffMs)) {
    const reason = 'cutoffMs must be a finite epoch-ms instant';
    return { available: false, readiness: { status: 'invalid-cutoff', reason }, reason };
  }
  return { available: false, readiness: { status: 'no-implemented-model', reason: NO_MODEL_REASON }, reason: NO_MODEL_REASON };
}

// ── experimental persistence baseline (synthetic fixtures only) ─────────────

export interface PersistenceBaselineInput {
  target: EnvironmentalField;
  horizonMinutes: number;
  history: readonly EnvironmentalSample[];
  /** MUST be `true`. This helper is for synthetic fixtures, never production. */
  syntheticFixture: boolean;
  minValidSamples: number;
  maxInputAgeMs: number;
  nowMs: number;
}

export type PersistenceBaselineResult =
  | { available: false; reason: string }
  | {
      available: true;
      algorithm: 'persistence';
      experimental: true;
      evaluated: false;
      syntheticFixture: true;
      target: EnvironmentalField;
      unit: '°C' | '%';
      horizonMinutes: number;
      predicted: number;
      basedOnMs: number;
    };

/**
 * Persistence baseline — "the next value equals the last valid value". Explicitly
 * EXPERIMENTAL and UNEVALUATED: refused unless `syntheticFixture === true`, the
 * numeric inputs are finite, enough valid samples exist, and the newest valid
 * sample is current. It must never be presented as an evaluated production
 * forecast; a real forecast requires an implemented, validated model that does
 * not yet exist.
 */
export function persistenceBaseline(input: PersistenceBaselineInput): PersistenceBaselineResult {
  if (input?.syntheticFixture !== true) {
    return { available: false, reason: 'requires-synthetic-fixture' };
  }
  if (!Number.isFinite(input.horizonMinutes) || input.horizonMinutes <= 0) {
    return { available: false, reason: 'invalid-horizon' };
  }
  if (!Number.isFinite(input.minValidSamples) || input.minValidSamples < 0) {
    return { available: false, reason: 'invalid-min-valid-samples' };
  }
  if (!Number.isFinite(input.maxInputAgeMs) || input.maxInputAgeMs < 0) {
    return { available: false, reason: 'invalid-max-input-age' };
  }
  if (!Number.isFinite(input.nowMs)) {
    return { available: false, reason: 'invalid-now' };
  }
  const valid = input.history.filter((s) => s.status === 'valid' && s.value !== null);
  if (valid.length === 0) return { available: false, reason: 'no-valid-input' };
  if (valid.length < input.minValidSamples) return { available: false, reason: 'insufficient-samples' };

  const newest = valid[valid.length - 1];
  const age = input.nowMs - newest.timestampMs;
  if (age > input.maxInputAgeMs || age < -DEFAULT_FUTURE_TOLERANCE_MS) {
    return { available: false, reason: 'stale-input' };
  }

  return {
    available: true,
    algorithm: 'persistence',
    experimental: true,
    evaluated: false,
    syntheticFixture: true,
    target: input.target,
    unit: ENVIRONMENTAL_FIELDS[input.target].unit,
    horizonMinutes: input.horizonMinutes,
    predicted: newest.value as number,
    basedOnMs: newest.timestampMs,
  };
}
