import { describe, it, expect } from 'vitest';
import {
  createAdsrEnvelope,
  generateCoughBurst,
  computeRmsDb,
  simulateCoughDetection,
  INFECTIOUS_FORMANT,
  NON_INFECTIOUS_FORMANT
} from '../audioSynthesizer';

describe('WebAudio Bioacoustics Synthesizer', () => {
  it('creates a valid ADSR envelope buffer (Float32Array)', () => {
    const envelope = createAdsrEnvelope(15, 200, 300, 16000);
    expect(envelope.length).toBeGreaterThan(0);
    const data = envelope;
    // Attack should start near 0
    expect(data[0]).toBeLessThan(0.1);
    // Peak should be near 1.0
    expect(Math.max(...data)).toBeGreaterThan(0.9);
    // Decay should drop toward ~0.1
    expect(data[data.length - 1]).toBeLessThan(0.3);
  });

  it('generates an infectious cough with 600Hz formant and explosive onset', () => {
    const burst = generateCoughBurst('INFECTIOUS', 300, 16000);
    expect(burst.length).toBeGreaterThan(0);
    const rmsDb = computeRmsDb(burst);
    expect(rmsDb).toBeGreaterThan(-40);
    expect(rmsDb).toBeLessThan(-10);
  });

  it('generates a non-infectious cough with 1600Hz formant and longer decay', () => {
    const burst = generateCoughBurst('NON_INFECTIOUS', 250, 16000);
    expect(burst.length).toBeGreaterThan(0);
    const rmsDb = computeRmsDb(burst);
    expect(rmsDb).toBeGreaterThan(-40);
  });

  it('returns NONE outside of cough intervals', () => {
    const event = simulateCoughDetection(2000, 5000); // mid-cycle
    expect(event.type).toBe('NONE');
    expect(event.dominantFreq).toBe(0);
  });

  it('classifies coughs with 600Hz or 1600Hz dominant formant when triggered', () => {
    const event = simulateCoughDetection(0, 5000);
    expect(['INFECTIOUS', 'NON_INFECTIOUS']).toContain(event.type);
    expect(event.dominantFreq).toBeGreaterThan(0);
    expect([INFECTIOUS_FORMANT, NON_INFECTIOUS_FORMANT]).toContain(event.dominantFreq);
  });
});
