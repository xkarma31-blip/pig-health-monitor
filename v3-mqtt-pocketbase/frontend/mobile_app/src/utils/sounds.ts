/**
 * 🔊 Sound Feedback Utility
 *
 * Web:  Web Audio API (procedurally generated, zero assets)
 * Native: expo-audio with procedurally generated WAV files cached to disk
 *
 * All sounds are short, premium tones designed for an IoT dashboard.
 * expo-audio is the SDK 57 replacement for expo-av (which had ABI crashes).
 */

import { Platform } from 'react-native';

type SoundType = 'tap' | 'success' | 'warning' | 'alert' | 'toggle' | 'navigate';

// ============================================================
// WEB — Web Audio API
// ============================================================

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (Platform.OS !== 'web') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playWebSound(type: SoundType): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  switch (type) {
    case 'tap': {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
      break;
    }

    case 'success': {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      const gain2 = ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.value = 523.25;
      osc2.frequency.value = 659.25;
      gain1.gain.setValueAtTime(0.1, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      gain2.gain.setValueAtTime(0.1, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1).connect(ctx.destination);
      osc2.connect(gain2).connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.2);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.3);
      break;
    }

    case 'warning': {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      const gain2 = ctx.createGain();
      osc1.type = 'triangle';
      osc2.type = 'triangle';
      osc1.frequency.value = 659.25;
      osc2.frequency.value = 440;
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      gain2.gain.setValueAtTime(0.12, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1).connect(ctx.destination);
      osc2.connect(gain2).connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.3);
      break;
    }

    case 'alert': {
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.06, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.08);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.08);
      }
      break;
    }

    case 'toggle': {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1000, now + 0.06);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
      break;
    }

    case 'navigate': {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
      break;
    }
  }
}

// ============================================================
// NATIVE — expo-audio with cached WAV files
// ============================================================

type SoundSpec = {
  frequency: number;
  durationMs: number;
  waveType: 'sine' | 'square' | 'triangle';
  envelope: 'short' | 'medium' | 'long';
};

const SOUND_SPECS: Record<SoundType, SoundSpec> = {
  tap:      { frequency: 1200, durationMs: 50,  waveType: 'sine',     envelope: 'short' },
  success:  { frequency: 523,  durationMs: 200, waveType: 'sine',     envelope: 'medium' },
  warning:  { frequency: 659,  durationMs: 150, waveType: 'triangle', envelope: 'medium' },
  alert:    { frequency: 880,  durationMs: 96,  waveType: 'square',   envelope: 'short' },
  toggle:   { frequency: 600,  durationMs: 60,  waveType: 'sine',     envelope: 'short' },
  navigate: { frequency: 400,  durationMs: 150, waveType: 'sine',     envelope: 'medium' },
};

function generateWavBuffer(spec: SoundSpec): ArrayBuffer {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * (spec.durationMs / 1000));
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const decayRate = spec.envelope === 'short' ? 20 : spec.envelope === 'medium' ? 8 : 4;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * spec.frequency * t;

    let sample = 0;
    switch (spec.waveType) {
      case 'sine':
        sample = Math.sin(phase);
        break;
      case 'square':
        sample = Math.sin(phase) > 0 ? 1 : -1;
        break;
      case 'triangle':
        sample = (2 / Math.PI) * Math.asin(Math.sin(phase));
        break;
    }

    const envelope = Math.exp(-t * decayRate);
    const clamped = Math.max(-1, Math.min(1, sample * envelope * 0.3));
    view.setInt16(44 + i * 2, clamped * 32767, true);
  }

  return buffer;
}

// Base64 encoder — RN Hermes has no `btoa`, and Buffer is unavailable.
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64_CHARS[b2 & 63] : '=';
  }
  return out;
}

const wavCache = new Map<SoundType, string>();
let nativeAudioReady = false;

/** Lazily initialize expo-audio + expo-file-system (bundled in Expo Go SDK 57). */
async function ensureNativeAudio(): Promise<boolean> {
  if (nativeAudioReady) return true;
  try {
    await import('expo-audio');
    await import('expo-file-system');
    nativeAudioReady = true;
    return true;
  } catch {
    return false; // module absent — stay silent (no-op)
  }
}

async function getNativeSoundUri(type: SoundType): Promise<string | null> {
  if (wavCache.has(type)) return wavCache.get(type)!;
  if (!(await ensureNativeAudio())) return null;

  try {
    const { Directory, File, Paths } = await import('expo-file-system');

    const buffer = generateWavBuffer(SOUND_SPECS[type]);
    const base64 = bytesToBase64(new Uint8Array(buffer));

    const dir = new Directory(Paths.document, 'pigpulse-sounds');
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, `sound_${type}.wav`);
    file.write(base64, { encoding: 'base64' });

    const fileUri = file.uri;
    wavCache.set(type, fileUri);
    return fileUri;
  } catch {
    return null;
  }
}

let activePlayers: { remove: () => void }[] = [];

async function playNativeSound(type: SoundType): Promise<void> {
  if (!(await ensureNativeAudio())) return;

  // Reuse cached URI if present; else generate + cache.
  let uri = wavCache.get(type) ?? null;
  if (!uri) {
    uri = await getNativeSoundUri(type);
    if (!uri) return;
  }

  try {
    const { createAudioPlayer } = await import('expo-audio');
    const player = createAudioPlayer({ uri });
    player.play();
    // Tear down after the sound finishes (duration + small margin).
    const ms = SOUND_SPECS[type].durationMs + 200;
    setTimeout(() => {
      try {
        player.remove();
      } catch { /* already disposed */ }
    }, ms);
    activePlayers = activePlayers.filter((p) => p !== player);
    activePlayers.push(player as unknown as { remove: () => void });
  } catch {
    // Silently fail
  }
}

// ============================================================
// PUBLIC API
// ============================================================

export async function initSounds(): Promise<void> {
  if (Platform.OS !== 'web') {
    await ensureNativeAudio();
  }
}

export function playSound(type: SoundType): void {
  if (Platform.OS === 'web') {
    playWebSound(type);
  } else {
    playNativeSound(type).catch(() => {});
  }
}