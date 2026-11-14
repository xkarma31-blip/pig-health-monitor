/**
 * home-telemetry.ts — pure, dependency-free helpers for the Home screen (lane B6).
 *
 * Deliberately self-contained (no relative imports) so it runs under the repo's
 * plain `tsx` test runner and bundles inside the isolated hook fixture without a
 * tsconfig or path mapping.
 *
 * WHY A LOCAL TIME PARSER: `frameTime` is a deliberate mirror of the canonical
 * `src/utils/telemetry-time.ts#telemetryTime`. It is duplicated ONLY so this
 * module has zero imports; the canonical helper stays the app's source of truth
 * and the hook resolves it through the normal tree. If the canonical parser
 * changes, this mirror must change with it.
 *
 * SCHEMA DISCLOSURE: the `telemetry` collection carries an acquisition
 * `timestamp` only. There is NO producer-age, monotonic-clock, clock-quality or
 * timezone field, so nothing here can certify UTC correctness or a device's own
 * uptime. Freshness is always record-timestamp vs a supplied `now`; a device
 * with a skewed clock cannot be detected from this data.
 *
 * HONESTY RULES (track-d1-ui.md Home defects):
 *   - The Home summary is DEVICE MONITORING and EXPLICIT reported status — never
 *     a count of "healthy pigs". `reportedStatus` recognises an explicit
 *     `healthStatus` only; a device without one stays `unknown` (the old
 *     `inferStatus` promoted it to healthy).
 *   - A barn SCENE centre (`center`) is never run against a clinical temperature
 *     threshold. Only a device-REPORTED `temperature` may carry the legacy
 *     *display* band, which is labelled legacy — it is not clinical and never
 *     feeds a status count.
 *   - An invalid-timestamp record can never overwrite a valid/newer one, and a
 *     record is replaced WHOLESALE (never merged) so a guard that strips fields
 *     cannot have them resurrected from the previous frame.
 */

// ── Constants ──────────────────────────────────────────────────────

export const CACHE_KEY_PREFIX = 'pigpulse.realtime.cache.v2';

export const FRESH_MS = 90_000;
export const AGING_MS = 5 * 60_000;
export const FUTURE_TOLERANCE_MS = 5_000;

/**
 * Legacy pig-temperature *display* thresholds (°C). Kept only to render a muted
 * disclosure note next to an explicit device-reported temperature. They are NOT
 * clinical, apply ONLY to a reported `temperature` (never a scene centre or
 * ambient reading) and never drive a device status or count.
 */
export const LEGACY_WATCH_C = 39.0;
export const LEGACY_ALERT_C = 39.5;

// ── Types ──────────────────────────────────────────────────────────

export interface TelemetryFrame {
  id?: string;
  deviceId?: string;
  timestamp?: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  audioLevel?: number;
  coughCount?: number;
  healthStatus?: string;
  /** Barn SCENE statistics from the Pi thermal console (never body temp). */
  center?: number;
  ambient?: number;
  [key: string]: unknown;
}

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'stale'
  | 'empty'
  | 'disconnected'
  | 'error';

export type ReportedStatus = 'normal' | 'watch' | 'alert' | 'unknown';
export type FreshnessBand = 'fresh' | 'aging' | 'stale' | 'unknown';
export type DeviceValueKind = 'temperature' | 'scene' | 'ambient';

export interface DeviceValue {
  kind: DeviceValueKind | null;
  value: number | null;
}

export interface FreshnessAggregate {
  band: FreshnessBand;
  newestTime: number;
  count: number;
}

export interface DeviceSummary {
  total: number;
  status: Record<ReportedStatus, number>;
  freshness: Record<FreshnessBand, number>;
  newestBand: FreshnessBand;
}

// ── Time ───────────────────────────────────────────────────────────

/**
 * Device acquisition time in ms, or NaN. Mirror of canonical `telemetryTime`:
 * a numeric string is seconds until it cross 1e12, zero/negative is not a time.
 */
export function frameTime(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  if (typeof value === 'string' && !value.trim()) return NaN;
  const numeric = Number(value);
  const time = Number.isFinite(numeric)
    ? numeric < 1e12
      ? numeric * 1000
      : numeric
    : Date.parse(String(value));
  return time > 0 ? time : NaN;
}

// ── Source scope / cache keys ──────────────────────────────────────

/** Strip userinfo, path, query and fragment, leaving `host[:port]` (IPv6 safe). */
function hostPort(base: string): string {
  const withoutScheme = String(base).replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  const authority = withoutScheme.split(/[/?#]/)[0];
  const at = authority.lastIndexOf('@');
  return at === -1 ? authority : authority.slice(at + 1);
}

function isLoopback(value: string): boolean {
  const host = value.startsWith('[') ? value.slice(1, value.indexOf(']')) : value.split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
}

/**
 * Stable identity of the selected source. Never contains credentials.
 * Web distinguishes a same-origin deployment from an explicit origin/local
 * proxy; native distinguishes a loopback bench box from a LAN box.
 */
export function sourceScope(base: string, platform: 'web' | 'native'): string {
  const value = base ?? '';
  if (platform === 'web') {
    if (value === '') return 'web+same-origin';
    if (value.startsWith('/')) return `web+local-proxy+${value}`;
    return `web+origin+${hostPort(value)}`;
  }
  const host = hostPort(value);
  return `${isLoopback(host) ? 'native+loopback' : 'native+lan'}+${host}`;
}

export function cacheKeyFor(scope: string): string {
  return `${CACHE_KEY_PREFIX}:${scope}`;
}

/** Replace any URL (which may carry userinfo) with a non-identifying marker. */
export function stripCredentials(text: string): string {
  return String(text).replace(/https?:\/\/[^\s]+/g, '<source>');
}

// ── Frame sanitising / identity ────────────────────────────────────

export function deviceKey(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const record = input as Record<string, unknown>;
  const deviceId = record.deviceId;
  if (typeof deviceId === 'string' && deviceId.trim()) return deviceId;
  const id = record.id;
  if (typeof id === 'string' && id.trim()) return id;
  return '';
}

/**
 * Validate an incoming record. Rejects non-objects, arrays and anything without
 * a device identity; drops non-finite numbers and non-string/number timestamps.
 * NEVER invents a timestamp and never substitutes zero for a missing value.
 */
export function sanitizeFrame(input: unknown): TelemetryFrame | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  if (!deviceKey(source)) return null;
  const frame: Record<string, unknown> = {};
  for (const name of Object.keys(source)) {
    const value = source[name];
    if (value === undefined) continue;
    if (name === 'timestamp') {
      if (typeof value !== 'string' && typeof value !== 'number') continue;
      const text = String(value);
      if (!text.trim()) continue;
      frame[name] = text;
      continue;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    frame[name] = value;
  }
  return frame as TelemetryFrame;
}

// ── Versioned, source-scoped cache ─────────────────────────────────

export function serializeCache(frames: Record<string, TelemetryFrame>, scope: string): string {
  return JSON.stringify({ v: 2, scope, frames });
}

/**
 * Parse a scoped cache envelope. The legacy unsourced bare-map cache (and any
 * other version/scope) is NOT restored. Invalid frames are dropped on load.
 */
export function parseCache(raw: unknown, scope: string): Record<string, TelemetryFrame> {
  if (typeof raw !== 'string' || !raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const envelope = parsed as Record<string, unknown>;
  if (envelope.v !== 2 || envelope.scope !== scope) return {};
  const frames = envelope.frames;
  if (!frames || typeof frames !== 'object' || Array.isArray(frames)) return {};
  const out: Record<string, TelemetryFrame> = {};
  for (const [key, value] of Object.entries(frames as Record<string, unknown>)) {
    const frame = sanitizeFrame(value);
    if (frame) out[key] = frame;
  }
  return out;
}

// ── Frame acceptance ───────────────────────────────────────────────

/**
 * Decide whether `incoming` replaces `current`. Replacement is WHOLESALE: the
 * returned frame is never a merge, so a thermal guard that strips a field
 * cannot have it resurrected. Rejects an invalid-timestamp or older record, and
 * an implausibly future one; an untimed frame is accepted only on first sight.
 */
export function acceptIncomingFrame(
  current: TelemetryFrame | undefined,
  incoming: TelemetryFrame | undefined,
  now: number,
): TelemetryFrame | undefined {
  if (!incoming) return current;
  if (!current) return incoming;
  const incomingTime = frameTime(incoming.timestamp);
  const currentTime = frameTime(current.timestamp);
  if (!Number.isFinite(incomingTime)) {
    // No usable incoming time: it must not displace a timed current frame.
    return Number.isFinite(currentTime) ? current : incoming;
  }
  if (incomingTime > now + FUTURE_TOLERANCE_MS) return current;
  if (Number.isFinite(currentTime) && incomingTime < currentTime) return current;
  return incoming;
}

// ── Reported status (no numeric fallback) ──────────────────────────

const REPORTED_STATUS: Record<string, ReportedStatus> = {
  NORMAL: 'normal',
  HEALTHY: 'normal',
  OK: 'normal',
  WATCH: 'watch',
  ELEVATED: 'watch',
  WARNING: 'watch',
  CRITICAL: 'alert',
  ALERT: 'alert',
  HIGH: 'alert',
  DANGER: 'alert',
};

/** Explicit device-reported status only; otherwise `unknown`. */
export function reportedStatus(frame: { healthStatus?: unknown; [key: string]: unknown }): ReportedStatus {
  const raw = frame?.healthStatus;
  if (typeof raw !== 'string') return 'unknown';
  return REPORTED_STATUS[raw.trim().toUpperCase()] ?? 'unknown';
}

// ── Readings (scene is never a clinical temperature) ───────────────

/** A finite number that is actually a reading; 0 is treated as "no reading". */
export function usableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0 ? value : null;
}

/**
 * Classify a frame's primary reading. A reported `temperature` is the only
 * `temperature` kind; a scene `center` is labelled `scene` so a caller cannot
 * mistake it for body temperature.
 */
export function readDeviceValue(frame: TelemetryFrame): DeviceValue {
  const temperature = usableNumber(frame.temperature);
  if (temperature !== null) return { kind: 'temperature', value: temperature };
  const center = usableNumber(frame.center);
  if (center !== null) return { kind: 'scene', value: center };
  const ambient = usableNumber(frame.ambient);
  if (ambient !== null) return { kind: 'ambient', value: ambient };
  return { kind: null, value: null };
}

/** Legacy DISPLAY band for an explicit device-reported temperature only. */
export function legacyDisplayBand(temperature: number | null | undefined): ReportedStatus | null {
  if (typeof temperature !== 'number' || !Number.isFinite(temperature)) return null;
  if (temperature < LEGACY_WATCH_C) return 'normal';
  if (temperature < LEGACY_ALERT_C) return 'watch';
  return 'alert';
}

// ── Freshness ──────────────────────────────────────────────────────

function bandForAge(age: number): FreshnessBand {
  if (!Number.isFinite(age)) return 'unknown';
  if (age < -FUTURE_TOLERANCE_MS) return 'unknown';
  if (age <= FRESH_MS) return 'fresh';
  if (age <= AGING_MS) return 'aging';
  return 'stale';
}

export function freshnessBand(frame: TelemetryFrame, now: number): FreshnessBand {
  const time = frameTime(frame?.timestamp);
  if (!Number.isFinite(time)) return 'unknown';
  return bandForAge(now - time);
}

/** Freshness of the newest finite frame; `unknown` when none carries a time. */
export function aggregateFreshness(
  frames: Record<string, TelemetryFrame>,
  now: number,
): FreshnessAggregate {
  const values = Object.values(frames);
  let newestTime = NaN;
  for (const frame of values) {
    const time = frameTime(frame?.timestamp);
    if (Number.isFinite(time) && (!Number.isFinite(newestTime) || time > newestTime)) {
      newestTime = time;
    }
  }
  return {
    band: Number.isFinite(newestTime) ? bandForAge(now - newestTime) : 'unknown',
    newestTime,
    count: values.length,
  };
}

// ── Device summary ─────────────────────────────────────────────────

/** Device monitoring counts by EXPLICIT reported status and by freshness. */
export function summarizeDevices(
  frames: Record<string, TelemetryFrame>,
  now: number,
): DeviceSummary {
  const status: Record<ReportedStatus, number> = { normal: 0, watch: 0, alert: 0, unknown: 0 };
  const freshness: Record<FreshnessBand, number> = { fresh: 0, aging: 0, stale: 0, unknown: 0 };
  const values = Object.values(frames);
  for (const frame of values) {
    status[reportedStatus(frame)] += 1;
    freshness[freshnessBand(frame, now)] += 1;
  }
  return {
    total: values.length,
    status,
    freshness,
    newestBand: aggregateFreshness(frames, now).band,
  };
}
