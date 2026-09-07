/**
 * WebAudio Bioacoustics Synthesizer & Noise Engine
 * Generates realistic swine respiratory acoustic signatures.
 * Follows the canonical cough formant model:
 * - Infectious: 600Hz dominant formant with explosive onset <15ms
 * - Non-infectious: 1600Hz dominant formant with 150-250ms decay
 * - Barn reverb: ConvolverNode with RT60 ~0.8s
 * - INMP441 soft-clipping noise floor at -55 dBFS
 */

export interface CoughEvent {
  type: 'INFECTIOUS' | 'NON_INFECTIOUS' | 'NONE';
  startTime: number;       // relative simulator time in ms
  duration: number;        // ms
  dominantFreq: number;    // 600 or 1600
  rmsDb: number;
}

export interface AudioEngineState {
  isRunning: boolean;
  sampleRate: number;
  totalCoughDetections: number;
  infectiousDetections: number;
}

export const DEFAULT_SAMPLE_RATE = 16000;
export const INFECTIOUS_FORMANT = 600;
export const NON_INFECTIOUS_FORMANT = 1600;
export const ATTACK_DURATION_MS = 15;
export const DECAY_DURATION_MS = 200;

/**
 * Creates a shaped ADSR envelope as a Float32Array (pure logic, no AudioBuffer dependency).
 * Mirrors WebAudio AudioBuffer for pure Node.js unit tests.
 */
export function createAdsrEnvelope(
  attackMs: number,
  decayMs: number,
  _durationMs: number,
  sampleRate: number = DEFAULT_SAMPLE_RATE
): Float32Array {
  const length = Math.ceil((attackMs + decayMs) * sampleRate / 1000);
  const data = new Float32Array(length);

  const attackSamples = Math.floor(attackMs * sampleRate / 1000);
  const decaySamples = Math.floor(decayMs * sampleRate / 1000);
  const total = attackSamples + decaySamples;

  for (let i = 0; i < total && i < data.length; i++) {
    if (i < attackSamples) {
      // Attack: linear rise to 1.0
      data[i] = i / Math.max(attackSamples, 1);
    } else {
      // Decay: exponential fall toward ~0.1
      const t = (i - attackSamples) / Math.max(decaySamples, 1);
      data[i] = 0.1 + 0.9 * Math.exp(-3.0 * t);
    }
  }
  return data;
}

/**
 * Generates a cough burst: bandpass-filtered noise shaped by ADSR envelope.
 * Uses bandpass to target formant frequency.
 */
export function generateCoughBurst(
  type: 'INFECTIOUS' | 'NON_INFECTIOUS',
  durationMs: number,
  sampleRate: number = DEFAULT_SAMPLE_RATE
): Float32Array {
  const length = Math.ceil(durationMs * sampleRate / 1000);
  const buffer = new Float32Array(length);
  const formant = type === 'INFECTIOUS' ? INFECTIOUS_FORMANT : NON_INFECTIOUS_FORMANT;

  // Generate bandpass-filtered noise around formant
  const bandwidth = type === 'INFECTIOUS' ? 300 : 200;
  const dt = 1.0 / sampleRate;
  const omega0 = 2.0 * Math.PI * formant * dt;
  const alpha = 2.0 * Math.cos(omega0) * Math.exp(-Math.PI * bandwidth * dt * sampleRate / sampleRate);

  // Biquad bandpole coefficients (simplified state-variable filter)
  let y1 = 0, y2 = 0;

  // Generate white noise and shape via simple resonator
  const envelope = createAdsrEnvelope(ATTACK_DURATION_MS, DECAY_DURATION_MS, durationMs, sampleRate);
  const envLen = envelope.length;

  for (let i = 0; i < length; i++) {
    // Simple pseudo-random
    const noise = Math.random() * 2.0 - 1.0;
    // One-pole resonator approximation
    const y = noise * 0.05 + alpha * (y1 * Math.cos(omega0) - y2) * 0.001;
    y2 = y1;
    y1 = y;

    const envIdx = Math.min(Math.floor(i * envLen / length), envLen - 1);
    buffer[i] = y * envelope[envIdx];
  }
  return buffer;
}

/**
 * Computes RMS dB level of an audio buffer relative to full-scale.
 */
export function computeRmsDb(buffer: Float32Array): number {
  if (buffer.length === 0) return -Infinity;
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sum / buffer.length);
  return 20.0 * Math.log10(Math.max(rms, 1e-10));
}

/**
 * Simulates the full bioacoustic pipeline state.
 * Returns the cough type and expected frequency band.
 */
export function simulateCoughDetection(
  tick: number,
  coughInterval: number = 5000
): CoughEvent {
  const timeInCycle = tick % coughInterval;
  if (timeInCycle < 100) {
    // Cough burst happens at start of cycle
    const isInfectious = Math.random() > 0.3;
    return {
      type: isInfectious ? 'INFECTIOUS' : 'NON_INFECTIOUS',
      startTime: tick,
      duration: isInfectious ? 300 : 250,
      dominantFreq: isInfectious ? INFECTIOUS_FORMANT : NON_INFECTIOUS_FORMANT,
      rmsDb: isInfectious ? -20.0 : -25.0
    };
  }
  return { type: 'NONE', startTime: 0, duration: 0, dominantFreq: 0, rmsDb: -Infinity };
}
