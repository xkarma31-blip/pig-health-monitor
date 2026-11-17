/**
 * 🧑‍🌾 Farmer setup persistence (canon port — PocketBase flavor).
 *
 * Everything a non-technical farmer configures lives here (AsyncStorage),
 * so NOTHING requires an app rebuild or env var:
 *   - pbUrl: where PocketBase lives (defaults to PAIR with utils/pocketbase.ts)
 *   - farmName / penName: labels shown on-screen
 *   - lang: 'en' | 'tl'
 *   - setupDone: wizard completed at least once
 *
 * Canon data path (no compute-node gateway):
 *   ESP32 → MQTT → Bridge → PocketBase → app
 * So "the box" for the farmer IS PocketBase — the wizard probes
 * `${pbUrl}/api/health` (returned `{ ok: true }`), same as pocketbase.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FarmerLang } from './farmerText';
import type { AccessMode } from './source-policy';

export interface FarmerSetup {
  /** PocketBase base URL the app talks to (see utils/pocketbase.ts PB_URL). */
  pbUrl: string;
  farmName: string;
  penName: string;
  lang: FarmerLang;
  setupDone: boolean;
  /** Interface sound feedback is opt-in; silent by default. */
  soundEnabled: boolean;
  /** Local-first by default; remote is the same Pi over its encrypted tunnel. */
  accessMode: AccessMode;
  /** Pi's address on the venue LAN, learned from the portal while on hotspot. */
  lanPbUrl: string;
  /** PocketBase base on the Pi's Tailscale address (measured 2026-11-17). */
  remotePbUrl: string;
}

const KEYS = {
  pbUrl: '@pigpulse/pbUrl',
  farmName: '@pigpulse/farmName',
  penName: '@pigpulse/penName',
  lang: '@pigpulse/lang',
  setupDone: '@pigpulse/setupDone',
  soundEnabled: '@pigpulse/soundEnabled',
  accessMode: '@pigpulse/accessMode',
  lanPbUrl: '@pigpulse/lanPbUrl',
  remotePbUrl: '@pigpulse/remotePbUrl',
} as const;

export const SETUP_DEFAULTS: FarmerSetup = {
  pbUrl: '',
  farmName: '',
  penName: '',
  lang: 'en',
  setupDone: false,
  soundEnabled: false,
  accessMode: 'auto',
  lanPbUrl: '',
  remotePbUrl: 'http://100.69.139.63:8090',
};

/** Well-known local candidates the Scan button probes (`/api/health` on each). */
export const PB_SCAN_CANDIDATES = [
  'http://127.0.0.1:8090',
  'http://localhost:8090',
  'http://192.168.69.1:8090',
  'http://192.168.254.100:8090',
  'http://192.168.1.100:8090',
  'http://192.168.0.100:8090',
];

export async function loadFarmerSetup(): Promise<FarmerSetup> {
  try {
    const [pbUrl, farmName, penName, lang, setupDone, soundEnabled, accessMode, lanPbUrl, remotePbUrl] = await Promise.all([
      AsyncStorage.getItem(KEYS.pbUrl),
      AsyncStorage.getItem(KEYS.farmName),
      AsyncStorage.getItem(KEYS.penName),
      AsyncStorage.getItem(KEYS.lang),
      AsyncStorage.getItem(KEYS.setupDone),
      AsyncStorage.getItem(KEYS.soundEnabled),
      AsyncStorage.getItem(KEYS.accessMode),
      AsyncStorage.getItem(KEYS.lanPbUrl),
      AsyncStorage.getItem(KEYS.remotePbUrl),
    ]);
    return {
      pbUrl: pbUrl ?? '',
      farmName: farmName ?? '',
      penName: penName ?? '',
      lang: lang === 'tl' ? 'tl' : 'en',
      setupDone: setupDone === '1',
      soundEnabled: soundEnabled === '1',
      accessMode: accessMode === 'local' || accessMode === 'remote' ? accessMode : 'auto',
      lanPbUrl: lanPbUrl ?? '',
      remotePbUrl: remotePbUrl ?? SETUP_DEFAULTS.remotePbUrl,
    };
  } catch {
    return { ...SETUP_DEFAULTS };
  }
}

export async function saveFarmerSetup(patch: Partial<FarmerSetup>): Promise<FarmerSetup> {
  const current = await loadFarmerSetup();
  const next = { ...current, ...patch };
  try {
    await Promise.all([
      AsyncStorage.setItem(KEYS.pbUrl, next.pbUrl),
      AsyncStorage.setItem(KEYS.farmName, next.farmName),
      AsyncStorage.setItem(KEYS.penName, next.penName),
      AsyncStorage.setItem(KEYS.lang, next.lang),
      AsyncStorage.setItem(KEYS.setupDone, next.setupDone ? '1' : '0'),
      AsyncStorage.setItem(KEYS.soundEnabled, next.soundEnabled ? '1' : '0'),
      AsyncStorage.setItem(KEYS.accessMode, next.accessMode),
      AsyncStorage.setItem(KEYS.lanPbUrl, next.lanPbUrl),
      AsyncStorage.setItem(KEYS.remotePbUrl, next.remotePbUrl),
    ]);
  } catch {
    // Storage failure: keep in-memory defaults so this session still works.
  }
  return next;
}

/** Probe one candidate: true only if it answers /api/health with code 200. */
export async function probePocketBase(url: string, timeoutMs = 2500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/api/health`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { code?: number; message?: string };
    return body.code === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}