/**
 * Local persistent cache (lane: offline support).
 *
 * AsyncStorage-backed, versioned, timestamped. Used to keep the last-known
 * alerts and environmental history on the phone so they are still visible when
 * the Pi/PocketBase is unreachable and after the app is killed and reopened.
 *
 * This is a read-through cache, not a second source of truth: a successful
 * network read always wins and rewrites the cache. A cache write/read failure is
 * non-fatal (the screen just behaves as if nothing was cached).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'pigpulse.cache.v1.';
const CACHE_VERSION = 1;

type Envelope<T> = { version: number; t: number; v: T };

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    const env: Envelope<unknown> = { version: CACHE_VERSION, t: Date.now(), v: value };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(env));
  } catch {
    /* cache write is non-fatal */
  }
}

export async function cacheGet<T>(key: string): Promise<{ t: number; v: T } | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed || parsed.version !== CACHE_VERSION || typeof parsed.t !== 'number' || !('v' in parsed)) {
      return null;
    }
    return { t: parsed.t, v: parsed.v };
  } catch {
    return null;
  }
}

export async function cacheRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {
    /* non-fatal */
  }
}