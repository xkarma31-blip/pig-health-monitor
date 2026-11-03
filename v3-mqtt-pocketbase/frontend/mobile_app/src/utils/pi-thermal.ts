/**
 * PigPulse Pi thermal-console client.
 *
 * The Pi serves its live MLX90640 console on HTTPS :8080:
 *   /data        → frame + stats (768 pixels, min/max/avg/center/hotspot…)
 *   /ambient     → SHT45 barn temp/humidity + ingest state
 *   /esp/status  → ESP32-S3 barn-mic socket state
 *
 * Base-URL resolution order:
 *   1. EXPO_PUBLIC_PI_THERMAL_URL — explicit override (web harness / power users)
 *   2. derived from the farmer-saved PocketBase address → https://<host>:8080
 *      (a phone on the PigPulse WiFi has the Pi's LAN IP saved as its PB URL)
 *   3. null → no live fetch; callers keep the clearly-labeled simulation.
 */

import { loadFarmerSetup } from './setupStore';

export interface PiFrameData {
  ok?: boolean;
  frame?: number;
  fps?: number;
  readMs?: number;
  min: number;
  max: number;
  avg: number;
  center: number;
  center4?: number;
  centerCompensated?: number;
  hotspot: number;
  hotspotX: number;
  hotspotY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  ambient: number;
  verdict: string;
  alerts?: number;
  pixels: number[];
}

export interface PiAmbientData {
  ok?: boolean;
  state?: string;
  device?: string;
  micOnline?: boolean;
  temperature: number;
  humidity: number;
  ageS?: number;
  mqttConnected?: boolean;
}

export interface PiEspStatus {
  connected: boolean;
  socket: boolean;
  stale: boolean;
  peer?: string;
  rate?: number;
  channels?: number;
  signal?: boolean;
  nonzeroPct?: number;
  bytes?: number;
  uptimeS?: number;
}

/** Explicit console URL from the build environment, when present. */
export function piBaseFromEnv(): string | null {
  const env = process.env.EXPO_PUBLIC_PI_THERMAL_URL;
  return env ? env.replace(/\/+$/, '') : null;
}

/**
 * Resolve the Pi console base URL. Host-parsing is done with a regex (not
 * `new URL`) — Hermes on Android has historically shipped a partial URL shim.
 */
export async function resolvePiBase(): Promise<string | null> {
  const fromEnv = piBaseFromEnv();
  if (fromEnv) return fromEnv;
  try {
    const setup = await loadFarmerSetup();
    if (!setup.pbUrl) return null;
    const host = setup.pbUrl
      .replace(/^[a-z]+:\/\//i, '')
      .split('/')[0]
      .split(':')[0];
    if (!host) return null;
    return `https://${host}:8080`;
  } catch {
    return null;
  }
}

/** GET JSON from the console; null on any failure (timeout, TLS, CORS, 4xx). */
export async function fetchPiJson<T>(base: string, path: string, timeoutMs = 4000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
