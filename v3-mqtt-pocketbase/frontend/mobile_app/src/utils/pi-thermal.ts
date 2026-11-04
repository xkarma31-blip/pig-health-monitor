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

import { Platform } from 'react-native';
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
 *
 * Order: env override → farmer-saved PB host :8080 → (web only) the deployment's
 * own /api/pi bridge, which api/pi.js serves through the read-only tunnel.
 */
export async function resolvePiBase(): Promise<string | null> {
  const fromEnv = piBaseFromEnv();
  if (fromEnv) return fromEnv;
  try {
    const setup = await loadFarmerSetup();
    if (setup.pbUrl) {
      const host = setup.pbUrl
        .replace(/^[a-z]+:\/\//i, '')
        .split('/')[0]
        .split(':')[0];
      if (host) return `https://${host}:8080`;
    }
  } catch {
    /* fall through to the web fallback */
  }
  // Deployed web builds ship api/pi.js (same-origin bridge). Local harnesses
  // without that route simply 404 → the hook reports live:false as before.
  if (Platform.OS === 'web') return '/api/pi';
  return null;
}

/** GET JSON from the console; null on any failure (timeout, TLS, CORS, 4xx). */
export async function fetchPiJson<T>(base: string, path: string, timeoutMs = 4000): Promise<T | null> {
  // The deployed bridge is single-path (platform functions match one exact
  // path): /api/pi?ep=<endpoint>&ts=… — LAN bases use plain subpaths.
  let url = `${base}${path}`;
  if (base === '/api/pi') {
    const [p, q] = path.split('?');
    const ep = p.replace(/^\//, '');
    url = `${base}?ep=${encodeURIComponent(ep)}${q ? `&${q}` : ''}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
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

async function blobToRenderable(blob: Blob): Promise<string> {
  if (Platform.OS === 'web' && typeof URL !== 'undefined' && 'createObjectURL' in URL) {
    return URL.createObjectURL(blob);
  }
  return await new Promise<string>((resolve, reject) => {
    try {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('blob read failed'));
      r.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });
}

/** One CCTV snapshot frame (JPEG) as a renderable URL; null when unavailable. */
export async function fetchPiFrame(base: string): Promise<string | null> {
  const url = base === '/api/pi' ? `${base}?ep=cctv` : `${base}/cctv`;
  try {
    const res = await fetch(url, { headers: { Accept: 'image/jpeg' } });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await blobToRenderable(blob);
  } catch {
    return null;
  }
}

/**
 * Outcome of an audio-chunk fetch.
 *
 * `url` is a blob URL for a playable WAV chunk, or null.
 * `reason` is the upstream's own plain-text explanation when there is no
 * audio ("ESP mic not connected - nothing to record", "camera audio busy -
 * another capture in progress", …) — passed through so the UI can say WHAT
 * is wrong instead of a generic "unreachable".
 */
export type PiAudioResult = { url: string | null; reason: string | null };

/**
 * Fetch one bounded WAV chunk. `signal` lets the caller abort an in-flight
 * capture when the user mutes, so the request is not left running.
 */
async function fetchAudioChunk(url: string, signal?: AbortSignal): Promise<PiAudioResult> {
  try {
    const res = await fetch(url, { headers: { Accept: 'audio/wav' }, signal });
    if (!res.ok) {
      let reason = '';
      try {
        reason = (await res.text()).trim();
      } catch {
        /* ignore — the status alone is still honest */
      }
      return { url: null, reason: reason || `HTTP ${res.status}` };
    }
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), reason: null };
  } catch (e) {
    // An aborted request is a user action (mute/unmount), not a failure.
    if (signal?.aborted) return { url: null, reason: null };
    return { url: null, reason: e instanceof Error ? e.name : 'request failed' };
  }
}

/** Bounded WAV chunk from the barn mic (seconds 1–10); null when unavailable. */
export async function fetchPiAudioChunk(
  base: string,
  seconds = 3,
  signal?: AbortSignal,
): Promise<PiAudioResult> {
  if (Platform.OS !== 'web') return { url: null, reason: null }; // native playback lands with the APK pass
  const url =
    base === '/api/pi'
      ? `${base}?ep=${encodeURIComponent('esp/record')}&seconds=${seconds}`
      : `${base}/esp/record?seconds=${seconds}`;
  return fetchAudioChunk(url, signal);
}

/** Bounded WAV chunk from the camera's own audio track (seconds 2–8); null when unavailable. */
export async function fetchPiCameraAudio(
  base: string,
  seconds = 4,
  signal?: AbortSignal,
): Promise<PiAudioResult> {
  if (Platform.OS !== 'web') return { url: null, reason: null };
  const url =
    base === '/api/pi'
      ? `${base}?ep=${encodeURIComponent('camera-audio')}&seconds=${seconds}`
      : `${base}/camera-audio?seconds=${seconds}`;
  return fetchAudioChunk(url, signal);
}
