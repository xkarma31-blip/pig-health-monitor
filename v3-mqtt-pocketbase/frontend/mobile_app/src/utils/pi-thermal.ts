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
  /** Pi-clock epoch ms when the frame was produced (absent on older consoles). */
  ts?: number;
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
  // Deployed web builds ship api/pi.js (same-origin bridge). A NATIVE build has
  // no same-origin: the Pi console is only reachable on the barn LAN, over a
  // self-signed certificate, so a phone on mobile data can only reach the
  // deployed bridge. Fall back to it instead of returning null, which used to
  // leave every live block (and both sound buttons) dead in the APK.
  if (Platform.OS === 'web') return '/api/pi';
  return piBridgeBase();
}

/**
 * Absolute origin of the deployed read-only bridge, used by native builds.
 * Public, holds no secret — the bridge forwards through the operator's tunnel.
 */
export const PI_BRIDGE_ORIGIN = (
  process.env.EXPO_PUBLIC_PI_BRIDGE_URL || 'https://pig-health-monitor.vercel.app'
).replace(/\/+$/, '');

/** The deployed bridge base (an absolute …/api/pi URL on native). */
export function piBridgeBase(): string {
  return `${PI_BRIDGE_ORIGIN}/api/pi`;
}

/**
 * True when `base` addresses the single-path bridge rather than a LAN console.
 * The bridge is one platform function: /api/pi?ep=<endpoint>, while a LAN
 * console serves plain subpaths (/data, /cctv, …). Both the same-origin web
 * base ('/api/pi') and the native absolute base must be recognised.
 */
function isBridgeBase(base: string): boolean {
  return base === '/api/pi' || base.endsWith('/api/pi');
}

/** GET JSON from the console; null on any failure (timeout, TLS, CORS, 4xx). */
export async function fetchPiJson<T>(base: string, path: string, timeoutMs = 4000): Promise<T | null> {
  // The deployed bridge is single-path (platform functions match one exact
  // path): /api/pi?ep=<endpoint>&ts=… — LAN bases use plain subpaths.
  let url = `${base}${path}`;
  if (isBridgeBase(base)) {
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

/** One CCTV snapshot frame: a renderable URL plus its Pi-clock capture time. */
export interface PiFrameCapture {
  url: string;
  /**
   * Pi-clock epoch ms when the Pi captured the JPEG (from `X-Frame-Ts`), or
   * null when the response carried no stamp (older console, or a proxy that
   * does not expose the header).
   */
  ts: number | null;
  /** Client clock ms when the response reached this device. */
  at: number;
}

/** One CCTV snapshot frame (JPEG) with its capture time; null when unavailable. */
export async function fetchPiFrame(base: string, timeoutMs = 10_000): Promise<PiFrameCapture | null> {
  const url = isBridgeBase(base) ? `${base}?ep=cctv` : `${base}/cctv`;
  // A connection that is accepted but never answered (hung proxy, silently
  // dropped Wi-Fi) must not pin the caller's in-flight flag forever — the
  // CCTV poller skips every tick while a fetch is pending, so one hung fetch
  // used to stop CCTV permanently. Same pattern as fetchPiJson.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: 'image/jpeg' }, signal: controller.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    const renderable = await blobToRenderable(blob);
    // Arrival is measured AFTER the payload is in hand (not at request start):
    // the PiClock offset must under-estimate, and every later arrival
    // timestamp makes the estimate more conservative. See pi-clock.ts.
    const fetchAt = Date.now();
    const rawTs = Number(res.headers.get('x-frame-ts'));
    return {
      url: renderable,
      ts: Number.isFinite(rawTs) && rawTs > 0 ? rawTs : null,
      at: fetchAt,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Continuous PCM stream URL for the barn mic (s16le, 16 kHz mono by default).
 * The web player schedules blocks from this one never-ending response; the
 * Pi closes it after a few idle seconds when the ESP mic is gone.
 */
export function piEspStreamUrl(base: string, rate = 16000): string {
  return isBridgeBase(base)
    ? `${base}?ep=${encodeURIComponent('esp/stream')}&rate=${rate}`
    : `${base}/esp/stream?rate=${rate}`;
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
  // React Native has no createObjectURL, so a blob cannot be produced there.
  // Hand the player the remote URL instead and let it fetch + decode; failures
  // are reported by the player, which can read the upstream's own reason.
  if (Platform.OS !== 'web') return { url, reason: null };
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
  const isBridge = isBridgeBase(base);
  const url =
    isBridge
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
  const url =
    isBridgeBase(base)
      ? `${base}?ep=${encodeURIComponent('camera-audio')}&seconds=${seconds}`
      : `${base}/camera-audio?seconds=${seconds}`;
  return fetchAudioChunk(url, signal);
}
