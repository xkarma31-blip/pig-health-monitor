/**
 * Live-source resolution + honest link-state math.
 *
 * Everything here is derived from the DEPLOYED contracts, not assumptions:
 *
 *   ESP32-S3 `s3-mic-01`
 *     firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry/src/
 *     esp32s3_telemetry.ino
 *       - publishes pig/s3-mic-01/telemetry every 1000 ms
 *       - payload: {"mic":bool,"rms":int,"peak":int,"sr":48000,
 *                   "temperature"?, "humidity"?}
 *       - rms/peak are 24-bit scale: FULL_SCALE = 8388608 (`#define FULL_SCALE`)
 *         and the firmware itself prints 20*log10(rms/FULL_SCALE)
 *       - LWT is retained on the SAME telemetry topic with {"mic":false,...}
 *       - it publishes NO `status` topic (CANON §6 item 5), so a devices row
 *         may never exist for it — recency is the only honest liveness signal
 *
 *   Pi `pi-thermal-01`
 *     backend/thermal-pi/thermal_publish.py
 *       - publishes telemetry every PUBLISH_INTERVAL_S = 10 s
 *       - publishes status (online/offline + lastSeen ms) every 60 s
 *
 *   Bridge
 *     backend/bridge/local_bridge.py — stamps `timestamp` in epoch MILLISECONDS
 *     when a payload omits it, so recency is computed on that value.
 *
 * No network call is made from this module. It is pure so the math is testable.
 */

import { telemetryTime } from './telemetry-time';

/** Firmware FULL_SCALE for the 24-bit RMS/peak values (esp32s3_telemetry.ino). */
export const ESP_FULL_SCALE = 8388608;

/** Meter floor: everything below −60 dBFS reads as silence. */
export const METER_FLOOR_DBFS = -60;

export type LinkState = 'live' | 'stale' | 'offline' | 'unknown';

export interface DeviceCadence {
  /** How often the device publishes data. */
  publishMs: number;
  /** How often it publishes a status/heartbeat, 0 when it has no status topic. */
  heartbeatMs: number;
}

/**
 * Per-device publish cadence. Anything not listed falls back to FALLBACK_CADENCE.
 * Keep in sync with the firmware / publisher constants named above.
 */
export const DEVICE_CADENCE: Record<string, DeviceCadence> = {
  's3-mic-01': { publishMs: 1_000, heartbeatMs: 0 },
  'pi-thermal-01': { publishMs: 10_000, heartbeatMs: 60_000 },
};

export const FALLBACK_CADENCE: DeviceCadence = { publishMs: 10_000, heartbeatMs: 60_000 };

export function cadenceFor(deviceId: string): DeviceCadence {
  return DEVICE_CADENCE[deviceId] ?? FALLBACK_CADENCE;
}

/**
 * Thresholds derived from cadence, not vibes:
 *   stale   — three missed publishes (or 15 s, whichever is longer)
 *   offline — six missed publishes, but never shorter than the heartbeat window
 */
export function thresholdsFor(cadence: DeviceCadence): { staleS: number; offlineS: number } {
  const publish = cadence.publishMs / 1000;
  const heartbeat = cadence.heartbeatMs / 1000;
  return {
    staleS: Math.max(publish * 3, 5),
    offlineS: Math.max(publish * 6, heartbeat * 2, 30),
  };
}

export function linkState(
  lastSeen: unknown,
  now = Date.now(),
  cadence: DeviceCadence = FALLBACK_CADENCE,
): LinkState {
  const ts = telemetryTime(lastSeen);
  if (!Number.isFinite(ts)) return 'unknown';
  const ageS = (now - ts) / 1000;
  if (ageS < -5) return 'unknown'; // clock skew bigger than tolerance
  const { staleS, offlineS } = thresholdsFor(cadence);
  if (ageS <= staleS) return 'live';
  if (ageS <= offlineS) return 'stale';
  return 'offline';
}

/** "4 s ago" / "2 min ago" / "—". Rounded, never negative. */
export function friendlyAge(lastSeen: unknown, now = Date.now()): string {
  const ts = telemetryTime(lastSeen);
  if (!Number.isFinite(ts)) return 'no data yet';
  const ageS = Math.max(0, Math.round((now - ts) / 1000));
  if (ageS < 2) return 'just now';
  if (ageS < 60) return `${ageS} s ago`;
  const min = Math.round(ageS / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  return `${Math.round(hr / 24)} d ago`;
}

/**
 * 24-bit RMS → dBFS, using exactly the firmware's own formula
 * (`20.0 * log10(rms / FULL_SCALE + 1e-9)`) so the app number matches the
 * serial monitor instead of drifting by a scale factor.
 */
export function dbfsFromRms(rms: unknown, fullScale = ESP_FULL_SCALE): number {
  const value = typeof rms === 'number' ? rms : Number(rms);
  if (!Number.isFinite(value) || value <= 0) return METER_FLOOR_DBFS;
  const db = 20 * Math.log10(value / fullScale + 1e-9);
  return Number.isFinite(db) ? Math.max(METER_FLOOR_DBFS, Math.min(0, db)) : METER_FLOOR_DBFS;
}

/** dBFS → 0..100 meter fill, linear from METER_FLOOR_DBFS to 0. */
export function meterPercent(db: number, floor = METER_FLOOR_DBFS): number {
  if (!Number.isFinite(db)) return 0;
  const clamped = Math.max(floor, Math.min(0, db));
  return Math.round(((clamped - floor) / -floor) * 100);
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0', '::1', '[::1]']);

/** Strip trailing slashes without needing URL parsing. */
function trimBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Resolve the Pi's thermal-pi origin (HTTPS :8080) from the farmer-saved
 * PocketBase URL.
 *
 * The Pi runs PocketBase on :8090 and thermal-pi on :8080 (CANON §2), so the
 * host carries over and only the port changes.
 *
 * Returns null for loopback addresses: `http://127.0.0.1:8090` is either the
 * laptop's PocketBase or an `adb reverse` tunnel — neither implies a reachable
 * thermal-pi on the same host. Set EXPO_PUBLIC_PI_URL to override.
 */
export function piBaseFromPbUrl(pbUrl: string | null | undefined): string | null {
  const override = trimBase(process.env.EXPO_PUBLIC_PI_URL || '');
  if (override) return override;

  const raw = trimBase(pbUrl || '');
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname;
    if (!host || LOOPBACK_HOSTS.has(host)) return null;
    // Already pointing at the thermal service itself.
    if (parsed.port === '8080') return `https://${host}:8080`;
    return `https://${host}:8080`;
  } catch {
    return null;
  }
}

export interface PiEndpoints {
  /** e.g. https://192.168.69.1:8080 */
  base: string;
  /** MJPEG proxy — thermal-pi web_server.py `/cctv`. */
  cctv: string;
  /** Thermal frame JSON — web_server.py `/data`. */
  data: string;
  /** ESP32-S3 TCP ingest status — web_server.py `/esp/status`. */
  espStatus: string;
  /** Plain-text diagnostics — web_server.py `/health`. */
  health: string;
  /** Thermal + CCTV fusion page. */
  fusion: string;
}

export function piEndpoints(base: string): PiEndpoints {
  const b = trimBase(base);
  return {
    base: b,
    cctv: `${b}/cctv`,
    data: `${b}/data`,
    espStatus: `${b}/esp/status`,
    health: `${b}/health`,
    fusion: `${b}/static/fusion.html`,
  };
}

/**
 * Pick the live device id for a role. Exact id first, then a substring match so
 * a renamed node still resolves instead of silently showing "no data".
 */
export function pickDeviceId(
  ids: string[],
  preferred: string,
  match: RegExp,
): string | undefined {
  if (ids.includes(preferred)) return preferred;
  return ids.find((id) => match.test(id));
}
