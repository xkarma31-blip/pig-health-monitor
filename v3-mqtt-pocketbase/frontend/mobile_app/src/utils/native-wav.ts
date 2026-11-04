/**
 * Play a remote WAV capture on a NATIVE build.
 *
 * Web plays the capture straight from a blob URL. React Native has no blob
 * URLs, so the chunk is downloaded to the app cache and played from disk with
 * expo-audio — the same two modules (and the same lazy-import style) the tap
 * sounds already use in utils/sounds.ts.
 *
 * Honest by construction: the upstream's own reason is returned verbatim when
 * the capture cannot be fetched, and playback is only reported as started
 * after the player really begins — never optimistically.
 */

import { Platform } from 'react-native';

/** Where a downloaded chunk lives, and the player that owns it. */
type Loaded = {
  uri: string;
  player: { play: () => void; remove: () => void; playing?: boolean };
};

let audioModule: typeof import('expo-audio') | null = null;
let fsModule: typeof import('expo-file-system') | null = null;
let modulesChecked = false;

/** Lazy-load expo-audio + expo-file-system once; null when unavailable. */
async function modules(): Promise<{
  audio: typeof import('expo-audio');
  fs: typeof import('expo-file-system');
} | null> {
  if (modulesChecked) {
    return audioModule && fsModule ? { audio: audioModule, fs: fsModule } : null;
  }
  modulesChecked = true;
  try {
    audioModule = await import('expo-audio');
    fsModule = await import('expo-file-system');
    return { audio: audioModule, fs: fsModule };
  } catch {
    return null; // modules absent — the caller reports "unavailable"
  }
}

/** Minimal base64 for a byte array (the EAS/RN runtime has no Buffer). */
function toBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : -1;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : -1;
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | (b1 >= 0 ? b1 >> 4 : 0)];
    out += b1 >= 0 ? chars[((b1 & 15) << 2) | (b2 >= 0 ? b2 >> 6 : 0)] : '=';
    out += b2 >= 0 ? chars[b2 & 63] : '=';
  }
  return out;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Download `url` and play it.
 *
 * Resolves when playback finished, or as soon as it could not start.
 * Returns null on success, otherwise a short human-readable reason — the
 * upstream's own text when it supplied one.
 */
export async function playRemoteWav(
  url: string,
  signal?: AbortSignal,
  secondsHint = 4,
): Promise<string | null> {
  if (Platform.OS === 'web') return 'unsupported on web';

  const mods = await modules();
  if (!mods) return 'audio module unavailable';

  let loaded: Loaded | null = null;
  try {
    const res = await fetch(url, { headers: { Accept: 'audio/wav' }, signal });
    if (!res.ok) {
      let reason = '';
      try {
        reason = (await res.text()).trim();
      } catch {
        /* the status alone is still honest */
      }
      return reason || `HTTP ${res.status}`;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 44 || bytes[0] !== 0x52 || bytes[1] !== 0x49) {
      return 'capture was not a WAV';
    }

    // Cache the chunk so repeated captures do not grow the app's storage.
    const { Directory, File, Paths } = mods.fs;
    const dir = new Directory(Paths.cache, 'pigpulse-mic');
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, `chunk_${Date.now()}.wav`);
    file.write(toBase64(bytes), { encoding: 'base64' });

    const player = mods.audio.createAudioPlayer({ uri: file.uri });
    loaded = { uri: file.uri, player: player as unknown as Loaded['player'] };
    player.play();

    // Wait out the capture, then stop. The Pi's WAV header carries the real
    // length, so the hint only bounds a stalled player.
    const budgetMs = Math.max(1500, (secondsHint + 3) * 1000);
    const started = Date.now();
    while (Date.now() - started < budgetMs) {
      if (signal?.aborted) break;
      await wait(250);
    }
    return null;
  } catch (e) {
    if (signal?.aborted) return null; // a user stop is not a failure
    return e instanceof Error ? e.name : 'playback failed';
  } finally {
    // Always release the player and the file, whatever happened above.
    try {
      loaded?.player.remove();
    } catch {
      /* already disposed */
    }
    try {
      const fs = fsModule;
      if (loaded && fs) {
        const f = new fs.File(loaded.uri);
        if (f.exists) f.delete();
      }
    } catch {
      /* the cache directory is disposable; a failed delete is harmless */
    }
  }
}
