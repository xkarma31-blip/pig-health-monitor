import { describe, it, expect } from 'vitest';
import {
  runInferenceChain,
  classifyFeatures,
  CLASSIFIER_SAMPLE_RATE
} from '../inferenceChain';
import { generateCoughBurst } from '../audioSynthesizer';

/** Mulberry32 — deterministic seeds so classifier behaviour is locked. */
function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SR = CLASSIFIER_SAMPLE_RATE;

describe('classifyFeatures', () => {
  it('maps silence to STABLE with high confidence', () => {
    const { scores, trend, confidence } = classifyFeatures({
      meanLogMel: -6,
      peakLogMel: -6,
      coughCount: 0
    });
    expect(trend).toBe('STABLE');
    expect(scores.stable).toBeGreaterThan(0.9);
    expect(confidence).toBeGreaterThan(0.4);
  });

  it('keeps a single sparse cough STABLE-dominant (not an outbreak)', () => {
    const { scores, trend } = classifyFeatures({
      meanLogMel: -3.5,
      peakLogMel: -2.5,
      coughCount: 1
    });
    expect(trend).toBe('STABLE');
    expect(scores.stable).toBeGreaterThan(scores.cluster);
  });

  it('reads a dense cough burst as CLUSTER', () => {
    const { scores, trend } = classifyFeatures({
      meanLogMel: -2.8,
      peakLogMel: -1.8,
      coughCount: 8
    });
    expect(trend).toBe('CLUSTER');
    expect(scores.cluster).toBeGreaterThan(0.5);
    expect(scores.cluster).toBeGreaterThan(scores.stable);
  });
});

describe('runInferenceChain', () => {
  it('returns STABLE for one second of silence', () => {
    const silence = new Float32Array(SR); // all zeros
    const result = runInferenceChain(silence, 0, SR);
    expect(result.trend).toBe('STABLE');
    expect(result.scores.stable).toBeGreaterThan(0.7);
    expect(result.confidence).toBeGreaterThan(0.2);
    expect(result.features.meanLogMel).toBeLessThan(-5);
  });

  it('produces melFrames with 40 bands that raise in energy with coughs', () => {
    const rng = createRng(0xC0FFEE);
    const silence = new Float32Array(SR);
    const quiet = runInferenceChain(silence, 0, SR);
    expect(quiet.melFrames.length).toBeGreaterThan(0);
    expect(quiet.melFrames[0]).toHaveLength(40);

    const coughs = new Float32Array(SR);
    for (let i = 0; i < 8; i++) {
      const burst = generateCoughBurst('INFECTIOUS', 300, SR, rng);
      coughs.set(burst, Math.min(i * (SR / 8), SR - burst.length));
    }
    const loud = runInferenceChain(coughs, 8, SR);
    expect(loud.features.meanLogMel).toBeGreaterThan(quiet.features.meanLogMel + 0.5);
    expect(loud.trend).toBe('CLUSTER');
  });
});